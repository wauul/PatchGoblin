"""Retrieve evaluation/job artifacts without forwarding credentials to the storage redirect."""
import io
import json
import sys
import zipfile
from pathlib import Path
import httpx
from worker.github import GitHub

env = dict(s.split("=",1) for s in Path(".env").read_text().splitlines() if "=" in s)
gh = GitHub(env["GITHUB_TOKEN"])
run_id, destination = sys.argv[1], Path(sys.argv[2])
destination.mkdir(parents=True, exist_ok=True)
artifacts = gh.request("GET", f"/repos/wauul/PatchGoblin/actions/runs/{run_id}/artifacts")["artifacts"]
for artifact in artifacts:
    response = gh.client.get(f"/repos/wauul/PatchGoblin/actions/artifacts/{artifact['id']}/zip")
    if response.status_code != 302:
        raise RuntimeError("Artifact redirect unavailable")
    with httpx.Client(timeout=30) as public:
        response = public.get(response.headers["location"])
    response.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        for name in archive.namelist():
            if name.endswith(".json") and "/" not in name and ".." not in name:
                (destination / name).write_bytes(archive.read(name))
for path in destination.glob("evaluation-results.json"):
    data = json.loads(path.read_text())
    print(json.dumps(data, indent=2))
