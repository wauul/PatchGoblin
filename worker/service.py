"""Authenticated HTTP wake-up service. Neon is the durable queue; no idle polling."""

import hmac
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from worker.agent import Agent
from worker.database import DatabaseStore, claim, connect
from worker.github import GitHub
from worker.railway_sandbox import RailwaySandbox, destroy
from worker.security import redact
from worker.submit import submit
from worker.app_auth import InstallationGitHub
from worker.pipeline_agent import PipelineAgent
from worker.webhooks import drain_deliveries

DRAIN_LOCK = threading.Lock()
DELIVERY_LOCK = threading.Lock()


def cleanup():
    with connect() as db:
        rows = db.execute(
            "SELECT id,sandbox_id FROM patchgoblin_jobs WHERE sandbox_id IS NOT NULL AND (lease_expires_at IS NULL OR lease_expires_at<now())"
        ).fetchall()
    for row in rows:
        try:
            destroy(row["sandbox_id"])
        except Exception:
            # Expired/auto-destroyed VMs are harmless. Keep the ID for inspection.
            continue
        with connect() as db:
            db.execute(
                "UPDATE patchgoblin_jobs SET sandbox_id=NULL WHERE id=%s AND sandbox_id=%s",
                (row["id"], row["sandbox_id"]),
            )


def execute(row):
    store = DatabaseStore(row)
    request = row["request"]
    github = None
    agent = None
    try:
        if not isinstance(request, dict) or set(request) - {
            "repo",
            "mode",
            "run_id",
            "ref",
            "owner",
            "key",
            "created_at",
            "ci_logs",
            "installation_id",
            "repository_id",
            "sha",
            "source",
            "base_ref",
            "review_pr",
            "retry_submission",
        }:
            raise ValueError("Invalid durable job request")
        if request.get("owner") != row["owner_key"]:
            raise ValueError("Durable job owner mismatch")
        github = (
            InstallationGitHub(int(row["installation_id"]), int(row["repository_id"]), request["repo"])
            if row.get("installation_id")
            else GitHub()
        )
        agent = (PipelineAgent if request.get("mode") in {"builder", "maintenance"} else Agent)(github, store)
        agent.sandbox_factory = lambda root, cancelled, deadline: RailwaySandbox(
            root, cancelled, deadline, {"repo": agent.state["repo"], "sha": agent.state["sha"]}, store.sandbox
        )
        result = agent.execute(request)
        if row.get("repository_id") and result.get("coverage"):
            with connect() as db:
                db.execute(
                    "UPDATE pg_repositories SET coverage=%s::jsonb WHERE id=%s",
                    (json.dumps(result["coverage"]), row["repository_id"]),
                )
        if result["status"] == "verified" and not store.cancelled(force=True):
            try:
                result.update(submit(github, row["id"], request, result, lambda: store.cancelled(force=True)))
            except Exception as exc:
                result["pr_error"] = redact(str(exc))[:1000]
            store.save(result)
        if row.get("installation_id") and result.get("sha"):
            try:
                github.request(
                    "POST",
                    f"/repos/{request['repo']}/check-runs",
                    json={
                        "name": "PatchGoblin " + request["mode"],
                        "head_sha": result["sha"],
                        "external_id": "job:" + str(row["id"]),
                        "status": "completed",
                        "conclusion": "success" if result["status"] in {"submitted", "verified"} else "neutral",
                        "details_url": os.getenv("APP_URL") + "/workbench?job=" + str(row["id"]),
                        "output": {
                            "title": result["status"].capitalize(),
                            "summary": redact(result.get("diagnosis", ""))
                            + "\n\n"
                            + ("\n".join(result.get("evidence", [])))[:3000]
                            + "\n\n"
                            + (result.get("pr_url") or "No unverified pull request was opened."),
                        },
                    },
                )
            except Exception:
                pass
        print(
            json.dumps({"job": row["id"], "status": result["status"], "metrics": result.get("metrics", {})}), flush=True
        )
    except Exception as exc:
        if not store.cancelled(force=True):
            state = (
                agent.state
                if agent
                else {"events": [], "patch": {}, "verification": [], "limitations": [], "metrics": {}}
            )
            state.update(status="failed", diagnosis=redact(str(exc))[:1000])
            store.save(state)
        print(json.dumps({"job": row["id"], "error": redact(str(exc))[:1000]}), flush=True)
    finally:
        if github:
            github.client.close()
        store.release()


def drain():
    try:
        cleanup()
        while True:
            while drain_deliveries():
                pass
            row = claim()
            if row:
                execute(row)
                continue
            with connect() as db:
                next_work = db.execute(
                    "SELECT LEAST((SELECT min(not_before) FROM patchgoblin_jobs WHERE status='queued' AND cancelled_at IS NULL),(SELECT min(available_at) FROM pg_deliveries WHERE status='pending')) AS at"
                ).fetchone()["at"]
            if not next_work:
                break
            from datetime import datetime, timezone

            time.sleep(max(0.2, min(15, (next_work - datetime.now(timezone.utc)).total_seconds())))
    except Exception as exc:
        print(json.dumps({"level": "error", "message": redact(str(exc))[:1000]}), flush=True)
    finally:
        DRAIN_LOCK.release()


def wake():
    if DRAIN_LOCK.acquire(blocking=False):
        threading.Thread(target=drain, daemon=True).start()
    elif DELIVERY_LOCK.acquire(blocking=False):
        # Reconcile signed events while sandbox work is running, so a newer push
        # or revoked installation can cancel that work before submission.
        def reconcile_pending():
            try:
                while drain_deliveries():
                    pass
            except Exception as exc:
                print(json.dumps({'level':'error','message':redact(str(exc))[:1000]}), flush=True)
            finally:
                DELIVERY_LOCK.release()
        threading.Thread(target=reconcile_pending, daemon=True).start()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def respond(self, status, body):
        text = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(text)))
        self.end_headers()
        self.wfile.write(text)

    def do_GET(self):
        self.respond(200, {"status": "ok"}) if self.path == "/health" else self.respond(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/wake":
            return self.respond(404, {"error": "Not found"})
        expected = "Bearer " + os.environ["WORKER_WAKE_TOKEN"]
        if not hmac.compare_digest(self.headers.get("Authorization", ""), expected):
            return self.respond(401, {"error": "Unauthorized"})
        if int(self.headers.get("Content-Length", "0")) != 0:
            return self.respond(400, {"error": "Wake requests must have an empty body"})
        wake()
        self.respond(202, {"accepted": True})


def main():
    for name in [
        "GITHUB_APP_ID",
        "GITHUB_APP_PRIVATE_KEY_B64",
        "GROQ_API_KEY",
        "DATABASE_URL",
        "RAILWAY_TOKEN",
        "WORKER_WAKE_TOKEN",
    ]:
        if not os.getenv(name):
            raise RuntimeError("Missing required worker setting: " + name)
    server = ThreadingHTTPServer(("0.0.0.0", int(os.getenv("PORT", "8080"))), Handler)
    wake()
    server.serve_forever()


if __name__ == "__main__":
    main()
