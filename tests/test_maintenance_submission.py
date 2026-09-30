"""Maintenance PR lookup uses explicit GitHub response fixtures."""
from worker.submit import pending_maintenance


class Github:
    def __init__(self, prs):
        self.prs = prs

    def request(self, method, path):
        return self.prs


def pr(branch, author='patchgoblin-ci[bot]', base='main'):
    return {'head': {'ref': branch}, 'user': {'login': author}, 'base': {'ref': base}}


def test_reuses_suffixed_open_maintenance_branch():
    existing = pr('codex/patchgoblin-maintenance-23')
    assert pending_maintenance(Github([existing]), 'owner/repo', {'ref':'main'}) is existing


def test_contributor_review_does_not_update_default_branch_maintenance():
    default = pr('codex/patchgoblin-maintenance')
    review = pr('codex/patchgoblin-maintenance-review-9-25')
    assert pending_maintenance(Github([default,review]), 'owner/repo', {'ref':'contributor','base_ref':'main','review_pr':9}) is review


def test_does_not_take_over_another_author_or_base():
    others = [pr('codex/patchgoblin-maintenance','human'),pr('codex/patchgoblin-maintenance-25',base='release')]
    assert pending_maintenance(Github(others), 'owner/repo', {'ref':'main'}) is None
