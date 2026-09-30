"""Repository token boundaries: exact metadata route and descendants only."""
import time
import pytest
from worker.app_auth import InstallationGitHub
from worker.github import GitHub


def test_installation_scope_accepts_repo_metadata_but_rejects_adjacent_repo(monkeypatch):
    github = InstallationGitHub.__new__(InstallationGitHub)
    github.repo = 'owner/repo'
    github.expires = time.monotonic() + 60
    monkeypatch.setattr(GitHub, 'request', lambda self, method, path, **kwargs: path)
    for path in ['/repos/owner/repo', '/repos/owner/repo?x=1', '/repos/owner/repo/commits/main']:
        assert github.request('GET', path) == path
    for path in ['/repos/owner/repo-other', '/repos/owner/repo-other/commits', '/user','/repos/owner/repo/../../other','/repos/owner/repo/%2e%2e/other']:
        with pytest.raises(ValueError, match='repository scope'):
            github.request('GET', path)
