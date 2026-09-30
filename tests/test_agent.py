import shutil
from worker.agent import Agent
from worker.project import make_workflow, inspect


class Store:
    previous = None

    def __init__(self):
        self.saved = []
        self.cancel = False

    def cancelled(self):
        return self.cancel

    def save(self, state):
        import copy
        self.saved.append(copy.deepcopy(state))


class GitHubFixture:
    calls = 0

    def __init__(self, root):
        self.root = root

    def request(self, method, path):
        self.calls += 1
        if "/commits/" in path:
            return {"sha": "f" * 40}
        return {"private": False, "default_branch": "main"}

    def download(self, repo, sha, root):
        shutil.copytree(self.root, root, dirs_exist_ok=True)

    def ci_evidence(self, repo, run_id):
        return {"sha":"f"*40,"branch":"main","workflow_path":".github/workflows/ci.yml","run_url":"https://github.com/example/run","logs":"ModuleNotFoundError: No module named requests"}


class TestModel:
    __test__ = False
    tokens = 0

    def __init__(self, files):
        self.files = files

    def decide(self, evidence):
        return {"action":"patch","files":self.files,"diagnosis":"Synthetic decision for orchestration test only","evidence":[]}

    def metrics(self):
        return {"model_tokens":None,"model_calls":0,"estimated_cost_usd":None}


class SimulatedSandbox:
    """Unit test double. NEVER used by the application or real evaluation suite."""
    calls = 0

    def __init__(self, root, cancelled, deadline):
        self.root = root

    def run(self, command, python, install=False):
        self.calls += 1
        missing = command == "python -m pytest" and "requests" not in (self.root / "requirements.txt").read_text()
        return {"command":command,"exit_code":1 if missing else 0,"logs":"ModuleNotFoundError: No module named requests" if missing else "", "duration_seconds":0,"network":"unit-test-double"}

    def close(self):
        pass


def fixture(root):
    (root / "requirements.txt").write_text("pytest\n")
    (root / "tests").mkdir()
    (root / "tests/test_a.py").write_text("import requests\ndef test_a(): assert requests.__version__\n")
    (root / ".github/workflows").mkdir(parents=True)
    (root / ".github/workflows/ci.yml").write_text(make_workflow(inspect(root)))


def test_verified_patch_preserves_test_and_runs_all_checks(tmp_path, monkeypatch):
    monkeypatch.setenv("ALLOWED_REPOS", "wauul/patchgoblin-lab")
    fixture(tmp_path)
    original = (tmp_path / "tests/test_a.py").read_text()
    store = Store()
    result = Agent(GitHubFixture(tmp_path), store, TestModel({"requirements.txt":"pytest\nrequests\n"}), SimulatedSandbox).execute({"repo":"wauul/patchgoblin-lab","mode":"repair","run_id":1})
    assert result["status"] == "verified"
    assert result["reproduction"][-1]["exit_code"] == 1
    assert len(result["verification"]) == 2
    assert (tmp_path / "tests/test_a.py").read_text() == original
    assert {e["stage"] for e in result["events"]} >= {"inspect","reproduce","investigate","patch","verify"}


def test_cancellation_never_invokes_model(tmp_path):
    fixture(tmp_path)
    store = Store()
    store.cancel = True
    result = Agent(GitHubFixture(tmp_path), store, TestModel({}), SimulatedSandbox).execute({"repo":"wauul/patchgoblin-lab","mode":"builder"})
    assert result["status"] == "cancelled"


def test_worker_restart_does_not_reset_budget(tmp_path):
    store = Store()
    store.previous = {"status":"patch","limitations":[]}
    result = Agent(GitHubFixture(tmp_path), store, TestModel({}), SimulatedSandbox).execute({})
    assert result["status"] == "failed"
    assert "interrupted" in result["limitations"][0]


def test_terminal_jobs_are_idempotent(tmp_path):
    store = Store()
    store.previous = {"status":"verified","patch":{"requirements.txt":"pytest\n"}}
    github = GitHubFixture(tmp_path)
    result = Agent(github, store, TestModel({}), SimulatedSandbox).execute({})
    assert result == store.previous
    assert github.calls == 0


def test_rejected_candidate_gets_bounded_correction_without_execution(tmp_path):
    fixture(tmp_path)

    class CorrectingModel(TestModel):
        calls = 0

        def decide(self, evidence):
            self.calls += 1
            if self.calls == 1:
                return {"action":"patch", "files":{"tests/test_a.py":"assert True\n"}}
            assert evidence["rejected_candidate"]["remaining_attempts"] == 1
            return {"action":"patch", "files":{"requirements.txt":"pytest\nrequests\n"}}

    model = CorrectingModel({})
    result = Agent(GitHubFixture(tmp_path), Store(), model, SimulatedSandbox).execute({"repo":"wauul/patchgoblin-lab","mode":"repair","run_id":1})
    assert result["status"] == "verified"
    assert result["metrics"]["patch_attempts"] == 2
    assert "tests/test_a.py" not in result["patch"]
    assert model.calls == 2
