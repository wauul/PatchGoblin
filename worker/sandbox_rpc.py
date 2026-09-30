"""Trusted command runner uploaded to a credential-free Railway VM.

Repository code runs only inside the existing restricted Docker sandbox.
This module is never imported from the downloaded repository.
"""

import hashlib
import json
import os
import re
import shutil
import sys
import time
import io
import tarfile
import base64
from pathlib import Path
from worker.github import GitHub
from worker.project import validate_command
from worker.sandbox import Sandbox
from worker.security import safe_path, redact, PATCH_FILES, LOCK_FILES

ROOT = Path("/app/repository")
CONTROL = Path("/opt/patchgoblin")


def digests():
    return {
        p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in ROOT.rglob("*")
        if p.is_file()
        and not p.is_symlink()
        and ".venv" not in p.relative_to(ROOT).parts
        and ".pytest_cache" not in p.relative_to(ROOT).parts
        and "__pycache__" not in p.relative_to(ROOT).parts
        and "node_modules" not in p.relative_to(ROOT).parts
        and ".corepack" not in p.relative_to(ROOT).parts
    }


def execute(payload):
    if payload["op"] == "init":
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", payload["repo"]) or not re.fullmatch(
            r"[a-f0-9]{40}", payload["sha"]
        ):
            raise ValueError("Invalid immutable repository identity")
        ROOT.mkdir(parents=True, exist_ok=True)
        if payload.get("archive_base64"):
            raw = base64.b64decode(payload["archive_base64"], validate=True)
            if len(raw) > 20_000_000:
                raise ValueError("Archive exceeds the transfer limit")
            with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as tar:
                members = tar.getmembers()
                if len(members) > 5000 or sum(m.size for m in members) > 100_000_000:
                    raise ValueError("Archive extraction limit exceeded")
                for member in members:
                    if not member.isfile() or member.issym() or member.islnk():
                        raise ValueError("Only regular repository files can enter a sandbox")
                    target = ROOT / safe_path(member.name)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(tar.extractfile(member).read())
        else:
            GitHub(token="public-archive-only").download(payload["repo"], payload["sha"], ROOT)
        for p in [ROOT, *ROOT.rglob("*")]:
            os.chown(p, 65534, 65534)
        return {"initialized": True}
    command = payload["command"]
    if command != "uv lock":
        validate_command(command)
    if not re.fullmatch(r"3\.(11|12|13)|node:(22|24)", payload["python"]):
        raise ValueError("Unsupported sandbox runtime")
    files = payload.get("files", {})
    if (
        len(files) > 4
        or sum(len(v) for k, v in files.items() if k not in LOCK_FILES) > 24000
        or any(len(files.get(p, "")) > 128000 for p in LOCK_FILES)
    ):
        raise ValueError("Remote patch transfer exceeds limits")
    for name, content in files.items():
        name = safe_path(name)
        if name not in PATCH_FILES and not (name.startswith(".github/workflows/") and name.endswith((".yml", ".yaml"))):
            raise ValueError("Remote patch path is outside the allowlist")
        target = ROOT / name
        if not target.resolve().is_relative_to(ROOT) or any(
            p.is_symlink() for p in [target, *target.parents] if p.is_relative_to(ROOT)
        ):
            raise ValueError("Repository symlink cannot redirect a patch write")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
        os.chown(target, 65534, 65534)
    if payload.get("reset_environment"):
        if (ROOT / ".venv").is_symlink():
            raise ValueError("Repository redirected the sandbox environment")
        shutil.rmtree(ROOT / ".venv", ignore_errors=True)
    before = digests()
    sb = Sandbox(ROOT, deadline=time.monotonic() + min(int(payload["remaining_seconds"]), 300))
    try:
        result = sb.run(command, payload["python"], install=payload["install"], cwd=safe_path(payload.get("cwd", ".")))
        after = digests()
        lock_path = {
            "uv lock": "uv.lock",
            "npm install --package-lock-only --ignore-scripts": "package-lock.json",
            "pnpm install --lockfile-only --ignore-scripts": "pnpm-lock.yaml",
        }.get(command)
        changed = [p for p, h in before.items() if after.get(p) != h and p != lock_path]
        if changed:
            raise ValueError("Repository execution changed protected files: " + ", ".join(changed[:8]))
        result["tool_calls"] = sb.calls
        if lock_path and result["exit_code"] == 0:
            lock = (ROOT / lock_path).read_text()
            if len(lock) > 128000:
                raise ValueError("Canonical uv lock exceeds the size limit")
            result["generated_files"] = {lock_path: lock}
        return result
    finally:
        sb.close()


if __name__ == "__main__":
    try:
        output = execute(json.loads((CONTROL / "request.json").read_text()))
    except Exception as exc:
        output = {"error": redact(str(exc))[:1500], "error_type": type(exc).__name__}
    (CONTROL / "result.json").write_text(json.dumps(output))
    sys.exit(0)
