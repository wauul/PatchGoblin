"""Trusted orchestration only. Never copy this module or SDK into execution VMs."""
import contextvars
import functools
import hashlib
import math
import os
import re
import random
import threading
import time
from contextlib import contextmanager

import sentry_sdk
from sentry_sdk import logger
from sentry_sdk.integrations.excepthook import ExcepthookIntegration
from sentry_sdk.integrations.threading import ThreadingIntegration

OPERATIONS = {'request', 'job', 'delivery', 'drain', 'reconcile', 'inspect', 'reproduce', 'investigate', 'patch',
              'verify', 'submit', 'inference', 'provision', 'destroy', 'cleanup', 'persistence', 'database',
              'github', 'check_run', 'release', 'verification'}
STATUSES = {'ok', 'error', 'success', 'failure', 'unavailable', 'cancelled', 'unsupported', 'failed', 'verified',
            'submitted', 'pending', 'done', 'expected', 'unknown'}
_stages = contextvars.ContextVar('telemetry_stages', default=None)
_seen = contextvars.ContextVar('telemetry_seen', default=None)
_logs_enabled = False
_log_sample_rate = .1
_max_events = 60
_event_window = 0
_event_count = 0
_volume_lock = threading.Lock()


def event_budget():
    global _event_window, _event_count
    with _volume_lock:
        now = int(time.monotonic() // 60)
        if now != _event_window:
            _event_window, _event_count = now, 0
        _event_count += 1
        return _event_count <= _max_events


def metadata(data):
    out = {}
    for key, value in (data or {}).items():
        if key == 'service' and value in ('frontend', 'api', 'worker', 'extension'):
            out[key] = value
        elif key in ('operation', 'stage') and isinstance(value, str) and value in OPERATIONS:
            out[key] = value
        elif key == 'status' and isinstance(value, str) and value in STATUSES:
            out[key] = value
        elif key == 'mode' and value in ('repair', 'builder', 'maintenance'):
            out[key] = value
        elif key == 'model' and value in ('openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen-coder-7b'):
            out[key] = value
        elif key in ('duration_ms', 'prompt_tokens', 'completion_tokens', 'total_tokens', 'http.status_code'):
            if isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0:
                out[key] = value
        elif key in ('job_id', 'delivery_id', 'request_id', 'event_id'):
            if isinstance(value, str) and re.fullmatch(r'[a-f0-9]{32}|[a-f0-9-]{36}', value):
                out[key] = value
    return out


def trace_metadata(data):
    if not isinstance(data, dict):
        return {}
    trace = data.get('sentry-trace', '')
    if not isinstance(trace, str) or not re.fullmatch(r'[a-f0-9]{32}-[a-f0-9]{16}(?:-[01])?', trace):
        return {}
    if trace.startswith('0' * 32) or trace[33:49] == '0' * 16:
        return {}
    out = {'sentry-trace': trace}
    baggage = data.get('baggage', '')
    if isinstance(baggage, str) and len(baggage) <= 1024:
        allowed = r'sentry-trace_id=[a-f0-9]{32}|sentry-public_key=[a-f0-9]{32}|sentry-org_id=\d{1,20}|sentry-sampled=(?:true|false)|sentry-sample_rate=(?:0(?:\.\d{1,10})?|1(?:\.0{1,10})?)'
        items = [item.strip() for item in baggage.split(',') if re.fullmatch(allowed, item.strip())][:5]
        if items:
            out['baggage'] = ','.join(items)
    return out


def durable_trace():
    try:
        span = sentry_sdk.get_current_span()
        if not span:
            return {}
        return trace_metadata({'sentry-trace': span.to_traceparent(), 'baggage': span.to_baggage()})
    except Exception:
        return {}


def _trace(data):
    out = {key: value for key, value in (data or {}).items()
            if key in ('trace_id', 'span_id', 'parent_span_id') and isinstance(value, str)
            and re.fullmatch(r'[a-f0-9]{16,32}', value)}
    if (data or {}).get('op') in OPERATIONS:
        out['op'] = data['op']
    if (data or {}).get('status') in STATUSES:
        out['status'] = data['status']
    return out


def sanitize_span(span):
    out = {key: value for key, value in span.items() if key in ('start_timestamp', 'timestamp')}
    out.update(_trace(span))
    data = metadata(span.get('data'))
    op = data.get('operation') or (span.get('description') if span.get('description') in OPERATIONS else 'request')
    out.update(description=op, op=op, data=data)
    return out


def sanitize_event(event, hint=None):
    out = {key: value for key, value in event.items()
           if key in ('event_id', 'timestamp', 'platform', 'type', 'level', 'release', 'environment', 'sdk')}
    out['tags'] = {key: value for key, value in metadata(event.get('tags')).items() if not key.endswith('_id')}
    context = event.get('contexts') or {}
    out['contexts'] = {'trace': _trace(context.get('trace')), 'operation': metadata(context.get('operation'))}
    if event.get('exception'):
        values = []
        for value in event['exception'].get('values', [])[-4:]:
            clean = {'type': value.get('type', 'Error') if re.fullmatch(r'[\w.]{1,60}', value.get('type', 'Error')) else 'Error',
                     'value': 'PatchGoblin operation failed'}
            frames = []
            for frame in value.get('stacktrace', {}).get('frames', [])[-60:]:
                # Python may report a basename while abs_path holds the package path.
                # Use the latter only to derive an allowlisted package-relative name.
                match = None
                for location in (frame.get('filename', ''), frame.get('abs_path', '')):
                    match = re.search(r'(?:^|/)(worker/[a-z_]+\.py)$', location.replace('\\', '/'))
                    if match:
                        break
                frames.append({'filename': match[1], 'lineno': frame.get('lineno'), 'in_app': True}
                              if match else {'filename': '[external]', 'in_app': False})
            clean['stacktrace'] = {'frames': frames}
            clean['mechanism'] = {'type': 'generic', 'handled': value.get('mechanism', {}).get('handled', True)}
            values.append(clean)
        out['exception'] = {'values': values}
    out['breadcrumbs'] = {'values': []}
    if event.get('type') == 'transaction':
        out.update(transaction=event.get('transaction') if event.get('transaction') in OPERATIONS else 'job',
                   start_timestamp=event.get('start_timestamp'), spans=[sanitize_span(s) for s in event.get('spans', [])[:100]])
    return out


def sanitize_log(log, hint=None):
    if not _logs_enabled or log.get('body') not in OPERATIONS:
        return None
    # The hook sees plain values; the SDK serializes OTLP attributes afterward.
    attrs = log.get('attributes', {})
    clean = metadata(attrs)
    if attrs.get('sentry.environment') in ('production', 'development', 'test', 'verification', 'staging'):
        clean['sentry.environment'] = attrs['sentry.environment']
    release = attrs.get('sentry.release')
    if isinstance(release, str) and re.fullmatch(r'patchgoblin@[a-f0-9]{40}', release):
        clean['sentry.release'] = release
    out = {key: value for key, value in log.items() if key in ('time_unix_nano', 'timestamp', 'trace_id', 'span_id', 'severity_number', 'severity_text', 'body')}
    out['attributes'] = clean
    return out


def _rate(value, default):
    try:
        n = float(value)
        return n if 0 <= n <= 1 and math.isfinite(n) else default
    except (TypeError, ValueError):
        return default


def init(env=None, **options):
    global _logs_enabled, _log_sample_rate, _max_events
    env = os.environ if env is None else env
    environment = env.get('SENTRY_ENVIRONMENT', 'development')
    dsn = env.get('SENTRY_DSN', '')
    if not re.fullmatch(r'https://[a-zA-Z0-9]+@[a-zA-Z0-9.-]+/\d+', dsn):
        return False
    if env.get('SENTRY_ENABLED') == 'false' or (environment != 'production' and env.get('SENTRY_VERIFY') != 'true'):
        return False
    sha = env.get('SENTRY_RELEASE') or env.get('RAILWAY_GIT_COMMIT_SHA') or env.get('GITHUB_SHA', '')
    release = 'patchgoblin@' + sha.removeprefix('patchgoblin@') if re.fullmatch(r'(?:patchgoblin@)?[a-f0-9]{40}', sha) else None
    _logs_enabled = env.get('SENTRY_LOGS_ENABLED') == 'true'
    _log_sample_rate = _rate(env.get('SENTRY_LOG_SAMPLE_RATE'), .1)
    try:
        _max_events = min(1000, max(0, int(env.get('SENTRY_MAX_EVENTS_PER_MINUTE', '60'))))
    except ValueError:
        _max_events = 60
    try:
        sentry_sdk.init(dsn=dsn, environment=environment if environment in ('production', 'development', 'test', 'verification', 'staging') else 'development',
                        release=release, default_integrations=False, auto_enabling_integrations=False,
                        integrations=[ExcepthookIntegration(), ThreadingIntegration(propagate_scope=False)],
                        send_default_pii=False, include_local_variables=False, max_request_body_size='never',
                        sample_rate=_rate(env.get('SENTRY_ERROR_SAMPLE_RATE'), 1),
                        traces_sample_rate=_rate(env.get('SENTRY_TRACES_SAMPLE_RATE'), .1),
                        trace_propagation_targets=[], trace_lifecycle='static', transport_queue_size=30, shutdown_timeout=2,
                        before_send=lambda event, hint: sanitize_event(event, hint) if not expected((hint.get('exc_info') or (None, None, None))[1]) and event_budget() else None,
                        before_send_transaction=sanitize_event,
                        before_breadcrumb=lambda crumb, hint: None, before_send_log=sanitize_log, **options)
        sentry_sdk.set_tag('service', 'worker')
        return True
    except Exception:
        return False


def expected(error):
    # Exact bounded policy outcomes; ValueError/RuntimeError in general remain faults.
    return (isinstance(error, InterruptedError) or type(error).__name__ in ('Unsupported', 'GitHubRateLimit')
            or str(error).split('\n')[0] in ('PG_RATE_LIMIT', 'PG_ACTIVE_JOB', 'PG_REPO_DISABLED')
            or str(error) in ('Model budget exhausted', 'Model token budget cannot cover this prompt and a useful response',
                              'Investigation budget exhausted without a verified patch', 'Job runtime budget exhausted',
                              'Repository installation access was removed or suspended', 'GitHub installation no longer exists'))


def capture(error, operation):
    if expected(error) or not sentry_sdk.is_initialized():
        return None
    try:
        previous = getattr(error, '_patchgoblin_event_id', None)
        if previous:
            return previous
        seen = _seen.get()
        if seen is not None and any(item is error for item in seen):
            return None
        if seen is not None:
            seen.append(error)
        with sentry_sdk.new_scope() as scope:
            scope.set_tag('operation', operation if operation in OPERATIONS else 'request')
            event_id = sentry_sdk.capture_exception(error)
            if event_id:
                try:
                    error._patchgoblin_event_id = event_id
                except Exception:
                    pass
            return event_id
    except Exception:
        return None


def log(operation, **data):
    if not _logs_enabled or random.random() >= _log_sample_rate:
        return
    try:
        logger.info(operation, attributes=metadata({'service': 'worker', 'operation': operation, **data}))
    except Exception:
        pass


@contextmanager
def span(operation):
    # Guard only telemetry setup/teardown; never swallow or repeat application work.
    ctx = None
    try:
        ctx = sentry_sdk.start_span(op=operation, name=operation)
        ctx.__enter__()
        ctx.set_data('operation', operation)
        ctx.set_data('service', 'worker')
    except Exception:
        ctx = None
    try:
        yield ctx
    finally:
        if ctx:
            try:
                ctx.__exit__(None, None, None)
            except Exception:
                pass


def instrument(operation):
    def decorate(fn):
        @functools.wraps(fn)
        def wrapped(*args, **kwargs):
            with span(operation):
                return fn(*args, **kwargs)
        return wrapped
    return decorate


def measured(span, **data):
    if span:
        try:
            for key, value in metadata(data).items():
                span.set_data(key, value)
        except Exception:
            pass


def stage(operation):
    tracker = _stages.get()
    if tracker is None or operation not in OPERATIONS:
        return
    if tracker:
        tracker.pop().__exit__(None, None, None)
    ctx = span(operation)
    ctx.__enter__()
    tracker.append(ctx)
    log(operation, stage=operation)


@contextmanager
def work_scope(operation, identity=None, trace=None, mode=None):
    # Threads start fresh and each durable item continues only its own persisted parent.
    contexts = []
    token = _stages.set([])
    seen_token = _seen.set([])
    try:
        ctx = sentry_sdk.isolation_scope()
        scope = ctx.__enter__()
        contexts.append(ctx)
        scope.clear()
        scope.set_tag('service', 'worker')
        scope.set_tag('operation', operation)
        if mode in ('repair', 'builder', 'maintenance'):
            scope.set_tag('mode', mode)
        if identity is not None:
            scope.set_context('operation', {operation + '_id': hashlib.sha256(str(identity).encode()).hexdigest()[:32]})
        tx = sentry_sdk.continue_trace(trace_metadata(trace), op=operation, name=operation)
        ctx = sentry_sdk.start_transaction(tx)
        ctx.__enter__()
        contexts.append(ctx)
    except Exception:
        pass
    try:
        yield
    finally:
        tracker = _stages.get()
        if tracker:
            try:
                tracker.pop().__exit__(None, None, None)
            except Exception:
                pass
        for ctx in reversed(contexts):
            try:
                ctx.__exit__(None, None, None)
            except Exception:
                pass
        _stages.reset(token)
        _seen.reset(seen_token)
        flush()


def flush():
    try:
        sentry_sdk.flush(timeout=1.5)
    except Exception:
        pass
