import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {handleProduct} from '../server/platform.ts';
import {encrypt,decrypt,validSignature,localReturn,hash} from '../server/platform-core.ts';
const env={APP_URL:'https://patchgoblin.vercel.app',TOKEN_ENCRYPTION_KEY:'12'.repeat(32),GITHUB_WEBHOOK_SECRET:'unit-test-secret',WORKER_URL:'https://worker.invalid',WORKER_WAKE_TOKEN:'test'};
const never=async()=>{throw Error('Unexpected provider call');};
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
 const query=async(sql:string,args:any[]=[]):Promise<any[]>=>{assert.ok(sql.includes('ON CONFLICT(id) DO NOTHING'));const id=args[0];if(seen.has(id))return [];seen.add(id);inserts++;return [{id}];};
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
