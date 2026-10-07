"""Durable signed-delivery processing, reconciled against current GitHub state."""
from worker import telemetry

import json
from worker.app_auth import app_request, InstallationGitHub
from worker.database import connect
from worker.security import redact
from worker.guardrails import require_feature


class GuardrailBudgetAlert(RuntimeError):
    pass


def cancel_repository(db, repo_id):
    db.execute(
        "UPDATE patchgoblin_jobs SET cancelled_at=now(),status='cancelled' WHERE repository_id=%s AND status NOT IN ('submitted','verified','failed','unsupported','cancelled')",
        (repo_id,),
    )


def reconcile_installation(installation_id):
    current = app_request("GET", f"/app/installations/{installation_id}")
    with connect() as db:
        if not current or current.get("suspended_at"):
            db.execute("UPDATE pg_installations SET active=false,updated_at=now() WHERE id=%s", (installation_id,))
            rows = db.execute("SELECT id FROM pg_repositories WHERE installation_id=%s", (installation_id,)).fetchall()
            for row in rows:
                db.execute(
                    "UPDATE pg_repositories SET active=false,auto_repair=false,auto_builder=false,auto_maintenance=false,coverage='{}' WHERE id=%s",
                    (row["id"],),
                )
                db.execute("DELETE FROM pg_repository_members WHERE repo_id=%s", (row["id"],))
                cancel_repository(db, row["id"])
            return
        db.execute(
            "INSERT INTO pg_installations(id,account_login,account_type,active) VALUES(%s,%s,%s,true) ON CONFLICT(id) DO UPDATE SET active=true,account_login=EXCLUDED.account_login,account_type=EXCLUDED.account_type,updated_at=now()",
            (installation_id, current["account"]["login"], current["account"]["type"]),
        )
    token = app_request("POST", f"/app/installations/{installation_id}/access_tokens")["token"]
    from worker.github import GitHub

    github = GitHub(token)
    seen = []
    try:
        for page in range(1, 11):
            repos = github.request("GET", f"/installation/repositories?per_page=100&page={page}")["repositories"]
            with connect() as db:
                for repo in repos:
                    seen.append(repo["id"])
                    db.execute(
                        "INSERT INTO pg_repositories(id,installation_id,full_name,default_branch,private) VALUES(%s,%s,%s,%s,%s) ON CONFLICT(id) DO UPDATE SET installation_id=EXCLUDED.installation_id,active=true,full_name=EXCLUDED.full_name,default_branch=EXCLUDED.default_branch,private=EXCLUDED.private,updated_at=now()",
                        (repo["id"], installation_id, repo["full_name"], repo["default_branch"], repo["private"]),
                    )
            if len(repos) < 100:
                break
        with connect() as db:
            removed = db.execute(
                "UPDATE pg_repositories SET active=false,auto_repair=false,auto_builder=false,auto_maintenance=false WHERE installation_id=%s AND NOT(id=ANY(%s)) RETURNING id",
                (installation_id, seen),
            ).fetchall()
            for row in removed:
                db.execute("DELETE FROM pg_repository_members WHERE repo_id=%s", (row["id"],))
                cancel_repository(db, row["id"])
    finally:
        github.client.close()


def enqueue(repo, mode, key, request, delay=0):
    if not repo["controller_id"]:
        return
    with connect() as db:
        if mode == "maintenance":
            db.execute(
                "UPDATE patchgoblin_jobs SET cancelled_at=now(),status='cancelled' WHERE repository_id=%s AND request->>'mode'='maintenance' AND status NOT IN ('submitted','verified','failed','unsupported','cancelled') AND idempotency_key<>%s",
                (repo["id"], key),
            )
        db.execute(
            "SELECT * FROM pg_enqueue(%s,%s,%s,%s::jsonb,%s)",
            (
                repo["controller_id"],
                repo["id"],
                key,
                json.dumps({"repo": repo["full_name"], "mode": mode, "source": "github", "key": key, **request, "telemetry": telemetry.durable_trace()}),
                delay,
            ),
        ).fetchone()
        for _alert in db.execute('SELECT * FROM pg_budget_alerts()').fetchall():
            telemetry.capture(GuardrailBudgetAlert('Service budget reached eighty percent.'), 'delivery')


