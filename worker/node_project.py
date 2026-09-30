import json
from pathlib import Path
from worker.coverage import detect, workflows
from worker.project import Unsupported, validate_command
import yaml


def inspect(root: Path):
    requirements = detect(root)
    units = [u for u in requirements["units"] if u["language"] == "node" and u["path"] == "."]
    if len(units) != 1:
        raise Unsupported(
            "Node repair currently requires one root package; monorepo CI creation and maintenance use individual packages"
        )
    unit = units[0]
    files = {
        p: (root / p).read_text()[:128000]
        for p in ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "README.md"]
        if (root / p).is_file()
    }
    files.update(workflows(root))
    return {
        "manager": unit["manager"],
        "language": "node",
        "python": unit["runtime"],
        "supported_versions": [unit["runtime"]],
        "install": unit["install"],
        "checks": unit["checks"],
        "has_tests": any("test" in s for s in unit["checks"]),
        "files": files,
        "workflows": workflows(root),
        "documented_commands": unit["documented_commands"],
    }


def workflow_plan(text):
    data = yaml.safe_load(text)
    jobs = data.get("jobs", {})
    if len(jobs) != 1 or data.get("env") or data.get("defaults"):
        raise Unsupported("Node repair needs one reproducible job without environment overrides")
    job = next(iter(jobs.values()))
    if any(job.get(k) for k in ["services", "strategy", "container", "env", "defaults", "if", "continue-on-error"]):
        raise Unsupported("Custom Node job policy requires manual review")
    runtime = "node:22"
    commands = []
    for step in job.get("steps", []):
        if any(step.get(k) for k in ["env", "if", "continue-on-error", "working-directory"]):
            raise Unsupported("Environment-dependent Node steps require manual review")
        uses = step.get("uses", "")
        if uses and not uses.startswith(("actions/checkout@", "actions/setup-node@", "pnpm/action-setup@")):
            raise Unsupported("Unsupported third-party Node workflow action")
        if uses.startswith("actions/setup-node@"):
            version = str(step.get("with", {}).get("node-version", "22")).removesuffix(".x")
            if version not in {"22", "24"}:
                raise Unsupported("Supported Node runtimes are 22 and 24")
            runtime = "node:" + version
        for command in step.get("run", "").splitlines():
            if command.strip() == "corepack enable":
                continue  # fixed trusted sandbox image already enables it
            validate_command(command)
            commands.append(command.strip())
    if not commands:
        raise Unsupported("Node workflow has no reproducible commands")
    return runtime, commands, next(iter(jobs))


def validate_manifest(original, updated):
    before, after = json.loads(original), json.loads(updated)
    for key in ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]:
        if not set(before.get(key, {})) <= set(after.get(key, {})):
            raise ValueError("Existing Node dependencies cannot be removed")
    if {
        k: v
        for k, v in before.items()
        if k not in {"dependencies", "devDependencies", "peerDependencies", "optionalDependencies"}
    } != {
        k: v
        for k, v in after.items()
        if k not in {"dependencies", "devDependencies", "peerDependencies", "optionalDependencies"}
    }:
        raise ValueError("Node scripts, runtime constraints and package-manager policy must be preserved")
