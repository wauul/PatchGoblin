"""Short-lived, single-repository installation credentials; never sent to sandboxes."""
from worker import telemetry

import base64
import os
import time
import jwt
import httpx
from worker.github import GitHub, rate_limit_delay, GitHubRateLimit
from urllib.parse import unquote


def app_jwt():
    now = int(time.time())
    return jwt.encode(
        {"iat": now - 60, "exp": now + 540, "iss": os.environ["GITHUB_APP_ID"]},
        base64.b64decode(os.environ["GITHUB_APP_PRIVATE_KEY_B64"]),
        algorithm="RS256",
    )


@telemetry.instrument('github')
def app_request(method, path, body=None):
    with httpx.Client(timeout=25) as client:
        response = client.request(
            method,
            "https://api.github.com" + path,
            headers={
                "Authorization": "Bearer " + app_jwt(),
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2026-03-10",
            },
            json=body,
        )
    delay = rate_limit_delay(response)
    if delay is not None:
        raise GitHubRateLimit(delay)
    if response.status_code == 404:
        return None
    if not response.is_success:
        raise RuntimeError(f"GitHub App HTTP {response.status_code}")
    return response.json() if response.content else None


class InstallationGitHub(GitHub):
    def __init__(self, installation_id, repository_id, repo):
        self.installation_id, self.repository_id, self.repo = installation_id, repository_id, repo
        self.expires = 0
        super().__init__(token="pending-installation-token")
        self.refresh()

    @telemetry.instrument('github')
    def refresh(self):
        current = app_request("GET", f"/repos/{self.repo}/installation")
        if not current or current["id"] != self.installation_id or current.get("suspended_at"):
            raise ValueError("Repository installation access was removed or suspended")
        value = app_request(
            "POST", f"/app/installations/{self.installation_id}/access_tokens", {"repository_ids": [self.repository_id]}
        )
        if not value:
            raise ValueError("GitHub installation no longer exists")
        self.client.headers["Authorization"] = "Bearer " + value["token"]
        self.expires = time.monotonic() + 3300

    @telemetry.instrument('github')
    def request(self, method, path, **kwargs):
        if time.monotonic() > self.expires:
            self.refresh()
        prefix = "/repos/" + self.repo
        decoded = unquote(path.split('?',1)[0])
        if any(p in {'.','..'} for p in decoded.split('/')) or '\\' in decoded:
            raise ValueError('Installation request escaped its repository scope')
        if path.split("?", 1)[0] != prefix and not path.startswith(prefix + "/"):
            raise ValueError("Installation request escaped its repository scope")
        return super().request(method, path, **kwargs)

    @telemetry.instrument('github')
    def download(self, repo, sha, root):
        if repo != self.repo:
            raise ValueError("Archive request escaped its repository scope")
        if time.monotonic() > self.expires:
            self.refresh()
        return super().download(repo, sha, root)