def record_remote_ci(repo, installation_id, run):
    """Agent branches only update their receipt; they never create another job."""
    github = InstallationGitHub(installation_id, repo["id"], repo["full_name"])
    try:
        latest = github.request("GET", f"/repos/{repo['full_name']}/actions/runs/{run['id']}")
        receipt = {
            "id": latest["id"],
            "name": latest["name"],
            "status": latest["status"],
            "conclusion": latest["conclusion"],
            "url": latest["html_url"],
        }
        with connect() as db:
            db.execute(
                """UPDATE patchgoblin_jobs SET state=jsonb_set(state,'{remote_ci}',
                COALESCE((SELECT jsonb_agg(item) FROM jsonb_array_elements(COALESCE(state->'remote_ci','[]')) item
                          WHERE item->>'id'<>%s),'[]'::jsonb)||%s::jsonb),updated_at=now()
                WHERE repository_id=%s AND state->>'pr_sha'=%s AND owner_key NOT LIKE 'deleted:%%'""",
                (str(latest["id"]), json.dumps([receipt]), repo["id"], latest["head_sha"]),
            )
    finally:
        github.client.close()


def process(delivery):
    with telemetry.work_scope('delivery', delivery.get('id'), (delivery.get('payload') or {}).get('telemetry')):
        try:
            _process(delivery)
        except Exception as exc:
            telemetry.capture(exc, 'delivery')
            raise


def _process(delivery):
    data = delivery["payload"]
    event = delivery["event"]
    installation_id = delivery["installation_id"]
    if event == "github_app_authorization":
        with connect() as db:
            account = data.get("sender", {}).get("id")
            db.execute("DELETE FROM pg_sessions WHERE account_id=%s", (account,))
            db.execute("UPDATE pg_accounts SET credentials=NULL,refresh_lease_until=NULL,token_expires_at=NULL,refresh_expires_at=NULL WHERE id=%s", (account,))
            db.execute("UPDATE patchgoblin_jobs SET cancelled_at=now(),status='cancelled' WHERE account_id=%s AND status NOT IN ('submitted','verified','failed','unsupported','cancelled')", (account,))
            db.execute(
                "UPDATE pg_repositories SET auto_repair=false,auto_builder=false,auto_maintenance=false WHERE controller_id=%s",
                (account,),
            )
        return
    if event in {"installation", "installation_repositories"}:
        reconcile_installation(installation_id)
        return
    require_feature('webhooks')
    if not delivery["repository_id"] or not installation_id:
        return
    with connect() as db:
        repo = db.execute(
            "SELECT r.* FROM pg_repositories r JOIN pg_installations i ON i.id=r.installation_id WHERE r.id=%s AND r.installation_id=%s AND r.active AND i.active",
            (delivery["repository_id"], installation_id),
        ).fetchone()
    if not repo:
        return
    if (
        event == "workflow_run"
        and data.get("action") == "completed"
        and data["workflow_run"]["head_branch"].startswith("codex/patchgoblin-")
    ):
        record_remote_ci(repo, installation_id, data["workflow_run"])
        return
    if not repo["enabled"] or repo["paused"]:
        return
    branch = data.get("ref", "").removeprefix("refs/heads/")
    if branch.startswith("codex/patchgoblin-"):
        return
    if event == "workflow_run" and data.get("action") == "completed":
        run = data["workflow_run"]
        branch = run["head_branch"]
        if branch.startswith("codex/patchgoblin-"):
            return
        github = InstallationGitHub(installation_id, repo["id"], repo["full_name"])
        try:
            latest = github.request("GET", f"/repos/{repo['full_name']}/actions/runs/{run['id']}")
            if latest["status"] != "completed" or latest["conclusion"] != "failure":
                return
            # Forks and pull_request_target have additional trust boundaries: no automatic repairs.
            if latest["event"] in {"pull_request", "pull_request_target"}:
                return
            if repo["auto_repair"]:
                enqueue(
                    repo,
                    "repair",
                    f"failure-{run['id']}-{latest.get('run_attempt', 1)}",
                    {"run_id": run["id"], "ref": branch, "sha": run["head_sha"]},
                )
            else:
                github.request(
                    "POST",
                    f"/repos/{repo['full_name']}/check-runs",
                    json={
                        "name": "PatchGoblin diagnosis",
                        "head_sha": run["head_sha"],
                        "external_id": f"run:{run['id']}",
                        "status": "completed",
                        "conclusion": "neutral",
                        "output": {
                            "title": "Repair is available on request",
                            "summary": "Automatic repair is disabled. A repository writer can request an isolated, verified investigation.",
                        },
                        "actions": [
                            {
                                "label": "Repair this run",
                                "description": "Run a bounded verified repair",
                                "identifier": "repair",
                            }
                        ],
                    },
                )
        finally:
            github.client.close()
    if event == "check_run" and data.get("action") in {"requested_action", "rerequested"}:
        check = data["check_run"]
        external = check.get("external_id", "")
        if str(check["app"]["id"]) != str(__import__("os").environ["GITHUB_APP_ID"]) or not external.startswith("run:"):
            return
        if data.get("action") == "requested_action" and data.get("requested_action", {}).get("identifier") != "repair":
            return
        github = InstallationGitHub(installation_id, repo["id"], repo["full_name"])
        try:
            permission = github.request(
                "GET", f"/repos/{repo['full_name']}/collaborators/{data['sender']['login']}/permission"
            )
            if permission.get("permission") not in {"write", "maintain", "admin"}:
                return
            sender_id = data["sender"]["id"]
            if permission.get("user", {}).get("id") != sender_id:
                return
            with connect() as db:
                registered = db.execute("SELECT id FROM pg_accounts WHERE id=%s", (sender_id,)).fetchone()
            if not registered:
                return  # The linked web workbench provides sign-in before investigation.
            run_id = int(external.split(":")[1])
            run = github.request("GET", f"/repos/{repo['full_name']}/actions/runs/{run_id}")
            if (
                run["conclusion"] == "failure"
                and run["event"] not in {"pull_request", "pull_request_target"}
                and not run["head_branch"].startswith("codex/patchgoblin-")
            ):
                enqueue(
                    {**repo, "controller_id": sender_id},
                    "repair",
                    f"native-repair-{run_id}-{run.get('run_attempt', 1)}",
                    {"run_id": run_id, "ref": run["head_branch"], "sha": run["head_sha"]},
                )
        finally:
            github.client.close()
    if event == "push" and not data.get("deleted") and branch == repo["default_branch"]:
        # Every push is inexpensive metadata analysis; only an actual coverage gap calls a model.
        mode = "maintenance" if repo["auto_maintenance"] else "builder" if repo["auto_builder"] else None
        if mode:
            github = InstallationGitHub(installation_id, repo["id"], repo["full_name"])
            try:
                current = github.request("GET", f"/repos/{repo['full_name']}/commits/{branch}")
                if current["sha"] != data["after"]:
                    return  # An out-of-order push cannot supersede the current repository head.
            finally:
                github.client.close()
            enqueue(repo, mode, "coverage-" + data["after"], {"ref": branch, "sha": data["after"]}, 15)
    if (
        event == "pull_request"
        and data.get("action") in {"opened", "synchronize", "reopened"}
        and repo["auto_maintenance"]
    ):
        pr = data["pull_request"]
        if pr["head"]["ref"].startswith("codex/patchgoblin-") or pr["user"]["login"].endswith("[bot]"):
            return
        if pr["head"]["repo"]["full_name"] != repo["full_name"]:
            # Fork source is not part of this installation. Contributors receive no write access.
            return
        enqueue(
            repo,
            "maintenance",
            f"pr-coverage-{pr['number']}-{pr['head']['sha']}",
            {
                "ref": pr["head"]["ref"],
                "base_ref": pr["base"]["ref"],
                "sha": pr["head"]["sha"],
                "review_pr": pr["number"],
            },
            15,
        )


