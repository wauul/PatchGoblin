import {NeonJobs} from './jobs.js';
export interface Env { GITHUB_TOKEN?:string; CONTROL_REPO?:string; ALLOWED_REPOS?:string; OWNER_LOGIN?:string; LOCAL_USER?:string; PRIVATE_OWNER_MODE?:string; DATABASE_URL?:string; VERCEL_PRIVATE_OWNER_MODE?:string; VERCEL_ENV?:string; WORKER_URL?:string; WORKER_WAKE_TOKEN?:string; PRODUCTION_URL?:string }
type Json = Record<string, any>;
const marker='<!-- patchgoblin-state-v1 -->\n';
const terminal=new Set(['verified','submitted','unsupported','failed','cancelled']);
async function decodeState(text:string):Promise<Json>{
 const value=JSON.parse(text);
 if(value.encoding!=='gzip-base64')return value;
 if(!Number.isInteger(value.bytes)||value.bytes<=0||value.bytes>250000||typeof value.payload!=='string'||value.payload.length>59000)throw new Error('Invalid state envelope.');
 const bytes=Uint8Array.from(atob(value.payload),c=>c.charCodeAt(0));
 const reader=new Response(bytes).body!.pipeThrough(new DecompressionStream('gzip')).getReader();
 const chunks:Uint8Array[]=[];let size=0;
 for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>250000){await reader.cancel();throw new Error('State exceeds decompression budget.');}chunks.push(next.value);}
 const raw=new Uint8Array(size);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw))).map(b=>b.toString(16).padStart(2,'0')).join('');
 if(size!==value.bytes||digest!==value.sha256)throw new Error('State checksum mismatch.');
 return JSON.parse(new TextDecoder().decode(raw));
}
export class ApiError extends Error {constructor(public status:number,message:string){super(message)}}
export const redact=(s:string)=>s.replace(/(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]+|gsk_[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}|postgres(?:ql)?:\/\/[^\s]+|Bearer\s+\S+)/gi,'[REDACTED]');
const filteredLogs=(s:string)=>redact(s.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g,'').replace(/((?:password|token|api[_-]?key|secret)\s*[=:]\s*)[^\s,;]+/gi,'$1[REDACTED]')).split('\n').filter(l=>/error|fail|conflict|requires|incompatible|ModuleNotFound|resolution|install|python|lock|dependency/i.test(l)).slice(-100).join('\n').slice(-12000);
const response=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
export async function handleApi(req:Request,env:Env,fetcher:typeof fetch=fetch):Promise<Response>{
 const url=new URL(req.url), control=env.CONTROL_REPO||'wauul/PatchGoblin', ownerLogin=env.OWNER_LOGIN||'wauul';
 // In confirmed owner-private Sites, dispatch authenticates both the owner and service credentials.
 // This adapter must NEVER be enabled for a public/shared deployment.
 const vercelPrivate=env.VERCEL_PRIVATE_OWNER_MODE==='true'&&env.VERCEL_ENV==='production';
 const user=env.PRIVATE_OWNER_MODE==='true'||vercelPrivate?'private-owner':req.headers.get('oai-authenticated-user-id')||(url.hostname==='127.0.0.1'?env.LOCAL_USER:undefined);
 if(!user)return response({error:'Sign in to access your repositories and jobs.'},401);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user+'|'+control));
 const owner=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,24);
 const allowed=(env.ALLOWED_REPOS||'wauul/patchgoblin-lab').split(',').filter(Boolean);
 const database=env.DATABASE_URL?new NeonJobs(env.DATABASE_URL):null;
 const wakeWorker=async()=>{
  if(!database||!env.WORKER_URL||!env.WORKER_WAKE_TOKEN)return;
  for(let attempt=0;attempt<2;attempt++){
   try{const wake=await fetcher(env.WORKER_URL+'/wake',{method:'POST',headers:{Authorization:'Bearer '+env.WORKER_WAKE_TOKEN},signal:AbortSignal.timeout(12000)});if(wake.ok)return;}catch{/* Retry cold starts; Neon retains the job if both attempts fail. */}
  }
 };
 const github=async(path:string,method='GET',data?:any):Promise<any>=>{
  if(!env.GITHUB_TOKEN)throw new ApiError(503,'GitHub integration is not configured. Live jobs are unavailable.');
  const r=await fetcher('https://api.github.com'+path,{method,headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json','User-Agent':'PatchGoblin','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
  if(!r.ok)throw new ApiError(r.status===401||r.status===403?503:r.status,`GitHub request failed (${r.status}). Check repository permissions and token expiry.`);
  return r.status===204?null:r.json();
 };
 const readBody=async()=>{
  if(req.headers.get('origin')&&req.headers.get('origin')!==url.origin)throw new ApiError(403,'Cross-origin requests are forbidden.');
  if(Number(req.headers.get('content-length')||0)>10000)throw new ApiError(413,'Request exceeds size limit.');
  const text=await req.text();if(text.length>10000)throw new ApiError(413,'Request exceeds size limit.');
  try{return JSON.parse(text)}catch{throw new ApiError(400,'Request must contain valid JSON.')}
 };
 const issueRequest=(issue:Json)=>{let input:Json;try{input=JSON.parse(issue.body)}catch{throw new ApiError(404,'Job not found.')}if(!issue.title.startsWith('PatchGoblin job ')||input.owner!==owner||issue.user.login!==ownerLogin)throw new ApiError(404,'Job not found.');return input;};
 const details=async(issue:Json):Promise<Json>=>{
  const input=issueRequest(issue);
  if(database){return {...issue.database_state,id:issue.number,...input,created_at:issue.created_at,issue_url:issue.html_url};}
  const comments=await github(`/repos/${control}/issues/${issue.number}/comments?per_page=100`);
  let state:Json={status:issue.state==='closed'?'cancelled':'queued',events:[],verification:[],patch:{},diff:'',diagnosis:'Waiting for a worker',metrics:{model_tokens:null,estimated_cost_usd:null},limitations:[]};
  for(const c of comments){if(c.body.startsWith(marker)&&['github-actions[bot]',ownerLogin].includes(c.user.login)){try{state=await decodeState(c.body.slice(marker.length));}catch{/* Ignore malformed comments. */}}}
  const pr=comments.findLast((c:Json)=>c.user.login===ownerLogin&&c.body.startsWith('<!-- patchgoblin-pr-v1 -->'));
  if(pr){try{Object.assign(state,JSON.parse(pr.body.split('\n').slice(1).join('\n')),{status:'submitted'});}catch{}}
  if(issue.state==='closed'&&state.status!=='submitted')state.status='cancelled';
  return {...state,id:issue.number,...input,created_at:issue.created_at,issue_url:issue.html_url};
 };
 try{
  if(url.pathname==='/api/bootstrap'){
   if(!env.GITHUB_TOKEN)return response({connected:false,login:null,repositories:[],limits:{concurrency:1,steps:6,attempts:2,runtime_seconds:600,model_tokens:12000}});
   const profile=await github('/user');
   if(profile.login!==ownerLogin)throw new ApiError(403,'Configured GitHub account does not match the authorized owner.');
   const repositories=await Promise.all(allowed.map(async name=>{const r=await github(`/repos/${name}`);return {name:r.full_name,default_branch:r.default_branch,private:r.private,can_push:!!r.permissions?.push,demo:name==='wauul/patchgoblin-lab'};}));
   return response({connected:true,login:profile.login,repositories,worker_submission:!!database,limits:{concurrency:1,steps:6,attempts:2,runtime_seconds:600,model_tokens:12000}});
  }
  if(url.pathname==='/api/runs'){
   const repo=url.searchParams.get('repo');if(!repo||!allowed.includes(repo))throw new ApiError(403,'Repository is outside the allowlist.');
   const runs=await github(`/repos/${repo}/actions/runs?status=failure&per_page=20`);
   return response(runs.workflow_runs.map((r:Json)=>({id:r.id,name:r.name,branch:r.head_branch,sha:r.head_sha,created_at:r.created_at,url:r.html_url,conclusion:r.conclusion})));
  }
  if(url.pathname==='/api/jobs'&&req.method==='GET'){
   const issues=database?(await database.list(owner)).map(row=>database.issue(row,ownerLogin)):await github(`/repos/${control}/issues?creator=${ownerLogin}&state=all&per_page=100`);
   const owned=issues.filter((i:Json)=>{try{return !i.pull_request&&issueRequest(i)}catch{return false}}).slice(0,30);
   // Resolve saved states in parallel, but return only compact owner-scoped metadata.
   return response(await Promise.all(owned.map(async(i:Json)=>{
    const input=issueRequest(i), state=await details(i);
    return {id:i.number,repo:input.repo,mode:input.mode,ref:input.ref,run_id:input.run_id,created_at:i.created_at,status:state.status};
   })));
  }
  if(url.pathname==='/api/jobs'&&req.method==='POST'){
   const input=await readBody();
   if(!allowed.includes(input.repo)||!['repair','builder'].includes(input.mode))throw new ApiError(400,'Choose an authorized repository and supported mode.');
   if(input.mode==='repair'&&(!Number.isSafeInteger(input.run_id)||input.run_id<=0))throw new ApiError(400,'Choose a failed workflow run.');
   if(typeof input.key!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(input.key))throw new ApiError(400,'An idempotency key is required.');
   if(input.ref&&!/^[A-Za-z0-9_./-]{1,100}$/.test(input.ref))throw new ApiError(400,'Invalid branch reference.');
   const profile=await github('/user');if(profile.login!==ownerLogin)throw new ApiError(403,'Unauthorized integration account.');
   const repository=await github(`/repos/${input.repo}`);if(!repository.permissions?.push||repository.private)throw new ApiError(403,'This deployment requires write access to an allowlisted public repository.');
   const issues=database?(await database.list(owner)).map(row=>database.issue(row,ownerLogin)):await github(`/repos/${control}/issues?creator=${ownerLogin}&state=all&per_page=100`);
   const prior=issues.find((i:Json)=>{try{const x=issueRequest(i);return x.key===input.key}catch{return false}});
   if(prior){const job=await details(prior);if(job.status==='queued')await wakeWorker();return response(job);}
   const recent=issues.filter((i:Json)=>{try{return issueRequest(i)&&Date.now()-Date.parse(i.created_at)<3600000}catch{return false}});
   if(recent.length>=8)throw new ApiError(429,'Eight jobs per hour maximum. Try again later.');
   for(const i of recent.filter((i:Json)=>i.state==='open')){const job=await details(i);if(!terminal.has(job.status)&&Date.now()-Date.parse(i.created_at)<1800000)throw new ApiError(409,'A job is already running. Wait for it or cancel it.');}
   let ci_logs:string|undefined;
   if(input.mode==='repair'){
    const run=await github(`/repos/${input.repo}/actions/runs/${input.run_id}`);
    if(run.conclusion!=='failure')throw new ApiError(400,'Choose a failed completed workflow run.');
    const jobs=await github(`/repos/${input.repo}/actions/runs/${input.run_id}/jobs?per_page=100`);
    const logs:string[]=[];
    for(const job of jobs.jobs.filter((j:Json)=>j.conclusion==='failure').slice(0,2)){
     const r=await fetcher(`https://api.github.com/repos/${input.repo}/actions/jobs/${job.id}/logs`,{redirect:'manual',headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json','User-Agent':'PatchGoblin'}});
     const location=r.headers.get('location');
     // Never forward the repository credential to GitHub's log-storage redirect.
     const log=r.status===302&&location?await fetcher(location,{redirect:'manual'}):r;
     if(!log.ok)throw new ApiError(502,`Cannot retrieve failed CI logs (${log.status}).`);
     logs.push(filteredLogs(await log.text()));
    }
    if(!logs.length)throw new ApiError(400,'The selected run has no failed job logs.');
    ci_logs=logs.join('\n').slice(-12000);
   }
   const body={repo:input.repo,mode:input.mode,run_id:input.mode==='repair'?input.run_id:null,ref:input.ref||repository.default_branch,owner,key:input.key,created_at:new Date().toISOString(),...(ci_logs===undefined?{}:{ci_logs})};
   let issue:Json;
   if(database){
    try{issue=database.issue(await database.create(owner,input.key,body),ownerLogin);}catch(error){
     const message=String((error as Error).message);
     if(message.includes('PG_RATE_LIMIT'))throw new ApiError(429,'Eight jobs per hour maximum. Try again later.');
     if(message.includes('PG_ACTIVE_JOB'))throw new ApiError(409,'A job is already running. Wait for it or cancel it.');
     throw new ApiError(503,'Durable job storage is unavailable. Retry with the same idempotency key.');
    }
    await wakeWorker();
   }else{issue=await github(`/repos/${control}/issues`,'POST',{title:`PatchGoblin job ${input.mode} ${input.key}`,body:JSON.stringify(body)});}
   return response(await details(issue),201);
  }
  const match=url.pathname.match(/^\/api\/jobs\/(\d+)(?:\/(cancel|submit|sync))?$/);
  if(match){
   let issue:Json;
   if(database){const row=await database.get(Number(match[1]),owner);if(!row)throw new ApiError(404,'Job not found.');issue=database.issue(row,ownerLogin);}else{issue=await github(`/repos/${control}/issues/${match[1]}`);}
   const input=issueRequest(issue);
   if(match[2]==='cancel'&&req.method==='POST'){await readBody();if(database){await database.cancel(issue.number,owner);}else{await github(`/repos/${control}/issues/${issue.number}`,'PATCH',{state:'closed',state_reason:'not_planned'});}return response({status:'cancelled'});}
   if(match[2]==='submit'&&req.method==='POST'){
    await readBody();const state=await details(issue);
    if(state.status==='submitted')return response(state);
    if(state.status!=='verified'||!state.verification.length||state.verification.some((v:Json)=>v.exit_code!==0))throw new ApiError(409,'A verified patch is required before submission.');
    if(!allowed.includes(input.repo))throw new ApiError(403,'Repository is outside the allowlist.');
    const files=Object.entries(state.patch) as [string,string][];
    if(!files.length||files.length>4||files.reduce((sum,[p,c])=>sum+(p==='uv.lock'?0:c.length),0)>24000||files.some(([p,c])=>p.includes('..')||p.includes('\\')||p.startsWith('/')||typeof c!=='string'||c.length>(p==='uv.lock'?128000:24000)||!(p.startsWith('.github/workflows/')||['requirements.txt','requirements-dev.txt','pyproject.toml','uv.lock'].includes(p))))throw new ApiError(400,'Patch failed the submission allowlist.');
    const current=await github(`/repos/${input.repo}/commits/${encodeURIComponent(state.base_ref)}`);
    if(current.sha!==state.sha)throw new ApiError(409,'Base branch changed during verification. Start a new job against the current commit.');
    const branch=`codex/patchgoblin-${database?'neon-':''}${issue.number}`;
    const existing=await github(`/repos/${input.repo}/pulls?state=all&head=${ownerLogin}:${branch}`);
    let pr=existing[0];
    if(!pr){
     const tree=await github(`/repos/${input.repo}/git/trees`,'POST',{base_tree:current.commit.tree.sha,tree:files.map(([path,content])=>({path,content,mode:'100644',type:'blob'}))});
     const commit=await github(`/repos/${input.repo}/git/commits`,'POST',{message:`PatchGoblin: ${input.mode==='builder'?'add Python CI':'repair dependency installation'}`,tree:tree.sha,parents:[state.sha]});
     try{await github(`/repos/${input.repo}/git/refs`,'POST',{ref:'refs/heads/'+branch,sha:commit.sha});}catch(e){if(!(e instanceof ApiError)||e.status!==422)throw e;}
     // Existing branch must contain the same independently verified tree; never overwrite another change.
     const head=await github(`/repos/${input.repo}/commits/${branch}`);if(head.commit.tree.sha!==tree.sha)throw new ApiError(409,'Submission branch differs from the verified patch.');
     const before=state.reproduction?.map((v:Json)=>`- ${v.command}: exit ${v.exit_code}`).join('\n')||'No existing CI workflow.';
     const after=state.verification.map((v:Json)=>`- ${v.command}: exit ${v.exit_code} (${v.duration_seconds}s)`).join('\n');
     const body=`## Summary\n\n${state.diagnosis}\n\n\`\`\`text\n${files.map(([p])=>p).join('\n')}\n\`\`\`\n\n## Evidence\n\n**Before:**\n${before}\n\n**After:** verified in a disposable sandbox at ${state.sha}.\n${after}\n\n${(state.evidence||[]).join('\n')}\n\n${state.limitations.join('\n')}\n\nModel usage: ${state.metrics.model_tokens??'unavailable'} tokens. Estimated cost unavailable.\n\nJob: ${issue.html_url}\n\n## Merge Danger\n\n**Door:** two-way\n\n**Blast Radius:** dependencies\n\nTests and required checks were preserved. No automatic merge.`;
     try{pr=await github(`/repos/${input.repo}/pulls`,'POST',{title:`PatchGoblin: ${input.mode==='builder'?'build Python CI':'repair dependency installation'}`,head:branch,base:state.base_ref,body});}catch(e){const raced=await github(`/repos/${input.repo}/pulls?state=all&head=${ownerLogin}:${branch}`);if(!raced[0])throw e;pr=raced[0];}
    }
    const result={pr_url:pr.html_url,pr_number:pr.number,pr_sha:pr.head.sha,status:'submitted'};
    if(database){await database.submitted(issue.number,owner,result);}else{await github(`/repos/${control}/issues/${issue.number}/comments`,'POST',{body:'<!-- patchgoblin-pr-v1 -->\n'+JSON.stringify(result)});}
    return response({...state,...result});
   }
   if(req.method==='GET'||(match[2]==='sync'&&req.method==='POST')){
    if(req.method==='POST')await readBody();const state=await details(issue);
    if(state.status==='queued')await wakeWorker();
    if(state.pr_sha){const runs=await github(`/repos/${input.repo}/actions/runs?head_sha=${state.pr_sha}&per_page=20`);state.remote_ci=runs.workflow_runs.map((r:Json)=>({name:r.name,status:r.status,conclusion:r.conclusion,url:r.html_url}));}
    return response(state);
   }
  }
  return response({error:'Route not found.'},404);
 }catch(e){const error=e as Error;console.log(JSON.stringify({level:'error',route:url.pathname,message:redact(error.message)}));return response({error:e instanceof ApiError?e.message:'An unexpected error occurred. Your credentials were not included in the response.'},e instanceof ApiError?e.status:500);}
}
