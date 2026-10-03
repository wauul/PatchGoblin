# Sentry operations

## Architecture and configuration

Four projects in the EU organization `patchgoblin`: `patchgoblin-frontend` (React),
`patchgoblin-api` (Node), `patchgoblin-worker` (Python), and `patchgoblin-extension`
(browser JavaScript). The Vercel build output confirms `nodejs24.x` and a fetch-style
entry point; this application does not use a Next.js or Express integration.

SDKs are locked by npm/uv: JavaScript 11.4.0, Python 2.71.0. JavaScript v11 uses
`dataCollection` and `beforeSendSpan` for streamed browser spans. The API uses
the supported static transaction lifecycle and `withStaticSpan` callback, plus
`beforeSendTransaction`, to retain the full isolated request tree; this was
confirmed in the deployed trace viewer. Python also uses static transactions
and explicit orchestration spans. Revisit the API lifecycle before an SDK major
upgrade; Sentry plans to retire the compatibility lifecycle. Automatic HTTP, database, AI,
console, and repository-content integrations are disabled.

See `.env.example` for every supported variable. Each server sets its own
`SENTRY_DSN`; frontend builds use `VITE_SENTRY_DSN`, extension builds use
`SENTRY_EXTENSION_DSN`. An absent/invalid DSN disables telemetry. Development and
tests are disabled unless `SENTRY_VERIFY=true` (frontend: `VITE_SENTRY_VERIFY`).
`SENTRY_ENABLED=false` always wins. Never put privileged tokens in `VITE_*`.

Defaults: errors 100%, traces 10%, operational logs disabled. Enabled logs sample
10% of calls. Errors have a per-process limit of 60/minute, configurable from
0 to 1000. The extension traces sample at zero. These are local ceilings; Sentry
quotas and spike protection apply independently. Serverless replicas each have
their own ceiling. Expected auth, validation, policy, quota, unsupported and
cancellation outcomes are filtered narrowly; arbitrary TypeError/RuntimeError
failures remain reportable.

## Privacy and retention

Sanitizers rebuild errors, breadcrumbs, logs, spans, and transactions from an
operational allowlist. No tokens, cookies, account identities, repository names,
URLs, source/patch/CI output, prompts/responses, request bodies, Python locals, or
source context are sent. Error messages are fixed; application filenames and line
numbers are retained for debugging. Opaque IDs live in contexts, not metric tags.
Measured inference token counts are separate from conservative budget estimates.
Existing platform logs keep their existing behavior; raw console logs are never
forwarded to Sentry.

The organization was verified on the free Developer plan on 2026-10-03. Error
events have 30-day retention; spans have 30-day detailed retention and sampled
history can extend to 13 months under provider policy. Logs follow the provider's
log retention policy. No paid plan or trial was enabled. Sentry still receives
network metadata during delivery. Anonymous telemetry cannot be located by
account identity for account deletion. Review retention after any plan change.

Replay is disabled. It requires **both** `VITE_SENTRY_REPLAY_ENABLED=true` and
`VITE_SENTRY_REPLAY_PRIVACY_VERIFIED=true`. Only `/`, `/docs`, `/faq`, `/extension`
are eligible, with no query string or hash. Text, inputs and named attributes are
masked. Media, code/log/evidence, links, forms, frames and repository/job-bearing
elements are blocked. rrweb handles URL attributes before attribute masking, so
links must be blocked explicitly. Network details/bodies are excluded and custom
recording events are dropped. Replay metadata uses normalized paths and no user
context. Account, OAuth, workbench and private pages never start Replay. Run
`node scripts/verify-sentry-replay.mjs` to decode recordings with canaries after
UI/SDK changes before opting in. The actual SDK recording passed this test on
2026-10-03; no Replay was uploaded to Sentry during verification. Both production
flags remain false by default.

The sandbox bridge's copy allowlist is unchanged. Neither Sentry nor this
telemetry module, DSNs, credentials, or network access enter execution VMs.

## Durable traces and delivery

