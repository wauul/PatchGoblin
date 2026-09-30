"""Live Neon acceptance checks using uncommitted, disposable transaction fixtures.

No fixture account, session, repository or job is committed. PostgreSQL identity
sequences can advance, so real job IDs need not be consecutive.
"""
import json
import os
import sys
import uuid
from pathlib import Path
from unittest.mock import patch
from contextlib import contextmanager

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from worker.database import connect, DatabaseStore

for line in Path('.local/neon.env').read_text().splitlines():
    if line.startswith('DATABASE_URL='):
        os.environ['DATABASE_URL'] = line.split('=', 1)[1]

checks = []
db = connect()
db.autocommit = False
try:
    account, other, repo, installation = -990000001, -990000002, -990000003, -990000004
    db.execute("INSERT INTO pg_accounts(id,login) VALUES(%s,'disposable-db-fixture'),(%s,'other-db-fixture')", (account, other))
    db.execute("INSERT INTO pg_installations(id,account_login,account_type) VALUES(%s,'disposable-db-fixture','User')", (installation,))
    db.execute("INSERT INTO pg_repositories(id,installation_id,full_name,controller_id) VALUES(%s,%s,'disposable-db-fixture/transaction',%s)", (repo, installation, account))
    db.execute("INSERT INTO pg_sessions(token_hash,account_id,csrf,expires_at) VALUES('disposable-fixture-session',%s,'fixture-csrf',now()+interval '1 hour')", (account,))
    db.execute("INSERT INTO pg_repository_members(account_id,repo_id,can_push,can_admin) VALUES(%s,%s,true,true)", (account, repo))
    request = json.dumps({'repo':'disposable-db-fixture/transaction','mode':'builder'})
    row = db.execute("SELECT * FROM pg_enqueue(%s,%s,'db-fixture-key',%s::jsonb,0)", (account, repo, request)).fetchone()
    again = db.execute("SELECT * FROM pg_enqueue(%s,%s,'db-fixture-key',%s::jsonb,0)", (account, repo, request)).fetchone()
    assert row['id'] == again['id']
    checks.append('Idempotent enqueue returns the existing job')
    assert not db.execute('SELECT id FROM patchgoblin_jobs WHERE id=%s AND account_id=%s', (row['id'],other)).fetchone()
    checks.append('Account ownership excludes another account')
    db.execute('SAVEPOINT active_check')
    try:
        db.execute("SELECT * FROM pg_enqueue(%s,%s,'another-fixture-key',%s::jsonb,0)", (account, repo, request))
        raise AssertionError('Concurrent account work was permitted')
    except Exception as error:
        assert 'PG_ACTIVE_JOB' in str(error)
        db.execute('ROLLBACK TO SAVEPOINT active_check')
    checks.append('Concurrent work is rejected atomically')
    db.execute('UPDATE pg_repositories SET daily_limit=1 WHERE id=%s', (repo,))
    db.execute('SAVEPOINT quota_check')
    try:
        db.execute("SELECT * FROM pg_enqueue(%s,%s,'quota-fixture-key',%s::jsonb,0)", (account, repo, request))
        raise AssertionError('Daily quota was exceeded')
    except Exception as error:
        assert 'PG_RATE_LIMIT' in str(error)
        db.execute('ROLLBACK TO SAVEPOINT quota_check')
    checks.append('Repository quota applies before new job creation')
    lease = uuid.uuid4()
    db.execute("UPDATE patchgoblin_jobs SET lease_token=%s,lease_expires_at=now()+interval '15 minutes',sandbox_id='uncommitted-disposable-vm',state=%s::jsonb WHERE id=%s", (lease,json.dumps({'status':'verify','private_evidence':'fixture-only'}),row['id']))
    store = DatabaseStore({**row,'lease_token':lease})
    db.execute('SELECT pg_delete_account(%s)', (account,))
    assert not db.execute('SELECT id FROM pg_accounts WHERE id=%s',(account,)).fetchone()
    assert not db.execute('SELECT token_hash FROM pg_sessions WHERE account_id=%s',(account,)).fetchone()
    assert not db.execute('SELECT repo_id FROM pg_repository_members WHERE account_id=%s',(account,)).fetchone()
    cleared = db.execute('SELECT * FROM patchgoblin_jobs WHERE id=%s',(row['id'],)).fetchone()
    assert cleared['request']=={} and cleared['state']=={} and cleared['account_id'] is None
    assert cleared['status']=='cancelled' and cleared['owner_key'].startswith('deleted:')
    assert cleared['sandbox_id']=='uncommitted-disposable-vm'
    checks.append('Deletion removes account/session/membership, erases evidence and retains only active cleanup data')

    @contextmanager
    def same_transaction():
        yield db

    with patch('worker.database.connect',same_transaction):
        store.save({'status':'cancelled','private_evidence':'must-not-return'})
    assert db.execute('SELECT state FROM patchgoblin_jobs WHERE id=%s',(row['id'],)).fetchone()['state']=={}
    checks.append('A racing cancelled worker cannot restore deleted evidence')
    assert db.execute('SELECT id FROM pg_accounts WHERE id=%s',(other,)).fetchone()
    checks.append('Another account remains present')
finally:
    db.rollback()
    db.close()
print(json.dumps({'environment':'live Neon, rollback-only disposable fixture','committed':False,'passed':len(checks),'checks':checks},indent=2))
