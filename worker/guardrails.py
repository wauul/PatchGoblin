"""Live server-side controls. Missing configuration/database state denies work."""
import time
from worker.database import connect


def require_feature(feature):
    with connect() as db:
        row = db.execute("SELECT pg_feature_allowed(%s) AS allowed", (feature,)).fetchone()
    if not row or row.get("allowed") is not True:
        raise RuntimeError("PG_FEATURE_PAUSED")


def deadline_timeout(deadline, maximum=30):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("Job runtime budget exhausted")
    return min(maximum, remaining)


def authorize_actor(github, account_id):
    with connect() as db:
        account = db.execute("SELECT id,login FROM pg_accounts WHERE id=%s", (account_id,)).fetchone()
    if not account:
        raise PermissionError("Job account no longer exists")
    permission = github.request("GET", f"/repos/{github.repo}/collaborators/{account['login']}/permission")
    if permission.get("user", {}).get("id") != account_id or permission.get("permission") not in {"write", "maintain", "admin"}:
        raise PermissionError("Repository write access was removed")


def audit(account_id, action, resource_id):
    with connect() as db:
        db.execute("SELECT pg_audit(%s,%s,%s)", (account_id, action, resource_id))
