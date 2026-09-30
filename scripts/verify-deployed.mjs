// QA uses the existing owner service credential on the server side, never browser JavaScript.
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const config=JSON.parse(readFileSync('.local/site-service.json','utf8'));
const jobId=process.argv[2]||'6';
async function call(path,body,origin){
 const r=await fetch(config.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'OAI-Sites-Authorization':'Bearer '+config.token,'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,body:await r.json()};
}
const job=await call('/jobs/'+jobId);assert.equal(job.status,200);
const {repo,mode,run_id,ref,key}=job.body;
const duplicate=await call('/jobs',{repo,mode,run_id,ref,key});
assert.equal(duplicate.status,200);assert.equal(duplicate.body.id,Number(jobId));
const unauthorized=await call('/jobs',{repo:'unapproved/repository',mode:'builder',key:crypto.randomUUID()});assert.equal(unauthorized.status,400);
const crossOrigin=await call('/jobs',{repo,mode,run_id,ref,key},'https://untrusted.example');assert.equal(crossOrigin.status,403);
const history=await call('/jobs');assert.ok(history.body.some(j=>j.id===Number(jobId)));
const anonymous=await fetch(config.url+'/api/bootstrap',{redirect:'manual'});
assert.ok(anonymous.status===302||anonymous.status===401||anonymous.status===403);
const results={at:new Date().toISOString(),url:config.url,job_id:Number(jobId),idempotency:true,unauthorized_repository_rejected:true,cross_origin_rejected:true,persisted_history:true,anonymous_status:anonymous.status,scope:'Deployed owner-private API via existing owner service credential. Browser UI uses a loopback proxy; hosted sign-in remains unverified.'};
writeFileSync('docs/deployed-verification.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results));
