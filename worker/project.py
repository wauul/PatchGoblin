import re
import tomllib
from pathlib import Path
import yaml
from packaging.specifiers import SpecifierSet
from packaging.version import Version


class Unsupported(ValueError):
    pass


def inspect(root: Path) -> dict:
    metadata = tomllib.loads((root / "pyproject.toml").read_text()) if (root / "pyproject.toml").exists() else {}
    if not metadata and not (root / "requirements.txt").exists():
        raise Unsupported("No supported Python project metadata or requirements.txt")
    if any((root / x).exists() for x in ["poetry.lock", "Pipfile.lock"]):
        raise Unsupported("Only pip and uv are supported")
    spec = metadata.get("project", {}).get("requires-python", ">=3.11")
    versions = [v for v in ["3.11", "3.12", "3.13"] if Version(v + ".0") in SpecifierSet(spec)]
    if not versions:
        raise Unsupported("Python requirement does not include a supported runtime (3.11–3.13)")
    uv = (root / "uv.lock").exists() or "uv" in metadata.get("tool", {})
    install = "uv sync --locked" if uv else "python -m pip install -r requirements.txt" if (root / "requirements.txt").exists() else "python -m pip install -e ."
    has_tests = any(root.glob("tests/test*.py")) or any(root.glob("test*.py"))
    checks = []
    readme = (root / "README.md").read_text()[:12000] if (root / "README.md").exists() else ""
    if has_tests:
        checks.append("uv run --locked python -m pytest" if uv else "python -m pytest")
    if "ruff" in metadata.get("tool", {}):
        checks.append("uv run --locked python -m ruff check ." if uv else "python -m ruff check .")
    # Execute only understood commands. Report custom commands instead of silently dropping them.
    workflows = {}
    for path in sorted((root / ".github/workflows").glob("*")):
        if path.suffix in {".yaml", ".yml"}:
            workflows[path.relative_to(root).as_posix()] = path.read_text()
    relevant = {}
    for path in ["pyproject.toml", "requirements.txt", "requirements-dev.txt", "uv.lock", ".python-version", "README.md"]:
        if (root / path).is_file():
            relevant[path] = (root / path).read_text()[:16000]
    relevant.update(workflows)
    return {"manager": "uv" if uv else "pip", "python": versions[0], "supported_versions": versions,
            "install": install, "checks": checks, "has_tests": has_tests, "files": relevant, "workflows": workflows,
            "documented_commands": re.findall(r"(?:python -m |uv run )[^\n`]+", readme)}


def workflow_plan(text: str) -> tuple[str, list[str], str]:
    data = yaml.safe_load(text)
    if not isinstance(data, dict):
        raise Unsupported("Invalid workflow")
    if data.get("env") or data.get("defaults"):
        raise Unsupported("Workflow environment/default overrides require manual review")
    jobs = data.get("jobs", {})
    if len(jobs) != 1:
        raise Unsupported("Initial runner supports one Python CI job; multiple jobs require manual review")
    job = next(iter(jobs.values()))
    if job.get("services") or job.get("container") or job.get("strategy"):
        raise Unsupported("Service/container/matrix workflows require manual review")
    if job.get("env") or job.get("defaults") or job.get("if") or job.get("continue-on-error"):
        raise Unsupported("Job environment or conditional policy requires manual review")
    python, commands = "3.11", []
    for step in job.get("steps", []):
        if step.get("if") or step.get("continue-on-error") or step.get("working-directory") or step.get("env"):
            raise Unsupported("Conditional or environment-dependent steps require manual review")
        uses = step.get("uses", "")
        if uses and not uses.startswith(("actions/checkout@", "actions/setup-python@", "astral-sh/setup-uv@")):
            raise Unsupported("Unsupported third-party workflow step")
        if uses.startswith("actions/checkout@") and set(step.get("with", {})) - {"fetch-depth", "persist-credentials"}:
            raise Unsupported("Custom checkout changes the repository execution context")
        if uses.startswith("actions/setup-python@"):
            python = str(step.get("with", {}).get("python-version", "3.11"))
        if "run" in step:
            for cmd in step["run"].strip().splitlines():
                validate_command(cmd)
                commands.append(cmd.strip())
    if not re.fullmatch(r"3\.(?:10|11|12|13)", python):
        raise Unsupported("Unsupported or dynamic Python runtime")
    if not commands:
        raise Unsupported("Workflow has no reproducible commands")
    return python, commands, next(iter(jobs))


def validate_command(cmd: str) -> None:
    from worker.security import is_install_command
    if not is_install_command(cmd) and not re.fullmatch(r"(?:python -m |uv run(?: --(?:frozen|locked))? (?:python -m )?)(?:pytest|ruff check \.)(?: -[a-zA-Z]+)*", cmd.strip()):
        raise Unsupported(f"Unsupported command requires manual review: {cmd[:160]}")
    if any(x in cmd for x in [";", "$", "`", "&&", "||", "\n"]):
        raise Unsupported("Shell expansion is forbidden")


def make_workflow(project: dict) -> str:
    steps = [{"uses": "actions/checkout@v4"}, {"uses": "actions/setup-python@v5", "with": {"python-version": project["python"]}}]
    if project["manager"] == "uv":
        steps.append({"uses": "astral-sh/setup-uv@v6", "with": {"enable-cache": True, "version":"0.8.22"}})
    elif "requirements.txt" in project["files"]:
        steps[1]["with"].update({"cache": "pip", "cache-dependency-path": "requirements*.txt"})
    steps.append({"name": "Install dependencies", "run": project["install"]})
    if project["manager"] == "pip" and "requirements-dev.txt" in project["files"]:
        steps.append({"name": "Install development dependencies", "run": "python -m pip install -r requirements-dev.txt"})
    steps += [{"name": f"Check {i + 1}", "run": cmd} for i, cmd in enumerate(project["checks"])]
    return yaml.safe_dump({"name": "Python CI", "on": {"push": {}, "pull_request": {}}, "permissions": {"contents": "read"},
                           "jobs": {"ci": {"runs-on": "ubuntu-latest", "timeout-minutes": 10, "steps": steps}}}, sort_keys=False)
