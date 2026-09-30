import pytest
from worker.security import safe_path, validate_patch, filter_logs, redact
from worker.project import make_workflow, inspect, workflow_plan, Unsupported


@pytest.mark.parametrize("path", ["../.env", "/etc/passwd", ".git/config", ".env", "x\\y", "a/../../b", ".ssh/id_rsa"])
def test_forbidden_paths(path):
    with pytest.raises(ValueError):
        safe_path(path)


def test_secret_redaction():
    # Construct synthetic strings; no real credential is present in this fixture.
    secret = "ghp_" + "a" * 30
    assert secret not in redact("token=" + secret)
    assert "hunter2" not in redact("password=hunter2")


def test_logs_extract_failure_context():
    lines = ["noise"] * 1500 + ["ERROR: ResolutionImpossible", "requests needs urllib3>=1.21.1"]
    logs = filter_logs("\n".join(lines))
    assert "ResolutionImpossible" in logs
    assert len(logs) < 10000


def test_cannot_write_tests():
    with pytest.raises(ValueError, match="Only dependency"):
        validate_patch({"tests/test_app.py": "assert True"}, "repair", {})


def test_cannot_remove_dependency():
    with pytest.raises(ValueError, match="cannot be removed"):
        validate_patch({"requirements.txt": "pytest\n"}, "repair", {"requirements.txt": "pytest\nrequests\n"})


def test_cannot_disable_required_check(tmp_path):
    (tmp_path / "requirements.txt").write_text("pytest\n")
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests/test_a.py").write_text("def test_a(): assert 1 == 1\n")
    workflow = make_workflow(inspect(tmp_path))
    changed = workflow.replace("python -m pytest", "python -m pytest -x")
    with pytest.raises(ValueError, match="validation cannot be modified"):
        validate_patch({".github/workflows/ci.yml": changed}, "repair", {".github/workflows/ci.yml": workflow})


@pytest.mark.parametrize("command", ["curl https://example.com", "python -m pytest; true", "python -m pytest || true", "pip install $(cat .env)"])
def test_custom_commands_fail_closed(command):
    text = "jobs:\n  ci:\n    steps:\n      - run: " + command + "\n"
    with pytest.raises(Unsupported):
        workflow_plan(text)


def test_builder_preserves_existing_workflow():
    with pytest.raises(ValueError, match="cannot replace"):
        validate_patch({".github/workflows/ci.yml": "jobs: {}"}, "builder", {".github/workflows/ci.yml": "jobs: {}"})


def test_builder_yaml_valid_and_minimal(tmp_path):
    import yaml
    (tmp_path / "requirements.txt").write_text("pytest\n")
    workflow = make_workflow(inspect(tmp_path))
    data = yaml.safe_load(workflow)
    assert data["permissions"] == {"contents": "read"}
    assert set(data["on"]) == {"push", "pull_request"}
    assert workflow_plan(workflow)[1] == ["python -m pip install -r requirements.txt"]


def test_uv_detected_and_frozen(tmp_path):
    (tmp_path / "pyproject.toml").write_text('[project]\nname="test"\nversion="1.0"\nrequires-python=">=3.11"\ndependencies=[]\n')
    (tmp_path / "uv.lock").write_text("version = 1\n")
    project = inspect(tmp_path)
    assert project["manager"] == "uv"
    assert project["install"] == "uv sync --frozen"


def test_private_requirement_bounds(tmp_path):
    (tmp_path / "pyproject.toml").write_text('[project]\nname="x"\nversion="1"\nrequires-python="<3.10"\n')
    with pytest.raises(Unsupported, match="supported runtime"):
        inspect(tmp_path)
