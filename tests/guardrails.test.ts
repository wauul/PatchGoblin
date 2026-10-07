import test from 'node:test';
import assert from 'node:assert/strict';
import {handleProduct} from '../server/platform.ts';
import {encrypt,Product,type Query} from '../server/platform-core.ts';
import {clientIp,limitedText,Guardrails,verifyChallenge} from '../server/guardrails.ts';
const env={APP_URL:'https://patchgoblin.vercel.app',VERCEL:'1',TOKEN_ENCRYPTION_KEY:'12'.repeat(32),GITHUB_OAUTH_CLIENT_ID:'fixture-client',TURNSTILE_SITE_KEY:'fixture-site',TURNSTILE_SECRET:'fixture-secret',TURNSTILE_HOSTNAMES:'patchgoblin.vercel.app'};
const noFetch:typeof fetch=async()=>{throw Error('No external call should happen');};
const request=(path:string,init:RequestInit={})=>new Request(env.APP_URL+path,{...init,headers:{'x-vercel-forwarded-for':'203.0.113.8',...Object.fromEntries(new Headers(init.headers))}});
test('trusted IP requires the hosting contract and ignores other forwarding headers',()=>{
 assert.equal(clientIp(request('/api/auth/login',{headers:{'x-forwarded-for':'192.0.2.10','x-real-ip':'192.0.2.11'}}),env),'203.0.113.8');
 assert.throws(()=>clientIp(request('/api/auth/login'),{...env,VERCEL:undefined}),/Trusted request/);
 assert.throws(()=>clientIp(request('/api/auth/login',{headers:{'x-vercel-forwarded-for':'1.1.1.1, 2.2.2.2'}}),env),/Trusted request/);
});
test('byte limiter cancels an oversized streaming body before buffering the rest',async()=>{
 let cancelled=false;
 const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array(11));},cancel(){cancelled=true;}});
 const r=new Response(stream);await assert.rejects(limitedText(r,10),/too large/);assert.equal(cancelled,true);
 await assert.rejects(limitedText(new Response('ééé'),5),/too large/);
});
test('wrong method is rejected before storage or providers',async()=>{
 const response=await handleProduct(request('/api/account/export',{method:'POST'}),env,noFetch,async()=>{throw Error('Unexpected database call');});
 assert.equal(response.status,405);
});
test('limiter denial, missing result and database outage cannot create OAuth state',async()=>{
 for(const query of [async()=>[{allowed:false}],async()=>[],async()=>{throw Error('Database unavailable');}]){
  const r=await handleProduct(request('/api/auth/login'),env,noFetch,query);assert.ok([429,503,500].includes(r.status));
 }
});
test('global feature controls fail closed when absent, false or unavailable',async()=>{
 for(const query of [async()=>[],async()=>[{allowed:false}],async()=>{throw Error('Database unavailable');}])await assert.rejects(new Guardrails(query,env).feature('inference'));
});
test('GET login presents challenge without creating OAuth state',async()=>{
 const statements:string[]=[];const r=await handleProduct(request('/api/auth/login?return_to=/dashboard'),env,noFetch,async(sql)=>{statements.push(sql);return [{allowed:true}];});
 assert.equal(r.status,200);assert.ok((await r.text()).includes('data-action="login"'));assert.ok(statements.every(s=>s.includes('pg_rate_limit')));
 assert.ok(r.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"));
 assert.ok(r.headers.get('content-security-policy')?.includes("form-action 'self' https://github.com;"));
});
test('revoked credentials hide stored repositories without blocking account controls',async()=>{
 const product=new Product(env,noFetch,async()=>{throw Error('No repository query required');});
 assert.deepEqual(await product.visibleRepositories({id:1,credentials:null}),[]);
});
test('challenge rejects failed, replayed, wrong-action, wrong-host and unavailable verification',async()=>{
 for(const result of [{success:false},{success:true,action:'signup',hostname:'patchgoblin.vercel.app'},{success:true,action:'login',hostname:'localhost'}]){
  await assert.rejects(verifyChallenge('token',env,async()=>Response.json(result),'203.0.113.8'),/Verification failed/);
 }
 await assert.rejects(verifyChallenge('token',env,noFetch,'203.0.113.8'),/Verification failed/);
 await assert.rejects(verifyChallenge('token',{...env,VERCEL_ENV:'production',TURNSTILE_HOSTNAMES:'patchgoblin.vercel.app,localhost'},noFetch,'203.0.113.8'),/not configured/);
 let calls=0;const fetcher:typeof fetch=async()=>Response.json(++calls===1?{success:true,action:'login',hostname:'patchgoblin.vercel.app'}:{success:false,'error-codes':['timeout-or-duplicate']});
 await verifyChallenge('same-token',env,fetcher,'203.0.113.8');await assert.rejects(verifyChallenge('same-token',env,fetcher,'203.0.113.8'));
});
test('history and export exclude private evidence after access is revoked',async()=>{
 const account={id:1,csrf:'csrf',credentials:encrypt({access_token:'fixture-user-token'},env)};
 const privateJob={id:7,repository_id:2,request:{repo:'org/private'},state:{diff:'sensitive-evidence'},status:'submitted'};
 const query:Query=async(sql)=>sql.includes('pg_rate_limit')?[{allowed:true}]:sql.startsWith('SELECT a.')?[account]:sql.includes('FROM patchgoblin_jobs WHERE account_id=')?[privateJob]:sql.startsWith('SELECT r.*,i.active')?[{id:2,installation_id:3}]:[];
 const revoked:typeof fetch=async()=>new Response(null,{status:404});
 for(const path of ['/api/jobs','/api/account/export']){const r=await handleProduct(request(path,{headers:{cookie:'__Host-pg-session=session'}}),env,revoked,query);assert.equal(r.status,200);assert.ok(!(await r.text()).includes('sensitive-evidence'));}
});
test('permission provider outage does not release saved evidence',async()=>{
 const query:Query=async(sql)=>sql.includes('pg_rate_limit')?[{allowed:true}]:sql.startsWith('SELECT a.')?[{id:1,credentials:encrypt({access_token:'fixture'},env)}]:sql.includes('FROM patchgoblin_jobs WHERE account_id=')?[{repository_id:2,request:{repo:'org/private'},state:{diff:'secret-evidence'}}]:sql.startsWith('SELECT r.*,i.active')?[{id:2,installation_id:3}]:[];
 const r=await handleProduct(request('/api/jobs',{headers:{cookie:'__Host-pg-session=session'}}),env,noFetch,query);assert.equal(r.status,500);assert.ok(!(await r.text()).includes('secret-evidence'));
});
test('job ownership query denies user A access to user B before provider work',async()=>{
 const query:Query=async(sql,args)=>sql.includes('pg_rate_limit')?[{allowed:true}]:sql.startsWith('SELECT a.')?[{id:1}]:sql.includes('WHERE id=$1 AND account_id=$2')?(assert.equal(args?.[1],1),[]):[];
 const r=await handleProduct(request('/api/jobs/9',{headers:{cookie:'__Host-pg-session=session'}}),env,noFetch,query);assert.equal(r.status,404);
});
test('read-only repository access cannot retry submission',async()=>{
 let requeued=false;
 const query:Query=async(sql)=>{if(sql.includes('pg_rate_limit'))return [{allowed:true}];if(sql.startsWith('SELECT a.'))return [{id:1,csrf:'csrf',credentials:encrypt({access_token:'fixture'},env)}];if(sql.includes('WHERE id=$1 AND account_id=$2'))return [{id:7,repository_id:2,status:'verified',request:{repo:'org/private'}}];if(sql.startsWith('SELECT r.*,i.active'))return [{id:2,installation_id:3}];if(sql.includes('pg_retry_submission'))requeued=true;return [];};
 const fetcher:typeof fetch=async()=>Response.json({id:2,permissions:{push:false}});
 const r=await handleProduct(request('/api/jobs/7/submit',{method:'POST',headers:{cookie:'__Host-pg-session=session',origin:env.APP_URL,'x-csrf-token':'csrf'},body:'{}'}),env,fetcher,query);
 assert.equal(r.status,403);assert.equal(requeued,false);
});
