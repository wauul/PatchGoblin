"""Guardrails are outside the model. No repository string can alter these policies."""
import re
from pathlib import PurePosixPath

LOCK_FILES={'uv.lock','package-lock.json','pnpm-lock.yaml','yarn.lock'}
PATCH_FILES={'requirements.txt','requirements-dev.txt','pyproject.toml','package.json',*LOCK_FILES}

SECRET = re.compile(r"(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]+|gsk_[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}|postgres(?:ql)?://[^\s]+|Bearer\s+\S+)", re.I)


def redact(text: str) -> str:
    text = SECRET.sub("[REDACTED]", text)
    return re.sub(r"(?i)(password|token|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+", r"\1=[REDACTED]", text)


def redact_data(value):
    if isinstance(value, str):
        return redact(value)
    if isinstance(value, dict):
        return {k:redact_data(v) for k, v in value.items()}
    if isinstance(value, list):
        return [redact_data(v) for v in value]
    return value


def public_prose(text, limit=3000):
    """Generated GitHub prose must not create links, images, HTML or mentions."""
    text = redact(str(text))[:limit]
    text = re.sub(r'https?://[^\s<>]+', '[link removed]', text, flags=re.I)
    text = text.replace('@', '@\u200b')
    return text.replace('<', '&lt;').replace('>', '&gt;').replace('[', '\\[').replace(']', '\\]').replace('`', '\\`')


def filter_logs(text: str, limit: int = 10000) -> str:
    lines = re.sub(r"\x1b\[[0-9;]*m", "", redact(text)).splitlines()
    selected = set()
    for i, line in enumerate(lines):
        if re.search(r"error|failed|conflict|requires.python|modulenotfound|resolution|cannot|no matching", line, re.I):
            selected.update(range(max(0, i - 3), min(len(lines), i + 5)))
    chosen = [lines[i] for i in sorted(selected)] or lines[-50:]
    return "\n".join(chosen)[-limit:]


def safe_path(path: str) -> str:
    p = PurePosixPath(path)
    if p.is_absolute() or ".." in p.parts or "\\" in path or not path or len(path) > 240:
        raise ValueError("Invalid repository path")
    if any(x.startswith(".env") or x in {".git", ".ssh", "secrets"} for x in p.parts):
        raise ValueError("Credential paths are forbidden")
    return str(p)


