-- Additive guardrails. Run after 001_jobs.sql and 002_product.sql, in one transaction.
CREATE TABLE IF NOT EXISTS pg_guardrail_controls (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 jobs boolean NOT NULL DEFAULT true, webhooks boolean NOT NULL DEFAULT true,
 inference boolean NOT NULL DEFAULT true, sandbox boolean NOT NULL DEFAULT true,
 submission boolean NOT NULL DEFAULT true,
 daily_jobs integer NOT NULL DEFAULT 30 CHECK(daily_jobs BETWEEN 1 AND 30),
 monthly_jobs integer NOT NULL DEFAULT 900 CHECK(monthly_jobs BETWEEN 1 AND 900),
 daily_model_tokens bigint NOT NULL DEFAULT 360000 CHECK(daily_model_tokens BETWEEN 12000 AND 360000),
 monthly_model_tokens bigint NOT NULL DEFAULT 10800000 CHECK(monthly_model_tokens BETWEEN 12000 AND 10800000),
 accounting_salt text NOT NULL DEFAULT gen_random_uuid()::text
);
INSERT INTO pg_guardrail_controls(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS pg_usage_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 subject text NOT NULL, repository_id bigint, job_id bigint,
 kind text NOT NULL CHECK(kind IN ('job','submission')),
 model_tokens integer NOT NULL DEFAULT 0 CHECK(model_tokens BETWEEN 0 AND 12000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pg_usage_time ON pg_usage_events(created_at);
CREATE INDEX IF NOT EXISTS pg_usage_subject ON pg_usage_events(subject,created_at);
CREATE INDEX IF NOT EXISTS pg_usage_repo ON pg_usage_events(repository_id,created_at);
ALTER TABLE patchgoblin_jobs ADD COLUMN IF NOT EXISTS submission_attempts integer NOT NULL DEFAULT 0;
-- No account/job foreign keys: deletion must not refund a consumed service budget.
CREATE TABLE IF NOT EXISTS pg_request_buckets (
 subject text NOT NULL, scope text NOT NULL, window_at timestamptz NOT NULL,
 used integer NOT NULL, expires_at timestamptz NOT NULL,
 PRIMARY KEY(subject,scope,window_at)
);
CREATE TABLE IF NOT EXISTS pg_audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, subject text NOT NULL,
 action text NOT NULL CHECK(action IN ('enqueue','settings','delete','cancel','retry_submission','submit')),
 resource_id bigint, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pg_budget_notifications (
 code text NOT NULL, window_at timestamptz NOT NULL, used bigint NOT NULL, ceiling bigint NOT NULL,
 PRIMARY KEY(code,window_at)
);
-- Non-owner roles get no access by default. Application uses trusted server credentials.
ALTER TABLE pg_guardrail_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE pg_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pg_request_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pg_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pg_budget_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pg_guardrail_controls,pg_usage_events,pg_request_buckets,pg_audit_events FROM PUBLIC;
REVOKE ALL ON pg_budget_notifications FROM PUBLIC;
ALTER TABLE pg_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pg_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pg_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE pg_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pg_repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE pg_repository_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE pg_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE patchgoblin_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pg_accounts,pg_sessions,pg_oauth_states,pg_installations,pg_repositories,pg_repository_members,pg_deliveries,patchgoblin_jobs FROM PUBLIC;

CREATE OR REPLACE FUNCTION pg_feature_allowed(p_feature text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT COALESCE((SELECT CASE p_feature WHEN 'jobs' THEN jobs WHEN 'webhooks' THEN webhooks
 WHEN 'inference' THEN jobs AND inference WHEN 'sandbox' THEN jobs AND sandbox
 WHEN 'submission' THEN jobs AND submission ELSE false END FROM pg_guardrail_controls WHERE singleton),false)
$$;
CREATE OR REPLACE FUNCTION pg_subject(p_account bigint) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT md5(accounting_salt||':'||p_account::text) FROM pg_guardrail_controls WHERE singleton
$$;
CREATE OR REPLACE FUNCTION pg_audit(p_account bigint,p_action text,p_resource bigint DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF pg_subject(p_account) IS NULL THEN RAISE EXCEPTION 'PG_PROTECTION_UNAVAILABLE'; END IF;
 INSERT INTO pg_audit_events(subject,action,resource_id) VALUES(pg_subject(p_account),p_action,p_resource);
END $$;
CREATE OR REPLACE FUNCTION pg_rate_limit(p_subject text,p_scope text,p_limit integer,p_seconds integer)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v_used integer; v_window timestamptz;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_guardrail_controls WHERE singleton) THEN RAISE EXCEPTION 'PG_PROTECTION_UNAVAILABLE'; END IF;
 IF length(p_subject)<>64 OR length(p_scope)>64 OR p_limit<1 OR p_limit>10000 OR p_seconds<1 OR p_seconds>3600 THEN RAISE EXCEPTION 'Invalid rate bucket'; END IF;
 v_window=to_timestamp(floor(extract(epoch FROM now())/p_seconds)*p_seconds);
 INSERT INTO pg_request_buckets(subject,scope,window_at,used,expires_at)
 VALUES(p_subject,p_scope,v_window,1,v_window+make_interval(secs=>p_seconds))
 ON CONFLICT(subject,scope,window_at) DO UPDATE SET used=LEAST(pg_request_buckets.used+1,p_limit+1)
 RETURNING used INTO v_used;
 RETURN v_used<=p_limit;
END $$;
CREATE OR REPLACE FUNCTION pg_budget_alerts() RETURNS TABLE(code text,used bigint,ceiling bigint) LANGUAGE sql AS $$
 WITH c AS (SELECT * FROM pg_guardrail_controls WHERE singleton),
 usage AS (SELECT count(*) FILTER(WHERE kind='job' AND created_at>now()-interval '1 day') AS day_jobs,
 count(*) FILTER(WHERE kind='job') AS month_jobs,
 COALESCE(sum(model_tokens) FILTER(WHERE created_at>now()-interval '1 day'),0) AS day_tokens,
 COALESCE(sum(model_tokens),0) AS month_tokens FROM pg_usage_events WHERE created_at>now()-interval '31 days'),
 candidates AS (SELECT v.code,v.used,v.ceiling FROM c CROSS JOIN usage CROSS JOIN LATERAL
 (VALUES ('daily_jobs',day_jobs,c.daily_jobs::bigint),('monthly_jobs',month_jobs,c.monthly_jobs::bigint),
 ('daily_tokens',day_tokens,c.daily_model_tokens),('monthly_tokens',month_tokens,c.monthly_model_tokens)) v(code,used,ceiling))
 INSERT INTO pg_budget_notifications(code,window_at,used,ceiling)
 SELECT code,date_trunc('day',now()),used,ceiling FROM candidates WHERE used>=ceiling*.8
 ON CONFLICT DO NOTHING RETURNING code,used,ceiling
$$;

-- Seed reservations once, so installing guardrails never resets recent consumption.
INSERT INTO pg_usage_events(subject,repository_id,job_id,kind,model_tokens,created_at)
SELECT pg_subject(j.account_id),j.repository_id,j.id,'job',12000,j.created_at
FROM patchgoblin_jobs j WHERE j.account_id IS NOT NULL AND j.created_at>now()-interval '31 days'
AND NOT EXISTS(SELECT 1 FROM pg_usage_events u WHERE u.job_id=j.id AND u.kind='job');

CREATE OR REPLACE FUNCTION pg_enqueue(p_account bigint,p_repo bigint,p_key text,p_request jsonb,p_delay integer DEFAULT 0)
RETURNS SETOF patchgoblin_jobs LANGUAGE plpgsql AS $$
DECLARE r pg_repositories; c pg_guardrail_controls; v_subject text; v_job patchgoblin_jobs;
BEGIN
 PERFORM pg_advisory_xact_lock(762437);
 SELECT * INTO c FROM pg_guardrail_controls WHERE singleton;
 IF c IS NULL OR NOT c.jobs THEN RAISE EXCEPTION 'PG_FEATURE_PAUSED'; END IF;
 PERFORM patchgoblin_expire();
 SELECT r0.* INTO r FROM pg_repositories r0 JOIN pg_installations i ON i.id=r0.installation_id
 JOIN pg_repository_members m ON m.repo_id=r0.id AND m.account_id=p_account AND m.can_push
 JOIN pg_accounts a ON a.id=p_account
 WHERE r0.id=p_repo AND r0.active AND i.active AND r0.enabled AND NOT r0.paused;
 IF r IS NULL THEN RAISE EXCEPTION 'PG_REPO_DISABLED'; END IF;
 IF length(p_key)<16 OR length(p_key)>100 OR p_key!~'^[A-Za-z0-9_-]+$'
 OR jsonb_typeof(p_request)<>'object' OR p_request->>'repo' IS DISTINCT FROM r.full_name
 OR COALESCE(p_request->>'mode','') NOT IN ('repair','builder','maintenance') THEN RAISE EXCEPTION 'Invalid job request'; END IF;
 IF EXISTS(SELECT 1 FROM patchgoblin_jobs WHERE owner_key='github:'||p_account AND idempotency_key=p_key) THEN
  RETURN QUERY SELECT * FROM patchgoblin_jobs WHERE owner_key='github:'||p_account AND idempotency_key=p_key; RETURN;
 END IF;
 v_subject=pg_subject(p_account);
 IF (SELECT count(*) FROM pg_usage_events WHERE subject=v_subject AND kind='job' AND created_at>now()-interval '1 hour')>=8
 OR (SELECT count(*) FROM pg_usage_events WHERE repository_id=p_repo AND kind='job' AND created_at>now()-interval '1 day')>=r.daily_limit
 OR (SELECT count(*) FROM pg_usage_events WHERE kind='job' AND created_at>now()-interval '1 day')>=c.daily_jobs
 OR (SELECT count(*) FROM pg_usage_events WHERE kind='job' AND created_at>now()-interval '31 days')>=c.monthly_jobs
 OR (SELECT COALESCE(sum(model_tokens),0) FROM pg_usage_events WHERE created_at>now()-interval '1 day')+12000>c.daily_model_tokens
 OR (SELECT COALESCE(sum(model_tokens),0) FROM pg_usage_events WHERE created_at>now()-interval '31 days')+12000>c.monthly_model_tokens
 THEN RAISE EXCEPTION 'PG_RATE_LIMIT'; END IF;
 IF EXISTS(SELECT 1 FROM patchgoblin_jobs WHERE account_id=p_account AND cancelled_at IS NULL AND status NOT IN ('verified','submitted','unsupported','failed','cancelled')) THEN RAISE EXCEPTION 'PG_ACTIVE_JOB'; END IF;
 INSERT INTO patchgoblin_jobs(owner_key,idempotency_key,request,account_id,repository_id,installation_id,not_before)
 VALUES('github:'||p_account,p_key,p_request||jsonb_build_object('owner','github:'||p_account,'installation_id',r.installation_id,'repository_id',r.id),p_account,p_repo,r.installation_id,now()+make_interval(secs=>GREATEST(0,LEAST(p_delay,60)))) RETURNING * INTO v_job;
 INSERT INTO pg_usage_events(subject,repository_id,job_id,kind,model_tokens) VALUES(v_subject,p_repo,v_job.id,'job',12000);
 PERFORM pg_audit(p_account,'enqueue',v_job.id);
 RETURN NEXT v_job;
END $$;

CREATE OR REPLACE FUNCTION pg_retry_submission(p_account bigint,p_job bigint) RETURNS void LANGUAGE plpgsql AS $$
DECLARE j patchgoblin_jobs;
BEGIN
 PERFORM pg_advisory_xact_lock(762437);
 IF NOT pg_feature_allowed('submission') THEN RAISE EXCEPTION 'PG_FEATURE_PAUSED'; END IF;
 SELECT * INTO j FROM patchgoblin_jobs WHERE id=p_job AND account_id=p_account FOR UPDATE;
 IF j IS NULL OR j.status<>'verified' OR j.cancelled_at IS NOT NULL OR j.lease_token IS NOT NULL
 OR NOT EXISTS(SELECT 1 FROM pg_repository_members WHERE account_id=p_account AND repo_id=j.repository_id AND can_push)
 THEN RAISE EXCEPTION 'PG_REPO_DISABLED'; END IF;
 IF j.submission_attempts>=3
 OR (SELECT count(*) FROM pg_usage_events WHERE kind='submission' AND created_at>now()-interval '1 day')>=90 THEN RAISE EXCEPTION 'PG_RATE_LIMIT'; END IF;
 INSERT INTO pg_usage_events(subject,repository_id,job_id,kind) VALUES(pg_subject(p_account),j.repository_id,j.id,'submission');
 UPDATE patchgoblin_jobs SET submission_attempts=submission_attempts+1,request=request||'{"retry_submission":true}',status='queued',state=state||'{"status":"verified"}' WHERE id=p_job;
 PERFORM pg_audit(p_account,'retry_submission',p_job);
END $$;

CREATE OR REPLACE FUNCTION pg_accept_delivery(p_id text,p_event text,p_installation bigint,p_repo bigint,p_payload jsonb)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v_revocation boolean; v_count integer;
BEGIN
 PERFORM pg_advisory_xact_lock(762439);
 v_revocation=COALESCE(p_event='github_app_authorization' OR p_event='installation' AND p_payload->>'action' IN ('deleted','suspend') OR p_event='installation_repositories' AND p_payload->>'action'='removed',false);
 IF EXISTS(SELECT 1 FROM pg_deliveries WHERE id=p_id) THEN RETURN false; END IF;
 IF NOT v_revocation AND NOT pg_feature_allowed('webhooks') THEN RAISE EXCEPTION 'PG_FEATURE_PAUSED'; END IF;
 IF octet_length(p_payload::text)>30000 THEN RAISE EXCEPTION 'Delivery too large'; END IF;
 SELECT count(*) INTO v_count FROM pg_deliveries WHERE status IN ('pending','processing')
 AND (NOT v_revocation OR event IN ('installation','installation_repositories','github_app_authorization'));
 IF v_count>=(CASE WHEN v_revocation THEN 100 ELSE 1000 END)
 OR NOT v_revocation AND (SELECT count(*) FROM pg_deliveries WHERE received_at>now()-interval '1 day')>=2000
 OR NOT v_revocation AND (SELECT count(*) FROM pg_deliveries WHERE installation_id=p_installation AND received_at>now()-interval '1 hour')>=300
 THEN RAISE EXCEPTION 'PG_RATE_LIMIT'; END IF;
 INSERT INTO pg_deliveries(id,event,installation_id,repository_id,payload) VALUES(p_id,p_event,p_installation,p_repo,p_payload);
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION patchgoblin_claim(p_lease uuid)
RETURNS SETOF patchgoblin_jobs LANGUAGE plpgsql AS $$
DECLARE v_id bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(762438); PERFORM patchgoblin_expire();
 IF NOT pg_feature_allowed('jobs') OR EXISTS(SELECT 1 FROM patchgoblin_jobs WHERE lease_token IS NOT NULL) THEN RETURN; END IF;
 SELECT id INTO v_id FROM patchgoblin_jobs WHERE status='queued' AND cancelled_at IS NULL AND not_before<=now()
 ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF v_id IS NULL THEN RETURN; END IF;
 RETURN QUERY UPDATE patchgoblin_jobs SET lease_token=p_lease,lease_expires_at=now()+interval '15 minutes',updated_at=now() WHERE id=v_id RETURNING *;
END $$;

CREATE OR REPLACE FUNCTION pg_retention() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 DELETE FROM pg_sessions WHERE expires_at<now(); DELETE FROM pg_oauth_states WHERE expires_at<now();
 DELETE FROM pg_request_buckets WHERE expires_at<now()-interval '1 hour';
 DELETE FROM pg_usage_events WHERE created_at<now()-interval '32 days';
 DELETE FROM pg_audit_events WHERE created_at<now()-interval '90 days';
 DELETE FROM pg_budget_notifications WHERE window_at<now()-interval '32 days';
 DELETE FROM pg_deliveries WHERE received_at<now()-interval '7 days' AND (status<>'processing' OR lease_expires_at<now());
 DELETE FROM patchgoblin_jobs j WHERE j.sandbox_id IS NULL AND j.lease_token IS NULL
 AND (j.owner_key LIKE 'deleted:%' OR j.created_at<now()-make_interval(days=>COALESCE((SELECT r.retention_days FROM pg_repositories r WHERE r.id=j.repository_id),30)));
 DELETE FROM pg_repositories r WHERE NOT r.active AND r.controller_id IS NULL AND NOT EXISTS(SELECT 1 FROM pg_repository_members m WHERE m.repo_id=r.id) AND NOT EXISTS(SELECT 1 FROM patchgoblin_jobs j WHERE j.repository_id=r.id);
 DELETE FROM pg_installations i WHERE NOT i.active AND NOT EXISTS(SELECT 1 FROM pg_repositories r WHERE r.installation_id=i.id);
END $$;
CREATE OR REPLACE FUNCTION pg_delete_account(p_account bigint) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_audit(p_account,'delete',NULL);
 UPDATE pg_repositories SET auto_repair=false,auto_builder=false,auto_maintenance=false,controller_id=NULL WHERE controller_id=p_account;
 UPDATE patchgoblin_jobs SET cancelled_at=now(),status='cancelled',request='{}',state='{}',owner_key='deleted:'||id WHERE account_id=p_account;
 DELETE FROM pg_accounts WHERE id=p_account;
 DELETE FROM patchgoblin_jobs WHERE owner_key LIKE 'deleted:%' AND sandbox_id IS NULL AND lease_token IS NULL;
END $$;
-- The retired owner/PAT adapter must not bypass reservations and authorization.
CREATE OR REPLACE FUNCTION patchgoblin_enqueue(p_owner text,p_key text,p_request jsonb)
RETURNS SETOF patchgoblin_jobs LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'PG_LEGACY_DISABLED';
END $$;
REVOKE ALL ON FUNCTION pg_feature_allowed(text),pg_subject(bigint),pg_audit(bigint,text,bigint),pg_rate_limit(text,text,integer,integer),pg_enqueue(bigint,bigint,text,jsonb,integer),pg_retry_submission(bigint,bigint),pg_accept_delivery(text,text,bigint,bigint,jsonb),patchgoblin_claim(uuid),pg_retention(),pg_budget_alerts(),pg_delete_account(bigint),patchgoblin_enqueue(text,text,jsonb) FROM PUBLIC;
