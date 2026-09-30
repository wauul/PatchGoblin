"""Non-destructive schema install and idempotent import of legacy owner job history."""
import json
import os
from pathlib import Path
from worker.database import connect
from worker.github import GitHub,StateStore

for path in [Path('.env'),Path('.local/neon.env')]:
    for line in path.read_text().splitlines():
        if '=' in line and not line.startswith('#'):
            key,value=line.split('=',1)
            os.environ[key]=value
g=GitHub()
with connect() as db:
    db.execute(Path('db/001_jobs.sql').read_text())
    count=0
    for issue in g.request('GET','/repos/wauul/PatchGoblin/issues?creator=wauul&state=all&per_page=100'):
        if not issue['title'].startswith('PatchGoblin job '):
            continue
        request=json.loads(issue['body'])
        state=StateStore(g,'wauul/PatchGoblin',issue['number']).previous or {'status':'failed','diagnosis':'Legacy runner did not persist a final result.'}
        comments=g.request('GET',f"/repos/wauul/PatchGoblin/issues/{issue['number']}/comments?per_page=100")
        for c in comments:
            if c['user']['login']=='wauul' and c['body'].startswith('<!-- patchgoblin-pr-v1 -->'):
                state.update(json.loads(c['body'].split('\n',1)[1]))
        status='cancelled' if issue['state']=='closed' and state['status']!='submitted' else state['status']
        # Only terminal history is imported. In-flight jobs must finish on their original worker.
        if status not in {'submitted','verified','failed','unsupported','cancelled'}:
            raise RuntimeError('Legacy job is still running; finish or cancel it before migration')
        db.execute("INSERT INTO patchgoblin_jobs(id,owner_key,idempotency_key,request,state,status,created_at,cancelled_at,legacy_issue_url) VALUES(%s,%s,%s,%s::jsonb,%s::jsonb,%s,%s,%s,%s) ON CONFLICT (owner_key,idempotency_key) DO NOTHING",(issue['number'],request['owner'],request['key'],json.dumps(request),json.dumps(state),status,issue['created_at'],issue['closed_at'] if status=='cancelled' else None,issue['html_url']))
        count+=1
    db.execute("SELECT setval(pg_get_serial_sequence('patchgoblin_jobs','id'),greatest((SELECT coalesce(max(id),1) FROM patchgoblin_jobs),1))")
print(json.dumps({'schema':'installed','legacy_jobs_considered':count,'credentials':'not printed'}))
