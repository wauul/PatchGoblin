"""Unit HTTP doubles for token accounting; real evaluations use the live model server."""
import json
import httpx
import pytest
from worker.model import Model


def test_prompt_tokens_reduce_generation_budget(monkeypatch):
    monkeypatch.setenv("MODEL_API_KEY", "synthetic-key")
    monkeypatch.setenv("MAX_MODEL_TOKENS", "3000")
    original_client = httpx.Client
    requests = []

    def route(request):
        requests.append(request.url.path)
        if request.url.path == "/apply-template":
            return httpx.Response(200, json={"prompt":"formatted conversation"})
        if request.url.path == "/tokenize":
            return httpx.Response(200, json={"tokens":[1]*2000})
        payload = json.loads(request.content)
        assert payload["max_tokens"] == 900
        return httpx.Response(200, json={"usage":{"total_tokens":2300},"choices":[{"message":{"content":'{"action":"unsupported"}'}}]})

    monkeypatch.setattr(httpx, "Client", lambda **kwargs: original_client(transport=httpx.MockTransport(route), **kwargs))
    model = Model()
    assert model.decide({"mode":"repair"})["action"] == "unsupported"
    assert model.tokens == 2300
    assert requests == ["/apply-template", "/tokenize", "/v1/chat/completions"]
    with pytest.raises(RuntimeError, match="budget exhausted"):
        model.decide({})


def test_oversized_prompt_stops_before_inference(monkeypatch):
    monkeypatch.setenv("MODEL_API_KEY", "synthetic-key")
    monkeypatch.setenv("MAX_MODEL_TOKENS", "3000")
    original_client = httpx.Client

    def route(request):
        if request.url.path == "/apply-template":
            return httpx.Response(200, json={"prompt":"large conversation"})
        assert request.url.path == "/tokenize"
        return httpx.Response(200, json={"tokens":[1]*2900})

    monkeypatch.setattr(httpx, "Client", lambda **kwargs: original_client(transport=httpx.MockTransport(route), **kwargs))
    model = Model()
    with pytest.raises(RuntimeError, match="cannot cover"):
        model.decide({})
    assert model.calls == 0