def validate_patch(files: dict[str, str], mode: str, originals: dict[str, str]) -> None:
    if not isinstance(files, dict) or any(not isinstance(p, str) or not isinstance(v, str) for p, v in files.items()):
        raise ValueError("files must map repository paths to complete UTF-8 content strings, not nested JSON objects")
    if not files or len(files) > 4 or sum(len(v) for p, v in files.items() if p not in LOCK_FILES) > 24000 or any(len(files.get(p,''))>128000 for p in LOCK_FILES):
        raise ValueError("Patch exceeds file/size budget")
    if mode == "repair" and all(p in originals and v.strip() == originals[p].strip() for p, v in files.items()):
        raise ValueError("Candidate changes no content; patch the file responsible for the reproduced failure")
    for path, content in files.items():
        safe_path(path)
        if SECRET.search(content):
            raise ValueError("Patch contains a credential")
        allowed = path in {"requirements.txt", "requirements-dev.txt", "pyproject.toml", "uv.lock",'package.json','package-lock.json','pnpm-lock.yaml'}
        workflow = path.startswith(".github/workflows/") and path.endswith((".yml", ".yaml"))
        if not allowed and not workflow:
            raise ValueError("Only dependency declarations and workflows may be changed")
        if mode == "builder" and not workflow:
            raise ValueError("Builder may only add its workflow")
        if mode == "builder" and path in originals:
            raise ValueError("Builder cannot replace existing workflows")
        if workflow and mode == "repair":
            # Existing validation and event/permission configuration is immutable.
            import yaml
            old, new = yaml.safe_load(originals.get(path, "")), yaml.safe_load(content)
            if not isinstance(old, dict) or not isinstance(new, dict):
                raise ValueError("Invalid workflow")
            old_jobs, new_jobs = old.get("jobs", {}), new.get("jobs", {})
            if set(old_jobs) != set(new_jobs):
                raise ValueError("Required jobs must remain")
            for name, job in old_jobs.items():
                a, b = job.get("steps", []), new_jobs[name].get("steps", [])
                if len(a) != len(b):
                    raise ValueError("Required steps must remain")
                for previous, current in zip(a, b, strict=True):
                    if previous != current:
                        if any(x in str(previous.get('uses','')) for x in ['setup-python@','setup-node@']):
                            if {k:v for k,v in previous.items() if k != "with"} != {k:v for k,v in current.items() if k != "with"}:
                                raise ValueError("Only Python version may change")
                            before, after = previous.get("with", {}), current.get("with", {})
                            version_key='node-version' if 'setup-node@' in previous.get('uses','') else 'python-version'
                            if {k:v for k,v in before.items() if k != version_key} != {k:v for k,v in after.items() if k != version_key}:
                                raise ValueError("Only Python version may change")
                        elif "run" in previous and is_install_command(previous["run"]):
                            if {k:v for k,v in previous.items() if k != "run"} != {k:v for k,v in current.items() if k != "run"} or not is_install_command(current.get("run", "")):
                                raise ValueError("Installation step may only become another permitted install command")
                            command = current["run"].replace("python -m pip", "pip").replace("uv pip", "pip").strip()
                            if previous['run'].strip() in {'npm ci','pnpm install --frozen-lockfile','yarn install --frozen-lockfile','yarn install --immutable'}:
                                expected=previous['run'].strip()
                            elif previous["run"].strip().startswith("uv sync"):
                                expected = previous["run"].replace("--frozen", "--locked").strip()
                            elif "requirements-dev.txt" in previous["run"] and "requirements-dev.txt" in originals:
                                expected = "pip install -r requirements-dev.txt"
                            elif "requirements.txt" in originals:
                                expected = "pip install -r requirements.txt"
                            else:
                                expected = "pip install -e ."
                            if command != expected:
                                raise ValueError("Installation repair must install the existing project declarations and preserve lock validation")
                        else:
                            raise ValueError("Required validation cannot be modified")
            for name in old_jobs:
                if {k:v for k,v in old_jobs[name].items() if k != "steps"} != {k:v for k,v in new_jobs[name].items() if k != "steps"}:
                    raise ValueError("Job policy cannot change")
            if {k:v for k,v in old.items() if k != "jobs"} != {k:v for k,v in new.items() if k != "jobs"}:
                raise ValueError("Workflow policy cannot change")
        if path=='package.json' and path in originals:
            from worker.node_project import validate_manifest
            validate_manifest(originals[path],content)
        if allowed and path in originals and path not in {'uv.lock','package.json','package-lock.json','pnpm-lock.yaml'}:
            # No removing declared packages; edits can narrow/change versions or add dependencies.
            old_names = dependency_names(path, originals[path])
            if not old_names <= dependency_names(path, content):
                raise ValueError("Existing dependencies cannot be removed")
            if path == "pyproject.toml":
                import copy
                import tomllib
                old, new = tomllib.loads(originals[path]), tomllib.loads(content)
                def policy(data):
                    result = copy.deepcopy(data)
                    result.get("project", {}).pop("dependencies", None)
                    result.get("project", {}).pop("optional-dependencies", None)
                    result.pop("dependency-groups", None)
                    return result
                if policy(old) != policy(new):
                    raise ValueError("Project runtime and validation configuration must be preserved")


def dependency_names(path: str, text: str) -> set[str]:
    if path.endswith(".toml"):
        import tomllib
        data = tomllib.loads(text)
        values = data.get("project", {}).get("dependencies", [])
        values += [v for group in data.get("project", {}).get("optional-dependencies", {}).values() for v in group]
        values += [v for group in data.get("dependency-groups", {}).values() for v in group if isinstance(v, str)]
    else:
        values = [s.strip() for s in text.splitlines() if s.strip() and not s.startswith(("#", "-"))]
    return {re.split(r"[\[<>=!~; ]", x, maxsplit=1)[0].lower().replace("_", "-") for x in values}


def is_install_command(command: str) -> bool:
    if command.strip() in {'npm ci','pnpm install --frozen-lockfile','yarn install --frozen-lockfile','yarn install --immutable','npm install --package-lock-only --ignore-scripts','pnpm install --lockfile-only --ignore-scripts'}:
        return True
    if any(flag in command for flag in ["--no-deps", "--ignore-requires-python", "legacy-resolver"]):
        return False
    return bool(re.fullmatch(r"(?:python -m pip|pip|uv pip) install (?:[A-Za-z0-9_.\[\],=<>!~ -]+)|uv sync(?: --(?:frozen|locked|all-extras|all-groups|dev))*", command.strip()))
