"""Live transactional checks. Every validation row is rolled back."""
import json
import os
import uuid
from pathlib import Path
from worker.database import connect

for line in Path('.local/neon.env').read_text().splitlines():
    if '=' in line:
        key,value=line.split('=',1)
        os.environ[key]=value
owner='migration-validation-'+uuid.uuid4().hex[:12]
request=json.dumps({'owner':owner,'repo':'wauul/patchgoblin-lab','mode':'builder'})
with connect() as db:
    db.execute('BEGIN')
    try:
        legacy=db.execute('SELECT count(*) AS n FROM patchgoblin_jobs WHERE legacy_issue_url IS NOT NULL').fetchone()['n']
        assert legacy==8
        row=db.execute('SELECT * FROM patchgoblin_enqueue(%s,%s,%s::jsonb)',(owner,'validation-key-0001',request)).fetchone()
        retry=db.execute('SELECT * FROM patchgoblin_enqueue(%s,%s,%s::jsonb)',(owner,'validation-key-0001',request)).fetchone()
        assert row['id']==retry['id']
        assert db.execute('SELECT id FROM patchgoblin_jobs WHERE id=%s AND owner_key=%s',(row['id'],'other-owner')).fetchone() is None
        claimed=db.execute('SELECT * FROM patchgoblin_claim(%s::uuid)',(str(uuid.uuid4()),)).fetchone()
        assert claimed['id']==row['id']
        assert db.execute('SELECT * FROM patchgoblin_claim(%s::uuid)',(str(uuid.uuid4()),)).fetchone() is None
        db.execute("UPDATE patchgoblin_jobs SET cancelled_at=now(),status='cancelled' WHERE id=%s",(row['id'],))
        assert db.execute('UPDATE patchgoblin_jobs SET state=%s::jsonb WHERE id=%s AND lease_token=%s AND cancelled_at IS NULL RETURNING id',('{}',row['id'],claimed['lease_token'])).fetchone() is None
        db.execute("UPDATE patchgoblin_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=%s",(row['id'],))
        db.execute('SELECT patchgoblin_expire()')
        saved=db.execute('SELECT status,lease_token FROM patchgoblin_jobs WHERE id=%s',(row['id'],)).fetchone()
        assert saved['status']=='cancelled' and saved['lease_token'] is None
        db.execute("UPDATE patchgoblin_jobs SET status='verify',cancelled_at=NULL,lease_token=%s,lease_expires_at=now()-interval '1 second' WHERE id=%s",(str(uuid.uuid4()),row['id']))
        db.execute('SELECT patchgoblin_expire()')
        assert db.execute('SELECT status FROM patchgoblin_jobs WHERE id=%s',(row['id'],)).fetchone()['status']=='failed'
        print(json.dumps({'legacy_jobs':legacy,'idempotency':'passed','owner_isolation':'passed','exclusive_lease':'passed','cancellation_write_guard':'passed','expired_job_recovery':'passed','terminal_state_preservation':'passed','validation_rows':'rolled back'}))
    finally:
        db.execute('ROLLBACK')
