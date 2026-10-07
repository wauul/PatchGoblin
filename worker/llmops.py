"""Optional metadata-only Langfuse observations, isolated from other exporters."""
import atexit
import hashlib
import os
from contextlib import contextmanager
from functools import lru_cache
from worker import telemetry

PIPELINE_VERSION = "decision-graph-v1"


def prompt_version(instruction):
    return hashlib.sha256(instruction.encode()).hexdigest()[:16]


def safe_metadata(values):
    clean = {}
    for key in ("prompt_version", "pipeline_version", "mode", "provider", "action", "outcome"):
        value = values.get(key)
        allowed = {
            "mode": {"repair", "builder", "maintenance"},
            "provider": {"groq", "compatible"},
            "action": {"read", "patch", "refresh_lock", "unsupported"},
            "outcome": {"success", "error"},
        }
        if key in allowed and value in allowed[key]:
            clean[key] = value
        elif key == "pipeline_version" and value == PIPELINE_VERSION:
            clean[key] = value
        elif key == "prompt_version" and isinstance(value, str) and len(value) == 16:
            if all(c in "0123456789abcdef" for c in value):
                clean[key] = value
    return clean


@lru_cache(maxsize=1)
def client():
    if os.getenv("PATCHGOBLIN_LANGFUSE_ENABLED", "false").lower() != "true":
        return None
    if not os.getenv("LANGFUSE_PUBLIC_KEY") or not os.getenv("LANGFUSE_SECRET_KEY"):
        return None
    try:
        from langfuse import Langfuse
        from opentelemetry.sdk.trace import TracerProvider
        instance = Langfuse(
            public_key=os.environ["LANGFUSE_PUBLIC_KEY"], secret_key=os.environ["LANGFUSE_SECRET_KEY"],
            base_url=os.getenv("LANGFUSE_BASE_URL", "https://cloud.langfuse.com"),
            environment=os.getenv("LANGFUSE_TRACING_ENVIRONMENT", "development"),
            timeout=2, debug=False, tracer_provider=TracerProvider(),
            should_export_span=lambda span: span.name == "patchgoblin.decision",
        )
        atexit.register(flush)
        return instance
    except Exception:
        return None


def flush():
    try:
        instance = client()
        if instance:
            instance.flush()
    except Exception:
        pass


@contextmanager
def observation(metadata):
    """Exporter failures do not retry inference or swallow application errors.

    Use a manual observation: exception recording by context managers can leak
    exception messages containing provider responses or repository content.
    """
    span = None
    try:
        instance = client()
        if instance:
            parent = telemetry.durable_trace().get('sentry-trace', '').split('-')
            trace_context = ({'trace_id': parent[0], 'parent_span_id': parent[1]}
                             if len(parent) >= 2 else None)
            span = instance.start_observation(name="patchgoblin.decision", as_type="generation",
                                              metadata=safe_metadata(metadata), trace_context=trace_context)
    except Exception:
        pass
    def update(values, usage=None):
        try:
            if span:
                tokens = {k: v for k, v in (usage or {}).items()
                          if k in {"input", "output", "total"} and type(v) is int and v >= 0}
                span.update(metadata=safe_metadata({**metadata, **values}), usage_details=tokens,
                            level="ERROR" if values.get("outcome") == "error" else "DEFAULT")
        except Exception:
            pass
    try:
        yield update
    except BaseException:
        update({"outcome": "error"})
        raise
    finally:
        try:
            if span:
                span.end()
        except Exception:
            pass
