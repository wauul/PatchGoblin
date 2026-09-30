"""Bounded model-selected pipeline changes with deterministic coverage and isolated checks."""

import difflib
import hashlib
import tempfile
import time
from pathlib import Path
from worker.agent import Agent
from worker.coverage import proposal, workflows, validate_maintenance
from worker.model import Model
from worker.project import Unsupported
from worker.security import redact, is_install_command
from worker.submit import pending_maintenance


class PipelineAgent(Agent):
    def execute(self, request):
        sandbox = None
        try:
            if self.store.previous and self.store.previous.get("status") in {
                "submitted",
                "verified",
                "failed",
                "unsupported",
                "cancelled",
            }:
                return self.store.previous
            self.event("inspect", "Comparing repository manifests and declared checks with actual workflow coverage")
            repo = request["repo"]
            metadata = self.github.request("GET", f"/repos/{repo}")
            ref = request.get("ref") or metadata["default_branch"]
            commit = self.github.request("GET", f"/repos/{repo}/commits/{ref}")
            sha = request.get("sha") or commit["sha"]
            if sha != commit["sha"]:
                raise Unsupported(
                    "A newer repository commit superseded this event; no stale pipeline change was attempted"
                )
            self.state.update(
                repo=repo, mode=request["mode"], base_ref=request.get("base_ref") or ref, sha=sha, source_ref=ref
            )
            parents = commit.get('parents',[])
            if parents:
                comparison = self.github.request('GET',f"/repos/{repo}/compare/{parents[0]['sha']}...{sha}")
                self.state['changed_files'] = [{'path':x['filename'],'status':x['status']} for x in comparison.get('files',[])[:100]]
            with tempfile.TemporaryDirectory(prefix="patchgoblin-") as directory:
                root = Path(directory)
                self.github.download(repo, sha, root)
                if request["mode"] == "maintenance":
                    pending_pr = pending_maintenance(self.github, repo, {**request, 'base_ref': self.state['base_ref']})
                    if pending_pr:
                        from worker.coverage import MANAGED
                        import base64

                        pending = self.github.request(
                            "GET", f"/repos/{repo}/contents/{MANAGED}?ref={pending_pr['head']['ref']}"
                        )
                        (root / MANAGED).parent.mkdir(parents=True, exist_ok=True)
                        (root / MANAGED).write_bytes(base64.b64decode(pending["content"]))
                        self.state["maintenance_pr_sha"] = pending_pr["head"]["sha"]
                        self.state['maintenance_branch'] = pending_pr['head']['ref']
                plan = proposal(root, request["mode"])
                self.state["coverage"] = plan["coverage"]
                self.state["evidence"] = [plan["reason"]]
                if not plan["files"]:
                    self.state.update(status="unsupported", category="already-covered", diagnosis=plan["reason"])
                    self.store.save(self.state)
                    return self.state
                protected = {
                    p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in root.rglob("*")
                    if p.is_file()
                }
                originals = workflows(root)
                evidence = {
                    "mode": request["mode"],
                    "changed_files": self.state.get('changed_files',[]),
                    "project": {
                        "files": originals,
                        "manager": plan["coverage"]["requirements"]["units"][0]["manager"],
                        "units": plan["coverage"]["requirements"]["units"],
                    },
                    "candidate_workflow": next(iter(plan["files"].values())),
                    "candidate_files": plan["files"],
                    "coverage_gap": plan["reason"],
                    "coverage_before": {
                        "covered": plan["coverage"]["covered"],
                        "pipelines": plan["coverage"]["pipelines"],
                    },
                }
                self.event(
                    "reproduce",
                    "Detected uncovered project checks from manifests, runtime constraints and existing CI commands",
                )
                self.model = self.model or Model()
                self.model.deadline = self.deadline
                self.event("investigate", "Asking the model to assess evidence and select the minimal coverage update")
                decision = self.model.decide(evidence)
                self.state["diagnosis"] = redact(decision.get("diagnosis", ""))[:3000]
                self.state["category"] = "pipeline-coverage"
                if decision.get("action") == "unsupported":
                    raise Unsupported(self.state["diagnosis"])
                if decision.get("action") != "patch" or decision.get("files") != plan["files"]:
                    raise ValueError(
                        "Pipeline proposal changed outside the deterministic coverage plan; no unverified custom workflow is accepted"
                    )
                validate_maintenance(originals, plan["files"])
                sandbox = self.sandbox_factory(root, self.store.cancelled, self.deadline)
                self.event("patch", "Adding uncovered checks while preserving every existing workflow job and policy")
                for path, text in plan["files"].items():
                    (root / path).parent.mkdir(parents=True, exist_ok=True)
                    (root / path).write_text(text)
                self.state["patch"] = plan["files"]
                self.state["diff"] = "".join(
                    "".join(
                        difflib.unified_diff(
                            originals.get(p, "").splitlines(True),
                            text.splitlines(True),
                            fromfile="a/" + p,
                            tofile="b/" + p,
                        )
                    )
                    for p, text in plan["files"].items()
                )
                self.event("verify", "Running the proposed installation and project checks in isolation")
                results = []
                for item in plan["commands"]:
                    result = sandbox.run(
                        item["command"], item["runtime"], install=is_install_command(item["command"]), cwd=item["path"]
                    )
                    result["working_directory"] = item["path"]
                    results.append(result)
                    if result["exit_code"] != 0:
                        break
                self.state["verification"] = results
                for path, digest in protected.items():
                    if path not in plan["files"] and (
                        not (root / path).is_file() or hashlib.sha256((root / path).read_bytes()).hexdigest() != digest
                    ):
                        raise ValueError("Repository execution changed protected source or validation")
                if len(results) != len(plan["commands"]) or any(x["exit_code"] != 0 for x in results):
                    raise Unsupported(
                        "The proposed CI commands did not verify. No maintenance pull request was opened."
                    )
                self.state["status"] = "verified"
                self.state["limitations"].append(
                    "Only new coverage commands were executed locally. Existing hand-written jobs are preserved; complete remote workflow validation is reported separately."
                )
        except InterruptedError as exc:
            self.state.update(status="cancelled", diagnosis=str(exc))
        except Unsupported as exc:
            self.state.update(status="unsupported", diagnosis=redact(str(exc)))
        except Exception as exc:
            self.state.update(status="failed", diagnosis=redact(str(exc))[:1000])
        finally:
            if sandbox:
                sandbox.close()
        if self.model:
            self.state["metrics"].update(self.model.metrics())
        self.state["metrics"].update(
            duration_seconds=round(time.monotonic() - self.start, 2),
            tool_calls=self.github.calls + (sandbox.calls if sandbox else 0),
            patch_attempts=1 if self.state["patch"] else 0,
        )
        self.store.save(self.state)
        return self.state
