import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {handleApi,redact,type Env} from '../server/api';
const env:Env={GITHUB_TOKEN:'synthetic-token',CONTROL_REPO:'wauul/PatchGoblin',ALLOWED_REPOS:'wauul/patchgoblin-lab',OWNER_LOGIN:'wauul'};
const request=(path:string,body?:any,user='alice')=>new Request('https://patchgoblin.example/api'+path,{method:body===undefined?'GET':'POST',headers:{...(user?{'oai-authenticated-user-id':user}:{}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
const json=(body:any)=>new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
test('anonymous access denied without touching GitHub',async()=>{const result=await handleApi(request('/jobs',undefined,''),env,async()=>{throw Error('must not call')});assert.equal(result.status,401)});
test('repository allowlist enforced',async()=>{const result=await handleApi(request('/jobs',{repo:'attacker/private',mode:'builder',key:'1234567890123456'}),env,async()=>{throw Error('must not call')});assert.equal(result.status,400)});
test('invalid failed run rejected',async()=>{const result=await handleApi(request('/jobs',{repo:'wauul/patchgoblin-lab',mode:'repair',run_id:'7',key:'1234567890123456'}),env);assert.equal(result.status,400)});
test('another owner cannot read a job',async()=>{const fetcher=async()=>json({number:7,title:'PatchGoblin job builder abc',body:JSON.stringify({owner:'someone-else',repo:'wauul/patchgoblin-lab'}),user:{login:'wauul'}});const r=await handleApi(request('/jobs/7'),env,fetcher as typeof fetch);assert.equal(r.status,404)});
test('cross-origin mutations rejected',async()=>{const req=request('/jobs',{repo:'wauul/patchgoblin-lab',mode:'builder',key:'1234567890123456'});req.headers.set('Origin','https://evil.example');const r=await handleApi(req,env);assert.equal(r.status,403)});
test('backend never returns provider credentials on error',async()=>{const r=await handleApi(request('/bootstrap'),env,(async()=>new Response('',{status:401})) as typeof fetch);assert.equal(r.status,503);assert.ok(!(await r.text()).includes('synthetic-token'))});
test('missing integration produces honest connection state',async()=>{const r=await handleApi(request('/bootstrap'),{});const state=await r.json();assert.equal(state.connected,false)});
test('unverified work cannot submit',async()=>{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('alice|wauul/PatchGoblin'));const owner=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,24);const fetcher=async(url:any)=>String(url).includes('/comments')?json([]):json({number:7,state:'open',title:'PatchGoblin job builder abc',body:JSON.stringify({owner,repo:'wauul/patchgoblin-lab'}),user:{login:'wauul'}});const r=await handleApi(request('/jobs/7/submit',{}),env,fetcher as typeof fetch);assert.equal(r.status,409)});
test('secret redaction covers token-like values',()=>{assert.equal(redact('ghp_'+'a'.repeat(30)),'[REDACTED]')});
test('CI log redirect receives no credential and persisted evidence is redacted',async()=>{
 let issue:any, redirected=false;
 const fetcher=async(url:any,options:any)=>{
  const path=String(url);
  if(path==='https://logs.example/file'){redirected=true;assert.equal(options.headers,undefined);return new Response('ERROR token=private-value\nModuleNotFoundError: requests\nBearer sensitive-value');}
  if(path.endsWith('/user'))return json({login:'wauul'});
  if(path.endsWith('/repos/wauul/patchgoblin-lab'))return json({permissions:{push:true},private:false,default_branch:'main'});
  if(path.includes('/issues?'))return json([]);
  if(path.endsWith('/actions/runs/7'))return json({conclusion:'failure'});
  if(path.includes('/jobs?'))return json({jobs:[{id:9,conclusion:'failure'}]});
  if(path.endsWith('/actions/jobs/9/logs'))return new Response(null,{status:302,headers:{Location:'https://logs.example/file'}});
  if(path.endsWith('/issues')&&options.method==='POST'){issue={...JSON.parse(options.body),number:8,state:'open',user:{login:'wauul'}};return json(issue);}
  if(path.endsWith('/comments?per_page=100'))return json([]);
  throw Error('Unexpected request '+path);
 };
 const r=await handleApi(request('/jobs',{repo:'wauul/patchgoblin-lab',mode:'repair',run_id:7,key:'1234567890123456'}),env,fetcher as typeof fetch);
 assert.equal(r.status,201);assert.equal(redirected,true);
 const stored=JSON.parse(issue.body);assert.ok(stored.ci_logs.includes('ModuleNotFoundError'));
 assert.ok(!stored.ci_logs.includes('private-value'));assert.ok(!stored.ci_logs.includes('sensitive-value'));
});
test('hourly cap rejects new work while an idempotent retry returns its existing job',async()=>{
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('alice|wauul/PatchGoblin'));
 const owner=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,24);
 const issues=Array.from({length:8},(_,i)=>({number:i+1,title:'PatchGoblin job builder key',state:'open',created_at:new Date().toISOString(),user:{login:'wauul'},body:JSON.stringify({owner,repo:'wauul/patchgoblin-lab',mode:'builder',key:'existing-key-number-'+i})}));
 const fetcher=async(url:any,options:any)=>{
  assert.equal(options.method,'GET');
  const path=String(url);
  if(path.endsWith('/user'))return json({login:'wauul'});
  if(path.endsWith('/repos/wauul/patchgoblin-lab'))return json({permissions:{push:true},private:false,default_branch:'main'});
  if(path.includes('/issues?'))return json(issues);
  if(path.includes('/comments?'))return json([]);
  throw Error('Unexpected request');
 };
 const limit=await handleApi(request('/jobs',{repo:'wauul/patchgoblin-lab',mode:'builder',key:'new-key-number-123'}),env,fetcher as typeof fetch);
 assert.equal(limit.status,429);
 const retry=await handleApi(request('/jobs',{repo:'wauul/patchgoblin-lab',mode:'builder',key:'existing-key-number-0'}),env,fetcher as typeof fetch);
 assert.equal(retry.status,200);assert.equal((await retry.json()).id,1);
});
test('large canonical lockfile evidence decodes only with a trusted author and valid checksum',async()=>{
 const ownerDigest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('alice|wauul/PatchGoblin'));
 const owner=Array.from(new Uint8Array(ownerDigest)).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,24);
 const lock='package = "fixture"\n'.repeat(4000);
 const raw=Buffer.from(JSON.stringify({status:'verified',patch:{'uv.lock':lock},verification:[{exit_code:0}]}));
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw))).map(b=>b.toString(16).padStart(2,'0')).join('');
 const envelope={encoding:'gzip-base64',bytes:raw.length,sha256:hash,payload:gzipSync(raw).toString('base64')};
 let author='github-actions[bot]';
 const fetcher=async(url:any)=>String(url).includes('/comments?')?json([{user:{login:author},body:'<!-- patchgoblin-state-v1 -->\n'+JSON.stringify(envelope)}]):json({number:7,state:'open',title:'PatchGoblin job repair fixture',user:{login:'wauul'},body:JSON.stringify({owner,repo:'wauul/patchgoblin-lab'})});
 const r=await handleApi(request('/jobs/7'),env,fetcher as typeof fetch);const state=await r.json();
 assert.equal(state.status,'verified');assert.equal(state.patch['uv.lock'],lock);
 author='untrusted-contributor';
 const forged=await handleApi(request('/jobs/7'),env,fetcher as typeof fetch);assert.equal((await forged.json()).status,'queued');
 author='github-actions[bot]';envelope.sha256='0'.repeat(64);
 const damaged=await handleApi(request('/jobs/7'),env,fetcher as typeof fetch);assert.equal((await damaged.json()).status,'queued');
});
