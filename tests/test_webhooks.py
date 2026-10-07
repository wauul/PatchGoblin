"""Delivery policy tests; provider/database doubles are explicit unit fixtures."""

from contextlib import contextmanager
import pytest
from worker import webhooks


class DB:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def execute(self, sql, args=()):
        self.calls.append((sql, args))
        return self

    def fetchone(self):
        return self.result


def fake_database(monkeypatch, result):
    db = DB(result)

    @contextmanager
    def connection():
        yield db

    monkeypatch.setattr(webhooks, "connect", connection)
    return db


def delivery(event, payload):
    return {"id": "unit-delivery", "event": event, "installation_id": 10, "repository_id": 20, "payload": payload}


REPO = {
    "id": 20,
    "full_name": "owner/repo",
    "enabled": True,
    "paused": False,
    "default_branch": "main",
    "auto_repair": True,
    "auto_builder": False,
    "auto_maintenance": True,
}


@pytest.fixture(autouse=True)
def healthy_controls(monkeypatch):
    monkeypatch.setattr(webhooks, 'require_feature', lambda feature: None)


def test_agent_workflow_receipt_never_enqueues_a_job(monkeypatch):
    fake_database(monkeypatch, REPO)
    receipts = []
    monkeypatch.setattr(webhooks, "record_remote_ci", lambda *args: receipts.append(args))
    monkeypatch.setattr(webhooks, "enqueue", lambda *args: (_ for _ in ()).throw(AssertionError("Loop")))
    webhooks.process(
        delivery(
            "workflow_run",
            {"action": "completed", "workflow_run": {"head_branch": "codex/patchgoblin-neon-1", "id": 1}},
        )
    )
    assert len(receipts) == 1


def test_agent_push_and_pr_never_enqueue(monkeypatch):
    fake_database(monkeypatch, REPO)
    monkeypatch.setattr(webhooks, "enqueue", lambda *args: (_ for _ in ()).throw(AssertionError("Loop")))
    webhooks.process(delivery("push", {"ref": "refs/heads/codex/patchgoblin-maintenance"}))
    webhooks.process(
        delivery(
            "pull_request",
            {
                "action": "opened",
                "pull_request": {"head": {"ref": "codex/patchgoblin-maintenance"}, "user": {"login": "bot"}},
            },
        )
    )


def test_disabled_or_paused_repo_never_starts_automation(monkeypatch):
    monkeypatch.setattr(webhooks, "enqueue", lambda *args: (_ for _ in ()).throw(AssertionError("Disabled")))
    for state in [{"enabled": False}, {"paused": True}]:
        fake_database(monkeypatch, {**REPO, **state})
        webhooks.process(delivery("push", {"ref": "refs/heads/main", "after": "new-sha"}))


def test_out_of_order_push_does_not_supersede_latest_commit(monkeypatch):
    fake_database(monkeypatch, REPO)

    class Client:
        def close(self):
            pass

    class Github:
        client = Client()

        def __init__(self, *args):
            pass

        def request(self, *args):
            return {"sha": "current-sha"}

    monkeypatch.setattr(webhooks, "InstallationGitHub", Github)
    monkeypatch.setattr(webhooks, "enqueue", lambda *args: (_ for _ in ()).throw(AssertionError("Stale event")))
    webhooks.process(delivery("push", {"ref": "refs/heads/main", "after": "old-sha"}))


def test_active_job_backpressure_remains_retryable_after_three_attempts(monkeypatch):
    db = fake_database(monkeypatch, {"id": "retry-unit", "attempts": 3})
    monkeypatch.setattr(webhooks, "process", lambda row: (_ for _ in ()).throw(RuntimeError("PG_ACTIVE_JOB")))
    assert webhooks.drain_deliveries()
    assert db.calls[-1][1][0] == "pending"


def native_action(monkeypatch, permission, registered=True):
    monkeypatch.setenv('GITHUB_APP_ID','51')
    repo={**REPO,'controller_id':999}
    class DB:
        def execute(self,sql,args=()):
            self.value=({'id':100} if registered else None) if 'SELECT id FROM pg_accounts' in sql else repo
            return self
        def fetchone(self):
            return self.value
    @contextmanager
    def connection():
        yield DB()
    monkeypatch.setattr(webhooks,'connect',connection)
    class Client:
        def close(self):
            pass
    class Github:
        client=Client()
        def __init__(self,*args):
            pass
        def request(self,method,path):
            return permission if path.endswith('/permission') else {'conclusion':'failure','event':'push','head_branch':'main','head_sha':'fixture-sha','run_attempt':2}
    monkeypatch.setattr(webhooks,'InstallationGitHub',Github)
    enqueued=[]
    monkeypatch.setattr(webhooks,'enqueue',lambda *args:enqueued.append(args))
    webhooks.process(delivery('check_run',{'action':'requested_action','requested_action':{'identifier':'repair'},'sender':{'login':'writer','id':100},'check_run':{'app':{'id':51},'external_id':'run:10'}}))
    return enqueued


def test_native_repair_uses_the_authorized_sender_and_durable_run_key(monkeypatch):
    result=native_action(monkeypatch,{'permission':'write','user':{'id':100}})
    assert len(result)==1
    assert result[0][0]['controller_id']==100
    assert result[0][2]=='native-repair-10-2'


@pytest.mark.parametrize('permission,registered',[
    ({'permission':'read','user':{'id':100}},True),
    ({'permission':'write','user':{'id':200}},True),
    ({'permission':'write','user':{'id':100}},False),
])
def test_native_repair_denies_readonly_mismatched_or_unregistered_sender(monkeypatch,permission,registered):
    assert native_action(monkeypatch,permission,registered)==[]
