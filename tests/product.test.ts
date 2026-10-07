import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {handleProduct as actualHandleProduct} from '../server/platform.ts';
import {Product,encrypt,decrypt,validSignature,localReturn,hash} from '../server/platform-core.ts';
const env={APP_URL:'https://patchgoblin.vercel.app',TOKEN_ENCRYPTION_KEY:'12'.repeat(32),GITHUB_WEBHOOK_SECRET:'unit-test-secret',WORKER_URL:'https://worker.invalid',WORKER_WAKE_TOKEN:'test'};
const never=async()=>{throw Error('Unexpected provider call');};
// Existing behavior tests use an explicit healthy limiter fixture; failure paths
// and the real database functions are tested separately in guardrails tests.
const handleProduct:typeof actualHandleProduct=(req,configuration,fetcher,query)=>{
 const headers=new Headers(req.headers);headers.set('x-vercel-forwarded-for','203.0.113.8');
 return actualHandleProduct(new Request(req,{headers}),{...configuration,VERCEL:'1'},fetcher,async(sql,args)=>sql.includes('pg_rate_limit')?[{allowed:true}]:query!(sql,args));
};
test('product authentication ignores owner flags and client-supplied identities',async()=>{
 const response=await handleProduct(new Request(env.APP_URL+'/api/jobs',{headers:{'oai-authenticated-user-id':'owner'}}),{...env,PRIVATE_OWNER_MODE:'true',VERCEL_PRIVATE_OWNER_MODE:'true'},never as typeof fetch,never);
 assert.equal(response.status,401);
});
test('public bootstrap does not execute GitHub calls or authorize repositories',async()=>{
 const response=await handleProduct(new Request(env.APP_URL+'/api/bootstrap'),env,never as typeof fetch,never);
 assert.deepEqual((await response.json()).repositories,[]);assert.equal(response.status,200);
});
test('OAuth return paths reject external, protocol-relative and API redirects',()=>{
 for(const value of ['https://evil.test','//evil.test','/\\evil.test','/api/jobs'])assert.equal(localReturn(value),'/dashboard');
 assert.equal(localReturn('/workbench?job=11'),'/workbench?job=11');
});
test('encrypted account tokens authenticate ciphertext and use unique nonces',()=>{
 const value={access_token:'unit-test-value',refresh_token:'rotate'};const first=encrypt(value,env),second=encrypt(value,env);
 assert.notEqual(first,second);assert.deepEqual(decrypt(first,env),value);assert.ok(!first.includes('unit-test-value'));
 const corrupted=Buffer.from(first,'base64url');corrupted[corrupted.length-1]^=1;assert.throws(()=>decrypt(corrupted.toString('base64url'),env));
});
test('webhook signature binds the exact body and rejects malformed lengths',()=>{
 const raw='{"action":"completed"}',sig='sha256='+createHmac('sha256',env.GITHUB_WEBHOOK_SECRET).update(raw).digest('hex');
 assert.ok(validSignature(raw,sig,env.GITHUB_WEBHOOK_SECRET));assert.equal(validSignature(raw+' ',sig,env.GITHUB_WEBHOOK_SECRET),false);assert.equal(validSignature(raw,'sha256=00',env.GITHUB_WEBHOOK_SECRET),false);
});
test('invalid webhook signatures never enter durable storage',async()=>{
 const response=await handleProduct(new Request(env.APP_URL+'/api/github/webhook',{method:'POST',body:'{}',headers:{'x-hub-signature-256':'sha256='+'0'.repeat(64)}}),env,never as typeof fetch,never);
 assert.equal(response.status,401);
});
test('duplicate signed deliveries retain exactly one durable identity',async()=>{
 const seen=new Set<string>();let inserts=0;
 const query=async(sql:string,args:any[]=[]):Promise<any[]>=>{assert.ok(sql.includes('pg_accept_delivery'));const id=args[0];if(seen.has(id))return [{inserted:false}];seen.add(id);inserts++;return [{inserted:true}];};
 const raw=JSON.stringify({action:'completed',installation:{id:1,account:{login:'example'}},repository:{id:2,full_name:'example/repo'},workflow_run:{id:42,status:'completed',conclusion:'failure',head_sha:'a'.repeat(40),head_branch:'main'}});
 const headers={'x-hub-signature-256':'sha256='+createHmac('sha256',env.GITHUB_WEBHOOK_SECRET).update(raw).digest('hex'),'x-github-event':'workflow_run','x-github-delivery':'delivery-000000000001'};
 const first=await handleProduct(new Request(env.APP_URL+'/api/github/webhook',{method:'POST',headers,body:raw}),env,async()=>new Response(null,{status:202}),query);
 const second=await handleProduct(new Request(env.APP_URL+'/api/github/webhook',{method:'POST',headers,body:raw}),env,async()=>new Response(null,{status:202}),query);
 assert.equal(inserts,1);assert.equal(first.status,202);assert.equal((await second.json()).duplicate,true);
});
test('session and origin checks deny mutation before data is modified',async()=>{
 const token='session-value';const account={id:1,login:'example',csrf:'csrf-value',token_hash:hash(token)};
 let mutations=0;const query=async(sql:string)=>{if(sql.startsWith('SELECT a.'))return [account];mutations++;return [];};
 const noCsrf=await handleProduct(new Request(env.APP_URL+'/api/auth/logout',{method:'POST',headers:{cookie:'__Host-pg-session='+token,origin:env.APP_URL},body:'{}'}),env,never as typeof fetch,query);
 const badOrigin=await handleProduct(new Request(env.APP_URL+'/api/auth/logout',{method:'POST',headers:{cookie:'__Host-pg-session='+token,'x-csrf-token':account.csrf,origin:'https://evil.test'},body:'{}'}),env,never as typeof fetch,query);
 assert.equal(noCsrf.status,403);assert.equal(badOrigin.status,403);assert.equal(mutations,0);
});
test('a consumed OAuth state or different browser cannot exchange a code',async()=>{
 const response=await handleProduct(new Request(env.APP_URL+'/api/auth/callback?code=not-used&state=old',{headers:{cookie:'__Host-pg-oauth=different-browser'}}),env,never as typeof fetch,async()=>[]);
 assert.equal(response.status,302);assert.ok(response.headers.get('location')!.startsWith('/?auth_error='));
});
test('sign-in uses the dedicated identity OAuth App without repository scopes',async()=>{
 let purpose='';
 const request=new Request(env.APP_URL+'/api/auth/login',{method:'POST',headers:{origin:env.APP_URL,'content-type':'application/x-www-form-urlencoded'},body:'cf-turnstile-response=fixture-token'});
 const response=await handleProduct(request,{...env,GITHUB_OAUTH_CLIENT_ID:'identity-client',GITHUB_CLIENT_ID:'repository-client',TURNSTILE_SECRET:'test-secret',TURNSTILE_HOSTNAMES:'patchgoblin.vercel.app'},async()=>Response.json({success:true,action:'login',hostname:'patchgoblin.vercel.app'}),async(sql)=>{purpose=sql;return [];});
 const location=new URL(response.headers.get('location')!);
 assert.equal(location.searchParams.get('client_id'),'identity-client');assert.equal(location.searchParams.get('scope'),'');
 assert.equal(location.searchParams.get('code_challenge_method'),'S256');assert.ok(purpose.includes("'identity'"));
});
test('identity-only login does not store a token or grant repository authorization',async()=>{
 const statements:string[]=[];
 const query=async(sql:string)=>{statements.push(sql);return sql.startsWith('DELETE FROM pg_oauth_states')?[{purpose:'identity',verifier:'test-verifier',return_to:'/dashboard'}]:[];};
 const fetcher=async(url:any,options:any)=>{if(String(url).endsWith('/access_token')){assert.equal(JSON.parse(options.body).client_id,'identity-client');return Response.json({access_token:'identity-only',expires_in:28800});}assert.equal(String(url),'https://api.github.com/user');return Response.json({id:123,login:'example',avatar_url:''});};
 const response=await handleProduct(new Request(env.APP_URL+'/api/auth/callback?code=one-time&state=state',{headers:{cookie:'__Host-pg-oauth=browser'}}),{...env,GITHUB_OAUTH_CLIENT_ID:'identity-client'},fetcher as typeof fetch,query);
 assert.equal(response.status,302);const accountInsert=statements.find(s=>s.startsWith('INSERT INTO pg_accounts'))!;
 assert.ok(!accountInsert.includes('credentials'));assert.ok(!statements.some(s=>s.includes('pg_repository_members')));
 assert.ok(response.headers.get('set-cookie')!.includes('__Host-pg-session='));
});
test('repository authorization cannot connect another GitHub identity to the session',async()=>{
 let writes=0;
 const query=async(sql:string)=>{if(sql.startsWith('DELETE FROM pg_oauth_states'))return [{purpose:'installation',account_id:123,verifier:'v'}];if(sql.startsWith('SELECT a.'))return [{id:123,login:'example'}];writes++;return [];};
 const fetcher=async(url:any)=>Response.json(String(url).endsWith('/access_token')?{access_token:'app-token'}:{id:456,login:'different'});
 const response=await handleProduct(new Request(env.APP_URL+'/api/auth/callback?code=one-time&state=state',{headers:{cookie:'__Host-pg-oauth=browser; __Host-pg-session=session'}}),env,fetcher as typeof fetch,query);
 assert.equal(response.status,403);assert.equal(writes,0);
});
test('identity-only accounts must explicitly authorize repository access',async()=>{
 const product=new Product(env,never as typeof fetch,never);
 await assert.rejects(product.userToken({id:123,credentials:null}),/Authorize selected repository access/);
});
test('retention requires bearer secret and rejects spoofable cron headers',async()=>{
  const statements:string[]=[];let wakes=0;
  const query=async(sql:string)=>{statements.push(sql);return [];};
  const fetcher=async(url:any,options:any)=>{if(String(url)==='https://worker.invalid/wake'){wakes++;return new Response(null,{status:202});}throw Error('Unexpected provider call: '+url);};
  const secretEnv={...env,CRON_SECRET:'retention-secret'};
  const cronHeaders={'user-agent':'vercel-cron/1.0','x-vercel-cron-schedule':'0 8 * * *'};
  const ok=await handleProduct(new Request(env.APP_URL+'/api/retention',{headers:cronHeaders}),secretEnv,fetcher as typeof fetch,query);
  assert.equal(ok.status,401);assert.deepEqual(statements,[]);assert.equal(wakes,0);
  const bearer=await handleProduct(new Request(env.APP_URL+'/api/retention',{headers:{authorization:'Bearer retention-secret'}}),secretEnv,fetcher as typeof fetch,query);
  assert.equal(bearer.status,200);assert.deepEqual(await bearer.json(),{ok:true,budget_alerts:0});
  assert.ok(statements.some(s=>s.includes('pg_retention()')));assert.equal(wakes,1);
  for(const headers of [
    {'user-agent':'vercel-cron/1.0'},
    {'x-vercel-cron-schedule':'0 8 * * *'},
    {'user-agent':'vercel-cron/1.0','x-vercel-cron-schedule':'5 * * * *'},
    {'user-agent':'curl/8.5.0','x-vercel-cron-schedule':'0 8 * * *'},
    {authorization:'Bearer wrong-secret'},
    {},
  ]){
    const response=await handleProduct(new Request(env.APP_URL+'/api/retention',{headers:headers as Record<string,string>}),secretEnv,never as typeof fetch,query);
    assert.equal(response.status,401,JSON.stringify(headers));
  }
  const unprovisioned=await handleProduct(new Request(env.APP_URL+'/api/retention',{headers:cronHeaders}),env,never as typeof fetch,query);
  assert.equal(unprovisioned.status,401);
});
