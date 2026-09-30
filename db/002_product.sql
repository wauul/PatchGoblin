CREATE TABLE IF NOT EXISTS pg_accounts (
 id bigint PRIMARY KEY, login text NOT NULL, avatar_url text NOT NULL DEFAULT '',
 credentials text NOT NULL, token_expires_at timestamptz, refresh_expires_at timestamptz,
 onboarding_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pg_accounts ADD COLUMN IF NOT EXISTS refresh_lease_until timestamptz;
-- Sign-in uses a separate identity-only OAuth App. These nullable credentials
-- belong exclusively to the explicitly authorized repository GitHub App.
ALTER TABLE pg_accounts ALTER COLUMN credentials DROP NOT NULL;
CREATE TABLE IF NOT EXISTS pg_sessions (
 token_hash text PRIMARY KEY, account_id bigint NOT NULL REFERENCES pg_accounts ON DELETE CASCADE,
 csrf text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pg_oauth_states (
 state_hash text PRIMARY KEY, browser_hash text NOT NULL, verifier text NOT NULL, return_to text NOT NULL,
 expires_at timestamptz NOT NULL
);
ALTER TABLE pg_oauth_states ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'legacy';
ALTER TABLE pg_oauth_states ADD COLUMN IF NOT EXISTS account_id bigint;
CREATE TABLE IF NOT EXISTS pg_installations (
 id bigint PRIMARY KEY, account_login text NOT NULL, account_type text NOT NULL,
 active boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pg_repositories (
 id bigint PRIMARY KEY, installation_id bigint NOT NULL REFERENCES pg_installations ON DELETE CASCADE,
 full_name text UNIQUE NOT NULL, default_branch text NOT NULL DEFAULT 'main', private boolean NOT NULL DEFAULT false,
 active boolean NOT NULL DEFAULT true, enabled boolean NOT NULL DEFAULT true, paused boolean NOT NULL DEFAULT false,
 auto_repair boolean NOT NULL DEFAULT false, auto_builder boolean NOT NULL DEFAULT false, auto_maintenance boolean NOT NULL DEFAULT false,
 controller_id bigint REFERENCES pg_accounts ON DELETE SET NULL,
 daily_limit integer NOT NULL DEFAULT 3 CHECK(daily_limit BETWEEN 1 AND 5),
 retention_days integer NOT NULL DEFAULT 30 CHECK(retention_days IN (7,30,90)),
 coverage jsonb NOT NULL DEFAULT '{}', last_event_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pg_repository_members (
 account_id bigint NOT NULL REFERENCES pg_accounts ON DELETE CASCADE,
 repo_id bigint NOT NULL REFERENCES pg_repositories ON DELETE CASCADE,
 can_push boolean NOT NULL DEFAULT false, can_admin boolean NOT NULL DEFAULT false,
 PRIMARY KEY(account_id,repo_id)
);
CREATE TABLE IF NOT EXISTS pg_deliveries (
 id text PRIMARY KEY, event text NOT NULL, installation_id bigint, repository_id bigint,
 payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(), lease_expires_at timestamptz,
 received_at timestamptz NOT NULL DEFAULT now(), error text
);
ALTER TABLE patchgoblin_jobs ADD COLUMN IF NOT EXISTS account_id bigint REFERENCES pg_accounts ON DELETE SET NULL;
ALTER TABLE patchgoblin_jobs ADD COLUMN IF NOT EXISTS repository_id bigint REFERENCES pg_repositories ON DELETE SET NULL;
ALTER TABLE patchgoblin_jobs ADD COLUMN IF NOT EXISTS installation_id bigint;
ALTER TABLE patchgoblin_jobs ADD COLUMN IF NOT EXISTS not_before timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS pg_delivery_queue ON pg_deliveries(status,available_at);
CREATE INDEX IF NOT EXISTS pg_job_repo ON patchgoblin_jobs(repository_id,created_at DESC);

CREATE OR REPLACE FUNCTION pg_enqueue(p_account bigint,p_repo bigint,p_key text,p_request jsonb,p_delay integer DEFAULT 0)
RETURNS SETOF patchgoblin_jobs LANGUAGE plpgsql AS $$
DECLARE r pg_repositories; v_owner text;
BEGIN
 PERFORM pg_advisory_xact_lock(762437);
 PERFORM patchgoblin_expire();
 SELECT * INTO r FROM pg_repositories WHERE id=p_repo AND active AND enabled AND NOT paused;
 IF r IS NULL OR NOT EXISTS(SELECT 1 FROM pg_accounts WHERE id=p_account) THEN RAISE EXCEPTION 'PG_REPO_DISABLED'; END IF;
 v_owner='github:'||p_account;
 IF EXISTS(SELECT 1 FROM patchgoblin_jobs WHERE owner_key=v_owner AND idempotency_key=p_key) THEN
  RETURN QUERY SELECT * FROM patchgoblin_jobs WHERE owner_key=v_owner AND idempotency_key=p_key; RETURN;
 END IF;
 IF (SELECT count(*) FROM patchgoblin_jobs WHERE account_id=p_account AND created_at>now()-interval '1 hour')>=8
 OR (SELECT count(*) FROM patchgoblin_jobs WHERE repository_id=p_repo AND created_at>now()-interval '1 day')>=r.daily_limit
 OR (SELECT count(*) FROM patchgoblin_jobs WHERE created_at>now()-interval '1 day')>=30 THEN RAISE EXCEPTION 'PG_RATE_LIMIT'; END IF;
 IF EXISTS(SELECT 1 FROM patchgoblin_jobs WHERE account_id=p_account AND cancelled_at IS NULL AND status NOT IN ('verified','submitted','unsupported','failed','cancelled')) THEN RAISE EXCEPTION 'PG_ACTIVE_JOB'; END IF;
 RETURN QUERY INSERT INTO patchgoblin_jobs(owner_key,idempotency_key,request,account_id,repository_id,installation_id,not_before)
 VALUES(v_owner,p_key,p_request||jsonb_build_object('owner',v_owner,'installation_id',r.installation_id,'repository_id',r.id),p_account,p_repo,r.installation_id,now()+make_interval(secs=>LEAST(p_delay,60))) RETURNING *;
END $$;

CREATE OR REPLACE FUNCTION patchgoblin_claim(p_lease uuid)
RETURNS SETOF patchgoblin_jobs LANGUAGE plpgsql AS $$
DECLARE v_id bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(762438); PERFORM patchgoblin_expire();
 IF EXISTS (SELECT 1 FROM patchgoblin_jobs WHERE lease_token IS NOT NULL) THEN RETURN; END IF;
 SELECT id INTO v_id FROM patchgoblin_jobs WHERE status='queued' AND cancelled_at IS NULL AND not_before<=now() ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF v_id IS NULL THEN RETURN; END IF;
 RETURN QUERY UPDATE patchgoblin_jobs SET lease_token=p_lease,lease_expires_at=now()+interval '15 minutes',updated_at=now() WHERE id=v_id RETURNING *;
END $$;

CREATE OR REPLACE FUNCTION pg_delete_account(p_account bigint) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 UPDATE pg_repositories SET auto_repair=false,auto_builder=false,auto_maintenance=false,controller_id=NULL WHERE controller_id=p_account;
 UPDATE patchgoblin_jobs SET cancelled_at=now(),status='cancelled',request='{}',state='{}',owner_key='deleted:'||id WHERE account_id=p_account;
 DELETE FROM pg_accounts WHERE id=p_account;
 DELETE FROM patchgoblin_jobs WHERE owner_key LIKE 'deleted:%' AND sandbox_id IS NULL AND lease_token IS NULL;
END $$;

CREATE OR REPLACE FUNCTION pg_retention() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 DELETE FROM pg_sessions WHERE expires_at<now(); DELETE FROM pg_oauth_states WHERE expires_at<now();
 DELETE FROM pg_deliveries WHERE received_at<now()-interval '7 days' AND status IN ('done','failed');
 DELETE FROM patchgoblin_jobs j USING pg_repositories r WHERE j.repository_id=r.id AND j.created_at<now()-make_interval(days=>r.retention_days) AND j.sandbox_id IS NULL AND j.lease_token IS NULL;
 DELETE FROM patchgoblin_jobs WHERE owner_key LIKE 'deleted:%' AND sandbox_id IS NULL AND lease_token IS NULL;
 DELETE FROM pg_repositories r WHERE NOT r.active AND r.controller_id IS NULL AND NOT EXISTS(SELECT 1 FROM pg_repository_members m WHERE m.repo_id=r.id) AND NOT EXISTS(SELECT 1 FROM patchgoblin_jobs j WHERE j.repository_id=r.id);
 DELETE FROM pg_installations i WHERE NOT i.active AND NOT EXISTS(SELECT 1 FROM pg_repositories r WHERE r.installation_id=i.id);
END $$;
