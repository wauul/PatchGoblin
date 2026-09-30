"""Evidence-backed CI requirements and coverage. Repository content is data, never policy."""

import fnmatch
import hashlib
import io
import json
import re
from pathlib import Path
import yaml
from ruamel.yaml import YAML
from worker.project import Unsupported, inspect as python_inspect
from worker.security import safe_path
from worker.node_manager import manager_version

MANAGED = ".github/workflows/patchgoblin-maintenance.yml"
SCRIPT_NAMES = {"test", "test:unit", "test:ci", "lint", "typecheck", "type-check", "check", "build"}


def manifests(root):
    paths = []
    for name in ["package.json", "pyproject.toml", "requirements.txt"]:
        paths.extend(root.rglob(name))
    return sorted(
        {
            p.parent
            for p in paths
            if len(p.relative_to(root).parts) < 6
            and not any(x in p.parts for x in ["node_modules", ".venv", ".git", "vendor"])
        }
    )[:12]


def detect(root: Path):
    units = []
    for folder in manifests(root):
        path = folder.relative_to(root).as_posix()
        if (folder / "package.json").is_file():
            package = json.loads((folder / "package.json").read_text())
            declared = package.get("packageManager", "")
            manager = (
                declared.split("@")[0]
                if declared
                else "pnpm"
                if (folder / "pnpm-lock.yaml").exists()
                else "yarn"
                if (folder / "yarn.lock").exists()
                else "npm"
            )
            if manager not in {"npm", "pnpm", "yarn"}:
                raise Unsupported("Unsupported Node package manager: " + manager)
            root_package = json.loads((root / "package.json").read_text()) if (root / "package.json").is_file() else {}
            workspace = folder != root and bool(
                root_package.get("workspaces") or (root / "pnpm-workspace.yaml").exists()
            )
            if workspace:
                root_manager = root_package.get("packageManager", "").split("@")[0]
                manager = root_manager or (
                    "pnpm" if (root / "pnpm-lock.yaml").exists() else "yarn" if (root / "yarn.lock").exists() else "npm"
                )
                declared = root_package.get('packageManager', '')
            version = manager_version(manager, declared)
            lock = {"npm": "package-lock.json", "pnpm": "pnpm-lock.yaml", "yarn": "yarn.lock"}[manager]
            install_dir = root if workspace else folder
            if not (install_dir / lock).exists():
                raise Unsupported(f"{path}: committed {lock} is required for reproducible installation")
            spec = package.get("engines", {}).get("node", root_package.get("engines", {}).get("node", ">=22"))
            runtime = node_runtime(str(spec))
            scripts = package.get("scripts", {})
            checks = [f"{manager} run {s}" for s in scripts if s in SCRIPT_NAMES]
            readme = (folder / "README.md").read_text()[:12000] if (folder / "README.md").exists() else ""
            frameworks = sorted(set(package.get("dependencies", {})) | set(package.get("devDependencies", {})))
            test_dirs = [
                p.relative_to(folder).as_posix()
                for p in folder.iterdir()
                if p.is_dir() and p.name in {"test", "tests", "__tests__", "e2e"}
            ]
            if (test_dirs or any(x in frameworks for x in ["vitest", "jest", "mocha", "@playwright/test"])) and not any(
                "test" in c for c in checks
            ):
                raise Unsupported(
                    f"{path}: tests detected without a declared test command. Declare a package script before automation."
                )
            units.append(
                {
                    "path": path,
                    "language": "node",
                    "manager": manager,
                    "manager_version": version,
                    "runtime": runtime,
                    "runtime_requirement": spec,
                    "install": {
                        "npm": "npm ci",
                        "pnpm": "pnpm install --frozen-lockfile",
                        "yarn": "yarn install --frozen-lockfile",
                    }[manager],
                    "install_path": install_dir.relative_to(root).as_posix(),
                    "checks": checks,
                    "frameworks": [
                        x
                        for x in frameworks
                        if x in {"vitest", "jest", "mocha", "typescript", "eslint", "next", "vite", "@playwright/test"}
                    ],
                    "test_directories": test_dirs,
                    "documented_commands": re.findall(r"(?:npm|pnpm|yarn) (?:run )?[\w:-]+", readme),
                    "evidence_files": [
                        safe_path((folder / "package.json").relative_to(root).as_posix()),
                        safe_path((install_dir / lock).relative_to(root).as_posix()),
                    ],
                }
            )
        if (folder / "pyproject.toml").exists() or (folder / "requirements.txt").exists():
            p = python_inspect(folder)
            units.append(
                {
                    "path": path,
                    "language": "python",
                    "manager": p["manager"],
                    "runtime": p["python"],
                    "runtime_requirement": p["supported_versions"],
                    "install": p["install"],
                    "install_path": path,
                    "checks": p["checks"],
                    "frameworks": ["pytest"] if p["has_tests"] else [],
                    "test_directories": ["tests"] if p["has_tests"] else [],
                    "documented_commands": p["documented_commands"],
                    "evidence_files": [
                        safe_path((folder / name).relative_to(root).as_posix())
                        for name in p["files"]
                        if name
                        in {"pyproject.toml", "requirements.txt", "requirements-dev.txt", "uv.lock", ".python-version"}
                    ],
                }
            )
    if not units:
        raise Unsupported("No supported Python or Node project manifests found")
    services = [
        p.relative_to(root).as_posix()
        for p in root.rglob("*")
        if p.is_file()
        and p.name in {"docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"}
        and len(p.relative_to(root).parts) < 5
    ]
    configs = [
        p.relative_to(root).as_posix()
        for p in root.rglob("*")
        if p.is_file()
        and re.match(r"(?:vite|vitest|jest|next|webpack|tsconfig|eslint|playwright)", p.name)
        and len(p.relative_to(root).parts) < 5
        and "node_modules" not in p.parts
    ]
    return {
        "units": units,
        "services": services,
        "configuration_files": configs,
        "fingerprint": hashlib.sha256(json.dumps(units, sort_keys=True).encode()).hexdigest(),
    }


