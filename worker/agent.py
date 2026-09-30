import difflib
import hashlib
import os
import tempfile
import time
from pathlib import Path
from worker.model import Model
from worker.project import Unsupported, inspect, make_workflow, workflow_plan
from worker.sandbox import Sandbox
from worker.security import safe_path, validate_patch, is_install_command, redact

TERMINAL = {"verified", "unsupported", "failed", "cancelled", "submitted"}


class Agent:
    def __init__(self, github, store, model=None, sandbox_factory=Sandbox):
        self.github, self.store, self.model, self.sandbox_factory = github, store, model, sandbox_factory
        self.start = time.monotonic()
        self.deadline = self.start + min(int(os.getenv("JOB_TIMEOUT_SECONDS", "600")), 900)
        self.state = {"status":"queued", "events":[], "verification":[], "patch":{}, "diff":"", "diagnosis":"",
                      "limitations":[], "metrics":{"model_tokens":None,"estimated_cost_usd":None}}

    def event(self, stage, message):
        if self.store.cancelled():
            raise InterruptedError("Job cancelled")
        if time.monotonic() > self.deadline:
            raise TimeoutError("Job runtime budget exhausted")
        self.state["status"] = stage
        self.state["events"].append({"stage":stage,"message":redact(message),"at":time.time()})
        self.state["metrics"]["duration_seconds"] = round(time.monotonic() - self.start, 2)
        if self.model:
            self.state["metrics"].update(self.model.metrics())
        self.store.save(self.state)

    def execute(self, request):
        previous = self.store.previous
        if previous and previous.get("status") in TERMINAL:
            return previous
        # A killed worker never silently restarts expensive work under a fresh budget.
        if previous and previous.get("status") not in {"queued", "inspect"}:
            previous["status"] = "failed"
            previous["limitations"].append("Worker interrupted. Safe recovery stopped this job; create an explicit new request.")
            self.store.save(previous)
            return previous
        sandbox = None
        try:
            self.event("inspect", "Reading immutable repository metadata and CI evidence")
            repo, mode = request["repo"], request["mode"]
            allowed = os.getenv("ALLOWED_REPOS", "wauul/patchgoblin-lab").split(",")
            if repo not in allowed or mode not in {"repair", "builder"}:
                raise ValueError("Repository or mode is not authorized")
            metadata = self.github.request("GET", f"/repos/{repo}")
            if metadata.get("private"):
                raise Unsupported("This free deployment supports allowlisted public repositories; private archives require a GitHub App installation")
            ci = self.github.ci_evidence(repo, int(request["run_id"])) if mode == "repair" else None
            branch = ci["branch"] if ci else request.get("ref", metadata["default_branch"])
            commit = self.github.request("GET", f"/repos/{repo}/commits/{branch}")
            sha = ci["sha"] if ci else commit["sha"]
            self.state.update({"repo":repo,"mode":mode,"base_ref":branch,"sha":sha,"run_url":ci["run_url"] if ci else None})
            with tempfile.TemporaryDirectory(prefix="patchgoblin-") as directory:
                root = Path(directory)
                self.github.download(repo, sha, root)
                protected = {p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob("*") if p.is_file()}
                project = inspect(root)
                self.state["project"] = {k:v for k,v in project.items() if k not in {"files","workflows"}}
                if not project["has_tests"]:
                    self.state["limitations"].append("Repository has no detected tests; dependency installation is not test coverage.")
                if mode == "builder" and project["workflows"]:
                    raise Unsupported("Existing workflows require review; builder will not replace CI")
                evidence = {"mode":mode,"project":project,"ci":ci,"candidate_workflow":make_workflow(project) if mode == "builder" else None}
                sandbox = self.sandbox_factory(root, self.store.cancelled, self.deadline)
                if mode == "repair":
                    path = safe_path(ci["workflow_path"].split("@", 1)[0])
                    if path not in project["workflows"]:
                        raise Unsupported("Failed workflow is not present at the failed commit")
                    python, commands, _ = workflow_plan(project["workflows"][path])
                    self.event("reproduce", "Running the original workflow commands in a disposable sandbox")
                    original = self.run_commands(sandbox, python, commands)
                    evidence["reproduction"] = original
                    self.state["reproduction"] = original
                    if not original or all(x["exit_code"] == 0 for x in original):
                        raise Unsupported("Original failure did not reproduce; no repair can be verified")
                    first_failure = next(x for x in original if x["exit_code"] != 0)
                    if not is_install_command(first_failure["command"]) and "ModuleNotFoundError" not in first_failure["logs"]:
                        raise Unsupported("Failure is outside dependency-installation scope")
                else:
                    self.event("reproduce", "Confirming CI is absent and inspecting the existing project checks")
                self.model = self.model or Model()
                attempts = 0
                originals = {k:(root / k).read_text() for k in project["files"]}
                for _ in range(min(int(os.getenv("MAX_STEPS", "6")), 6)):
                    self.event("investigate", "Selecting an evidence-backed investigation or minimal patch")
                    decision = self.model.decide(evidence)
                    self.state["diagnosis"] = str(decision.get("diagnosis", ""))[:3000]
                    self.state["category"] = str(decision.get("category", ""))[:100]
                    self.state["evidence"] = [str(x)[:1000] for x in decision.get("evidence", [])[:8]]
                    action = decision.get("action")
                    if action == "unsupported":
                        raise Unsupported(self.state["diagnosis"] or "Model found insufficient supported evidence")
                    if action == "read":
                        paths = decision.get("paths", [])
                        if not paths or len(paths) > 4:
                            raise ValueError("Investigation exceeds read budget")
                        evidence["additional_files"] = {safe_path(p):(root / safe_path(p)).read_text()[:8000] for p in paths if (root / safe_path(p)).is_file()}
                        continue
                    if action != "patch":
                        raise ValueError("Invalid model tool action")
                    attempts += 1
                    if attempts > min(int(os.getenv("MAX_ATTEMPTS", "2")), 2):
                        raise RuntimeError("Patch attempt budget exhausted")
                    files = decision.get("files", {})
                    try:
                        if "uv.lock" in files:
                            raise ValueError("Lockfiles must be refreshed by uv, never authored by the model")
                        validate_patch(files, mode, originals)
                    except ValueError as exc:
                        # Rejected candidates consume a patch attempt without touching the checkout.
                        # Give the model concrete policy feedback within the original budget.
                        evidence["rejected_candidate"] = {"reason":str(exc), "paths":list(files),
                                                          "remaining_attempts":2-attempts}
                        self.event("investigate", "Candidate rejected by patch policy; requesting a bounded correction")
                        continue
                    self.event("patch", f"Applying candidate {attempts} within the dependency/workflow allowlist")
                    # Revert previous candidate before applying the next. Tests were never writable by the model.
                    for p in self.state["patch"]:
                        if p in originals:
                            (root / p).write_text(originals[p])
                        else:
                            (root / p).unlink(missing_ok=True)
                    for p, content in files.items():
                        target = root / p
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.write_text(content)
                    updated = inspect(root)
                    if decision.get("refresh_lock"):
                        if project["manager"] != "uv":
                            raise ValueError("Lock refresh requires uv")
                        lock = sandbox.run("uv lock", updated["python"], install=True)
                        if lock["exit_code"]:
                            evidence["lock_refresh_failure"] = lock
                            continue
                        files["uv.lock"] = (root / "uv.lock").read_text()
                        validate_patch(files, mode, originals)
                    workflow_path = ".github/workflows/patchgoblin.yml" if mode == "builder" else path
                    python, commands, _ = workflow_plan((root / workflow_path).read_text())
                    if mode == "builder":
                        expected = [project["install"], *(["python -m pip install -r requirements-dev.txt"] if project["manager"] == "pip" and "requirements-dev.txt" in project["files"] else []), *project["checks"]]
                        if commands != expected:
                            raise ValueError("Builder must preserve detected installation and validation commands")
                        import yaml
                        generated = yaml.safe_load((root / workflow_path).read_text())
                        if generated.get("permissions") != {"contents":"read"} or set(generated.get("on", generated.get(True, {}))) != {"push","pull_request"}:
                            raise ValueError("Builder workflow must use minimal permissions and both CI events")
                    self.state["patch"] = files
                    self.state["diff"] = "".join("".join(difflib.unified_diff(originals.get(p, "").splitlines(True), content.splitlines(True), fromfile="a/"+p, tofile="b/"+p)) for p, content in files.items())
                    self.event("verify", "Running patched installation, then every original required check")
                    # Use a clean environment so previously installed dependencies cannot mask a failure.
                    import shutil
                    shutil.rmtree(root / ".venv", ignore_errors=True)
                    results = self.run_commands(sandbox, python, commands)
                    self.state["verification"] = results
                    for p, digest in protected.items():
                        if p not in files and (not (root / p).is_file() or hashlib.sha256((root / p).read_bytes()).hexdigest() != digest):
                            raise ValueError("Repository execution changed protected source or validation files")
                    if results and all(r["exit_code"] == 0 for r in results) and len(results) == len(commands):
                        self.state["status"] = "verified"
                        self.state["limitations"].append("Sandbox checks verified. Remote pull-request CI must be confirmed separately.")
                        self.state["metrics"].update(self.model.metrics())
                        self.state["metrics"].update({"duration_seconds":round(time.monotonic()-self.start, 2),"tool_calls":self.github.calls+sandbox.calls,"patch_attempts":attempts})
                        self.store.save(self.state)
                        return self.state
                    evidence["verification_failure"] = results
                raise RuntimeError("Investigation budget exhausted without a verified patch")
        except InterruptedError as exc:
            self.state.update({"status":"cancelled","diagnosis":str(exc)})
        except Unsupported as exc:
            self.state.update({"status":"unsupported","diagnosis":str(exc)})
        except Exception as exc:
            self.state.update({"status":"failed","diagnosis":redact(str(exc))[:1000]})
        finally:
            if sandbox:
                sandbox.close()
        if self.model:
            self.state["metrics"].update(self.model.metrics())
        self.state["metrics"].update({"duration_seconds":round(time.monotonic()-self.start,2), "tool_calls":self.github.calls + (sandbox.calls if sandbox else 0)})
        self.store.save(self.state)
        return self.state

    def run_commands(self, sandbox, python, commands):
        results = []
        for command in commands:
            result = sandbox.run(command, python, install=is_install_command(command))
            results.append(result)
            if result["exit_code"] != 0:
                break
        return results
