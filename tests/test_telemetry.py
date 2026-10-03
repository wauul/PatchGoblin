import json
import threading
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor

import sentry_sdk
from sentry_sdk.transport import Transport

from worker import telemetry

DSN = 'https://12345678901234567890123456789012@o123.ingest.sentry.io/456'
SECRET = 'private-repo-model-prompt-ghp_supersecret'


class MemoryTransport(Transport):
    def __init__(self, options=None):
        super().__init__(options)
        self.items = []

    def capture_envelope(self, envelope):
        for item in envelope.items:
            self.items.append((item.headers['type'], item.payload.json))


def test_disabled_and_invalid_configuration_never_initializes(monkeypatch):
    monkeypatch.setattr(sentry_sdk, 'init', lambda **kw: (_ for _ in ()).throw(AssertionError('Unexpected init')))
    assert not telemetry.init({})
    assert not telemetry.init({'SENTRY_DSN': DSN, 'SENTRY_ENVIRONMENT': 'test'})
    assert not telemetry.init({'SENTRY_DSN': 'bad', 'SENTRY_VERIFY': 'true'})


def test_errors_strip_provider_text_locals_source_and_secrets():
    event = {'message': SECRET, 'user': {'id': SECRET}, 'request': {'data': SECRET}, 'extra': {'source': SECRET},
             'tags': {'service': 'worker', 'repo': SECRET}, 'contexts': {'operation': {'job_id': 'a' * 32, 'repo': SECRET}},
             'exception': {'values': [{'type': 'RuntimeError', 'value': SECRET, 'stacktrace': {'frames': [
                 {'filename': 'model.py', 'abs_path': '/app/worker/model.py', 'lineno': 5, 'vars': {'key': SECRET}, 'context_line': SECRET},
                 {'filename': SECRET, 'vars': {'code': SECRET}}]}}]}}
    clean = telemetry.sanitize_event(event)
    assert SECRET not in json.dumps(clean)
    assert clean['exception']['values'][0]['stacktrace']['frames'][0]['filename'] == 'worker/model.py'
    assert clean['contexts']['operation']['job_id'] == 'a' * 32


def test_real_sdk_preserves_owned_python_stack_locations():
    transport = MemoryTransport()
    with sentry_sdk.new_scope():
        telemetry.init({'SENTRY_DSN': DSN, 'SENTRY_VERIFY': 'true', 'SENTRY_ENVIRONMENT': 'verification'}, transport=transport)
        try:
            telemetry.metadata(1)
        except AttributeError as error:
            telemetry.capture(error, 'verification')
        telemetry.flush()
    events = [value for kind, value in transport.items if kind == 'event']
    assert len(events) == 1
    frames = events[0]['exception']['values'][0]['stacktrace']['frames']
    assert any(frame['filename'] == 'worker/telemetry.py' and frame['lineno'] > 0 for frame in frames)
    assert all('abs_path' not in frame and 'vars' not in frame for frame in frames)


def test_trace_metadata_is_bounded_and_expected_filter_is_narrow():
    parent = 'a' * 32 + '-' + 'b' * 16 + '-1'
    assert telemetry.trace_metadata({'sentry-trace': parent, 'baggage': 'prompt=' + SECRET + ',sentry-org_id=123'}) == {
        'sentry-trace': parent, 'baggage': 'sentry-org_id=123'}
    assert telemetry.trace_metadata({'sentry-trace': SECRET}) == {}
    assert telemetry.expected(InterruptedError('cancelled'))
    assert telemetry.expected(RuntimeError('PG_ACTIVE_JOB'))
    assert not telemetry.expected(RuntimeError('Crash mentions PG_ACTIVE_JOB'))
    assert not telemetry.expected(ValueError('Unexpected state'))