The browser propagates only to same-origin `/api` endpoints. API request scopes
start fresh. Each queued job/request or webhook payload stores a validated
`sentry-trace` and up to five SDK baggage entries (1024-byte input ceiling).
The existing JSONB fields make this additive without a database migration.
Duplicate deliveries/idempotent jobs retain their original parent. Job responses
strip internal telemetry. A worker job continues its persisted parent, independent
of wake requests, drain transactions, and other threads. Delivery-triggered jobs
continue that delivery's trace. Untrusted input is never copied as arbitrary
baggage.

API errors include `X-Request-ID`, and reported faults also include
`X-Sentry-Event-ID`. Vercel's `waitUntil` delivers pending telemetry; the standalone
fallback waits at most 1.5 seconds. Worker scopes flush with bounded waits.
Extension errors flush immediately and on `pagehide` with keepalive transport;
abrupt browser termination can still lose pending popup telemetry.

## Releases, private maps, and deployment

Use `patchgoblin@<40-character Git SHA>` consistently. The extension adds
`+extension.<manifest version>`. Set `SENTRY_RELEASE` for local CLI deployments;
Vercel/Railway Git SHA variables are supported for Git-driven builds.

The build credential has the limited `org:ci` scope. It is stored in ignored
`.local/sentry.env`, or in CI secret storage. Runtime Vercel/Railway variables must
never include `SENTRY_AUTH_TOKEN`. The ignored local file also contains project
slugs and public DSNs. `scripts/sentry-local.mjs` loads it only for Node build
commands and normalizes Windows PATH casing for Vercel's builder.

Vite generates hidden maps only with complete upload configuration, uploads
artifact bundles, then deletes public maps. Extension maps are generated and
uploaded from `.local/sentry/extension`; the ZIP ships only bundled runtime assets,
a narrowly scoped ingest host/CSP, and its existing `activeTab` permission.
No background/content scripts or remote executable code are added.

Run `scripts/sentry-api-maps.mjs` **after** `vercel build` and **before**
`vercel deploy --prebuilt`. Vercel currently emits unminified application JS plus
private maps in `.vercel/output/functions/api/index.func`; these maps are injected
with debug IDs and uploaded. They are not under public static output. Keep the
exact uploaded function build for deployment. Do not rebuild on deploy.

Local builds work without credentials and production builds warn explicitly.
Release CI sets `SENTRY_REQUIRE_UPLOAD=true`, failing incomplete uploads instead
of silently shipping unreadable stacks. `.github/workflows/sentry-release.yml`
uses production environment secrets and does not publish maps as CI downloads.
Before manually dispatching that workflow, configure GitHub's `production`
environment variable `SENTRY_ORG=patchgoblin` and secrets `SENTRY_AUTH_TOKEN`
(limited `org:ci`), `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`.
Their GitHub presence has not been verified; the approved Sentry token was saved
locally only. Vercel supplies public frontend configuration during `pull`.
Record Sentry deploy tracking only after a deployment succeeds; uploading maps
alone is not a deployment. Extension packaging is separate from store publication.

## Alerting and dashboard queries

The account has automatic error monitors for all four projects. The active
all-project alert (1328573) sends new/existing high-priority production issues
to `#patchgoblin`, throttled to 30 minutes per issue. Its filters require
`environment=production` and exclude `operation=verification`. The three duplicate
project defaults are disabled. Actual frontend and extension failures appear
in the alert's trigger history. The retention monitor is explicitly connected.
Cleanup,
release/persistence, repeated wake, and inference infrastructure faults deserve
investigation; failed repository CI and unsupported repairs do not.

The daily retention monitor runs `0 8 * * *` in UTC, grace 10 minutes, max runtime
2 minutes, failure/recovery threshold 1. The UI-created monitor is named
`patchgoblin-daily-retention` and has immutable slug `new-monitor`; set
`SENTRY_RETENTION_MONITOR_SLUG=new-monitor` on the API. Check-ins wrap only the
authenticated retention route and cannot fail the maintenance task.

Operational dashboard queries (all `environment:production`):

