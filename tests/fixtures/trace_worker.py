"""Cross-language queue continuation using real SDKs and local memory transports."""
import json
import sys

import sentry_sdk
from sentry_sdk.transport import Transport
from langfuse import Langfuse
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from worker import telemetry, llmops


class MemoryTransport(Transport):
    def __init__(self, options=None):
        super().__init__(options)
        self.transactions = []

    def capture_envelope(self, envelope):
        for item in envelope.items:
            if item.headers['type'] == 'transaction':
                self.transactions.append(item.payload.json)


carrier = json.load(sys.stdin)
transport = MemoryTransport()
telemetry.init({'SENTRY_DSN': 'https://12345678901234567890123456789012@o123.ingest.sentry.io/456',
                'SENTRY_VERIFY': 'true', 'SENTRY_ENVIRONMENT': 'verification',
                'SENTRY_TRACES_SAMPLE_RATE': '1'}, transport=transport)
exporter = InMemorySpanExporter()
sdk = Langfuse(public_key='pk-lf-queue-test', secret_key='sk-lf-queue-test',
               tracer_provider=TracerProvider(), span_exporter=exporter)
llmops.client = lambda: sdk
with telemetry.work_scope('job', 1, carrier, 'repair'):
    with telemetry.span('inference'):
        stage_span_id = telemetry.durable_trace()['sentry-trace'].split('-')[1]
        with llmops.observation({'mode': 'repair', 'prompt': 'private-trace-canary'}) as update:
            update({'outcome': 'success'}, {'input': 3, 'output': 2, 'total': 5})
sdk.flush()
decision = exporter.get_finished_spans()[0]
transaction = transport.transactions[0]
print(json.dumps({'trace_id': transaction['contexts']['trace']['trace_id'],
                  'parent_span_id': transaction['contexts']['trace']['parent_span_id'],
                  'stage_span_id': stage_span_id,
                  'decision_trace_id': f'{decision.context.trace_id:032x}',
                  'decision_parent_span_id': f'{decision.parent.span_id:016x}',
                  'canary_removed': 'private-trace-canary' not in str(decision.attributes)}))
sdk.shutdown()
sentry_sdk.get_client().close()
