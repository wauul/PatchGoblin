"""Publish only evidence from the two explicitly public disposable lab repositories."""
import base64
import hashlib
import json
import os
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from worker.database import connect
from worker.app_auth import app_request, InstallationGitHub

for file in ['.local/neon.env','.local/github-app.env']:
    for line in Path(file).read_text().splitlines():
        if '=' in line:
            key,value=line.split('=',1)
            os.environ[key]=value
labs={'wauul/patchgoblin-lab','wauul/patchgoblin-product-lab'}
jobs=[]
with connect() as db:
    for row in db.execute('SELECT id,status,created_at,request,state,sandbox_id FROM patchgoblin_jobs WHERE id BETWEEN 14 AND 24 ORDER BY id'):
        assert row['request']['repo'] in labs
        state=row['state']
        jobs.append({'id':row['id'],'status':row['status'],'created_at':row['created_at'].isoformat(),'repo':row['request']['repo'],'mode':row['request']['mode'],'entry_point':row['request'].get('source','web'),'source_sha':state.get('sha',row['request'].get('sha')),'sandbox_cleanup_pending':bool(row['sandbox_id']),**{k:state[k] for k in ['diagnosis','metrics','pr_url','pr_sha','pr_error','diff','reproduction','verification','remote_ci','limitations','coverage','changed_files'] if k in state}})
    assert not db.execute('SELECT id FROM patchgoblin_jobs WHERE sandbox_id IS NOT NULL OR lease_token IS NOT NULL').fetchone()
    rows=db.execute("SELECT id,installation_id,full_name,auto_repair,auto_maintenance,auto_builder,active FROM pg_repositories WHERE active").fetchall()
    assert {r['full_name'] for r in rows}==labs
    report={'checked_at':datetime.now(timezone.utc).isoformat(),'scope':'Actual hosted product-lab jobs, including development failures; not an independent complete Groq benchmark','job_count':len(jobs),'outcomes':dict(Counter(j['status'] for j in jobs)),'measured_model_tokens':sum((j.get('metrics',{}).get('model_tokens') or 0) for j in jobs),'all_execution_vms_cleared':True,'jobs':jobs}
    controls=json.loads(Path('.local/uninstall-verification.json').read_text())
    controls['restored_installation']=rows[0]['installation_id']
    controls['restored_repositories']=sorted(r['full_name'] for r in rows)
    controls['restored_automation_off']=all(not r['auto_repair'] and not r['auto_maintenance'] and not r['auto_builder'] for r in rows)
    proofs=[]
    for number in [5,6]:
        repo='wauul/patchgoblin-lab'
        github=InstallationGitHub(rows[0]['installation_id'],next(r['id'] for r in rows if r['full_name']==repo),repo)
        pr=github.request('GET',f'/repos/{repo}/pulls/{number}')
        files=github.request('GET',f'/repos/{repo}/pulls/{number}/files?per_page=100')
        original=github.request('GET',f'/repos/{repo}/contents/.github/workflows/custom-python-ci.yml?ref=main')
        proposed=github.request('GET',f"/repos/{repo}/contents/.github/workflows/custom-python-ci.yml?ref={pr['head']['sha']}")
        assert base64.b64decode(original['content'])==base64.b64decode(proposed['content'])
        assert {f['filename'] for f in files}==({'.github/workflows/patchgoblin-maintenance.yml'} if number==5 else {'package-lock.json'})
        proofs.append({'pr':pr['html_url'],'head_sha':pr['head']['sha'],'merged':pr['merged'],'changed_files':[f['filename'] for f in files],'custom_python_workflow_sha256':hashlib.sha256(base64.b64decode(original['content'])).hexdigest(),'custom_python_workflow_byte_identical':True})
        github.client.close()
    controls['preservation']=proofs
Path('docs/product-results.json').write_text(json.dumps(report,indent=2)+'\n')
Path('docs/product-controls-verification.json').write_text(json.dumps(controls,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='jobs'},indent=2))
