// Decode intercepted SDK recordings from disposable fixtures; never send a Replay.
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {writeFile,rm} from 'node:fs/promises';
import {inflateSync,gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const secret='replay-private-canary-824917';
const fixture='web/sentry-replay-verify.ts',html='web/sentry-replay-verify.html';
const env={...process.env,VITE_SENTRY_DSN:'https://12345678901234567890123456789012@o123.ingest.sentry.io/456',VITE_SENTRY_VERIFY:'true',VITE_SENTRY_ENVIRONMENT:'verification',VITE_SENTRY_TRACES_SAMPLE_RATE:'0',VITE_SENTRY_REPLAY_ENABLED:'true',VITE_SENTRY_REPLAY_PRIVACY_VERIFIED:'true'};delete env.SENTRY_AUTH_TOKEN;
await writeFile(html,'<html><body><div id="root"></div><script type="module" src="/sentry-replay-verify.ts"></script></body></html>');
await writeFile(fixture,`const privatePage=location.search.includes('privatePage');history.replaceState({},'',privatePage?'/account':location.search.includes('queryPage')?'/?code=${secret}':'/');document.cookie='fixture=${secret}';document.getElementById('root')!.innerHTML='<p>${secret}</p><input title="${secret}" value="${secret}"><pre>${secret}</pre><code>${secret}</code><div class="logs">${secret}</div><div class="evidence">${secret}</div><div data-sentry-block>${secret}</div><a href="https://github.com/${secret}" aria-label="${secret}">link</a><img src="/image-${secret}">';await import('./telemetry');const Sentry=await import('@sentry/react');(window as any).replayTest={ready:()=>!!Sentry.getReplay(),flush:()=>Sentry.getReplay()?.flush()};`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5198','--strictPort'],{env,stdio:['ignore','pipe','pipe']});let output='';server.stdout.on('data',d=>output+=d);server.stderr.on('data',d=>output+=d);
let browser;const envelopes=[];
function items(buffer){let cursor=buffer.indexOf(10)+1,result=[];while(cursor<buffer.length){const end=buffer.indexOf(10,cursor);if(end<0)break;const header=JSON.parse(buffer.subarray(cursor,end).toString());cursor=end+1;const size=header.length??buffer.indexOf(10,cursor)-cursor;const payload=buffer.subarray(cursor,size<0?buffer.length:cursor+size);result.push({header,payload});cursor+=payload.length;if(buffer[cursor]===10)cursor++;}return result;}
try{
 await new Promise((resolve,reject)=>{const timer=setInterval(()=>{if(output.includes('127.0.0.1:5198')){clearInterval(timer);resolve();}},100);server.on('exit',()=>{clearInterval(timer);reject(Error('Replay fixture server failed'));});setTimeout(()=>{clearInterval(timer);reject(Error('Replay fixture startup timed out'));},15000).unref();});
 browser=await chromium.launch({headless:true});const context=await browser.newContext();
 await context.route('https://*.ingest.*sentry.io/**',async route=>{envelopes.push(route.request().postDataBuffer());await route.fulfill({status:200,contentType:'application/json',body:'{}',headers:{'access-control-allow-origin':'*'}});});
 const page=await context.newPage();await page.goto('http://127.0.0.1:5198/sentry-replay-verify.html');await page.waitForFunction(()=>window.replayTest?.ready());await page.getByRole('textbox').fill(secret+'-input');await page.waitForTimeout(5200);await page.evaluate(()=>window.replayTest.flush());
 const decoded=[];let metadata=0;
 for(const envelope of envelopes)for(const {header,payload}of items(envelope)){
  if(header.type==='replay_event'){metadata++;assert.ok(!payload.toString().includes(secret));}
  if(header.type==='replay_recording'){const recording=payload.subarray(payload.indexOf(10)+1);let text;try{text=inflateSync(recording).toString();}catch{try{text=gunzipSync(recording).toString();}catch{text=recording.toString();}}assert.ok(text.startsWith('['));const events=JSON.parse(text);assert.ok(events.some(event=>event.type===2));const leaks=[];function scan(value,path=[]){if(typeof value==='string'&&value.includes(secret))leaks.push({path:path.join('.'),value:value.slice(0,200)});else if(value&&typeof value==='object')for(const [key,item]of Object.entries(value))scan(item,[...path,key]);}scan(events);assert.deepEqual(leaks,[]);decoded.push(events.length);}
 }
 assert.ok(metadata&&decoded.length);
 const before=envelopes.length;await context.close();const privateContext=await browser.newContext();await privateContext.route('https://*.ingest.*sentry.io/**',async route=>{envelopes.push(route.request().postDataBuffer());await route.fulfill({status:200,body:'{}'});});const privatePage=await privateContext.newPage();await privatePage.goto('http://127.0.0.1:5198/sentry-replay-verify.html?privatePage');await privatePage.waitForFunction(()=>!!window.replayTest);assert.equal(await privatePage.evaluate(()=>window.replayTest.ready()),false);assert.equal(envelopes.length,before);
 await privateContext.close();const queryContext=await browser.newContext();const queryPage=await queryContext.newPage();await queryPage.goto('http://127.0.0.1:5198/sentry-replay-verify.html?queryPage');await queryPage.waitForFunction(()=>!!window.replayTest);assert.equal(await queryPage.evaluate(()=>window.replayTest.ready()),false);
 const result={at:new Date().toISOString(),transport:'intercepted local SDK envelopes; no Sentry Replay uploaded',recordings_decoded:decoded.length,recorded_event_counts:decoded,text_inputs_code_logs_evidence_url_cookie_canaries_removed:true,private_account_route_excluded:true,query_string_route_excluded:true,production_replay_enabled:false};await writeFile('docs/sentry-replay-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();server.kill();await rm(fixture,{force:true});await rm(html,{force:true});}
