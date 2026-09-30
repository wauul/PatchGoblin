import json
import os
from pathlib import Path
from worker.agent import Agent
from worker.github import GitHub, StateStore
from worker.security import redact


def main():
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    issue = event.get("issue")
    if not issue or issue["user"]["login"] != os.getenv("OWNER_LOGIN", "wauul") or not issue["title"].startswith("PatchGoblin job "):
        print("Ignored: not an authorized PatchGoblin job")
        return
    github = GitHub()
    store = StateStore(github, os.environ["GITHUB_REPOSITORY"], issue["number"])
    agent = Agent(github, store)
    try:
        request = json.loads(issue["body"])
        if not isinstance(request, dict) or set(request) - {"repo","mode","run_id","ref","owner","key","created_at","ci_logs"}:
            raise ValueError("Unknown request fields")
        if "ci_logs" in request and (not isinstance(request["ci_logs"], str) or len(request["ci_logs"]) > 12000):
            raise ValueError("Invalid redacted CI evidence")
        result = agent.execute(request)
    except (ValueError, TypeError) as exc:
        result = {**agent.state, "status":"failed", "diagnosis":redact(str(exc))[:1000]}
        store.save(result)
    Path("result.json").write_text(json.dumps(result, indent=2))
    print(json.dumps({"status":result["status"],"metrics":result["metrics"]}))


if __name__ == "__main__":
    main()
