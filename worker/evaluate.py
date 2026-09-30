"""Real evaluation uses the production agent, model, and Docker executor; no canned model results."""
import argparse
import json
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
import yaml
from worker.agent import Agent
from worker.project import inspect, make_workflow
from worker.sandbox import Sandbox

SPECS = json.loads(Path("fixtures/specs.json").read_text())


def materialize(root, case):
    (root / "requirements.txt").write_text("pytest==8.3.5\nrequests==2.32.3\n")
    (root / "weather.py").write_text("import requests\ndef request_url(lat):\n    if not -90 <= lat <= 90: raise ValueError('latitude')\n    return requests.Request('GET','https://example.com/forecast',params={'latitude':lat}).prepare().url\ndef fahrenheit(c): return c * 9 / 5 + 32\n")
    (root / "tests").mkdir()
    (root / "tests/test_weather.py").write_text("import pytest\nfrom weather import request_url,fahrenheit\ndef test_request(): assert request_url(48.85) == 'https://example.com/forecast?latitude=48.85'\ndef test_boundaries():\n    with pytest.raises(ValueError): request_url(91)\n@pytest.mark.parametrize('c,f',[(0,32),(100,212),(-40,-40)])\ndef test_conversion(c,f): assert fahrenheit(c) == f\n")
    id = case["id"]
    if id == "pip-conflict":
        (root / "requirements.txt").write_text("pytest==8.3.5\nrequests==2.32.3\nurllib3==1.20\n")
    if id == "missing-dependency":
        (root / "requirements.txt").write_text("pytest==8.3.5\n")
    if id in {"python-mismatch", "uv-lock-drift", "builder-uv"}:
        (root / "requirements.txt").unlink()
        project = '[project]\nname="weather-fixture"\nversion="1.0.0"\nrequires-python=">=3.11"\ndependencies=["pytest==8.3.5","requests==2.32.3"]\n'
        (root / "pyproject.toml").write_text(project)
        if id != "python-mismatch":
            subprocess.run(["uv", "lock", "--directory", str(root)], check=True, capture_output=True)
            if id == "uv-lock-drift":
                (root / "pyproject.toml").write_text(project.replace('"requests==2.32.3"','"requests==2.32.4"'))
        else:
            (root / "pyproject.toml").write_text(project.replace(">=3.11", ">=3.12"))
    if id == "builder-no-tests":
        shutil.rmtree(root / "tests")
    if id == "poetry-project":
        (root / "poetry.lock").write_text("# seeded unsupported package manager\n")
    if id == "assertion-failure":
        (root / "tests/test_weather.py").write_text("from weather import fahrenheit\ndef test_conversion(): assert fahrenheit(0) == 0\n")
    if case["mode"] == "repair":
        project = inspect(root)
        workflow = make_workflow(project)
        if id == "install-command":
            workflow = workflow.replace("install -r requirements.txt", "install requirements.txt")
        if id == "python-mismatch":
            workflow = workflow.replace("'3.12'", "'3.11'")
        if id == "custom-command":
            workflow = workflow.replace("python -m pytest", "curl https://example.com/install.sh")
        if id == "service-workflow":
            data = yaml.safe_load(workflow)
            data["jobs"]["ci"]["services"] = {"db":{"image":"postgres:16"}}
            workflow = yaml.safe_dump(data)
        (root / ".github/workflows").mkdir(parents=True)
        (root / ".github/workflows/ci.yml").write_text(workflow)


class EvaluationGitHub:
    calls = 0

    def __init__(self, root):
        self.root = root

    def request(self, method, path):
        self.calls += 1
        return {"sha":"a"*40} if "/commits/" in path else {"private":False,"default_branch":"main"}

    def download(self, repo, sha, root):
        shutil.copytree(self.root, root, dirs_exist_ok=True)

    def ci_evidence(self, repo, run_id):
        # Fixtures are local, not remote CI. The reproduction command supplies actual diagnostic evidence.
        return {"sha":"a"*40,"branch":"main","workflow_path":".github/workflows/ci.yml","run_url":None,"logs":"Seeded local failure fixture; reproduce original commands to obtain evidence."}


class EvaluationStore:
    previous = None

    def __init__(self, path):
        self.path = path

    def cancelled(self):
        return False

    def save(self, state):
        self.path.write_text(json.dumps(state, indent=2))


