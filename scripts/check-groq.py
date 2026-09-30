"""Real, free-tier Groq smoke check against immutable public lab metadata."""
import json
import os
import tempfile
from pathlib import Path
from worker.github import GitHub
from worker.model import Model
from worker.project import inspect,make_workflow

for line in Path('.local/groq.env').read_text().splitlines():
    if '=' in line:
        key,value=line.split('=',1)
        os.environ[key]=value
os.environ['MODEL_CONTEXT_TOKENS']='12000'
github=GitHub(token='public-metadata-only')
with tempfile.TemporaryDirectory() as directory:
    root=Path(directory)
    github.download('wauul/patchgoblin-lab','main',root)
    project=inspect(root)
    model=Model()
    decision=model.decide({'mode':'builder','project':project,'candidate_workflow':make_workflow(project)})
    output={'live_provider':'groq','decision':decision,'metrics':model.metrics()}
    Path('.local/groq-smoke.json').write_text(json.dumps(output,indent=2))
    print(json.dumps({'action':decision['action'],'paths':list(decision['files']),'metrics':model.metrics()}))
