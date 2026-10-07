"""Public-worker guardrails block work before provider calls and contain output."""
from contextlib import contextmanager
import httpx
import pytest
from worker import guardrails
from worker.github import GitHub
from worker.model import Model
from worker.security import public_prose
from worker.railway_sandbox import RailwaySandbox


def test_database_limits_are_transaction_local_for_neon_pooling(monkeypatch):
    from worker import database
    statements = []
    class Connection:
        def __enter__(self):
            return self
        def __exit__(self, *args):
            return False
        def execute(self, statement):
            statements.append(statement)
    def open_connection(*args, **kwargs):
        assert 'options' not in kwargs
        assert not kwargs.get('autocommit', False)
        return Connection()
    monkeypatch.setenv('DATABASE_URL', 'postgresql://fixture')
    monkeypatch.setattr(database.psycopg, 'connect', open_connection)
    with database.connect():
        assert statements == ["SET LOCAL statement_timeout='10s'", "SET LOCAL lock_timeout='5s'"]


def connection_fixture(monkeypatch, value):
    class DB:
        def execute(self, *args):
            return self
        def fetchone(self):
            return value
    @contextmanager
    def connect():
        yield DB()
    monkeypatch.setattr(guardrails, 'connect', connect)


@pytest.mark.parametrize('value', [None, {}, {'allowed': False}])
def test_missing_or_disabled_control_blocks_work(monkeypatch, value):
    connection_fixture(monkeypatch, value)
    with pytest.raises(RuntimeError, match='PG_FEATURE_PAUSED'):
        guardrails.require_feature('inference')


def test_control_database_failure_is_not_a_bypass(monkeypatch):
    monkeypatch.setattr(guardrails, 'connect', lambda: (_ for _ in ()).throw(RuntimeError('Database unavailable')))
    with pytest.raises(RuntimeError, match='Database unavailable'):
        guardrails.require_feature('sandbox')


@pytest.mark.parametrize('permission', [{'permission': 'read', 'user': {'id': 1}}, {'permission': 'write', 'user': {'id': 2}}])
def test_actor_revocation_or_identity_mismatch_blocks_writes(monkeypatch, permission):
    connection_fixture(monkeypatch, {'id': 1, 'login': 'writer'})
    class Github:
        repo = 'owner/repo'
        def request(self, *args):
            return permission
    with pytest.raises(PermissionError, match='write access'):
        guardrails.authorize_actor(Github(), 1)


def test_inference_stop_blocks_before_http_and_does_not_consume_new_call(monkeypatch):
    monkeypatch.setenv('GROQ_API_KEY', 'synthetic-key')
    monkeypatch.setenv('MODEL_BASE_URL', 'https://api.groq.com/openai/v1')
    model = Model()
    model.before_inference = lambda: (_ for _ in ()).throw(RuntimeError('PG_FEATURE_PAUSED'))
    with pytest.raises(RuntimeError, match='PG_FEATURE_PAUSED'):
        model.decide({'mode': 'repair'})
    assert model.calls == 0


def test_sandbox_stop_blocks_before_provision(monkeypatch):
    sandbox = RailwaySandbox.__new__(RailwaySandbox)
    sandbox.before_provision = lambda: (_ for _ in ()).throw(RuntimeError('PG_FEATURE_PAUSED'))
    with pytest.raises(RuntimeError, match='PG_FEATURE_PAUSED'):
        sandbox.start()


def test_streamed_download_rejects_oversize_and_closes_stream():
    class Body(httpx.SyncByteStream):
        closed = False
        chunks = 0
        def __iter__(self):
            for _ in range(100):
                self.chunks += 1
                yield b'x' * 11
        def close(self):
            self.closed = True
    body = Body()
    with httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(200, stream=body))) as client:
        github = GitHub.__new__(GitHub)
        with pytest.raises(ValueError, match='size'):
            github.bounded_get(client, 'https://example.invalid/archive', 10)
    assert body.closed and body.chunks == 1


def test_generated_prose_cannot_publish_active_links_html_or_mentions():
    result = public_prose('@team [click](https://evil.invalid) <img src=x> `code`')
    assert '@team' not in result and 'https://' not in result and '<img' not in result
    assert len(public_prose('x' * 10000)) == 3000


def test_environment_cannot_raise_reserved_per_job_model_budget(monkeypatch):
    monkeypatch.setenv('GROQ_API_KEY', 'synthetic-key')
    monkeypatch.setenv('MODEL_BASE_URL', 'https://api.groq.com/openai/v1')
    monkeypatch.setenv('MAX_MODEL_TOKENS', '20000')
    assert Model().max_tokens == 12000


def test_authenticated_wake_is_bounded_and_rejects_bodies(monkeypatch):
    import threading
    from worker import service
    monkeypatch.setenv('WORKER_WAKE_TOKEN', 'synthetic-wake-token')
    monkeypatch.setattr(service, 'WAKE_COUNT', 0)
    monkeypatch.setattr(service, 'WAKE_WINDOW', 0)
    calls = []
    monkeypatch.setattr(service, 'wake', lambda: calls.append(True))
    server = service.BoundedHTTPServer(('127.0.0.1', 0), service.Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with httpx.Client(base_url=f'http://127.0.0.1:{server.server_port}') as client:
            assert client.post('/wake').status_code == 401
            headers = {'Authorization': 'Bearer synthetic-wake-token'}
            assert client.post('/wake', headers=headers, content='x').status_code == 400
            for _ in range(30):
                assert client.post('/wake', headers=headers).status_code == 202
            assert client.post('/wake', headers=headers).status_code == 429
            assert len(calls) == 30
    finally:
        server.shutdown()
        server.server_close()