def test_concurrent_durable_jobs_are_isolated_and_end_all_stages():
    transport = MemoryTransport()
    with sentry_sdk.new_scope():
        assert telemetry.init({'SENTRY_DSN': DSN, 'SENTRY_ENVIRONMENT': 'verification', 'SENTRY_VERIFY': 'true',
                               'SENTRY_TRACES_SAMPLE_RATE': '1', 'SENTRY_LOGS_ENABLED': 'true', 'SENTRY_LOG_SAMPLE_RATE': '1'}, transport=transport)
        barrier = threading.Barrier(2)

        def run(identity):
            parent = identity * 32 + '-' + 'b' * 16 + '-1'
            with telemetry.work_scope('job', identity, {'sentry-trace': parent}, 'repair'):
                telemetry.stage('inspect')
                barrier.wait(timeout=5)
                trace = telemetry.durable_trace()
                error = RuntimeError(SECRET)
                telemetry.capture(error, 'job')
                telemetry.capture(error, 'job')
                telemetry.capture(InterruptedError(SECRET), 'job')
                telemetry.stage('verify')
                telemetry.log('inference', model='openai/gpt-oss-20b', total_tokens=42, prompt=SECRET)
                return trace

        with ThreadPoolExecutor(2) as pool:
            a, c = list(pool.map(run, ['a', 'c']))
        assert a['sentry-trace'].startswith('a' * 32)
        assert c['sentry-trace'].startswith('c' * 32)
        telemetry.flush()
        events = [value for kind, value in transport.items if kind == 'event']
        transactions = [value for kind, value in transport.items if kind == 'transaction']
        assert len(events) == 2
        assert {e['contexts']['trace']['trace_id'] for e in events} == {'a' * 32, 'c' * 32}
        assert len({e['contexts']['operation']['job_id'] for e in events}) == 2
        assert len(transactions) == 2
        assert all({s['description'] for s in tx['spans']} == {'inspect', 'verify'} for tx in transactions)
        assert SECRET not in json.dumps(transport.items, default=str)
        assert any(kind == 'log' for kind, value in transport.items)
        logs = [item for kind, value in transport.items if kind == 'log' for item in value['items']]
        inference = [item for item in logs if item['body'] == 'inference']
        assert inference and all(item['attributes']['total_tokens'] == {'type': 'integer', 'value': 42} for item in inference)
        assert all(item['attributes']['service']['value'] == 'worker' for item in inference)


def test_telemetry_failure_does_not_repeat_or_change_work(monkeypatch):
    calls = []
    monkeypatch.setattr(sentry_sdk, 'start_span', lambda **kw: (_ for _ in ()).throw(RuntimeError('offline')))
    with telemetry.span('persistence'):
        calls.append('done')
    assert calls == ['done']


def test_no_telemetry_is_installed_in_untrusted_sandbox():
    from pathlib import Path
    bridge = Path('scripts/railway-sandbox-bridge.mjs').read_text()
    assert 'telemetry.py' not in bridge and 'sentry' not in bridge.lower()
    for name in ('sandbox_rpc.py', 'sandbox.py', 'project.py', 'security.py', 'github.py', 'state_codec.py', 'node_manager.py'):
        assert 'telemetry' not in Path('worker', name).read_text()


def test_delivery_producer_persists_its_trace_for_a_later_job(monkeypatch):
    from worker import webhooks
    transport = MemoryTransport()
    saved = {}

    class Database:
        def execute(self, sql, args):
            assert 'pg_enqueue' in sql
            saved.update(json.loads(args[3]))
            return self

        def fetchone(self):
            return {'id': 1}

    @contextmanager
    def connect():
        yield Database()

    monkeypatch.setattr(webhooks, 'connect', connect)
    with sentry_sdk.new_scope():
        telemetry.init({'SENTRY_DSN': DSN, 'SENTRY_VERIFY': 'true', 'SENTRY_ENVIRONMENT': 'verification',
                        'SENTRY_TRACES_SAMPLE_RATE': '1'}, transport=transport)
        with telemetry.work_scope('delivery', 1, {'sentry-trace': 'a' * 32 + '-' + 'b' * 16 + '-1'}):
            webhooks.enqueue({'installation_id': 1, 'controller_id': 2, 'id': 3, 'full_name': 'fixture/repo'}, 'repair', 'fixture', {})
        # A later drain has a different active parent. The durable item's parent wins.
        with telemetry.work_scope('drain', trace={'sentry-trace': 'c' * 32 + '-' + 'd' * 16 + '-1'}):
            with telemetry.work_scope('job', 1, saved['telemetry'], 'repair'):
                assert telemetry.durable_trace()['sentry-trace'].startswith('a' * 32)
                telemetry.capture(RuntimeError(SECRET), 'job')
        telemetry.flush()
        assert any(kind == 'event' and event['contexts']['trace']['trace_id'] == 'a' * 32 for kind, event in transport.items)
