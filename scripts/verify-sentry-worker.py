"""Controlled local orchestration, real Sentry transport; no database/VM/provider job."""
import json
import subprocess
import sys
import os
import httpx
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from worker import telemetry  # noqa: E402

local = dict(line.split('=', 1) for line in Path('.local/sentry.env').read_text().splitlines() if '=' in line)
parent = json.loads(Path('.local/sentry/verification/api-parent.json').read_text())
release = 'patchgoblin@' + subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
if not telemetry.init({'SENTRY_DSN': local['SENTRY_WORKER_DSN'], 'SENTRY_ENVIRONMENT': 'verification',
                       'SENTRY_VERIFY': 'true', 'SENTRY_RELEASE': release, 'SENTRY_TRACES_SAMPLE_RATE': '1',
                       'SENTRY_LOGS_ENABLED': 'true', 'SENTRY_LOG_SAMPLE_RATE': '1'}):
    raise RuntimeError('Verification SDK did not initialize')
with telemetry.work_scope('job', 'controlled-fixture', parent['telemetry'], 'repair'):
    for stage in ('inspect', 'reproduce', 'investigate', 'patch', 'verify', 'submit'):
        telemetry.stage(stage)
    # Synthetic provider fixture only: exercise measured usage handling, never Groq billing.
    from worker.model import Model
    os.environ.update(MODEL_BASE_URL='https://provider.invalid/v1', MODEL_API_KEY='fixture', MODEL_NAME='openai/gpt-oss-20b', MODEL_CONTEXT_TOKENS='20000')
    original_client = httpx.Client
    def fixture_response(request):
        return httpx.Response(200, json={'usage': {'prompt_tokens': 7, 'completion_tokens': 1, 'total_tokens': 8},
            'choices': [{'message': {'content': json.dumps({'action': 'unsupported', 'files': {}, 'diagnosis': 'verification-private-content'})}}]})
    httpx.Client = lambda **kwargs: original_client(transport=httpx.MockTransport(fixture_response), **kwargs)
    try:
        Model().decide({'project': {}, 'fixture': 'verification-private-content'})
    finally:
        httpx.Client = original_client
    try:
        telemetry.metadata('invalid-controlled-type')
    except AttributeError as error:
        event_id = telemetry.capture(error, 'verification')
    trace = telemetry.durable_trace()
telemetry.flush()
result = {'release': release, 'event_id': event_id, 'trace_id': trace['sentry-trace'][:32],
          'runtime': 'local trusted Python SDK with persisted API parent; no production queue job',
          'parent_event_id': parent['event_id'], 'inference_usage': 'synthetic provider response fixture, not billed Groq usage'}
assert result['trace_id'] == parent['trace_id']
Path('docs/sentry-live-worker-verification.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result))