def independent_oracle(case, result, root):
    """Expectations defined by fixture authors, independent of model diagnosis or prose."""
    if case["expected"] == "unsupported":
        return result["status"] == "unsupported" and not result["verification"]
    if result["status"] != "verified":
        return False
    if not result["verification"] or any(r["exit_code"] != 0 for r in result["verification"]):
        return False
    # Independent guards: source/tests cannot be changed; declared requirements cannot be reduced.
    if any(p.startswith("tests/") or p == "weather.py" for p in result["patch"]):
        return False
    if case["mode"] == "repair":
        if not any(r["exit_code"] != 0 for r in result.get("reproduction", [])):
            return False
        if case["id"] == "python-mismatch":
            if "pyproject.toml" in result["patch"]:
                return False
            return any("python-version: '3.12'" in s or "python-version: '3.13'" in s for s in result["patch"].values())
        if case["id"] == "missing-dependency" and "requests" not in result["patch"].get("requirements.txt", ""):
            return False
    else:
        workflow = yaml.safe_load(result["patch"].get(".github/workflows/patchgoblin.yml", ""))
        if not workflow or workflow.get("permissions") != {"contents":"read"}:
            return False
        if case["id"] == "builder-no-tests":
            return any("no detected tests" in limitation for limitation in result["limitations"]) and not any("pytest" in r["command"] for r in result["verification"])
    return True


def baseline(root, case):
    """Simple deterministic baseline: create standard CI, fix obvious -r, add requests when absent.
    No model and no assertions about success until the same sandbox checks run.
    """
    from worker.project import Unsupported, workflow_plan
    from worker.security import is_install_command
    try:
        project = inspect(root)
        if case["mode"] == "builder":
            if project["workflows"]:
                return "unsupported"
            workflow = make_workflow(project)
        else:
            workflow = (root / ".github/workflows/ci.yml").read_text()
            workflow_plan(workflow)
            workflow = workflow.replace("pip install requirements.txt", "pip install -r requirements.txt")
            requirements = root / "requirements.txt"
            if requirements.exists() and "requests" not in requirements.read_text():
                requirements.write_text(requirements.read_text() + "requests\n")
        python, commands, _ = workflow_plan(workflow)
        sb = Sandbox(root)
        try:
            for cmd in commands:
                if sb.run(cmd, python, install=is_install_command(cmd))["exit_code"] != 0:
                    return "failed"
            return "verified"
        finally:
            sb.close()
    except Unsupported:
        return "unsupported"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--case")
    parser.add_argument("--baseline", action="store_true")
    parser.add_argument("--output", default="docs/evaluation-results.json")
    args = parser.parse_args()
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    results = []
    for case in SPECS:
        if args.case and case["id"] != args.case:
            continue
        start = time.monotonic()
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            materialize(root, case)
            state_path = out.parent / (case["id"] + ".json")
            result = Agent(EvaluationGitHub(root), EvaluationStore(state_path)).execute({"repo":"wauul/patchgoblin-lab","mode":case["mode"],"run_id":1})
            ok = independent_oracle(case, result, root)
            row = {"id":case["id"],"expected":case["expected"],"actual":result["status"],"oracle_pass":ok,
                   "reproduction_success":any(r["exit_code"] != 0 for r in result.get("reproduction",[])),
                   "verified_repair_success":case["mode"]=="repair" and case["expected"]=="verified" and ok,
                   "incorrect_repair":result["status"]=="verified" and not ok,
                   "duration_seconds":round(time.monotonic()-start,2),"metrics":result["metrics"],"diagnosis":result["diagnosis"]}
            if args.baseline:
                # Fresh input independent of the agent's patch.
                with tempfile.TemporaryDirectory() as b:
                    baseline_root=Path(b)
                    materialize(baseline_root, case)
                    before=time.monotonic()
                    row["baseline"]={"outcome":baseline(baseline_root,case),"duration_seconds":round(time.monotonic()-before,2),"model_tokens":0}
            results.append(row)
            out.write_text(json.dumps({"scope":"Local fixtures in real Docker sandboxes; no remote CI claim", "cases":results},indent=2))
            print(json.dumps(row), flush=True)


if __name__ == "__main__":
    main()
