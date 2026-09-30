"""Idempotent submission of a verified patch using GitHub's data API."""
import os
from urllib.parse import quote
from worker.security import safe_path, redact


def submit(github,job_id,request,state,cancelled=lambda:False):
    files=state.get('patch',{})
    checks=state.get('verification',[])
    if state.get('status')!='verified' or not checks or any(v['exit_code']!=0 for v in checks):
        raise ValueError('A verified patch is required before submission')
    if request['repo'] not in os.getenv('ALLOWED_REPOS','wauul/patchgoblin-lab').split(','):
        raise ValueError('Repository is outside the allowlist')
    if not files or len(files)>4 or sum(len(v) for p,v in files.items() if p!='uv.lock')>24000:
        raise ValueError('Patch exceeds submission budget')
    for name,content in files.items():
        safe_path(name)
        if not isinstance(content,str) or len(content)>(128000 if name=='uv.lock' else 24000):
            raise ValueError('Invalid patch content')
        if name not in {'requirements.txt','requirements-dev.txt','pyproject.toml','uv.lock'} and not (name.startswith('.github/workflows/') and name.endswith(('.yml','.yaml'))):
            raise ValueError('Patch failed the submission allowlist')
    if cancelled():
        raise InterruptedError('Job cancelled before submission')
    repo=request['repo']
    prefix=f'/repos/{repo}'
    current=github.request('GET',prefix+'/commits/'+quote(state['base_ref'],safe=''))
    if current['sha']!=state['sha']:
        raise ValueError('Base branch changed during verification. Start a new job against the current commit.')
    owner=os.getenv('OWNER_LOGIN','wauul')
    branch=f'codex/patchgoblin-neon-{job_id}'
    existing=github.request('GET',prefix+f'/pulls?state=all&head={owner}:{branch}')
    if existing:
        pr=existing[0]
    else:
        tree=github.request('POST',prefix+'/git/trees',json={'base_tree':current['commit']['tree']['sha'],
            'tree':[{'path':p,'content':c,'mode':'100644','type':'blob'} for p,c in files.items()]})
        commit=github.request('POST',prefix+'/git/commits',json={'message':'PatchGoblin: '+('add Python CI' if request['mode']=='builder' else 'repair dependency installation'),
            'tree':tree['sha'],'parents':[state['sha']]})
        if cancelled():
            raise InterruptedError('Job cancelled before branch creation')
        try:
            github.request('POST',prefix+'/git/refs',json={'ref':'refs/heads/'+branch,'sha':commit['sha']})
        except RuntimeError as exc:
            if 'HTTP 422' not in str(exc):
                raise
        head=github.request('GET',prefix+'/commits/'+branch)
        if head['commit']['tree']['sha']!=tree['sha']:
            raise ValueError('Submission branch differs from the verified patch')
        before='\n'.join(f"- {v['command']}: exit {v['exit_code']}" for v in state.get('reproduction',[])) or 'No existing CI workflow.'
        after='\n'.join(f"- {v['command']}: exit {v['exit_code']} ({v['duration_seconds']}s)" for v in checks)
        metrics=state.get('metrics',{})
        workbench=os.getenv('APP_URL','https://patchgoblin.vercel.app')
        body=f"""## Summary

{state['diagnosis']}

Changed files: {', '.join(files)}

## Evidence

**Before:**
{before}

**After:** verified in a disposable Railway sandbox at {state['sha']}.
{after}

{chr(10).join(state.get('evidence',[]))}

{chr(10).join(state.get('limitations',[]))}

Model: {metrics.get('model','unavailable')} via Groq. Usage: {metrics.get('model_tokens','unavailable')} tokens. Token list-price estimate: {metrics.get('estimated_cost_usd','unavailable')} USD; actual charges unavailable.

[Job {job_id}]({workbench}/?job={job_id})

## Merge Danger

**Door:** two-way

**Blast Radius:** dependencies

Tests and required checks were preserved. No automatic merge.
"""
        if cancelled():
            raise InterruptedError('Job cancelled before pull request creation')
        payload={'title':'PatchGoblin: '+('build Python CI' if request['mode']=='builder' else 'repair dependency installation'),
                 'head':branch,'base':state['base_ref'],'body':redact(body)}
        try:
            pr=github.request('POST',prefix+'/pulls',json=payload)
        except RuntimeError:
            raced=github.request('GET',prefix+f'/pulls?state=all&head={owner}:{branch}')
            if not raced:
                raise
            pr=raced[0]
    return {'pr_url':pr['html_url'],'pr_number':pr['number'],'pr_sha':pr['head']['sha'],'status':'submitted'}
