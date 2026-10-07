"""Real PostgreSQL race, deletion, membership and fail-closed integration tests."""
import json
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import psycopg
import pytest


@pytest.fixture
def database():
    url = os.getenv('TEST_DATABASE_URL')
    if not url:
        pytest.skip('TEST_DATABASE_URL required; CI provides an isolated PostgreSQL service')
    schema = 'guardrails_' + uuid.uuid4().hex
    with psycopg.connect(url, autocommit=True) as root:
        root.execute(f'CREATE SCHEMA {schema}')
    def connect():
        return psycopg.connect(url, autocommit=True, options=f'-c search_path={schema},public -c statement_timeout=10000')
    try:
        with connect() as db:
            for migration in ['001_jobs.sql', '002_product.sql', '003_guardrails.sql']:
                db.execute(Path('db', migration).read_text())
            for number in range(1, 41):
                db.execute('INSERT INTO pg_accounts(id,login) VALUES(%s,%s)', (number, f'user-{number}'))
                db.execute("INSERT INTO pg_installations(id,account_login,account_type) VALUES(%s,%s,'User')", (number, f'user-{number}'))
                db.execute('INSERT INTO pg_repositories(id,installation_id,full_name,daily_limit) VALUES(%s,%s,%s,5)', (number, number, f'user-{number}/repo'))
                db.execute('INSERT INTO pg_repository_members(account_id,repo_id,can_push) VALUES(%s,%s,true)', (number, number))
        yield connect
    finally:
        with psycopg.connect(url, autocommit=True) as root:
            root.execute(f'DROP SCHEMA {schema} CASCADE')


def enqueue(db, account=1, repo=1, key='request-00000001'):
    return db.execute('SELECT id FROM pg_enqueue(%s,%s,%s,%s::jsonb)', (account, repo, key, json.dumps({'repo': f'user-{repo}/repo', 'mode': 'builder'}))).fetchone()[0]


def test_global_cap_is_atomic_under_parallel_enqueues(database):
    with database() as db:
        db.execute('UPDATE pg_guardrail_controls SET daily_jobs=4')
    def attempt(number):
        with database() as db:
            try:
                enqueue(db, number, number)
                return True
            except psycopg.Error as error:
                assert 'PG_RATE_LIMIT' in str(error)
                return False
    with ThreadPoolExecutor(max_workers=8) as pool:
        assert sum(pool.map(attempt, range(1, 9))) == 4
    with database() as db:
        assert db.execute("SELECT count(*),sum(model_tokens) FROM pg_usage_events WHERE kind='job'").fetchone() == (4, 48000)


def test_account_deletion_does_not_refund_global_or_account_usage(database):
    with database() as db:
        db.execute('UPDATE pg_guardrail_controls SET daily_jobs=1')
        job = enqueue(db)
        db.execute("UPDATE patchgoblin_jobs SET status='verified' WHERE id=%s", (job,))
        db.execute('SELECT pg_delete_account(1)')
        assert db.execute('SELECT count(*) FROM patchgoblin_jobs').fetchone()[0] == 0
        assert db.execute('SELECT count(*) FROM pg_usage_events').fetchone()[0] == 1
        db.execute("INSERT INTO pg_accounts(id,login) VALUES(1,'user-1')")
        db.execute('INSERT INTO pg_repository_members(account_id,repo_id,can_push) VALUES(1,1,true)')
        with pytest.raises(psycopg.Error, match='PG_RATE_LIMIT'):
            enqueue(db, key='request-00000002')
        with pytest.raises(psycopg.Error, match='PG_RATE_LIMIT'):
            enqueue(db, 2, 2)


def test_repository_cap_is_atomic_and_survives_deletion(database):
    with database() as db:
        db.execute('UPDATE pg_repositories SET daily_limit=1 WHERE id=1')
        job = enqueue(db)
        db.execute("UPDATE patchgoblin_jobs SET status='verified' WHERE id=%s", (job,))
        db.execute('SELECT pg_delete_account(1)')
        db.execute('INSERT INTO pg_repository_members(account_id,repo_id,can_push) VALUES(2,1,true)')
        with pytest.raises(psycopg.Error, match='PG_RATE_LIMIT'):
            enqueue(db, 2, 1)


def test_membership_and_missing_controls_deny_enqueue(database):
    with database() as db:
        with pytest.raises(psycopg.Error, match='PG_REPO_DISABLED'):
            enqueue(db, 2, 1)
        db.execute('DELETE FROM pg_guardrail_controls')
        assert db.execute("SELECT pg_feature_allowed('jobs')").fetchone()[0] is False
        with pytest.raises(psycopg.Error, match='PG_FEATURE_PAUSED'):
            enqueue(db)
        with pytest.raises(psycopg.Error, match='PG_PROTECTION_UNAVAILABLE'):
            db.execute("SELECT pg_rate_limit(%s,'login',2,60)", ('a' * 64,))


