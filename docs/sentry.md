# Sentry operations

## Architecture and configuration

Four projects in the EU organization `patchgoblin`: `patchgoblin-frontend` (React),
`patchgoblin-api` (Node), `patchgoblin-worker` (Python), and `patchgoblin-extension`
(browser JavaScript). The Vercel build output confirms `nodejs24.x` and a fetch-style
entry point; this application does not use a Next.js or Express integration.

SDKs are locked by npm/uv: JavaScript 11.4.0, Python 2.71.0. JavaScript v11 uses
`dataCollection` and `beforeSendSpan` for streamed spans. Python uses static
transactions and explicit orchestration spans. Automatic HTTP, database, AI,
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
are eligible. Text/inputs/attributes are masked, media and code/log/evidence
elements are blocked, network details/bodies are excluded, and custom/plugin
recording events are dropped. Account, OAuth, workbench and private pages never
start Replay. Keep the privacy verification flag false until a captured recording
with canary text/inputs/code has been decoded and inspected after UI changes.

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
Record Sentry deploy tracking only after a deployment succeeds; uploading maps
alone is not a deployment. Extension packaging is separate from store publication.

## Alerting and dashboard queries

The account has automatic error monitors for all four projects. Configure issue
alerts for new/regressed production errors to the existing `#patchgoblin` team,
with a 60-minute repeat interval; verification errors must be excluded. Cleanup,
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
| API latency | Spans, `service:api operation:request` | `p95(span.duration)`, grouped by route |
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
node scripts/verify-sentry-browser.mjs
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

References: [Sentry shared environments](https://docs.sentry.io/platforms/javascript/best-practices/shared-environments/),
[Vite maps](https://docs.sentry.io/platforms/javascript/guides/react/sourcemaps/uploading/vite/),
[Python options](https://docs.sentry.io/platforms/python/configuration/options/),
[Sentry retention notice](https://sentry.zendesk.com/hc/en-us/articles/40207939677083-Data-retention-notice-August-27-2025),
[Vercel Node runtime](https://vercel.com/docs/functions/runtimes/node-js).
