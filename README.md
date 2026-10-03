# PatchGoblin

Small dependency patches and CI updates, backed by actual command evidence. PatchGoblin inspects a repository, reproduces supported failures, verifies a bounded change in isolation, and opens a pull request for human review. It never merges automatically.

- **Live application:** [patchgoblin.vercel.app](https://patchgoblin.vercel.app)
- **GitHub App:** [Install PatchGoblin CI](https://github.com/apps/patchgoblin-ci/installations/new), choosing individual repositories
- **Extension:** [Chrome/Edge package](https://patchgoblin.vercel.app/patchgoblin-extension.zip), [source and unpacked instructions](extension/README.md). Not store listed.
- **Source:** [wauul/PatchGoblin](https://github.com/wauul/PatchGoblin)
- **Examples:** [Node CI creation](https://github.com/wauul/patchgoblin-product-lab/pull/1), [mixed-language maintenance](https://github.com/wauul/patchgoblin-lab/pull/5), [automatic npm repair](https://github.com/wauul/patchgoblin-lab/pull/6), [Python repair](https://github.com/wauul/patchgoblin-lab/pull/4)

The public application runs on **Vercel**, inference uses **Groq GPT-OSS-20B**, durable jobs/account data use **Neon Postgres**, and the **Railway** worker executes checks in disposable Railway VMs with restricted Docker containers. The old Sites address redirects to Vercel. Historical results remain identifiable; illustrative demos are labeled and execute nothing.

The **Patch Bench** identity carries the existing goblin's forest and lime colors through marketing, workspace, documentation and the extension. Light/dark appearance uses one sun/moon button; styled English/French menus and appearance persist. See [design system](DESIGN.md), [design coverage and verification](docs/design-coverage.md) and [design sources/licenses](docs/design-resources.md).

## Web application

GitHub-only login leads to onboarding, selected-repository installation, a dashboard, repair/builder/maintenance workbench, searchable history, evidence/diff views, live remote CI receipts, repository automation/limits, and account export/deletion. Public documentation, FAQ, support, privacy and terms are included. Loading, empty, failure and success states are explicit.

1. Sign in with GitHub. This establishes identity only.
2. Explicitly authorize the separate repository GitHub App, install it, and select repositories. Organization installation requires actual organization approval.
3. Refresh repository access and finish onboarding.
4. Choose a repository/mode. Repairs require a real completed failed Actions run.
5. Review reproduction, diff, sandbox verification and remote CI separately. Successful sandbox commands do not imply remote CI succeeded.

Automatic repair, missing-CI creation and maintenance are opt-in per repository. Pause/disable stops new work and cancels active work. Writers may submit jobs; administrators control automation. Access is the intersection of current GitHub user permissions and selected App repositories. Client-supplied owner flags cannot grant access. Private archives use installation authorization; no private repository was used in the public evaluation.

## Identity and permissions

Two real applications are registered:

- **PatchGoblin OAuth App**, registration `3894466`: empty scope/public identity, exact HTTPS callback, PKCE S256 and browser-bound one-use state. Its token is discarded after checking `/user`.
- **PatchGoblin CI GitHub App**, App ID `5136754`, slug `patchgoblin-ci`: separate explicit user authorization and installation. Actions/metadata read; contents/workflows/pull requests/checks write. No repository secrets, administration or branch-protection access.

The web session is Secure, HTTP-only, host-only, SameSite=Lax, expires after seven days, and is revoked on logout. Repository user grants are AES-256-GCM encrypted in Neon and refresh under a database lease. Repository operations use short-lived installation tokens restricted to one repository. The extension and execution VM receive no GitHub, Groq or Railway credentials. See [OAuth configuration and hosted verification](docs/github-oauth.md).

## Supported agent scope

State progresses through `inspect → reproduce → investigate → patch → verify → submit`. Deterministic code controls commands, paths, budgets, immutable source, sandboxing, persistence, cancellation and submission. Model explanations are hypotheses; command results are evidence.

| Area | Implemented behavior |
| --- | --- |
| Python repair | pip/uv constraints, missing declarations, install commands, supported runtime mismatch, canonical uv lock refresh; tests cannot be weakened |
| Node repair | One root package, simple single-job workflow, npm/pnpm canonical lock refresh and dependency constraints; scripts/runtime policy/existing dependencies preserved |
| CI creation/maintenance | Python and Node/TypeScript; up to 12 bounded manifest roots; workspace install roots; declared test/lint/type-check/build scripts; framework, test-directory and configuration evidence |
| Runtimes | Python 3.11–3.13 for generated CI; Node 22/24 chosen from supported engine constraints |
| Package managers | pip, uv, npm, pinned pnpm 9/10, classic Yarn 1; declared pnpm/Yarn versions used in both sandbox and generated workflow |
| Coverage | Explicit workflows, jobs, commands, working directories, runtime/install manager and relevant path filters compared with current requirements |
| Maintenance | Justified gaps only; immutable candidate selected by checksum; new commands executed; existing jobs/events/permissions preserved; open App PR updated without force push |
| Contributor PR | Separate App review branch/PR, no writes to contributor branch; fork automation reports its trust boundary |

Adding arbitrary code does not itself justify CI changes. New packages, checks, supported runtimes/package managers and configuration are inspected. Existing handwritten jobs remain intact; missing coverage is added in a managed workflow, preserving prior managed jobs. Service requirements are detected and reported as unsupported, never claimed verified.

Boundaries: complex semver/dynamic workflow policies need review; path filters are conservative, not a full Actions expression interpreter. Credential-dependent build outputs/services are not validated. Yarn Berry, Poetry/Pipenv, arbitrary custom shell, matrix/secret/service jobs and application assertion bugs are outside verified repair scope. npm comes from the selected Node image; exact npm patch-version enforcement is not implemented. Yarn lock repair is not implemented. Framework scripts can run, but their browser/service requirements may exceed sandbox support. Unsupported/failed jobs retain evidence and open no unverified PR.

## Durable automation

The HTTPS webhook validates raw-body HMAC-SHA256 and stores bounded metadata keyed by delivery ID. Installation/repository changes, uninstall, workflow completion, pushes, PR updates, native check actions and authorization revocation are handled. Processing reconciles current GitHub state, preventing stale events from re-enabling removed access or superseding a newer head.

Default-branch maintenance debounces for 15 seconds. Superseded work is cancelled; signed events can reconcile concurrently with execution. Agent branch/PR events never enqueue more jobs; their workflow events update actual remote CI receipts. Stable maintenance branches, recovery suffixes and contributor-review prefixes avoid repeat PR creation. A changed source or maintenance head stops submission.

The native **Repair this run** action checks sender identity, current write/maintain/admin permission and account registration, and deduplicates by run/attempt. Job checks link to evidence. Fork and `pull_request_target` failures are not automatically executed as trusted installation work.

Neon advisory locks enforce one active account job, one global worker, eight account jobs/hour, configurable 1–5 repository jobs/day and 30 service jobs/day. Jobs have exclusive 15-minute leases. Interrupted execution is never silently rerun with a fresh budget. Rate limits respect Retry-After/reset times; durable deliveries retry. Failures remain visible and require explicit retries where supported.

## Sandbox and budgets

Immutable archives: 20 MB compressed, 100 MB extracted, 5,000 files; credential paths/symlinks excluded. Trusted tooling is uploaded separately to a credential-free Railway VM. Containers run as UID 65534 with read-only rootfs, capabilities removed, no-new-privileges, 1 CPU, 512 MB RAM, 128 PIDs, 128 MB temporary storage, no Docker socket/secret mounts.

Installation uses an internal PyPI/npm/Yarn-only proxy. Checks run without network. There is no host-execution fallback. Patched environments are recreated; protected source/check hashes are verified. VMs are explicitly destroyed with idle expiry as fallback; pending cleanup IDs stay visible.

Each job: six investigation steps, two patch attempts, 12,000 aggregate model tokens, ten minutes execution. Commands have 120-second/output limits; patches have four-file/24 KB limits, canonical locks separately bounded at 128 KB. GPT-OSS prompt budgeting uses the published `o200k_harmony` tokenizer with schema/framing reserve. Usage is measured; absent usage stops further calls conservatively. Dollar values are token-list-price estimates, not actual account charges.

## Privacy and controls

The worker accesses selected manifests/workflows, bounded archives, Actions metadata and filtered logs. Selected excerpts/logs go to Groq; execution runs on Railway. Neon retains encrypted repository authorization, sessions, settings, evidence and usage. Vercel hosts and serves requests.

Evidence retention is configurable to 7/30/90 days (30 default). Completed webhook payloads are cleared; delivery metadata expires after seven days; expired sessions/states are removed; retention cron runs daily. Account deletion removes sessions, encrypted grant/account data/evidence and cancels work. Opaque cleanup tombstones can temporarily remain until VM cleanup; a racing worker cannot restore erased evidence. Deletion does not erase GitHub PRs/commits or uninstall the App. Export excludes secrets/session material.

The web app includes Vercel Web Analytics and Speed Insights. Speed Insights measures real-user page performance across the application. Its `beforeSend` filter removes query strings, fragments and URL credentials and reports only known application routes; unknown paths are grouped under `/not-found`. Vercel's build-time observability configuration is forwarded to the React SDK by Vite. Performance data is viewed in the project's Speed Insights dashboard after deployment and visitor traffic.

Live [privacy](https://patchgoblin.vercel.app/privacy), [terms](https://patchgoblin.vercel.app/terms), [support](https://patchgoblin.vercel.app/support). Operator name/legal contact/support URL are configurable. No entity, certification, email or uptime guarantee is invented. A dedicated legal contact is not configured; the page identifies this missing publication detail.

## Local development

Prerequisites: Node 22+, Python 3.11+, uv and Git. Docker is needed for local execution/evaluation, not web development or unit tests.

```sh
npm ci
uv sync --frozen --group dev
cp .env.example .env
npm run dev -- --port 5180
```

Product API: `server/platform.ts`, served by `api/index.ts` in production. For local integration, configure ignored `.local/neon.env`, `.local/github-app.env`, `.local/github-oauth.env`, `.local/railway.env`, then run `node --import tsx scripts/product-local.ts` (loopback 8792). Vite proxies `/api` there. Production OAuth/Secure cookies require the configured HTTPS origin. Public localhost pages work; use a separately registered HTTPS development callback for full identity testing.

`scripts/local-server.ts` and old Sites workflows are historical owner/PAT adapters, not product identity or queue. Never deploy local-owner flags as product authentication.

```sh
npm test
npm run build:web
uv run pytest -q
uv run ruff check worker tests
npm run build:extension
```

npm/uv lockfiles are committed. `build:web` packages the extension, checks TypeScript and builds `dist/client`. `npm run build` additionally produces the historical Sites redirect bundle. Extension build/unpacked/publication instructions: [extension/README.md](extension/README.md).

## Deployment

1. Provision Neon; apply `db/001_jobs.sql`, then `db/002_product.sql` (`scripts/migrate-product.py` applies the additive product migration). Use pooled TLS URLs; preserve the encryption key.
2. Register separate OAuth and GitHub Apps with the permissions above. Canonical OAuth callback: `/api/auth/callback`; App setup: `/api/github/setup`; signed webhook: `/api/github/webhook`. [Current registration](docs/github-oauth.md).
3. Vercel server secrets: database URL, `APP_URL`, both client ID/secret pairs, App ID/slug/key, webhook/encryption/cron secrets, worker URL/wake token. Optional operator/legal/support settings. Never prefix secrets with `VITE_`.
4. Railway secrets: database URL, App ID/key/slug, Groq key/endpoint/model, project-scoped Railway SDK token/environment, wake token, `APP_URL`. `Dockerfile.worker` builds the service and warms trusted tokenizer data.
5. Run checks; `vercel deploy --prod --yes`; `railway up --service worker`. Wait for Ready/Success and verify actual behavior. Public canonical origin remains accessible; preview/unique deployment URLs retain protection.
6. Install/select repositories, then opt in to automation. Rotate provider credentials through runtime secret stores, never repository secrets.

`.railway/railway.ts` declares the service. Worker `/health` is read-only; `/wake` requires a bearer secret. It sleeps idle and drains on authenticated wake/startup; Vercel handlers never execute repository checks. `scripts/provision-product.mjs` updates this project's secrets using private files/stdin without printing values.

## Actual verification

[Product report](docs/product-verification.md), [public-lab evidence](docs/product-results.json), [live HTTP receipts](docs/product-http-verification.json). HTTP tests cover anonymous denial, bad signatures, duplicate signed delivery, export/deletion using a temporary backend session fixture. Rollback-only live Neon tests cover limits/deletion races; these are not invented successful jobs.

The original independent **12-case Qwen evaluation** passed 11/12 acceptance checks: 5/5 repairs, 2/3 builders, 4/4 unsupported; 0/5 incorrect verified repairs. A targeted uv-builder retest passed after an instruction correction. Original failure retained; this is **not a new 12/12 or Groq score**. [Report](docs/evaluation.md), [aggregate](docs/evaluation-results.json), [actual run](https://github.com/wauul/PatchGoblin/actions/runs/36715987219).

```sh
# Real historical evaluation; needs Docker and a model endpoint.
uv run python -m worker.evaluate --baseline
# Disposable lab fixture seeding: commits real changes.
uv run python scripts/seed-product.py --target=wauul/patchgoblin-lab --add-widget-lint
# Labeled backend acceptance checks, not inference evaluation.
uv run python scripts/verify-product-db.py
uv run python scripts/verify-product-http.py
```

Unit fixtures are never used by production. Inference, reproduction, verification, remote CI, tokens/runtime are measured separately. Development failures, stale-head stops and infrastructure failures are retained. No example PR was automatically merged.

## Costs and boundaries

Vercel Hobby, Neon Free and Groq Free are used. Railway uses existing Hobby project/credits; no new subscription/purchase was made. Railway execution consumes usage/credits and is not an unlimited free service. No extension registration payment was made. Estimates do not prove actual charges. Current Groq/development keys expire October 30, 2026 and require operator rotation.

Organization/private-repository installation and native Chrome/Edge permission/cookie behavior are not claimed live-verified. The user confirmed Chrome unpacked installation. A controlled-browser harness tests the real popup/backend while simulating active-tab/create-tab APIs; it is explicitly labeled and removed from the final deployment. The package is unpublished; store account access/publication steps are documented.

## Troubleshooting

- **No repositories:** authorize the separate App, install/select repositories, refresh. Organization approval and your permission both matter.
- **Reconnect:** refresh the App user grant; identity sign-in alone grants no repository permission.
- **Queued:** inspect account/repository quotas, worker health and delivery status. One global lease is allowed.
- **No PR:** inspect unsupported/verification/source-change/submission evidence. Only verified patches submit; remote CI is separate.
- **Unsupported runtime/setup:** declare supported reproducible policy; custom requirements are never silently weakened.
- **Sandbox unavailable:** inspect Railway access/credits/resources. Execution stops without host fallback.
- **Popup sign-in/unavailable:** open PatchGoblin in the same browser, sign in and reopen. Cookie blocking can prevent status; actions remain web forms.
- **Uninstall/delete:** manage the GitHub App/extension separately from deleting the PatchGoblin account.
