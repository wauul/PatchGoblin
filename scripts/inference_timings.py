"""Print only numeric llama.cpp timing summaries, never runtime arguments or credentials."""
import re
from pathlib import Path
from worker.security import redact

path = Path(".local/model-runtime/server.log")
if path.exists():
    for line in path.read_text(errors="replace").splitlines():
        if re.search(r"(?:prompt eval time|eval time|total time)\s*=\s*\d", line):
            print(redact(line)[-350:])