def test_token_reservation_and_monthly_cap_are_hard_limits(database):
    with database() as db:
        db.execute('UPDATE pg_guardrail_controls SET daily_model_tokens=12000')
        enqueue(db)
        with pytest.raises(psycopg.Error, match='PG_RATE_LIMIT'):
            enqueue(db, 2, 2)
        db.execute("UPDATE pg_usage_events SET created_at=now()-interval '2 days'")
        db.execute('UPDATE pg_guardrail_controls SET monthly_jobs=1')
        with pytest.raises(psycopg.Error, match='PG_RATE_LIMIT'):
            enqueue(db, 2, 2)


def test_idempotency_consumes_one_reservation(database):
    with database() as db:
        job = enqueue(db)
        assert enqueue(db) == job
        assert db.execute('SELECT count(*) FROM pg_usage_events').fetchone()[0] == 1


def test_parallel_rate_limits_allow_exactly_the_limit(database):
    def attempt(_):
        with database() as db:
            return db.execute("SELECT pg_rate_limit(%s,'login',2,600)", ('a' * 64,)).fetchone()[0]
    with ThreadPoolExecutor(max_workers=8) as pool:
        assert sum(pool.map(attempt, range(8))) == 2


def test_retry_cap_and_stop_control_cannot_be_bypassed(database):
    with database() as db:
        job = enqueue(db)
        for _ in range(3):
            db.execute("UPDATE patchgoblin_jobs SET status='verified' WHERE id=%s", (job,))
            db.execute('SELECT pg_retry_submission(1,%s)', (job,))
        db.execute("UPDATE patchgoblin_jobs SET status='verified' WHERE id=%s", (job,))
        with pytest.raises(psycopg.Error, match='PG_RATE_LIMIT'):
            db.execute('SELECT pg_retry_submission(1,%s)', (job,))
        db.execute('UPDATE pg_guardrail_controls SET submission=false')
        with pytest.raises(psycopg.Error, match='PG_FEATURE_PAUSED'):
            db.execute('SELECT pg_retry_submission(1,%s)', (job,))
        db.execute('UPDATE pg_guardrail_controls SET jobs=false')
        assert db.execute('SELECT * FROM patchgoblin_claim(%s::uuid)', (str(uuid.uuid4()),)).fetchall() == []


def test_retention_preserves_current_budgets_and_expires_stale_pending_deliveries(database):
    with database() as db:
        enqueue(db)
        db.execute("INSERT INTO pg_deliveries(id,event,payload,received_at) VALUES('stale','push','{}',now()-interval '8 days')")
        db.execute('SELECT pg_retention()')
        assert db.execute('SELECT count(*) FROM pg_usage_events').fetchone()[0] == 1
        assert db.execute('SELECT count(*) FROM pg_deliveries').fetchone()[0] == 0


def test_migration_rerun_does_not_duplicate_budget(database):
    with database() as db:
        enqueue(db)
        db.execute(Path('db/003_guardrails.sql').read_text())
        assert db.execute('SELECT count(*) FROM pg_usage_events').fetchone()[0] == 1


def test_paused_webhooks_still_accept_revocation(database):
    with database() as db:
        db.execute('UPDATE pg_guardrail_controls SET webhooks=false')
        with pytest.raises(psycopg.Error, match='PG_FEATURE_PAUSED'):
            db.execute("SELECT pg_accept_delivery('normal','push',1,1,'{}')")
        with pytest.raises(psycopg.Error, match='PG_FEATURE_PAUSED'):
            db.execute("SELECT pg_accept_delivery('missing-action','installation',1,1,'{}')")
        assert db.execute("SELECT pg_accept_delivery('revoke','installation',1,1,'{\"action\":\"deleted\"}')").fetchone()[0] is True


def test_budget_alerts_trigger_at_eighty_percent_and_deduplicate(database):
    with database() as db:
        db.execute('UPDATE pg_guardrail_controls SET daily_jobs=5')
        for number in range(1, 5):
            enqueue(db, number, number)
        assert ('daily_jobs', 4, 5) in db.execute('SELECT * FROM pg_budget_alerts()').fetchall()
        assert db.execute('SELECT * FROM pg_budget_alerts()').fetchall() == []


def test_nonowner_database_role_cannot_read_accounts_despite_select_grant(database):
    role = 'guardrail_reader_' + uuid.uuid4().hex
    with database() as db:
        schema = db.execute('SELECT current_schema()').fetchone()[0]
        try:
            db.execute(f'CREATE ROLE {role}')
            db.execute(f'GRANT USAGE ON SCHEMA {schema} TO {role}')
            db.execute(f'GRANT SELECT ON pg_accounts TO {role}')
            db.execute(f'SET ROLE {role}')
            assert db.execute('SELECT id FROM pg_accounts').fetchall() == []
        finally:
            db.execute('RESET ROLE')
            db.execute(f'DROP OWNED BY {role}')
            db.execute(f'DROP ROLE {role}')
