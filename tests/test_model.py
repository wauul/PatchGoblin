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


def test_timed_out_inference_usage_is_unavailable_not_zero(monkeypatch):
    monkeypatch.setenv("MODEL_API_KEY", "synthetic-key")
    original_client = httpx.Client

    def route(request):
        if request.url.path == "/apply-template":
            return httpx.Response(200, json={"prompt":"conversation"})
        if request.url.path == "/tokenize":
            return httpx.Response(200, json={"tokens":[1]*100})
        raise httpx.ReadTimeout("synthetic timeout", request=request)

    monkeypatch.setattr(httpx, "Client", lambda **kwargs: original_client(transport=httpx.MockTransport(route), **kwargs))
    model = Model()
    with pytest.raises(RuntimeError, match="usage is unavailable"):
        model.decide({})
    assert model.metrics()["model_tokens"] is None
    assert model.tokens == model.max_tokens
    assert model.calls == 1


def test_groq_strict_files_transport_and_real_usage_fields(monkeypatch):
    monkeypatch.setenv('GROQ_API_KEY','synthetic-provider-key')
    monkeypatch.setenv('MODEL_BASE_URL','https://api.groq.com/openai/v1')
    monkeypatch.setenv('MODEL_CONTEXT_TOKENS','12000')
    original_client=httpx.Client
    def route(request):
        payload=json.loads(request.content)
        schema=payload['response_format']['json_schema']
        assert schema['strict'] is True
        assert schema['schema']['properties']['files']['type']=='array'
        assert set(schema['schema']['required'])==set(schema['schema']['properties'])
        assert 'synthetic-provider-key' not in payload['messages'][1]['content']
        decision={'action':'patch','files':[{'path':'.github/workflows/patchgoblin.yml','content':'workflow'}]}
        return httpx.Response(200,json={'usage':{'total_tokens':1500,'prompt_tokens':1200,'completion_tokens':300},'choices':[{'message':{'content':json.dumps(decision)}}]})
    monkeypatch.setattr(httpx,'Client',lambda **kwargs:original_client(transport=httpx.MockTransport(route),**kwargs))
    model=Model()
    assert model.decide({'mode':'builder'})['files']=={'.github/workflows/patchgoblin.yml':'workflow'}
    assert model.metrics()['prompt_tokens']==1200
    assert model.metrics()['completion_tokens']==300
    assert model.metrics()['model_tokens']==1500


def test_pipeline_selection_binds_the_original_proposal_without_yaml_copying(monkeypatch):
    monkeypatch.setenv('GROQ_API_KEY','synthetic-provider-key')
    monkeypatch.setenv('MODEL_BASE_URL','https://api.groq.com/openai/v1')
    monkeypatch.setenv('MODEL_CONTEXT_TOKENS','12000')
    original_client=httpx.Client
    files={'.github/workflows/patchgoblin-maintenance.yml':'# Keep comment\nname: CI\n'}
    def route(request):
        payload=json.loads(request.content)
        schema=payload['response_format']['json_schema']['schema']
        assert 'files' not in schema['properties']
        context=json.loads(payload['messages'][1]['content'])
        decision={'action':'patch','candidate_id':context['candidate_id'],'diagnosis':'New typecheck needs coverage','category':'pipeline-coverage','evidence':[]}
        return httpx.Response(200,json={'usage':{'total_tokens':800,'prompt_tokens':700,'completion_tokens':100},'choices':[{'message':{'content':json.dumps(decision)}}]})
    monkeypatch.setattr(httpx,'Client',lambda **kwargs:original_client(transport=httpx.MockTransport(route),**kwargs))
    model=Model()
    assert model.decide({'mode':'maintenance','candidate_files':files,'coverage_gap':'New command'})['files']==files
