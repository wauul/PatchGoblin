import io
import os
import tarfile
import time
from pathlib import Path
import httpx
from worker.security import safe_path
from worker.state_codec import encode_state, decode_state

MARKER = "<!-- patchgoblin-state-v1 -->\n"


class GitHub:
    def __init__(self, token=None):
        self.client = httpx.Client(base_url="https://api.github.com", timeout=30, follow_redirects=False,
                                  headers={"Authorization": "Bearer " + (token or os.environ["GITHUB_TOKEN"]),
                                           "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"})
        self.calls = 0

    def request(self, method, path, **kwargs):
        self.calls += 1
        for attempt in range(3):
            response = self.client.request(method, path, **kwargs)
            if response.status_code not in {429, 502, 503}:
                break
            time.sleep(2 ** attempt)
        if not response.is_success:
            raise RuntimeError(f"GitHub HTTP {response.status_code} for {method} {path.split('?')[0]}")
        return response.json() if response.content else None

    def download(self, repo: str, sha: str, root: Path):
        # Public archive URL, intentionally no credential on the redirected origin.
        with httpx.Client(timeout=45) as public:
            r = public.get(f"https://codeload.github.com/{repo}/tar.gz/{sha}")
        r.raise_for_status()
        if len(r.content) > 20_000_000:
            raise ValueError("Repository exceeds 20 MB archive limit")
        with tarfile.open(fileobj=io.BytesIO(r.content), mode="r:gz") as tar:
            members = tar.getmembers()
            if len(members) > 5000 or sum(m.size for m in members) > 100_000_000:
                raise ValueError("Repository exceeds extraction limit")
            for member in members:
                if member.issym() or member.islnk() or not member.isfile():
                    continue
                relative = "/".join(member.name.split("/")[1:])
                if not relative:
                    continue
                try:
                    safe_path(relative)
                except ValueError:
                    continue
                target = root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(tar.extractfile(member).read())

    def ci_evidence(self, repo: str, run_id: int, stored_logs=None) -> dict:
        from worker.security import filter_logs
        run = self.request("GET", f"/repos/{repo}/actions/runs/{run_id}")
        if run["conclusion"] != "failure":
            raise ValueError("Select a failed completed workflow run")
        jobs = self.request("GET", f"/repos/{repo}/actions/runs/{run_id}/jobs?per_page=100")["jobs"]
        failed = [j for j in jobs if j["conclusion"] == "failure"]
        logs = [filter_logs(stored_logs)] if isinstance(stored_logs, str) else []
        for job in ([] if logs else failed[:2]):
            response = self.client.get(f"/repos/{repo}/actions/jobs/{job['id']}/logs")
            self.calls += 1
            if response.status_code == 302:
                with httpx.Client(timeout=30) as anonymous:
                    r = anonymous.get(response.headers["location"])
                r.raise_for_status()
                logs.append(filter_logs(r.text))
            elif response.is_success:
                logs.append(filter_logs(response.text))
            else:
                raise RuntimeError(f"Cannot retrieve CI logs (HTTP {response.status_code}); no reproduction claim")
        return {"sha": run["head_sha"], "branch": run["head_branch"], "workflow_path": run["path"],
                "run_url": run["html_url"], "failed_jobs": [{"name":j["name"], "steps":j["steps"]} for j in failed], "logs": "\n".join(logs)}


class StateStore:
    def __init__(self, github: GitHub, repo: str, number: int):
        self.github, self.repo, self.number = github, repo, number
        self.comment_id = None
        self.last_cancel_check = 0
        self.is_cancelled = False
        comments = github.request("GET", f"/repos/{repo}/issues/{number}/comments?per_page=100")
        self.previous = None
        for comment in comments:
            if comment["body"].startswith(MARKER) and comment["user"]["login"] in {"github-actions[bot]", os.getenv("OWNER_LOGIN", "wauul")}:
                self.comment_id = comment["id"]
                self.previous = decode_state(comment["body"][len(MARKER):])

    def save(self, state: dict):
        body = MARKER + encode_state(state)
        if len(body) > 60000:
            raise ValueError("Job state exceeds persistence budget")
        if self.comment_id:
            self.github.request("PATCH", f"/repos/{self.repo}/issues/comments/{self.comment_id}", json={"body":body})
        else:
            comment = self.github.request("POST", f"/repos/{self.repo}/issues/{self.number}/comments", json={"body":body})
            self.comment_id = comment["id"]

    def cancelled(self):
        if time.monotonic() - self.last_cancel_check > 5:
            self.last_cancel_check = time.monotonic()
            issue = self.github.request("GET", f"/repos/{self.repo}/issues/{self.number}")
            self.is_cancelled = issue["state"] == "closed"
        return self.is_cancelled