def node_runtime(spec):
    # Resolve supported major ranges conservatively. Complex semver remains a visible boundary.
    clean = spec.replace(" ", "")
    for version in [22, 24]:
        if re.fullmatch(r"(?:>=)?" + str(version) + r"(?:\.x|\.0\.0)?", clean) or re.fullmatch(
            r"[~^]" + str(version) + r"(?:\.\d+(?:\.\d+)?)?", clean
        ):
            return "node:" + str(version)
        bounds = re.findall(r"(>=|>|<=|<)(\d+)(?:\.\d+)*", clean)
        if bounds and "".join(a + b for a, b in bounds) == re.sub(r"\.\d+", "", clean):
            if all(
                {">=": version >= int(n), ">": version > int(n), "<=": version <= int(n), "<": version < int(n)}[op]
                for op, n in bounds
            ):
                return "node:" + str(version)
    raise Unsupported("Node engine range requires manual review or a supported Node 22/24 runtime: " + spec)


def workflows(root):
    return {
        p.relative_to(root).as_posix(): p.read_text()
        for p in (root / ".github/workflows").glob("*")
        if p.suffix in {".yml", ".yaml"}
    }


def coverage(root, requirements):
    covered = []
    policies = []
    for path, text in workflows(root).items():
        data = yaml.safe_load(text) or {}
        events = data.get("on", data.get(True, {}))
        for name, job in data.get("jobs", {}).items():
            cwd = (
                job.get("defaults", {})
                .get("run", {})
                .get("working-directory", data.get("defaults", {}).get("run", {}).get("working-directory", "."))
            )
            runs = []
            runtime = None
            manager = None
            for step in job.get("steps", []):
                if "setup-node@" in step.get("uses", ""):
                    runtime = "node:" + str(step.get("with", {}).get("node-version", ""))
                if "setup-python@" in step.get("uses", ""):
                    runtime = str(step.get("with", {}).get("python-version", ""))
                for command in step.get("run", "").splitlines():
                    runs.append(
                        {
                            "path": step.get("working-directory", cwd),
                            "command": command.strip(),
                            "conditional": bool(step.get("if") or job.get("if")),
                        }
                    )
                if any(step.get("run", "").startswith(x) for x in ["npm ci", "pnpm install", "yarn install"]):
                    manager = step["run"].split()[0]
            for unit in requirements["units"]:
                scope = events.get("push", {}) if isinstance(events, dict) else {}
                filters = scope.get("paths", []) if isinstance(scope, dict) else []
                included = not filters or any(
                    any(fnmatch.fnmatch(f, pattern) for pattern in filters if not pattern.startswith("!"))
                    for f in unit["evidence_files"]
                )
                for command in unit["checks"]:
                    matching = any(
                        r["path"].rstrip("/") == unit["path"].rstrip("/")
                        and r["command"] == command
                        and not r["conditional"]
                        for r in runs
                    )
                    compatible = runtime == unit["runtime"] and (
                        unit["language"] == "python" or manager == unit["manager"]
                    )
                    if matching and included and compatible:
                        covered.append(
                            {
                                "path": unit["path"],
                                "command": command,
                                "workflow": path,
                                "job": name,
                                "runtime": runtime,
                            }
                        )
            policies.append(
                {
                    "workflow": path,
                    "job": name,
                    "runtime": runtime,
                    "manager": manager,
                    "commands": runs,
                    "events": events,
                }
            )
    return {"covered": covered, "pipelines": policies, "requirements": requirements}


