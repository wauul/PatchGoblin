# Model workflow and operations

PatchGoblin uses LangChain runnables inside a LangGraph decision graph:
`prepare -> infer -> validate`. Every production `Model.decide` call, including
repair, builder and maintenance, goes through this graph. Preparation retains
the existing task prompts, redaction, provider schemas and immutable proposal
binding. Inference retains exact/conservative prompt accounting, the six-call
limit, aggregate token budget and deadline. Validation parses JSON and binds
pipeline selections to their original proposal. The existing agent still owns
investigation, patch policy, cancellation, sandbox verification and submission.
The graph has no checkpoint storage and no automatic inference retries.

## Langfuse

Set these **worker-only** environment variables to enable observations:

```dotenv
PATCHGOBLIN_LANGFUSE_ENABLED=true
LANGFUSE_PUBLIC_KEY=<project public key>
LANGFUSE_SECRET_KEY=<project secret key>
LANGFUSE_BASE_URL=https://cloud.langfuse.com
LANGFUSE_TRACING_ENVIRONMENT=production
```

Use the URL for your Langfuse region or self-hosted instance. Restart the worker
after changing configuration. Empty credentials or the default disabled flag
leave tracing off. Keys must never appear in browser or extension configuration.

Each decision exports a manual generation observation with duration, measured
token usage when available, mode, provider, action, outcome, prompt hash and
pipeline version. Repository names, users, file paths, source, prompts, logs,
patch content, model responses and exception text are not sent. Missing usage
remains unavailable; it is never presented as zero-cost inference. No LangChain
callback handler is attached because those handlers capture prompts and outputs.
LangSmith automatic tracing is disabled around graph execution, even when its
environment flag is enabled. Langfuse uses its own tracer provider and exports
only the named decision observations. Exporter failures never retry inference
or change application error handling. CLI evaluations flush before exiting;
the long-lived worker batches exports and also flushes at process exit.

## LLMOps and release checks

- Dependencies are locked in `uv.lock`; run `uv sync --frozen --group dev`.
- Job metrics include `pipeline_version` and a SHA-256-derived `prompt_version`
  for the actual system instruction. Prompt changes stay in code review.
- CI runs HTTP-double model/graph tests, token accounting, policy and sandbox
  doubles, and a real-SDK in-memory export privacy check. These are regression
  checks, not live inference accuracy measurements.
- The manually dispatched evaluation workflow runs the existing real Qwen and
  Docker fixtures with `--gate`. All selected cases must pass the independent
  oracle and report no incorrect repairs. Unknown case IDs and empty reports
  fail. Reports include framework versions, prompt hashes and model metrics.

```powershell
uv run --frozen pytest -q
uv run --frozen ruff check worker tests
# Requires Docker and a configured real inference endpoint:
uv run --frozen python -m worker.evaluate --baseline --gate --output .local/llmops/evaluation.json
```

Use the full fixture run before a model/prompt release; a `--case` run checks only
that selected case. Review its report before deploying the same lockfile and
prompt code. Historical reports remain historical: the original 11/12 Qwen
score does not establish accuracy for this integration, and the strict gate
would reject that original result. No new live model evaluation, Langfuse Cloud
delivery or production deployment is implied by passing local regression tests.

SDK references: [LangChain runnables](https://reference.langchain.com/python/langchain-core/runnables/base),
[LangGraph graphs](https://reference.langchain.com/python/langgraph/graph),
[Langfuse Python SDK](https://python.reference.langfuse.com/langfuse).

## Connection verification — 7 October 2026

The [PatchGoblin EU Langfuse project](https://cloud.langfuse.com/project/cmuy7kz3s016lad0i4vto85x3/traces)
is configured on the Railway production worker. Its project keys are stored only
in ignored local configuration and server-side Railway variables; the IaC
manifest preserves those variables across future updates.

[Railway deployment b6f41d8f](https://railway.com/project/c3b25011-ba77-4886-b65e-1cb80d8d2a18/service/19040b88-a58d-4bf0-92f9-98c4ec0e23f1?id=b6f41d8f-8c1d-4588-90cf-d790d63cd650)
reported SUCCESS, and the worker health endpoint returned `{"status":"ok"}`.
This release used a worker-only snapshot of the local source, not a Git push.

A local synthetic assertion-failure fixture used real Groq inference through
the production decision graph and correctly returned `unsupported`. Langfuse's
`verification` environment showed trace `06aadc22719bb26475332cbef17a57f6`,
989 measured tokens (886 input, 103 output), success metadata and empty
prompt/response fields. Initial schema-rejected verification attempts remain
visible; an explicit required-fields instruction resolved the tested failure.
This one-case smoke check is not a new full evaluation score.

All 87 Python tests and Ruff passed. A direct inside-container smoke check was
blocked by absent Railway SSH keys. No production repository job was submitted
to establish end-to-end repair/submission behavior in this verification.
