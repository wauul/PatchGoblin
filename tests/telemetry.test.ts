import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import * as Sentry from '@sentry/node';
import {configuration,metadata,route,sanitizeEvent,sanitizeSpan,sanitizeLog,sanitizeReplay,traceMetadata,dataCollection} from '../telemetry/privacy.ts';
import {initTelemetry,captureFault,expectedError,requestScope,durableTrace,flushTelemetry} from '../server/telemetry.ts';
import {ProductError} from '../server/platform-core.ts';
import {handleProduct} from '../server/platform.ts';

const secret='private-repo-ghp_supersecret-prompt';
const dsn='https://12345678901234567890123456789012@o123.ingest.sentry.io/456';
test('disabled/missing/invalid telemetry configuration is inert; verification is explicit',()=>{
 for(const env of [{},{SENTRY_DSN:dsn},{SENTRY_DSN:dsn,SENTRY_ENVIRONMENT:'test'},{SENTRY_DSN:'bad',SENTRY_ENVIRONMENT:'production'},{SENTRY_DSN:dsn,SENTRY_VERIFY:'true',SENTRY_ENABLED:'false'}])assert.equal(configuration(env,'api').enabled,false);
 assert.equal(configuration({SENTRY_DSN:dsn,SENTRY_ENVIRONMENT:'production'},'api').enabled,true);
 assert.equal(configuration({SENTRY_DSN:dsn,SENTRY_VERIFY:'true'},'api').enabled,true);
 assert.equal(configuration({SENTRY_RELEASE:'a'.repeat(40)},'api').release,'patchgoblin@'+'a'.repeat(40));
 assert.equal(dataCollection.genAI.inputs,false);assert.deepEqual(dataCollection.httpBodies,[]);
});
test('privacy rebuilds errors/spans/logs from safe operational metadata',()=>{
 const input={message:secret,user:{email:secret},request:{headers:{authorization:secret},data:secret,url:secret},extra:{code:secret},tags:{service:'api',repo:secret,route:'/api/jobs/123?code='+secret,job_id:'a'.repeat(32)},contexts:{operation:{request_id:'a'.repeat(32),prompt:secret},trace:{trace_id:'b'.repeat(32),span_id:'c'.repeat(16),data:secret}},exception:{values:[{type:'Error',value:secret,stacktrace:{frames:[{filename:'/app/server/platform.ts',lineno:42,vars:{token:secret},context_line:secret},{filename:'https://github.com/'+secret,context_line:secret}]}}]},breadcrumbs:[{category:'console',message:secret}]};
 const clean=sanitizeEvent(input);
 assert.equal(JSON.stringify(clean).includes(secret),false);
 assert.equal(clean.exception.values[0].stacktrace.frames[0].filename,'server/platform.ts');
 assert.equal(clean.tags.route,'/api/jobs/:id');assert.equal(clean.tags.job_id,undefined);
 assert.equal(clean.contexts.operation.request_id,'a'.repeat(32));
 const span=sanitizeSpan({trace_id:'a'.repeat(32),span_id:'b'.repeat(16),name:secret,status:'error',is_segment:true,start_timestamp:1,end_timestamp:2,attributes:{operation:'inference',model:'openai/gpt-oss-20b',prompt:secret,total_tokens:500}});
 assert.equal(JSON.stringify(span).includes(secret),false);assert.equal(span.name,'inference');assert.equal(span.attributes.total_tokens,500);assert.equal(span.status,'error');
 assert.equal(sanitizeLog({message:secret}),null);
 assert.deepEqual(sanitizeLog({message:'cleanup',attributes:{operation:'cleanup',status:'error',console:secret}}).attributes,{operation:'cleanup',status:'error'});
 assert.deepEqual(metadata({stage:secret,model:secret}),{});
 assert.equal(route('/api/jobs/123/submit?repo='+secret),'/api/jobs/:id/submit');
 const replay=sanitizeReplay({type:'replay_event',replay_id:'a'.repeat(32),segment_id:0,replay_type:'session',user:{email:secret},request:{url:secret},urls:['https://patchgoblin.vercel.app/?code='+secret],segment_names:[secret],error_ids:[secret,'b'.repeat(32)]});
 assert.ok(!JSON.stringify(replay).includes(secret));assert.deepEqual(replay.urls,['/']);assert.equal(replay.replay_id,'a'.repeat(32));
});
test('trace persistence bounds input and rejects unvalidated baggage',()=>{
 const parent='a'.repeat(32)+'-'+'b'.repeat(16)+'-1';
 assert.deepEqual(traceMetadata({'sentry-trace':parent,baggage:'private='+secret+',sentry-org_id=123,sentry-sampled=true'}),{'sentry-trace':parent,baggage:'sentry-org_id=123,sentry-sampled=true'});
 for(const trace of ['0'.repeat(32)+'-'+'b'.repeat(16),parent+'\nsecret',secret])assert.deepEqual(traceMetadata({'sentry-trace':trace}),{});
 assert.equal(traceMetadata({'sentry-trace':parent,baggage:'a'.repeat(1025)}).baggage,undefined);
});
test('expected policy failures are separated narrowly from application defects',()=>{
 for(const e of [new ProductError(401,secret),new ProductError(429,secret),new ProductError(503,'Renewal',true),new Error('PG_ACTIVE_JOB')])assert.equal(expectedError(e),true);
 for(const e of [new ProductError(502,secret),new Error('Unexpected crash mentions PG_ACTIVE_JOB'),new TypeError(secret)])assert.equal(expectedError(e),false);
});
test('real SDK transport: caught API faults, deduplication, concurrent isolation and durable parents',async()=>{
 const envelopes:any[]=[];
 initTelemetry({SENTRY_DSN:dsn,SENTRY_ENVIRONMENT:'verification',SENTRY_VERIFY:'true',SENTRY_TRACES_SAMPLE_RATE:'1'}, {transport:()=>({send:async envelope=>{envelopes.push(envelope);return {statusCode:200};},flush:async()=>true})});
 try {
  const parentA='a'.repeat(32)+'-'+'b'.repeat(16)+'-1',parentB='c'.repeat(32)+'-'+'d'.repeat(16)+'-1';
  const traces=await Promise.all([parentA,parentB].map(async parent=>requestScope(new Request('https://patchgoblin.vercel.app/api/jobs',{headers:{'sentry-trace':parent}}),async requestId=>{
   await new Promise(r=>setTimeout(r,parent===parentA?10:1));
   const fault=new TypeError(secret);const first=captureFault(fault,'job');assert.equal(captureFault(fault,'job'),first);
   assert.equal(captureFault(new ProductError(401,secret),'request'),undefined);
   return {requestId,trace:durableTrace()};
  })));
  assert.equal(traces[0].trace['sentry-trace'].slice(0,32),'a'.repeat(32));assert.equal(traces[1].trace['sentry-trace'].slice(0,32),'c'.repeat(32));
  const stored=new Map<string,any>();let wakes=0;
  const raw=JSON.stringify({action:'completed',installation:{id:1},repository:{id:2,full_name:secret},workflow_run:{id:42,status:'completed',conclusion:'failure',head_sha:'a'.repeat(40),head_branch:'main'}});
  const webhookEnv={GITHUB_WEBHOOK_SECRET:'fixture',WORKER_URL:'https://worker.invalid',WORKER_WAKE_TOKEN:'fixture'};
  const headers={'x-hub-signature-256':'sha256='+createHmac('sha256','fixture').update(raw).digest('hex'),'x-github-event':'workflow_run','x-github-delivery':'fixture-delivery'};
  const query=async(sql:string,args:any[]=[])=>{assert.ok(sql.includes('ON CONFLICT(id) DO NOTHING'));if(stored.has(args[0]))return [];stored.set(args[0],JSON.parse(args[4]));return [{id:args[0]}];};
  for(const parent of [parentA,parentB])await handleProduct(new Request('https://patchgoblin.vercel.app/api/github/webhook',{method:'POST',body:raw,headers:{...headers,'sentry-trace':parent,baggage:'secret='+secret}}),webhookEnv,async()=>{wakes++;return new Response(null,{status:202});},query);
  // Duplicate delivery still wakes the worker, preserving the existing retry behavior.
  assert.equal(wakes,2);assert.equal(stored.size,1);
  assert.equal(stored.get('fixture-delivery').telemetry['sentry-trace'].slice(0,32),'a'.repeat(32));
  assert.ok(!JSON.stringify(stored.get('fixture-delivery').telemetry).includes(secret));
  const r=await handleProduct(new Request('https://patchgoblin.vercel.app/api/bootstrap',{headers:{cookie:'__Host-pg-session=opaque'}}),{},fetch,async()=>{throw new Error(secret);});
  assert.equal(r.status,500);assert.ok(r.headers.get('X-Request-ID'));assert.ok(r.headers.get('X-Sentry-Event-ID'));
  await flushTelemetry();
  const events=envelopes.flatMap(e=>e[1]).filter((item:any)=>item[0].type==='event').map((item:any)=>item[1]);
  assert.equal(events.length,3);assert.equal(JSON.stringify(envelopes).includes(secret),false);
  assert.equal(events[0].contexts.operation.request_id===events[1].contexts.operation.request_id,false);
  assert.ok(events.some((e:any)=>e.contexts.trace.trace_id==='a'.repeat(32)));
  const transactions=envelopes.flatMap(e=>e[1]).filter((item:any)=>item[0].type==='transaction').map((item:any)=>item[1]);
  assert.ok(transactions.length>0);
  assert.ok(transactions.every((item:any)=>item.environment==='verification' && item.tags.service==='api'));
  assert.ok(transactions.every((item:any)=>item.contexts.trace.op==='request'));
  assert.ok(transactions.some((item:any)=>item.transaction==='/api/github/webhook' && item.spans.some((span:any)=>span.op==='wake')));
  const countCheckIns=()=>envelopes.flatMap(e=>e[1]).filter((item:any)=>item[0].type==='check_in').map((item:any)=>item[1]);
  const cronEnv={CRON_SECRET:'controlled-fixture'};
  const denied=await handleProduct(new Request('https://patchgoblin.vercel.app/api/retention'),cronEnv,fetch,async()=>{throw Error('Unauthorized cron must not access SQL');});
  assert.equal(denied.status,401);assert.equal(countCheckIns().length,0);
  const cron=()=>new Request('https://patchgoblin.vercel.app/api/retention',{headers:{authorization:'Bearer controlled-fixture'}});
  const completed=await handleProduct(cron(),cronEnv,fetch,async sql=>{assert.equal(sql,'SELECT pg_retention()');return [];});
  assert.equal(completed.status,200);
  const failed=await handleProduct(cron(),cronEnv,fetch,async()=>{throw new TypeError(secret);});
  assert.equal(failed.status,500);
  await flushTelemetry();
  const checkIns=countCheckIns();assert.deepEqual(checkIns.map((item:any)=>item.status),['in_progress','ok','in_progress','error']);
  assert.equal(checkIns[0].check_in_id,checkIns[1].check_in_id);assert.equal(checkIns[2].check_in_id,checkIns[3].check_in_id);
 } finally {await Sentry.close(1000);}
});
