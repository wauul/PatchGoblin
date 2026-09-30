import json
import yaml
import pytest
from worker.coverage import detect, proposal, validate_maintenance, node_runtime
from worker.project import Unsupported
from worker.node_project import validate_manifest


def node_project(root, scripts=None):
    (root / "package.json").write_text(
        json.dumps(
            {
                "name": "fixture",
                "version": "1.0.0",
                "engines": {"node": ">=22 <25"},
                "scripts": scripts or {"test": "node --test"},
            }
        )
    )
    (root / "package-lock.json").write_text('{"lockfileVersion":3,"packages":{}}')


def test_maintenance_adds_new_package_without_changing_custom_workflow(tmp_path):
    node_project(tmp_path)
    folder = tmp_path / ".github/workflows"
    folder.mkdir(parents=True)
    original = """# Hand-written customization must remain byte-for-byte intact.
name: Custom CI
on: [push, pull_request]
permissions: {contents: read}
jobs:
  custom:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with: {node-version: '22'}
      - run: npm ci
      - run: npm run test
      - run: echo "custom report"
"""
    (folder / "ci.yml").write_text(original)
    nested = tmp_path / "apps/site"
    nested.mkdir(parents=True)
    node_project(nested, {"typecheck": "tsc --noEmit", "build": "vite build"})
    plan = proposal(tmp_path, "maintenance")
    assert (folder / "ci.yml").read_text() == original
    generated = yaml.safe_load(next(iter(plan["files"].values())))
    assert len(generated["jobs"]) == 1
    assert {x["path"] for x in plan["commands"]} == {"apps/site"}
    assert {x["command"] for x in plan["commands"]} == {"npm ci", "npm run typecheck", "npm run build"}


def test_no_coverage_gap_means_no_patch_or_model_work(tmp_path):
    node_project(tmp_path)
    first = proposal(tmp_path, "builder")
    for path, text in first["files"].items():
        target = tmp_path / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)
    second = proposal(tmp_path, "maintenance")
    assert second["files"] == {} and second["commands"] == []


def test_manually_customized_managed_jobs_cannot_be_replaced():
    original = {
        "name": "CI",
        "on": ["push"],
        "permissions": {"contents": "read"},
        "jobs": {"handwritten": {"runs-on": "ubuntu-latest", "steps": [{"run": "echo important"}]}},
    }
    changed = {**original, "jobs": {}}
    with pytest.raises(ValueError, match="customization"):
        validate_maintenance(
            {".github/workflows/a.yml": yaml.safe_dump(original)}, {".github/workflows/a.yml": yaml.safe_dump(changed)}
        )


def test_path_filters_missing_new_package_require_coverage(tmp_path):
    node_project(tmp_path)
    p = tmp_path / ".github/workflows/ci.yml"
    p.parent.mkdir(parents=True)
    p.write_text("""name: CI
on:
  push:
    paths: ['legacy/**']
jobs:
  test:
    steps:
      - uses: actions/setup-node@v4
        with: {node-version: '22'}
      - run: npm ci
      - run: npm run test
""")
    assert proposal(tmp_path, "maintenance")["files"]


def test_detects_services_and_reports_unverified_boundary(tmp_path):
    node_project(tmp_path)
    (tmp_path / "compose.yaml").write_text("services:\n  postgres: {image: postgres:18}\n")
    assert detect(tmp_path)["services"] == ["compose.yaml"]
    with pytest.raises(Unsupported, match="Service dependencies"):
        proposal(tmp_path, "builder")


def test_node_repairs_cannot_weaken_scripts_or_remove_dependencies():
    original = json.dumps({"scripts": {"test": "node --test"}, "dependencies": {"a": "1.0"}})
    with pytest.raises(ValueError, match="dependencies"):
        validate_manifest(original, json.dumps({"scripts": {"test": "node --test"}, "dependencies": {}}))
    with pytest.raises(ValueError, match="scripts"):
        validate_manifest(original, json.dumps({"scripts": {"test": "exit 0"}, "dependencies": {"a": "1.0"}}))


def test_node_versions_are_selected_from_actual_constraints():
    assert node_runtime(">=22 <25") == "node:22"
    assert node_runtime("^24.0.0") == "node:24"
    with pytest.raises(Unsupported):
        node_runtime(">=26")
