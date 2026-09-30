"""Docker sandbox. Fail closed when Docker or the restricted egress proxy is unavailable."""

import os
import shlex
import subprocess
import tempfile
import time
import uuid
from pathlib import Path
from worker.security import filter_logs


class Sandbox:
    def __init__(self, root: Path, cancelled=lambda: False, deadline: float | None = None):
        self.root = root.resolve()
        self.cancelled = cancelled
        self.deadline = deadline or time.monotonic() + 600
        self.id = "pg-" + uuid.uuid4().hex[:12]
        self.network = self.id + "-net"
        self.proxy = self.id + "-proxy"
        self.active = None
        self.calls = 0
        self.ready = False
        uid = os.getuid() if os.name != "nt" else 65534
        gid = os.getgid() if os.name != "nt" else 65534
        self.user = f"{uid if uid else 65534}:{gid if gid else 65534}"

    def docker(self, args: list[str], timeout=120) -> subprocess.CompletedProcess:
        self.calls += 1
        return subprocess.run(["docker", *args], capture_output=True, text=True, timeout=timeout, check=True)

    def prepare(self, python: str):
        self.docker(["info", "--format", "{{.ServerVersion}}"], 15)
        node = python.startswith("node:")
        self.image = ("patchgoblin-node:" + python.split(":")[1]) if node else "patchgoblin-python:" + python
        cached = subprocess.run(["docker", "image", "inspect", self.image], capture_output=True, timeout=15)
        if cached.returncode:
            with tempfile.TemporaryDirectory() as d:
                path = Path(d)
                runtime = (
                    f"FROM node:{python.split(':')[1]}-bookworm-slim\nRUN npm install --global corepack@0.34.0 && corepack enable\nENV COREPACK_HOME=/workspace/.corepack\n"
                    if node
                    else f"FROM python:{python}-slim\nRUN pip install --no-cache-dir uv==0.8.22\n"
                )
                (path / "Dockerfile").write_text(
                    runtime
                    + "RUN mkdir -p /workspace && chown 65534:65534 /workspace\nUSER 65534:65534\nWORKDIR /workspace\n"
                )
                self.docker(["build", "-t", self.image, d], 180)
        # Repository download is performed before this. No host credentials enter either container.
        self.docker(["network", "create", "--internal", self.network])
        config = """http_port 3128
acl SSL_ports port 443
acl CONNECT method CONNECT
acl packages dstdomain pypi.org files.pythonhosted.org registry.npmjs.org registry.yarnpkg.com repo.yarnpkg.com
http_access deny CONNECT !SSL_ports
http_access allow packages
http_access deny all
cache deny all
access_log none
cache_log /dev/null
pid_filename /tmp/squid.pid
"""
        self.proxy_dir = tempfile.TemporaryDirectory()
        conf = Path(self.proxy_dir.name) / "squid.conf"
        conf.write_text(config)
        self.docker(
            [
                "run",
                "-d",
                "--name",
                self.proxy,
                "--memory=128m",
                "--cpus=.5",
                "--pids-limit=64",
                "-v",
                f"{conf}:/etc/squid/squid.conf:ro",
                "ubuntu/squid:6.10-24.10_beta",
            ]
        )
        self.docker(["network", "connect", "--alias", "package-proxy", self.network, self.proxy])
        self.ready = True

    def run(self, command: str, python: str, install=False, cwd=".") -> dict:
        from worker.project import validate_command

        if command != "uv lock":
            validate_command(command)
        if self.cancelled():
            raise InterruptedError("Job cancelled")
        if time.monotonic() >= self.deadline:
            raise TimeoutError("Job runtime budget exhausted")
        if not self.ready:
            self.prepare(python)
        elif self.image != (
            ("patchgoblin-node:" + python.split(":")[1])
            if python.startswith("node:")
            else "patchgoblin-python:" + python
        ):
            # A Python-version fix must use a fresh environment.
            self.close()
            self.id = "pg-" + uuid.uuid4().hex[:12]
            self.network, self.proxy = self.id + "-net", self.id + "-proxy"
            import shutil

            shutil.rmtree(self.root / ".venv", ignore_errors=True)
            self.prepare(python)
        self.active = self.id + "-run"
        args = [
            "docker",
            "run",
            "--rm",
            "--name",
            self.active,
            "--read-only",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges",
            "--memory=512m",
            "--cpus=1",
            "--pids-limit=128",
            "--user=" + self.user,
            "--tmpfs=/tmp:rw,noexec,nosuid,size=128m",
            "--network",
            self.network if install else "none",
            "-v",
            f"{self.root}:/workspace:rw",
            "-w",
            "/workspace" + ("" if cwd == "." else "/" + cwd),
            "-e",
            "HOME=/tmp",
            "-e",
            "UV_CACHE_DIR=/tmp/uv-cache",
            "-e",
            "UV_PYTHON_DOWNLOADS=never",
        ]
        if install:
            args += [
                "-e",
                "HTTPS_PROXY=http://package-proxy:3128",
                "-e",
                "HTTP_PROXY=http://package-proxy:3128",
                "-e",
                "https_proxy=http://package-proxy:3128",
                "-e",
                "http_proxy=http://package-proxy:3128",
                "-e",
                "npm_config_https_proxy=http://package-proxy:3128",
                "-e",
                "npm_config_proxy=http://package-proxy:3128",
            ]
        # The shell script is fixed. Commands are validated, then individually quoted.
        cmd = " ".join(shlex.quote(v) for v in shlex.split(command))
        from worker.security import safe_path

        safe_path(cwd)
        if not (self.root / cwd).resolve().is_relative_to(self.root) or (self.root / cwd).is_symlink():
            raise ValueError("Invalid command working directory")
        script = (
            cmd
            if python.startswith("node:")
            else "[ -d .venv ] || python -m venv .venv; export PATH=$PWD/.venv/bin:$PATH; " + cmd
        )
        args += [self.image, "sh", "-c", script]
        self.calls += 1
        start = time.monotonic()
        # Stream to a temporary file, limiting memory; terminate on cancellation, duration, or excessive output.
        with tempfile.TemporaryFile(mode="w+b") as log:
            process = subprocess.Popen(args, stdout=log, stderr=subprocess.STDOUT)
            try:
                while process.poll() is None:
                    if (
                        self.cancelled()
                        or time.monotonic() - start > min(120, self.deadline - start)
                        or log.tell() > 2_000_000
                    ):
                        self.docker(["kill", self.active], 10)
                        process.wait(timeout=10)
                        if self.cancelled():
                            raise InterruptedError("Job cancelled")
                        raise TimeoutError("Command runtime/output budget exhausted")
                    time.sleep(1)
                log.seek(max(0, log.tell() - 100000))
                output = log.read().decode("utf-8", errors="replace")
            finally:
                if process.poll() is None:
                    process.kill()
                self.active = None
        return {
            "command": command,
            "exit_code": process.returncode,
            "duration_seconds": round(time.monotonic() - start, 2),
            "logs": filter_logs(output),
            "network": "package-registry-only proxy" if install else "disabled",
        }

    def close(self):
        for args in [["rm", "-f", self.proxy], ["network", "rm", self.network]]:
            try:
                self.docker(args, 15)
            except Exception:
                pass
        if hasattr(self, "proxy_dir"):
            self.proxy_dir.cleanup()
        self.ready = False