| Signal | Dataset / filter | Measure |
|---|---|---|
| API faults | Errors, `service:api` | `count()` |
| API latency | Spans, `service:api operation:request` | `p95(span.duration)` |
| Worker infrastructure faults | Errors, `service:worker` | `count()` |
| Job stage duration | Spans, `service:worker operation:[inspect,reproduce,investigate,patch,verify,submit]` | `avg(span.duration)`, grouped by operation |
| Measured inference usage | Logs, `service:worker operation:inference` | `sum(total_tokens)`, grouped by model |
| Cleanup failures | Errors, `service:worker operation:[cleanup,destroy]` | `count()` |

Log-based inference totals are sampled operational diagnostics, not a billing
ledger. Plan quotas, sampling, and dropped data affect every chart. Consult the
verification ledger for account configuration that was actually saved.

## Verification and troubleshooting

```sh
npm test
npm run build:web
npm run build:extension
uv run pytest -q
uv run ruff check worker tests
node scripts/check-sentry-artifacts.mjs
node scripts/verify-vercel-runtime.mjs
node scripts/verify-sentry-browser.mjs
node scripts/verify-sentry-replay.mjs
```

The browser verifier needs Playwright and a working full Chrome for Testing
binary. Set `SENTRY_VERIFY_BROWSER_EXECUTABLE` if the bundled Chromium has a Windows
side-by-side assembly error. It uses an isolated test profile, loads the actual
ZIP as MV3, tests English/French mobile recovery/reload, and intercepts **actual
SDK envelopes** to inspect privacy canaries. It creates exact temporary local
fixtures and removes them in `finally`; it does not create a production endpoint
or start real jobs. Its JSON report explicitly distinguishes intercepted SDK
delivery from Sentry SaaS receipt.

Tests exercise real SDK transports, concurrent isolated requests/jobs, capture
deduplication, disabled configuration, narrow expected filtering, atomic webhook
trace storage, delivery-to-job propagation, and sandbox copy isolation. Live
verification must additionally confirm all four events in Sentry, map resolution,
trace relationships, deployed release identity, and actual cron check-ins.

Missing events: check DSN/environment/override, local event limits, project quota,
spike protection, network/CSP/ad blockers, then flush status. Missing worker trace:
inspect only the bounded internal telemetry metadata and ensure the producer
stored it before enqueue. Missing map: compare release/debug ID to the exact
deployed artifact; use `sentry-cli sourcemaps explain <event ID>` with read-capable
operator access (the build token intentionally cannot read events). Never print
secrets, replay recordings, repository evidence, or raw event bodies into shared
diagnostics.

## Verified deployment ledger — 2026-10-03

Final deployed release: `patchgoblin@578d2d0d233e7198e5b4f06b777d395664187668`.
The extension adds `+extension.2.0.1`. The build token has only `org:ci` and
remains in ignored `.local/sentry.env`; it is absent from runtime variables and
public artifacts. Organization controls require scrubbing, remove user data,
prevent IP storage, disable JavaScript source fetching, and restrict debug-file
access to admins. Numeric token-count fields are explicitly safe; no prompt or
response text is allowed. Received user geography is filtered, not usable location.

