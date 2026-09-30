"""Start a pinned real open-weight model on the trusted worker host, never in the repository sandbox."""
import hashlib
import os
import secrets
import subprocess
import tarfile
import time
from pathlib import Path
import httpx

BINARY_URL = "https://github.com/ggml-org/llama.cpp/releases/download/b11146/llama-b11146-bin-ubuntu-x64.tar.gz"
BINARY_SHA = "c150306eb16b5ab696f76a8bdf810c35fd98a24e82158742e6fa28f420ff8410"
MODEL_URL = "https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/f74adce6aa16316c625447af059dbebe4983757c/qwen2.5-coder-3b-instruct-q4_k_m.gguf"
MODEL_SHA = "724fb256bec1ff062b2f65e4569e871ad2e95ab2a3989723d1769c54294730b7"


def download(url, path, digest):
    if path.exists() and hashlib.file_digest(path.open("rb"), "sha256").hexdigest() == digest:
        return
    with httpx.stream("GET", url, follow_redirects=True, timeout=180) as response:
        response.raise_for_status()
        with path.open("wb") as handle:
            for chunk in response.iter_bytes():
                handle.write(chunk)
    with path.open("rb") as handle:
        if hashlib.file_digest(handle, "sha256").hexdigest() != digest:
            raise RuntimeError("Pinned model/runtime checksum mismatch")


root = Path(".local/model-runtime")
root.mkdir(parents=True, exist_ok=True)
archive, model = root / "llama.tar.gz", root / "qwen-coder-3b.gguf"
download(BINARY_URL, archive, BINARY_SHA)
download(MODEL_URL, model, MODEL_SHA)
with tarfile.open(archive) as tar:
    tar.extractall(root / "bin", filter="data")
server = next((root / "bin").rglob("llama-server"))
key = secrets.token_urlsafe(32)
print("::add-mask::" + key, flush=True)
log = (root / "server.log").open("wb")
process = subprocess.Popen([str(server.resolve()), "-m", str(model.resolve()), "--host", "127.0.0.1", "--port", "8081",
                            "--ctx-size", "16384", "--parallel", "1", "--threads", "4", "--n-gpu-layers", "0",
                            "--api-key", key, "--alias", "qwen-coder-3b", "--no-webui"], stdout=log, stderr=log)
for _ in range(120):
    if process.poll() is not None:
        raise RuntimeError("Pinned model server stopped during startup; inspect the local runtime log")
    try:
        if httpx.get("http://127.0.0.1:8081/health", headers={"Authorization":"Bearer " + key}, timeout=2).status_code == 200:
            break
    except httpx.RequestError:
        pass
    time.sleep(1)
else:
    process.terminate()
    raise RuntimeError("Model server startup timed out")
with Path(os.environ["GITHUB_ENV"]).open("a") as handle:
    handle.write(f"MODEL_BASE_URL=http://127.0.0.1:8081/v1\nMODEL_NAME=qwen-coder-3b\nMODEL_API_KEY={key}\n")
print("Pinned Qwen Coder 3B server ready on loopback; ephemeral key masked.")
