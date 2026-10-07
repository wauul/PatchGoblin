# OpenTelemetry tracing

The API explicitly enables Sentry 11's OpenTelemetry tracer provider and uses
`@opentelemetry/api` for bounded child operations (database, GitHub, persistence,
webhook and worker wake). The existing Sentry request transaction remains the
root. Spans export through the existing Sentry privacy hooks and sampling rules;
there is no additional collector or endpoint to configure.

The browser sends W3C `traceparent` alongside its Sentry propagation headers only
to the existing same-origin API targets. API requests accept version-00 W3C
parents and legacy Sentry parents. Conflicting parents, zero IDs and malformed
headers start a fresh trace. Only bounded Sentry sampling baggage is retained;
`tracestate` and arbitrary baggage are discarded.

API job and webhook producers persist both header formats in the existing JSON
telemetry field. Workers continue the persisted parent when processing each job
or delivery, even when a drain has a different active trace. Legacy queued items
continue to work without a migration. Worker stages remain Sentry spans.

Optional Langfuse generations use the current worker span's trace ID and parent
span ID through an isolated Python OpenTelemetry SDK provider. This links AI
decisions to the same trace without exporting unrelated worker spans to Langfuse.
Sentry and Langfuse still show their respective spans in separate interfaces.

## Configuration

Use the existing service-specific Sentry DSNs and `SENTRY_TRACES_SAMPLE_RATE`
(default 0.1); the browser uses `VITE_SENTRY_TRACES_SAMPLE_RATE`. Missing DSNs,
`SENTRY_ENABLED=false`, or unverified development environments disable Sentry
exports. Langfuse remains independently opt-in using the worker-only settings in
[llmops.md](llmops.md). No new credentials or public configuration are required.

OpenTelemetry metrics/log exporters and broad automatic instrumentation are not
enabled. Repository names, source, prompts, responses, request bodies, credentials
and exception messages remain excluded by the existing allowlists. Monitoring
failures do not retry application work or change its outcome. No SDK is installed
in untrusted execution sandboxes.

## Verification

`npm test` now requires `uv` and the frozen Python dependencies. The real-SDK
cross-language check passes an API-produced carrier through a worker job and
stage into a Langfuse generation, with local memory transports. It asserts the
trace ID, both parent relationships, and removal of a private-content canary.
Existing tests also cover concurrent job isolation, durable webhook continuation,
error privacy, invalid parents and disabled monitoring.

These checks establish local export and propagation behavior. Production
deployment and receipt of the new spans in Sentry/Langfuse need separate live
verification.

## Production deployment — 7 October 2026

The web/API and Railway worker were deployed from the tested local source
snapshot, release `patchgoblin@0713b3347051abe847d54d342d2ca76193c80a05`.
This fingerprint identifies the source snapshot; it is not a Git commit or push.

- Vercel deployment: `dpl_DBy3VTJqq5X6TEGrN57DgsA5BzmU`, READY and aliased to
  [PatchGoblin](https://patchgoblin.vercel.app).
- Railway deployment: `56cb7e59-11bc-4b2e-8475-f445b8845dca`, SUCCESS with
  [worker health](https://worker-production-ac16.up.railway.app/health) returning 200.
- Public page and anonymous bootstrap returned 200, the frontend bundle contains
  the new release, and the public source-map request returned 403 without map data.
  The existing downloadable extension package was preserved byte-for-byte.
- A signed synthetic GitHub `ping` using W3C context returned 202. Sentry's
  [received production trace](https://patchgoblin.sentry.io/explore/traces/trace/be53c22ba42cd1cd26cb1abd98896d88/)
  shows five spans: API request, webhook, database, worker delivery and wake, with
  the new release and zero issues. This establishes live API-to-worker continuation
  through durable delivery processing and export of the API's OTel child spans.

No repository job, model inference, patch or pull request was created by this
smoke check. The Langfuse decision-parent relationship is verified by the local
real-SDK cross-language test; a deployed inference job has not exercised that link.
See [deployment verification](opentelemetry-deployment-verification.json).

References: [Sentry OpenTelemetry provider](https://github.com/getsentry/sentry-javascript/blob/develop/packages/opentelemetry/README.md),
[OpenTelemetry Python propagation](https://opentelemetry.io/docs/languages/python/propagation/).
