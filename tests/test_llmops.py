"""Privacy and fail-open checks using the real SDK's in-memory exporter."""
import pytest
from langfuse import Langfuse
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from worker import llmops
from worker.decision_graph import build_graph, decide
from worker.evaluation_gate import failures


def test_default_observability_does_not_create_client(monkeypatch):
    llmops.client.cache_clear()
    monkeypatch.delenv("PATCHGOBLIN_LANGFUSE_ENABLED", raising=False)
    assert llmops.client() is None
    llmops.client.cache_clear()


def test_langfuse_exports_only_allowed_metadata_and_usage(monkeypatch):
    exporter = InMemorySpanExporter()
    sdk = Langfuse(public_key="pk-lf-offline-test", secret_key="sk-lf-offline-test",
                   tracer_provider=TracerProvider(), span_exporter=exporter)
    monkeypatch.setattr(llmops, "client", lambda: sdk)
    with llmops.observation({"mode": "repair", "repo": "private/customer", "prompt": "secret source"}) as update:
        update({"outcome": "success", "action": "patch", "diagnosis": "private logs"},
               {"input": 3, "output": 2, "total": 5, "secret": "private key"})
    sdk.flush()
    spans = exporter.get_finished_spans()
    assert len(spans) == 1
    attributes = str(dict(spans[0].attributes))
    for private in ("private/customer", "secret source", "private logs", "private key"):
        assert private not in attributes
    assert '"input": 3' in attributes
    assert spans[0].attributes["langfuse.observation.metadata.action"] == "patch"
    with pytest.raises(RuntimeError, match="sensitive source"):
        with llmops.observation({"mode": "builder"}):
            raise RuntimeError("sensitive source")
    sdk.flush()
    failed = exporter.get_finished_spans()[-1]
    assert failed.attributes["langfuse.observation.metadata.outcome"] == "error"
    assert "sensitive source" not in str(failed.attributes)
    assert not failed.events
    sdk.shutdown()


def test_observability_failure_never_retries_or_swallows_model_errors(monkeypatch):
    class Broken:
        def start_observation(self, **kwargs):
            raise RuntimeError("exporter unavailable")
    monkeypatch.setattr(llmops, "client", lambda: Broken())
    calls = []
    with pytest.raises(ValueError, match="private provider error"):
        with llmops.observation({}) as update:
            calls.append(1)
            update({"outcome": "success"})
            raise ValueError("private provider error")
    assert calls == [1]


def test_graph_stops_on_inference_failure_without_parse_or_retry(monkeypatch):
    monkeypatch.setenv("LANGSMITH_TRACING", "true")
    calls = []
    class Model:
        def _prepare(self, evidence):
            calls.append("prepare")
            return evidence
        def _infer(self, prepared):
            calls.append("infer")
            raise RuntimeError("budget consumed")
        def _parse(self, prepared, response):
            calls.append("parse")
    with pytest.raises(RuntimeError, match="budget consumed"):
        decide(build_graph(Model()), {"private": "source"})
    assert calls == ["prepare", "infer"]


def test_release_gate_rejects_failed_unsafe_empty_and_duplicate_evaluations():
    valid = {"id": "repair", "oracle_pass": True, "incorrect_repair": False}
    assert failures([valid]) == []
    assert failures([])
    assert failures([valid, valid])
    assert failures([{**valid, "oracle_pass": False}])
    assert failures([{**valid, "incorrect_repair": True}])
    assert failures([{"id": "missing-evidence"}])