def drain_deliveries():
    with connect() as db:
        row = db.execute(
            "UPDATE pg_deliveries SET status='processing',attempts=attempts+1,lease_expires_at=now()+interval '2 minutes' WHERE id=(SELECT id FROM pg_deliveries WHERE (status='pending' OR status='processing' AND lease_expires_at<now()) AND available_at<=now() AND (pg_feature_allowed('webhooks') OR event IN ('github_app_authorization','installation','installation_repositories')) ORDER BY CASE WHEN event IN ('github_app_authorization','installation','installation_repositories') THEN 0 ELSE 1 END,received_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *"
        ).fetchone()
    if not row:
        return False
    _finish_delivery(row)
    return True


def _finish_delivery(row):
    try:
        process(row)
        with connect() as db:
            db.execute(
                "UPDATE pg_deliveries SET status='done',payload='{}',lease_expires_at=NULL,error=NULL WHERE id=%s",
                (row["id"],),
            )
    except Exception as exc:
        telemetry.capture(exc, 'delivery')
        busy = "PG_ACTIVE_JOB" in str(exc)
        delay = max(15, getattr(exc,'retry_after',15))
        with connect() as db:
            db.execute(
                "UPDATE pg_deliveries SET status=%s,available_at=now()+(%s * interval '1 second'),lease_expires_at=NULL,error=%s WHERE id=%s",
                ("pending" if 'PG_RATE_LIMIT' not in str(exc) and row["attempts"] < (45 if busy else 8 if hasattr(exc,'retry_after') else 3) else "failed", delay, redact(str(exc))[:300], row["id"]),
            )
    return True
