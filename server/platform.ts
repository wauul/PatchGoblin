import {Product,ProductError,json,redirect,cookie,cookies,hash,random,encrypt,localReturn,repositoryName,validSignature,type ProductEnv,type Query} from './platform-core.js';
import {requestScope,captureFault,durableTrace,span,operationalLog,retentionCheckIn,responseStatus} from './telemetry.js';
import {route} from '../telemetry/privacy.js';
const terminal=new Set(['submitted','verified','unsupported','failed','cancelled']);
const limits={concurrency:1,steps:6,attempts:2,runtime_seconds:600,model_tokens:12000,account_hourly_jobs:8,repository_daily_jobs:3,service_daily_jobs:30};
const jobView=(r:any)=>{const {telemetry:_trace,...request}=r.request||{};return {...r.state,...request,id:Number(r.id),status:r.status,created_at:r.created_at,updated_at:r.updated_at};};
export async function handleProduct(req:Request,env:ProductEnv,fetcher:typeof fetch=fetch,query?:Query):Promise<Response>{
 return requestScope(req,async requestId=>{
  const response=await handleProductRequest(req,env,fetcher,query);
  response.headers.set('X-Request-ID',requestId);
  responseStatus(response.status);
  operationalLog('request',{route:route(req.url),status:response.status>=500?'error':'ok','http.status_code':response.status});
  return response;
 });
}
async function handleProductRequest(req:Request,env:ProductEnv,fetcher:typeof fetch,query?:Query):Promise<Response>{
 const url=new URL(req.url),path=url.pathname,product=new Product(env,fetcher,query),sql=product.sql;
 const origin=env.APP_URL||'https://patchgoblin.vercel.app';
 const readBody=async()=>{if(req.headers.get('origin')!==origin||req.headers.get('sec-fetch-site')==='cross-site')throw new ProductError(403,'Cross-origin requests are forbidden.');const raw=await req.text();if(raw.length>10000)throw new ProductError(413,'Request is too large.');try{return JSON.parse(raw)}catch{throw new ProductError(400,'Request must contain JSON.');}};
 try{
  if(path==='/api/public')return json({app_slug:env.GITHUB_APP_SLUG||null,installation_url:env.GITHUB_APP_SLUG?'https://github.com/apps/'+env.GITHUB_APP_SLUG+'/installations/new':null,source_url:'https://github.com/wauul/PatchGoblin',support_url:env.SUPPORT_URL||'https://github.com/wauul/PatchGoblin/issues',operator:env.OPERATOR_NAME||'Independent project operated by the GitHub account wauul',legal_contact:env.LEGAL_CONTACT||null,limits});
  if(path==='/api/github/webhook'&&req.method==='POST'){
   if(!env.GITHUB_WEBHOOK_SECRET)throw new ProductError(503,'Webhook integration is not configured.');
   const raw=await req.text();if(raw.length>2_000_000)throw new ProductError(413,'Webhook is too large.');
   if(!validSignature(raw,req.headers.get('x-hub-signature-256'),env.GITHUB_WEBHOOK_SECRET))throw new ProductError(401,'Invalid webhook signature.');
   const id=req.headers.get('x-github-delivery')||'',event=req.headers.get('x-github-event')||'';
   if(!/^[a-zA-Z0-9-]{16,100}$/.test(id))throw new ProductError(400,'Missing delivery identity.');
   if(!['installation','installation_repositories','workflow_run','push','pull_request','check_run','github_app_authorization','ping'].includes(event))return json({accepted:true,ignored:true},202);
   let data;try{data=JSON.parse(raw);}catch{throw new ProductError(400,'Webhook must contain JSON.');}
   // Retain only automation metadata; never persist full pushed source or CI logs here.
   const payload={action:data.action,installation:data.installation&&{id:data.installation.id,account:data.installation.account},repository:data.repository&&{id:data.repository.id,full_name:data.repository.full_name,default_branch:data.repository.default_branch},sender:data.sender&&{id:data.sender.id,login:data.sender.login},ref:data.ref,before:data.before,after:data.after,deleted:data.deleted,
    workflow_run:data.workflow_run&&{id:data.workflow_run.id,conclusion:data.workflow_run.conclusion,status:data.workflow_run.status,head_sha:data.workflow_run.head_sha,head_branch:data.workflow_run.head_branch,event:data.workflow_run.event},
    pull_request:data.pull_request&&{number:data.pull_request.number,head:{sha:data.pull_request.head.sha,ref:data.pull_request.head.ref,repo:{full_name:data.pull_request.head.repo?.full_name}},base:{ref:data.pull_request.base.ref},user:{login:data.pull_request.user.login}},
    check_run:data.check_run&&{id:data.check_run.id,head_sha:data.check_run.head_sha,external_id:data.check_run.external_id,app:{id:data.check_run.app?.id}},requested_action:data.requested_action};
   const inserted=await span('webhook',()=>sql('INSERT INTO pg_deliveries(id,event,installation_id,repository_id,payload) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(id) DO NOTHING RETURNING id',[id,event,data.installation?.id||null,data.repository?.id||null,JSON.stringify({...payload,telemetry:durableTrace()})]));
   // Repeated delivery also wakes pending durable work after an interrupted cold start.
   try{const response=await span('wake',()=>fetcher(env.WORKER_URL+'/wake',{method:'POST',headers:{Authorization:'Bearer '+env.WORKER_WAKE_TOKEN},signal:AbortSignal.timeout(2000)}));if(!response.ok)captureFault(new Error('Worker wake failed'),'wake');}catch(error){captureFault(error,'wake');}
   return json({accepted:true,duplicate:inserted.length===0},202);
  }
  if(path==='/api/retention'){
   if(!env.CRON_SECRET||req.headers.get('authorization')!=='Bearer '+env.CRON_SECRET)throw new ProductError(401,'Unauthorized');
   const checkIn=retentionCheckIn('in_progress');
   try{await span('retention',()=>sql('SELECT pg_retention()'));await product.wake();if(checkIn)retentionCheckIn('ok',checkIn);return json({ok:true});}
   catch(error){if(checkIn)retentionCheckIn('error',checkIn);throw error;}
  }
  if(path==='/api/auth/login'&&req.method==='GET'){
   if(!env.GITHUB_OAUTH_CLIENT_ID)throw new ProductError(503,'GitHub login is not configured.');
   const state=random(),browser=random(),verifier=random();
   await sql("INSERT INTO pg_oauth_states(state_hash,browser_hash,verifier,return_to,purpose,expires_at) VALUES($1,$2,$3,$4,'identity',now()+interval '10 minutes')",[hash(state),hash(browser),verifier,localReturn(url.searchParams.get('return_to'))]);
   const target=new URL('https://github.com/login/oauth/authorize');target.searchParams.set('client_id',env.GITHUB_OAUTH_CLIENT_ID);target.searchParams.set('scope','');target.searchParams.set('redirect_uri',origin+'/api/auth/callback');target.searchParams.set('state',state);target.searchParams.set('code_challenge',Buffer.from(hash(verifier),'hex').toString('base64url'));target.searchParams.set('code_challenge_method','S256');
   return redirect(target.toString(),cookie('__Host-pg-oauth',browser,600));
  }
  if(path==='/api/auth/callback'&&req.method==='GET'){
   const state=url.searchParams.get('state')||'',browser=cookies(req)['__Host-pg-oauth']||'';
   const row=(await sql('DELETE FROM pg_oauth_states WHERE state_hash=$1 AND browser_hash=$2 AND expires_at>now() RETURNING *',[hash(state),hash(browser)]))[0];
   if(!row||!['identity','installation'].includes(row.purpose)||!url.searchParams.get('code'))return redirect('/?auth_error='+encodeURIComponent('GitHub sign-in was declined or expired. Please try again.'),cookie('__Host-pg-oauth','',0));
   const current=row.purpose==='installation'?await product.session(req):null;
   if(row.purpose==='installation'&&(!current||String(current.id)!==String(row.account_id)))throw new ProductError(401,'Sign in again before connecting repository access.');
   const auth=await product.oauth({code:url.searchParams.get('code')!,redirect_uri:origin+'/api/auth/callback',code_verifier:row.verifier},row.purpose==='identity');
   const user=await product.github('/user',auth.access_token);
   if(row.purpose==='installation'){
    if(String(user.id)!==String(current.id))throw new ProductError(403,'Connect repository access using the same GitHub account you signed in with.');
    await sql('UPDATE pg_accounts SET credentials=$2,token_expires_at=$3,refresh_expires_at=$4,refresh_lease_until=NULL,updated_at=now() WHERE id=$1',[user.id,encrypt(auth,env),auth.expires_in?new Date(Date.now()+auth.expires_in*1000).toISOString():null,auth.refresh_token_expires_in?new Date(Date.now()+auth.refresh_token_expires_in*1000).toISOString():null]);
    await product.sync({...current,credentials:encrypt(auth,env),token_expires_at:auth.expires_in?new Date(Date.now()+auth.expires_in*1000).toISOString():null});
    return redirect(row.return_to,cookie('__Host-pg-oauth','',0));
   }
   // Identity-only OAuth tokens are used once to confirm /user and are never stored.
   // Existing repository credentials remain tied to their separate GitHub App grant.
   await sql('INSERT INTO pg_accounts(id,login,avatar_url) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET login=EXCLUDED.login,avatar_url=EXCLUDED.avatar_url,updated_at=now()',[user.id,user.login,user.avatar_url]);
   const session=random();await sql("INSERT INTO pg_sessions(token_hash,account_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval '7 days')",[hash(session),user.id,random()]);
   // Migrate only the original operator's historical owner-private jobs.
   if(user.login==='wauul'&&env.LEGACY_GITHUB_ACCOUNT_ID===String(user.id))await sql("UPDATE patchgoblin_jobs SET account_id=$1,owner_key=$2,request=request||jsonb_build_object('owner',$2::text) WHERE owner_key=$3",[user.id,'github:'+user.id,hash('private-owner|wauul/PatchGoblin').slice(0,24)]);
   const response=redirect(row.return_to);response.headers.append('Set-Cookie',cookie('__Host-pg-session',session,604800));response.headers.append('Set-Cookie',cookie('__Host-pg-oauth','',0));return response;
  }
  const account=await product.session(req);
  if(path==='/api/bootstrap'&&!account)return json({connected:false,account:null,repositories:[],limits});
  if(path==='/api/github/setup'&&!account)return redirect('/api/auth/login?return_to=/onboarding');
  if(!account)throw new ProductError(401,'Sign in with GitHub to continue.');
  if(req.method!=='GET'&&req.method!=='HEAD'){if(req.headers.get('x-csrf-token')!==account.csrf)throw new ProductError(403,'Session verification failed. Refresh the page and try again.');}
  if(path==='/api/bootstrap'){
   const repositories=await product.repositories(account.id),usage=(await sql("SELECT count(*) FILTER(WHERE created_at>now()-interval '1 day')::int AS daily,count(*) FILTER(WHERE created_at>now()-interval '1 hour')::int AS hourly,COALESCE(sum((state->'metrics'->>'model_tokens')::bigint),0)::bigint AS model_tokens FROM patchgoblin_jobs WHERE account_id=$1",[account.id]))[0];
   return json({connected:true,repository_authorized:!!account.credentials,login:account.login,account:{id:Number(account.id),login:account.login,avatar_url:account.avatar_url,onboarding_at:account.onboarding_at},csrf:account.csrf,repositories,usage,worker_submission:true,limits});
  }
  if(path==='/api/extension/status'){
   const name=repositoryName(url.searchParams.get('repo'));
   let auth;try{auth=await product.authorize(account,name);}catch(error){if(error instanceof ProductError&&[403,404].includes(error.status))return json({installed:false});throw error;}
   let workflowCount=0;
   try{const files=await product.github(`/repos/${name}/contents/.github/workflows?ref=${encodeURIComponent(auth.row.default_branch)}`,auth.token);workflowCount=Array.isArray(files)?files.filter((f:any)=>f.type==='file'&&/\.ya?ml$/.test(f.name)).length:0;}catch(error){if(!(error instanceof ProductError)||error.status!==404)throw error;}
   let run=null;if(url.searchParams.get('run')){const id=Number(url.searchParams.get('run'));if(!Number.isSafeInteger(id)||id<1)throw new ProductError(400,'Invalid run identifier.');run=await product.github(`/repos/${name}/actions/runs/${id}`,auth.token);}
   const jobs=await sql("SELECT id,status,request->>'mode' AS mode FROM patchgoblin_jobs WHERE account_id=$1 AND repository_id=$2 ORDER BY created_at DESC LIMIT 3",[account.id,auth.row.id]);
   return json({installed:true,enabled:auth.row.enabled,paused:auth.row.paused,can_push:!!auth.actual.permissions?.push,workflow_count:workflowCount,run_conclusion:run?.status==='completed'?run.conclusion:null,jobs});
  }
  if(path==='/api/auth/logout'&&req.method==='POST'){await readBody();await sql('DELETE FROM pg_sessions WHERE token_hash=$1',[account.token_hash]);return json({ok:true},200,{'Set-Cookie':cookie('__Host-pg-session','',0)});}
  if(path==='/api/github/connect'&&req.method==='GET'){
   if(!env.GITHUB_CLIENT_ID)throw new ProductError(503,'Repository authorization is not configured.');
   const state=random(),browser=random(),verifier=random();
   await sql("INSERT INTO pg_oauth_states(state_hash,browser_hash,verifier,return_to,purpose,account_id,expires_at) VALUES($1,$2,$3,'/onboarding','installation',$4,now()+interval '10 minutes')",[hash(state),hash(browser),verifier,account.id]);
   const target=new URL('https://github.com/login/oauth/authorize');target.searchParams.set('client_id',env.GITHUB_CLIENT_ID);target.searchParams.set('redirect_uri',origin+'/api/auth/callback');target.searchParams.set('state',state);target.searchParams.set('login',account.login);target.searchParams.set('code_challenge',Buffer.from(hash(verifier),'hex').toString('base64url'));target.searchParams.set('code_challenge_method','S256');
   return redirect(target.toString(),cookie('__Host-pg-oauth',browser,600));
  }
  if(path==='/api/github/setup'){if(!account.credentials)return redirect('/onboarding');await product.sync(account);return redirect('/onboarding');}
  if(path==='/api/github/sync'&&req.method==='POST'){await readBody();return json({repositories:await product.sync(account)});}
  if(path==='/api/account/onboarding'&&req.method==='POST'){await readBody();await sql('UPDATE pg_accounts SET onboarding_at=now() WHERE id=$1',[account.id]);return json({ok:true});}
  if(path==='/api/account/export'){
   const jobs=await sql('SELECT id,request,state,status,created_at FROM patchgoblin_jobs WHERE account_id=$1 ORDER BY id',[account.id]);const repositories=await product.repositories(account.id);
   return json({exported_at:new Date().toISOString(),account:{id:account.id,login:account.login,created_at:account.created_at},repositories,jobs},200,{'Content-Disposition':'attachment; filename="patchgoblin-data.json"'});
  }
  if(path==='/api/account/delete'&&req.method==='POST'){
   const body=await readBody();if(body.confirm!==account.login)throw new ProductError(400,'Type your GitHub login to confirm deletion.');
   await sql('SELECT pg_delete_account($1)',[account.id]);await product.wake();
   return json({ok:true,message:'Account data deleted and active jobs cancelled. GitHub installations and pull requests remain on GitHub; uninstall the App there separately.'},200,{'Set-Cookie':cookie('__Host-pg-session','',0)});
  }
  if(path==='/api/repositories/settings'&&req.method==='POST'){
   const body=await readBody();const {row}=await product.authorize(account,body.repo,true,true);
   for(const key of ['enabled','paused','auto_repair','auto_builder','auto_maintenance'])if(typeof body[key]!=='boolean')throw new ProductError(400,'Invalid automation settings.');
   if(![7,30,90].includes(body.retention_days)||!Number.isInteger(body.daily_limit)||body.daily_limit<1||body.daily_limit>5)throw new ProductError(400,'Invalid usage or retention limit.');
   await sql('UPDATE pg_repositories SET enabled=$2,paused=$3,auto_repair=$4,auto_builder=$5,auto_maintenance=$6,daily_limit=$7,retention_days=$8,controller_id=$9,updated_at=now() WHERE id=$1',[row.id,body.enabled,body.paused,body.auto_repair,body.auto_builder,body.auto_maintenance,body.daily_limit,body.retention_days,account.id]);
   if(!body.enabled||body.paused)await sql("UPDATE patchgoblin_jobs SET cancelled_at=now(),status='cancelled',updated_at=now() WHERE repository_id=$1 AND status NOT IN ('submitted','verified','unsupported','failed','cancelled')",[row.id]);
   return json({ok:true});
  }
  if(path==='/api/repositories/health'){
   const {row,token}=await product.authorize(account,repositoryName(url.searchParams.get('repo')));
   const data=await product.github(`/repos/${row.full_name}/actions/runs?per_page=10&branch=${encodeURIComponent(row.default_branch)}`,token);
   return json({runs:data.workflow_runs.map((r:any)=>({id:r.id,name:r.name,status:r.status,conclusion:r.conclusion,url:r.html_url,sha:r.head_sha,branch:r.head_branch})),coverage:row.coverage});
  }
  if(path==='/api/runs'){
   const name=repositoryName(url.searchParams.get('repo'));const {token}=await product.authorize(account,name,true);
   const data=await product.github(`/repos/${name}/actions/runs?status=failure&per_page=30`,token);
   return json({runs:data.workflow_runs.filter((r:any)=>!r.head_branch?.startsWith('codex/patchgoblin-')).map((r:any)=>({id:r.id,name:r.name,branch:r.head_branch,sha:r.head_sha,url:r.html_url,event:r.event}))});
  }
  if(path==='/api/jobs'&&req.method==='GET'){
   await sql('SELECT patchgoblin_expire()');const rows=await sql('SELECT * FROM patchgoblin_jobs WHERE account_id=$1 ORDER BY created_at DESC LIMIT 200',[account.id]);return json({jobs:rows.map(jobView)});
  }
  if(path==='/api/jobs'&&req.method==='POST'){
   const body=await readBody();const repo=repositoryName(body.repo);if(!['repair','builder','maintenance'].includes(body.mode)||typeof body.key!=='string'||!/^[\w-]{16,100}$/.test(body.key))throw new ProductError(400,'Choose a supported mode and request identity.');
   const {row,token}=await product.authorize(account,repo,true);if(!row.enabled||row.paused)throw new ProductError(409,'This repository is disabled or paused.');
   let ref=body.ref||row.default_branch,sha;
   if(body.mode==='repair'){if(!Number.isSafeInteger(body.run_id)||body.run_id<1)throw new ProductError(400,'Choose a failed workflow run.');const run=await product.github(`/repos/${repo}/actions/runs/${body.run_id}`,token);if(run.conclusion!=='failure'||run.status!=='completed')throw new ProductError(400,'Choose a completed failed run.');if(run.event==='pull_request'&&run.head_repository?.full_name!==repo)throw new ProductError(422,'Fork failure repair needs a maintainer branch; maintenance can review the PR separately.');ref=run.head_branch;sha=run.head_sha;}
   if(typeof ref!=='string'||ref.length>200||ref.startsWith('codex/patchgoblin-')||/[\s~^:?*\[\\]/.test(ref))throw new ProductError(400,'Choose a valid contributor or base branch.');
   const request={repo,mode:body.mode,run_id:body.mode==='repair'?body.run_id:null,ref,key:body.key,sha,source:'web',owner:'github:'+account.id,telemetry:durableTrace()};
   const rowJob=(await sql('SELECT * FROM pg_enqueue($1,$2,$3,$4::jsonb)',[account.id,row.id,body.key,JSON.stringify(request)]))[0];await product.wake();return json(jobView(rowJob),202);
  }
  const match=path.match(/^\/api\/jobs\/(\d+)(?:\/(cancel|sync|submit))?$/);
  if(match){
   await sql('SELECT patchgoblin_expire()');const row=(await sql('SELECT * FROM patchgoblin_jobs WHERE id=$1 AND account_id=$2',[Number(match[1]),account.id]))[0];if(!row)throw new ProductError(404,'Job not found.');
   // Historical public operator evidence is owner scoped; every installed job rechecks current GitHub access.
   let auth;if(row.repository_id)auth=await product.authorize(account,row.request.repo);
   if(!match[2]&&req.method==='GET'){if(row.status==='queued')await product.wake();return json(jobView(row));}
   if(req.method!=='POST')throw new ProductError(405,'Use POST for this action.');await readBody();
   if(match[2]==='cancel'){if(!terminal.has(row.status))await sql("UPDATE patchgoblin_jobs SET cancelled_at=now(),status='cancelled',updated_at=now() WHERE id=$1 AND account_id=$2",[row.id,account.id]);return json({...jobView(row),status:terminal.has(row.status)?row.status:'cancelled'});}
   if(match[2]==='submit'){if(row.status!=='verified'||row.cancelled_at)throw new ProductError(409,'Only verified, active jobs can retry submission.');await sql("UPDATE patchgoblin_jobs SET request=request||'{\"retry_submission\":true}',status='queued',state=state||'{\"status\":\"verified\"}' WHERE id=$1 AND account_id=$2",[row.id,account.id]);await product.wake();return json({...jobView(row),status:'queued'});}
   if(match[2]==='sync'&&row.state.pr_sha&&auth){const runs=await product.github(`/repos/${row.request.repo}/actions/runs?head_sha=${row.state.pr_sha}&per_page=20`,auth.token);const remote=runs.workflow_runs.map((r:any)=>({id:r.id,name:r.name,status:r.status,conclusion:r.conclusion,url:r.html_url}));await sql("UPDATE patchgoblin_jobs SET state=state||jsonb_build_object('remote_ci',$2::jsonb),updated_at=now() WHERE id=$1",[row.id,JSON.stringify(remote)]);return json({...jobView(row),remote_ci:remote});}
   return json(jobView(row));
  }
  throw new ProductError(404,'Endpoint not found.');
 }catch(error){const message=(error as Error).message;if(message.split('\n')[0]==='PG_RATE_LIMIT')return json({error:'Usage limit reached. Check repository settings and try again tomorrow.'},429);if(message.split('\n')[0]==='PG_ACTIVE_JOB')return json({error:'You already have an active job. Wait for it or cancel it first.'},409);if(message.split('\n')[0]==='PG_REPO_DISABLED')return json({error:'Repository automation is unavailable or paused.'},409);if(error instanceof ProductError&&error.status<500)return json({error:error.message},error.status);const eventId=captureFault(error,'request');if(error instanceof ProductError)return json({error:error.message,...(eventId?{event_id:eventId}:{})},error.status,eventId?{'X-Sentry-Event-ID':eventId}:{});console.error(JSON.stringify({level:'error',route:route(req.url),type:(error as Error).name}));return json({error:'The request could not be completed. Retry or contact support with the request ID.',...(eventId?{event_id:eventId}:{})},500,eventId?{'X-Sentry-Event-ID':eventId}:{});}
}
