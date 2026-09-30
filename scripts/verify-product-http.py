"""Real production HTTP checks with a labeled, short-lived backend session fixture.

This fixture is not an OAuth identity or a successful agent job. All fixture
records are deleted, including on failure. The real operator account is untouched.
"""
import hashlib
import hmac
import json
import os
import secrets
import sys
import uuid
from pathlib import Path
import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from worker.database import connect

for file in ['.local/neon.env','.local/github-app.env']:
    for line in Path(file).read_text().splitlines():
        if '=' in line:
            key,value=line.split('=',1)
            os.environ[key]=value

origin='https://patchgoblin.vercel.app'
checks=[]
with httpx.Client(base_url=origin,timeout=30) as client:
    assert client.get('/').status_code==200
    assert client.get('/api/jobs',headers={'x-openai-user-id':'owner','x-openai-is-authenticated':'true'}).status_code==401
    checks.append('Public landing returns 200; anonymous jobs and client-supplied identity return 401')
    assert client.post('/api/github/webhook',content='{}',headers={'x-hub-signature-256':'sha256='+'0'*64}).status_code==401
    checks.append('Invalid webhook signature is rejected')
    delivery='fixture-'+str(uuid.uuid4())
    raw=json.dumps({'zen':'Explicit developer ping fixture, no repository and no job'}).encode()
    headers={'x-hub-signature-256':'sha256='+hmac.new(os.environ['GITHUB_WEBHOOK_SECRET'].encode(),raw,hashlib.sha256).hexdigest(),'x-github-delivery':delivery,'x-github-event':'ping','Content-Type':'application/json'}
    first=client.post('/api/github/webhook',content=raw,headers=headers)
    again=client.post('/api/github/webhook',content=raw,headers=headers)
    assert first.status_code==202 and first.json()['duplicate'] is False
    assert again.status_code==202 and again.json()['duplicate'] is True
    with connect() as db:
        assert db.execute('SELECT count(*) AS n FROM pg_deliveries WHERE id=%s',(delivery,)).fetchone()['n']==1
    checks.append('The same signed ping is accepted once and returns duplicate=true on redelivery')

    account=-(1_000_000_000+secrets.randbelow(900_000_000))
    session=secrets.token_urlsafe(32)
    token_hash=hashlib.sha256(session.encode()).hexdigest()
    csrf=secrets.token_urlsafe(32)
    login='disposable-http-fixture'
    evidence='Disposable backend acceptance fixture; never executed'
    try:
        with connect() as db:
            db.execute('INSERT INTO pg_accounts(id,login) VALUES(%s,%s)',(account,login))
            db.execute("INSERT INTO pg_sessions(token_hash,account_id,csrf,expires_at) VALUES(%s,%s,%s,now()+interval '10 minutes')",(token_hash,account,csrf))
            db.execute("INSERT INTO patchgoblin_jobs(id,account_id,owner_key,idempotency_key,request,state,status) VALUES(%s,%s,%s,'disposable-http-fixture','{}',%s::jsonb,'unsupported')",(account,account,'github:'+str(account),json.dumps({'fixture':True,'diagnosis':evidence})))
        client.cookies.set('__Host-pg-session',session,domain='patchgoblin.vercel.app',path='/')
        exported=client.get('/api/account/export')
        assert exported.status_code==200
        data=exported.json()
        assert data['account']['login']==login and len(data['jobs'])==1
        assert 'credentials' not in json.dumps(data) and 'token_hash' not in json.dumps(data)
        checks.append('Real export HTTP route includes fixture data and excludes credentials and session material')
        denied=client.post('/api/account/delete',json={'confirm':login},headers={'Origin':'https://untrusted.invalid','x-csrf-token':csrf})
        assert denied.status_code==403
        result=client.post('/api/account/delete',json={'confirm':login},headers={'Origin':origin,'x-csrf-token':csrf})
        assert result.status_code==200,result.text
        with connect() as db:
            assert not db.execute('SELECT id FROM pg_accounts WHERE id=%s',(account,)).fetchone()
            assert not db.execute('SELECT id FROM patchgoblin_jobs WHERE id=%s',(account,)).fetchone()
            assert not db.execute('SELECT token_hash FROM pg_sessions WHERE account_id=%s',(account,)).fetchone()
        assert client.get('/api/account/export').status_code==401
        checks.append('Cross-origin deletion is denied; confirmed deletion removes fixture account, session and evidence; the session then returns 401')
    finally:
        with connect() as db:
            db.execute('DELETE FROM patchgoblin_jobs WHERE id=%s',(account,))
            db.execute('DELETE FROM pg_accounts WHERE id=%s',(account,))
report={'environment':origin,'account_fixture':'temporary backend session, not OAuth identity','fixture_records_removed':True,'passed':len(checks),'checks':checks}
Path('docs/product-http-verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
