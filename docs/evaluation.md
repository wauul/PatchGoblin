# Measured evaluation — September 30, 2026

The complete 12-fixture snapshot is [run 7](https://github.com/wauul/PatchGoblin/actions/runs/36715987219), source `d7bc5171293aef95302ca4af960b241c909180e9`. It used real Qwen Coder 7B inference and production agent code with actual Docker commands on a free public GitHub runner. The fixture adapter supplies immutable local input, not canned decisions or command results. This is sandbox verification, separate from target-repository CI.

| Fixture | Expected | Actual | Independent acceptance | Seconds | Model tokens | Tool calls | Baseline |
|---|---|---|---|---:|---:|---:|---|
| pip-conflict | verified | verified | pass | 105.92 | 1,258 | 10 | failed |
| missing-dependency | verified | verified | pass | 79.29 | 1,698 | 10 | verified |
| python-mismatch | verified | verified | pass | 75.22 | 1,257 | 16 | failed |
| install-command | verified | verified | pass | 95.98 | 2,290 | 9 | verified |
| uv-lock-drift | verified | verified | pass | 74.64 | 1,608 | 10 | failed |
| builder-pip | verified | verified | pass | 63.47 | 1,001 | 8 | verified |
| builder-uv | verified | unsupported | fail | 91.26 | 1,644 | 4 | verified |
| builder-no-tests | verified | verified | pass | 48.42 | 959 | 7 | verified |
| assertion-failure | unsupported | unsupported | pass | 6.68 | no inference | 10 | failed |
| poetry-project | unsupported | unsupported | pass | 0.00* | no inference | 2 | unsupported |
| custom-command | unsupported | unsupported | pass | 0.02 | no inference | 4 | unsupported |
| service-workflow | unsupported | unsupported | pass | 0.02 | no inference | 4 | unsupported |

*Runtime is rounded to hundredths; 0.00 is a fast classification, not proof of zero work. Pre-inference cases retain null provider-usage values in the raw artifacts.

- Acceptance: **11/12**, including **5/5 repairs**, **2/3 builders**, and **4/4 unsupported cases**.
- All five supported repair failures reproduced before patching. The assertion failure also reproduced and was rejected without editing tests.
- Incorrect verified repairs: **0/5**. Seven total verified outputs passed their independent oracle. This small author-defined suite is not an estimate of general-world reliability.
- Real measured tokens: **11,715**; tool calls: **94**; summed agent/fixture runtime: **640.92 seconds**. The complete runner took 12m51s, including model setup, baseline, and artifact handling.
- Baseline: **2/5 repairs**, **3/3 builders**, **3/4 unsupported classifications**, **8/12 expected outcomes**; 48.79 summed seconds, zero model tokens. Its assertion case failed rather than explicitly reporting unsupported. The baseline's uv builder success exposed the model's mistaken rejection.
- Estimated dollars remain unavailable: there is no billing meter. Inference used the free runner CPU, with no external model subscription or credits purchased.

The uv drift result changes only the canonical `uv.lock`; valid project metadata is retained. Source and semantic tests remain unchanged. The no-tests builder verifies installation and explicitly reports absent test coverage.

## Evidence and provenance

[Aggregate JSON](evaluation-results.json), [all run-7 case artifacts](evaluations/run-7/), and [source/run manifest](evaluations/manifest.json) retain diagnostics, actual commands, exits, logs, patches, and usage. The evaluation workflow intentionally collects failures and can finish green when an agent case fails; only independent fixture acceptance counts here.

## Targeted uv builder correction

[Run 8](https://github.com/wauul/PatchGoblin/actions/runs/36717541679), source `880d55a1353a7e1058a786ef22df20f50df124c9`, retested **only builder-uv** after clarifying the Python/runtime/tool version semantics. It **passed independent acceptance**, with one real inference call, **1,735 tokens**, **9 tool calls**, one patch attempt, and **129.66 seconds**. The baseline passed in 5.51 seconds. [Raw evidence](evaluations/run-8/builder-uv.json) includes actual installation and unchanged test commands, a minimal-permission workflow patch, and provider usage.

The model rationale was internally contradictory about the uv version despite generating a valid workflow. Model narrative is not verification evidence; the deterministic policy and actual command exits establish this result. This explanation-quality limitation is retained, not silently rewritten. Run 7's complete 11/12 snapshot remains the reported benchmark; the successful one-case retest is not represented as a new 12/12 run.

## Development results retained

| Run | Model/configuration | Repairs | Builders | Unsupported |
|---|---|---:|---:|---:|
| [3](https://github.com/wauul/PatchGoblin/actions/runs/36709047005) | 3B, initial prompt | 2/5 | 0/3 | 4/4 |
| [4](https://github.com/wauul/PatchGoblin/actions/runs/36710514898) | 3B, revised prompt | 1/5 | 3/3 | 4/4 |
| [6](https://github.com/wauul/PatchGoblin/actions/runs/36713471251) | 7B, before lock refresh/tool correction | 4/5 | 2/3 | 4/4 |
| [7](https://github.com/wauul/PatchGoblin/actions/runs/36715987219) | 7B, canonical lock refresh | 5/5 | 2/3 | 4/4 |

Original aggregate artifacts are retained under `evaluations/`. Earlier experimental oracles were strengthened for uv drift; use run 7 for the current independent acceptance criteria. [Run 1](https://github.com/wauul/PatchGoblin/actions/runs/36707401286) stopped at a sandbox host-permission setup error; [run 2](https://github.com/wauul/PatchGoblin/actions/runs/36708046450) encountered the retired GitHub Models endpoint; [run 5](https://github.com/wauul/PatchGoblin/actions/runs/36712313782) was cancelled after revealing an overly short inference timeout. These are development failures, not successful evaluations.

## Real pull requests

The separate live deployed control plane submitted [builder PR 1](https://github.com/wauul/patchgoblin-lab/pull/1) and [repair PR 2](https://github.com/wauul/patchgoblin-lab/pull/2). Both passed six unchanged tests in the sandbox and their actual push/pull-request Actions workflows. No PR was merged. Hosted API checks are recorded in [deployed-verification.json](deployed-verification.json). The UI screenshot uses the local frontend with the deployed API through a server-side owner-service proxy; the available browser's normal hosted ChatGPT sign-in returned an upstream parsing error.
