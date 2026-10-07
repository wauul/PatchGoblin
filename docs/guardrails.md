# Abuse and cost controls

The canonical API is `api/index.ts`. The historical public hosting-header/PAT
entry returns HTTP 410. The old database enqueue function also denies new work.
Local historical tooling is not a production API.

## Release order

1. Back up the database and apply `db/003_guardrails.sql` **in a transaction**
   after migrations 001 and 002, using the trusted schema-owner connection.
   `scripts/migrate-product.py` applies 002 and 003 together. Reapplying 003
   preserves controls and seeds recent existing jobs only once.
2. Configure `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`, and
   `TURNSTILE_HOSTNAMES=patchgoblin.vercel.app` in the Vercel runtime secret store.
   A dedicated widget's keys are stored in ignored `.local/guardrails.env` on
   the development machine. Do not commit or put the secret in a browser build.
3. Deploy the API and worker from the same reviewed source. API limiting needs
   `TOKEN_ENCRYPTION_KEY` and the Vercel-managed `VERCEL=1` environment. The only
   trusted IP header is Vercel's `x-vercel-forwarded-for`; arbitrary forwarding
   headers and non-Vercel deployments are rejected. Local development must use
   a loopback request URL and a loopback APP_URL.
4. Exercise a fresh real Turnstile token through POST `/api/auth/login`, then
   verify that the same token is rejected. Verify signed webhook delivery,
   a successful authorized job, cancellation, and current repository access.
   Test doubles and local PostgreSQL tests do not establish production delivery.
5. Configure Sentry notifications for `GuardrailBudgetAlert` and the existing
   retention monitor. Error capture does not establish that notifications reach
   an operator. Existing provider billing/account ceilings must also be checked.

Missing controls, limiter results, encryption configuration or permission
verification deny protected operations. Authentication/export/deletion and
cleanup remain available when job features are paused.

## Emergency stop without deployment

Use the trusted operator database connection. Pause all job stages:

```sql
UPDATE pg_guardrail_controls
SET jobs=false, inference=false, sandbox=false, submission=false, webhooks=false
WHERE singleton;
```

The worker checks before claims, inference, VM provisioning and GitHub writes;
repository availability is also checked during execution. A provider request
already sent may still finish and consume its reserved budget. Installation
revocation events and cleanup remain enabled. Resume only the required stages:

```sql
UPDATE pg_guardrail_controls
SET jobs=true, inference=true, sandbox=true, submission=true, webhooks=true
WHERE singleton;
```

Controls may lower the service caps, but database constraints prevent increasing
them above 30 jobs / 360,000 reserved model tokens per rolling day and 900 jobs /
10,800,000 tokens per rolling 31 days. This is a **work/token ceiling**, not an
invoice ceiling: hosting, ingress, storage, package downloads and provider rates
are separate. Requests rejected at the application still consume hosting work;
an edge-level firewall limit remains useful if traffic volume warrants it.

## Accounting and retries

Each new job atomically reserves 12,000 tokens. Model configuration cannot raise
that per-job budget. Account limits remain eight jobs per rolling hour; repository
limits are configurable from one to five jobs per rolling day. Idempotent enqueue
uses one reservation. Reservations are not refunded by failure, cancellation or
account deletion. No job content or credentials are kept in the usage ledger.

Submission retries require current write permission, use a database function,
have a lifetime limit of three per job, and a global limit of 90 retries/day.
Terminal verified state is reused; a retry must not restart model inference.
Interrupted nonterminal pipeline work cannot restart with a new model budget.

Signed delivery ingestion has a 1,000-item pending queue and 2,000-delivery/day
ceiling, plus 300/hour per installation. Revocation has separate priority and
queue capacity. Quota-rejected deliveries become failed rather than repeatedly
calling GitHub. Work is bounded per reconciliation pass and drain cycle.

## Access and retention

History, individual jobs, account export and repository listing recheck current
GitHub access. Export uses bounded pages; the Account UI collects them into one
download and refuses to silently truncate. Worker writes check that the original
account still exists and has current GitHub write/maintain/admin permission.

Database RLS denies non-owner roles unless explicitly configured otherwise.
No PUBLIC grants are retained on sensitive tables or guardrail functions.
The current application still uses **trusted schema-owner server credentials**;
RLS does not restrict that owner and does not replace application authorization.
Do not expose a database URL to clients or reuse the owner credential in untrusted
tools. A separate least-privilege runtime role requires a deliberate follow-up
role/function design and deployment; it is not silently provisioned here.

Daily retention expires session/OAuth records, stale pending deliveries, orphan
historical evidence, request buckets, usage reservations after 32 days, audit
records after 90 days, and repository evidence at its configured 7/30/90 days.
Job deletion waits for leases/VM cleanup. Backups and third-party retention remain
outside this application. Privacy text includes Turnstile and optional Langfuse.

## Monitoring and verification

`pg_budget_alerts()` records thresholds at 80% and deduplicates daily notices.
Enqueue and the protected retention cron emit sanitized Sentry faults for new notices.
Query `pg_usage_events`, `pg_budget_notifications`, and `pg_audit_events` through
the trusted operator connection to inspect reservations, thresholds and sensitive
actions. Error/log caps are per process; they are not an account-wide Sentry cap.

CI supplies an isolated PostgreSQL service using `TEST_DATABASE_URL` and tests
concurrent enqueue/rate limits, deletion resistance, membership denial, stop
controls, retries, retention, alerts and RLS. Without that variable, DB integration
tests explicitly skip; do not interpret a skipped local run as DB verification.
API/worker tests cover revoked access, missing controls, provider errors,
oversized streamed bodies/downloads, Turnstile failure/replay responses and
sanitized public prose. The secret scan checks tracked source and reachable Git
history for supported credential patterns without needing local secret files.
It is a pattern scanner, not proof that every possible secret format is absent.

### Local verification on October 7, 2026

- 57 TypeScript tests and 113 Python tests passed, with all database integration
  tests running against an isolated local PostgreSQL database.
- Both web/worker builds, Ruff, and the tracked-source/reachable-history secret
  scan passed. The frontend retains the existing large-chunk build warning.
- A live Cloudflare widget was created using `cf`; its secret was accepted by
  Siteverify, which correctly rejected a dummy response. The local browser
  displayed a successful managed challenge and the updated privacy notice.
  The browser blocked the form POST, so real server-side token acceptance and
  replay rejection remain unverified. Mocked denial/replay tests passed.
- No production database migration, runtime secret installation, deployment or
  operator notification delivery was performed. Follow the release order above.