def proposal(root, mode):
    requirements = detect(root)
    model = coverage(root, requirements)
    existing = workflows(root)
    if mode == "builder" and existing:
        raise Unsupported("Existing workflows are preserved; use maintenance mode to inspect coverage gaps")
    if requirements["services"]:
        raise Unsupported(
            "Service dependencies detected in "
            + ", ".join(requirements["services"])
            + ". Isolated service verification requires manual setup; no generic pipeline will replace it."
        )
    missing = []
    for unit in requirements["units"]:
        checks = [
            c
            for c in unit["checks"]
            if not any(x["path"] == unit["path"] and x["command"] == c for x in model["covered"])
        ]
        if mode == "builder" or checks:
            missing.append({**unit, "checks": unit["checks"] if mode == "builder" else checks})
    if not missing:
        return {
            "coverage": model,
            "files": {},
            "commands": [],
            "reason": "All detected checks and supported runtimes are already covered.",
        }
    path = ".github/workflows/patchgoblin.yml" if mode == "builder" else MANAGED
    roundtrip = YAML()
    roundtrip.preserve_quotes = True
    roundtrip.width = 120
    document = (
        roundtrip.load(existing[path])
        if path in existing
        else {
            "name": "PatchGoblin CI" if mode == "builder" else "CI maintenance",
            "on": {"push": {}, "pull_request": {}},
            "permissions": {"contents": "read"},
            "jobs": {},
        }
    )
    commands = []
    explanations = []
    for unit in missing:
        identifier = (
            "pg_"
            + hashlib.sha256(
                (unit["path"] + unit["language"] + json.dumps(unit["checks"]) + unit["runtime"]).encode()
            ).hexdigest()[:10]
        )
        if identifier in document["jobs"]:
            raise Unsupported("Existing managed job changed its event or execution policy; manual review is required")
        steps = [{"uses": "actions/checkout@v4", "with": {"persist-credentials": False}}]
        cwd = unit["path"]
        install_path = unit["install_path"]
        if unit["language"] == "node":
            steps.append(
                {
                    "uses": "actions/setup-node@v4",
                    "with": {
                        "node-version": unit["runtime"].split(":")[1],
                        "cache": unit["manager"],
                        "cache-dependency-path": str(
                            Path(install_path)
                            / {"npm": "package-lock.json", "pnpm": "pnpm-lock.yaml", "yarn": "yarn.lock"}[
                                unit["manager"]
                            ]
                        ).replace("\\", "/"),
                    },
                }
            )
            if unit["manager"] != "npm":
                steps.insert(
                    1,
                    {
                        "name": "Install package manager",
                        "run": "npm install --global "
                        + unit['manager'] + '@' + unit['manager_version'],
                    },
                )
        else:
            steps.append({"uses": "actions/setup-python@v5", "with": {"python-version": unit["runtime"]}})
            if unit["manager"] == "uv":
                steps.append({"uses": "astral-sh/setup-uv@v6", "with": {"version": "0.8.22", "enable-cache": True}})
        sequence = [(unit["install"], install_path)]
        if unit["language"] == "python" and (root / cwd / "requirements-dev.txt").exists() and unit["manager"] == "pip":
            sequence.append(("python -m pip install -r requirements-dev.txt", cwd))
        sequence += [(cmd, cwd) for cmd in unit["checks"]]
        for cmd, directory in sequence:
            steps.append(
                {
                    "name": ("Install dependencies" if cmd == unit["install"] else cmd),
                    "run": cmd,
                    **({"working-directory": directory} if directory != "." else {}),
                }
            )
            item = {"command": cmd, "path": directory, "runtime": unit["runtime"]}
            if item not in commands:
                commands.append(item)
        document["jobs"][identifier] = {
            "name": unit["path"] + " · " + unit["language"],
            "runs-on": "ubuntu-latest",
            "timeout-minutes": 10,
            "steps": steps,
        }
        explanations.append(
            f"{unit['path']}: manifest evidence requires {', '.join(unit['checks']) or 'dependency installation'} using {unit['manager']} at {unit['runtime']}; current CI does not cover this combination."
        )
    output = io.StringIO()
    roundtrip.dump(document, output)
    return {
        "coverage": model,
        "files": {path: output.getvalue()},
        "commands": commands,
        "reason": " ".join(explanations),
    }


def validate_maintenance(originals, files):
    for path, text in files.items():
        if not path.startswith(".github/workflows/") or not path.endswith((".yml", ".yaml")):
            raise ValueError("Maintenance may only change workflows")
        new = yaml.safe_load(text)
        if path in originals:
            old = yaml.safe_load(originals[path])
            if {k: v for k, v in old.items() if k != "jobs"} != {k: v for k, v in new.items() if k != "jobs"}:
                raise ValueError("Existing event and permission policy must remain unchanged")
            for name, job in old["jobs"].items():
                if new["jobs"].get(name) != job:
                    raise ValueError("Hand-written job customization must remain unchanged")
        elif new.get("permissions") != {"contents": "read"}:
            raise ValueError("New workflows must use read-only contents permission")