| Component | Actual production event | Sentry issue / readable location |
|---|---|---|
| Frontend | `ba823052a085404b935a8b1a23a41b3b` | [151123487](https://patchgoblin.sentry.io/issues/151123487/), `web/telemetry.ts:46`, `web/ProductApp.tsx:44` via private Vite maps |
| API | `5658ef06771a44619323beb366efa529` | [151121061](https://patchgoblin.sentry.io/issues/151121061/), original `api/index.ts` via private function maps |
| Worker | `ab3b19d75a7d433b9465f75eccf508ac` | [151123481](https://patchgoblin.sentry.io/issues/151123481/), `worker/service.py:235`, no stack locals |
| Extension | `7c5dab8ad1d24cf1bb35201655e5f5da` | [151121457](https://patchgoblin.sentry.io/issues/151121457/), `extension/popup.js:152` via private bundled maps |

Frontend and extension events above were confirmed on the final `578d2d0` release.
The controlled deployed API/worker faults and linked traces below were confirmed
on `0a11b3a`; the final change only tightened frontend Replay privacy. API/worker
telemetry code is unchanged, and final deployment health/runtime checks passed.

The API/worker [production trace](https://patchgoblin.sentry.io/explore/traces/trace/a8e48eb26f854726bca6b18f2cfffa5d/)
shows nine spans: API request → verification call → worker job → six stages,
plus both faults and two logs. The deployed browser/API/worker share
[trace 706897430643439c83607d661c0b3354](https://patchgoblin.sentry.io/issues/?query=trace%3A706897430643439c83607d661c0b3354).
These were controlled fixtures, never real user jobs or private repositories.
Source-map source context comes from uploaded application code, not customer code.

The [operations dashboard](https://patchgoblin.sentry.io/dashboard/6205684/) has
all six saved widgets. Numeric inference logs were received with eight tokens
from an explicitly synthetic provider response in `environment:verification`.
The production inference chart correctly excludes that fixture; it is empty until
measured real usage arrives and must not be treated as a billing ledger.

The [cron monitor](https://patchgoblin.sentry.io/monitors/2349191/) received an
`Okay` check-in (`77f46857…`) from the actual authenticated handler driven locally
with a SQL double. No retention data was deleted. Ownership is `#patchgoblin`.
The first automatic Vercel execution remains to be observed at **2026-10-04
08:00 UTC**; the monitor now detects misses.

Final Vercel deployment: `dpl_4y7vNDSWjUffsGD2CmDhQfym1Xev`, serving
[patchgoblin.vercel.app](https://patchgoblin.vercel.app).
Final Railway deployment: `f2358e95-e2f2-4b10-955e-a259014ccfb4`, serving
[worker health](https://worker-production-ac16.up.railway.app/health).
Sentry deploy records were created after both hosts reported successful deployment.
Anonymous bootstrap and worker health return 200. Private maps are absent from
static files and ZIP; a public map request returns 403 without map content.

Both temporary verification branches and their credential were removed. The API
now follows ordinary unauthenticated routing (401) and the worker returns 404,
even with the old verification header. Four temporary Vercel deployments were
deleted and each URL was verified 404. The production extension download matches
the locally built 2.0.1 ZIP (SHA256 in `sentry-final-deployment-verification.json`).
`sentry-endpoint-removal-verification.json` records removal using the original
credential before deleting it locally; the final check uses a harmless fixture
header. `sentry-cross-service-verification.json` preserves the deployed three-
component trace, and `sentry-production-browser-verification.json` records the
final shipped web/extension release. Temporary branches are also absent from the
final compiled API and worker source.
**2.0.1 is packaged and downloadable; it was not submitted/published to stores.**

Passed: `npm test` (39), both npm builds, `uv run pytest -q` (79), Ruff,
compiled native-ESM Vercel bootstrap, public-artifact scans, English/French
390px recovery UI/reload with 44px controls, native MV3 popup/shutdown, and actual
SDK payload canaries. JSON evidence files distinguish local intercepted transport,
live SaaS transport, controlled deployed routes, and final endpoint removal.

Replay privacy verification decoded the actual SDK recording and checked text,
input, code, logs, evidence, URL and cookie canaries, plus excluded account and
query-string routes. Production Replay remains off; turning it on is an explicit
configuration choice, not required for error/tracing coverage.

Remaining gates: automatic retention execution is pending its next
scheduled run. The manual GitHub release workflow still needs its documented
production environment secrets/variables before use; the approved build token was
saved locally only. Local private uploads and production deployments are verified.

References: [Sentry shared environments](https://docs.sentry.io/platforms/javascript/best-practices/shared-environments/),
[Vite maps](https://docs.sentry.io/platforms/javascript/guides/react/sourcemaps/uploading/vite/),
[Python options](https://docs.sentry.io/platforms/python/configuration/options/),
[Sentry retention notice](https://sentry.zendesk.com/hc/en-us/articles/40207939677083-Data-retention-notice-August-27-2025),
[Vercel Node runtime](https://vercel.com/docs/functions/runtimes/node-js).
