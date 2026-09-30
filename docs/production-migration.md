# Production migration — 30 September 2026

Production: [patchgoblin.vercel.app](https://patchgoblin.vercel.app). The previous owner-private Sites address redirects to this app and rejects legacy job creation after cutover.

| Responsibility | Provider | Configuration |
|---|---|---|
| React frontend and Node API | Vercel Hobby | Vite build, Node 24; Authentication protects **all** deployment URLs |
| Model API | Groq Free | openai/gpt-oss-20b; strict JSON schema; actual provider token usage |
| Durable requests and state | Neon Free | Postgres 18, Frankfurt; pooled TLS; eight original jobs imported |
| Queue processing and PR submission | Railway existing Hobby workspace | One sleeping HTTP worker in Europe; 1 CPU, 512 MiB limit |
| Repository execution | Disposable Railway sandboxes | Isolated VM, no credentials, restricted Docker execution; destroy after each job |

## Verified live flows

These are real jobs launched in the authenticated Vercel browser against the explicitly labeled seeded public lab. They made real Groq API calls and ran unchanged repository commands in disposable Railway/Docker sandboxes. Neither PR was merged.

| Job | Outcome | Usage | Agent execution | Independent remote CI |
|---|---|---|---|---|
| 10 — builder | [PR #3](https://github.com/wauul/patchgoblin-lab/pull/3), one added workflow, six unchanged tests passed | 1,341 tokens; 1 call; 14 tools | 46.95 s | [push](https://github.com/wauul/patchgoblin-lab/actions/runs/36722521902) and [pull request](https://github.com/wauul/patchgoblin-lab/actions/runs/36722529850) successful |
| 11 — dependency repair | [PR #4](https://github.com/wauul/patchgoblin-lab/pull/4), reproduced resolver failure, retained declared dependencies, six unchanged tests passed | 5,576 tokens; 2 calls; 21 tools | 59.86 s | [push](https://github.com/wauul/patchgoblin-lab/actions/runs/36722750104) and [pull request](https://github.com/wauul/patchgoblin-lab/actions/runs/36722757968) successful |

The repair's first model proposal attempted to remove an existing dependency. Patch policy rejected it before any repository write or command execution, and the second proposal changed only the incompatible constraint. The builder's first model explanation incorrectly said “No changes required” although its workflow patch and checks were correct. That original record is retained. A narrow prompt correction now asks it to explain the missing CI; the live Groq smoke check was repeated. Model explanations remain hypotheses; command results and remote CI establish verification.

The earlier complete 12-case Qwen evaluation remains unchanged in [evaluation.md](evaluation.md). Its scores are **not** Groq evaluation results. This migration verified the two real hosted flows above, plus persistence, authentication, and cancellation checks recorded in migration-verification.json.

## Durable queue and isolation

db/001_jobs.sql installs an idempotent schema without removing legacy data. scripts/migrate-neon.py imports only terminal owner-created GitHub jobs and their trusted state/PR metadata, preserving original IDs, timestamps, statuses, and links. Eight jobs were imported. Retrying the import does not overwrite an existing record.

The database enqueue function serializes rate/concurrency checks with an advisory lock. A retry with the same owner/idempotency key returns its original job. Owner keys scope every API read/write. The claim function enforces a single exclusive 15-minute lease. Expired jobs fail with an explicit recovery reason; expensive work is not silently replayed. Cancellation is durable and prevents stale verification/submission writes.

Vercel wakes Railway with a dedicated bearer secret. The service returns promptly, drains queued jobs in a background thread, and submits verified PRs independently of the browser. Startup also drains the queue. A queued job poll/idempotent retry reattempts waking a sleeping service. There is no idle database polling or permanent model process.

The trusted worker downloads an immutable public archive for inspection. Execution uses a separate Railway VM with no environment variables, public domains, credentials, or project private-network access. Trusted RPC code is uploaded outside the repository. Commands are validated and never interpolated from model text into VM shell code. Repository code runs inside the existing Docker policy: unprivileged user, capabilities dropped, read-only root filesystem, 512 MiB, one CPU, bounded PIDs/output/time, no Docker socket, PyPI-only installation proxy, and disabled networking for checks. A missing Docker/proxy fails closed. Remote source/validation mutations are detected.

VM IDs are saved before setup so cancellation can destroy them through a separate control process. Normal completion destroys the VM, and startup attempts cleanup of expired leased VMs. A three-minute idle timeout provides an additional cleanup boundary.

## Secrets and deployment

No secret uses a VITE_ prefix. Credentials are stored in provider runtime secret stores and ignored local files; .dockerignore/.gitignore exclude them from images, Git, and frontend output.

| Vercel production only | Railway worker only |
|---|---|
| GITHUB_TOKEN, DATABASE_URL, WORKER_WAKE_TOKEN | GITHUB_TOKEN, DATABASE_URL, GROQ_API_KEY, RAILWAY_TOKEN, WORKER_WAKE_TOKEN |
| CONTROL_REPO, OWNER_LOGIN, ALLOWED_REPOS, WORKER_URL, VERCEL_PRIVATE_OWNER_MODE=true | OWNER_LOGIN, ALLOWED_REPOS, APP_URL, model/job limits |

RAILWAY_TOKEN is scoped to PatchGoblin's production environment, not the whole account. Railway supplies RAILWAY_ENVIRONMENT_ID to the service. Groq and GitHub keys expire on **30 October 2026** and must be rotated before then. The GitHub token selects only the control repository and the lab, with Actions read, Contents/Issues/Pull requests/Workflows write, and Metadata read. No GitHub repository secrets or branch protection were changed.

Before enabling the Vercel owner adapter, set Vercel Authentication to **All Deployments** (ssoProtection.deploymentType=all). Public/shared operation requires a real per-user authentication adapter. Protected CLI verification uses `vercel curl`; a bypass credential stays in the CLI's private credential cache.

```sh
npm ci
uv sync --frozen --group dev
npm test
uv run pytest -q
uv run ruff check worker tests
npm run build:web
vercel deploy --prod
railway config plan
railway config apply --yes
railway up --service worker --detach
```

The Railway declaration preserves existing secrets and constrains only this project's worker. On Windows with npm-installed CLI wrappers, add the CLI's native bin directory to PATH for IaC's version check. Current schema migration/import: `uv run python scripts/migrate-neon.py` with repository root on PYTHONPATH and the ignored .env/.local/neon.env present. Live smoke scripts likewise require root PYTHONPATH. scripts/provision-migration.mjs passes secrets via stdin/private variable files; it is specific to the provisioned project and skips deployments while setting secrets.

Current validation: **42 Python tests and 13 API/entry tests passed**, TypeScript/production builds passed, real Neon transactions verified owner isolation, idempotency, exclusive claim, and cancellation write guards. Test records were rolled back. Anonymous Vercel API requests redirect to Authentication; unauthenticated Railway wake calls return 401. Client-supplied identity spoofing fails closed outside production.

## Costs and rollback

Vercel, Neon, and Groq use their current free plans. Railway uses the user's pre-existing Hobby workspace and its included usage/available credits; no plan upgrade or credit purchase was made. Worker/sandbox usage consumes those allowances and can become paid usage when they are exhausted. Sleeping and per-job destruction reduce compute usage but do not guarantee an indefinitely free Railway bill.

The builder and repair token list-price estimates were $0.000157 and $0.000537. These use Groq's [published GPT-OSS-20B rates](https://console.groq.com/docs/models), and are not account charges or total infrastructure cost. Groq Free rate limits can stop a job; provider failures are reported rather than replaced with invented results.

Rollback source remains in Git and the saved Sites versions; historical GitHub job evidence remains intact. Remove PRODUCTION_URL and restore the scoped GitHub secret before deliberately reactivating a legacy Sites version. New Neon jobs are not automatically exported back to GitHub issues. Stop accepting new jobs and finish/cancel active work before switching workers or databases.
