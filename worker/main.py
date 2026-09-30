import json
import os
from pathlib import Path
from worker.agent import Agent
from worker.github import GitHub, StateStore


def main():
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    issue = event.get("issue")
    if not issue or issue["user"]["login"] != os.getenv("OWNER_LOGIN", "wauul") or not issue["title"].startswith("PatchGoblin job "):
        print("Ignored: not an authorized PatchGoblin job")
        return
    request = json.loads(issue["body"])
    if set(request) - {"repo","mode","run_id","ref","owner","key","created_at"}:
        raise ValueError("Unknown request fields")
    github = GitHub()
    store = StateStore(github, os.environ["GITHUB_REPOSITORY"], issue["number"])
    result = Agent(github, store).execute(request)
    Path("result.json").write_text(json.dumps(result, indent=2))
    print(json.dumps({"status":result["status"],"metrics":result["metrics"]}))


if __name__ == "__main__":
    main()
