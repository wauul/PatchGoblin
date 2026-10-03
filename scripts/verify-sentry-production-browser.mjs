// Controlled anonymous responses and actual deployed artifacts. No user jobs.
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {unzipSync} from 'fflate';
const {chromium}=createRequire(import.meta.url)('playwright');
const base='https://patchgoblin.vercel.app',dir=path.resolve('.local/sentry/verification/production');await mkdir(dir,{recursive:true});
const bodies={frontend:[],extension:[]};let browser,extension;
const collect=service=>async route=>{bodies[service].push(route.request().postData()||'');await route.continue();};
try{
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.route('https://*.ingest.*sentry.io/**',collect('frontend'));
 await context.route(base+'/api/bootstrap',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"fixture-private-content"}'}));
 const page=await context.newPage();const delivery=page.waitForResponse(r=>r.url().includes('.ingest.')&&r.request().method()==='POST');
 await page.goto(base+'/dashboard');await page.getByRole('button',{name:'Retry connection',exact:true}).waitFor();assert.equal((await delivery).status(),200);
 await page.screenshot({path:dir+'/frontend-handled-failure.png',fullPage:true});
 let propagated;
 if(process.argv.includes('--protected-trace')){
  const token=(await readFile('.local/sentry/deploy-verify.token','utf8')).trim();
  propagated=await page.evaluate(async token=>{const response=await fetch('/api/__sentry_verify',{method:'POST',headers:{'X-PatchGoblin-Verify':token}});return {status:response.status,...await response.json()};},token);
  assert.equal(propagated.status,500);assert.ok(propagated.event_id&&propagated.worker_event_id);
 }
 const download=await fetch(base+'/patchgoblin-extension.zip');assert.equal(download.status,200);
 const zip=unzipSync(new Uint8Array(await download.arrayBuffer()));const manifest=JSON.parse(new TextDecoder().decode(zip['manifest.json']));assert.equal(manifest.version,'2.0.1');
 const unpack=dir+'/unpacked';await mkdir(unpack,{recursive:true});
 for(const [name,data]of Object.entries(zip)){assert.ok(!name.endsWith('.map'));const target=path.resolve(unpack,name);assert.ok(target.startsWith(path.resolve(unpack)+path.sep));await mkdir(path.dirname(target),{recursive:true});await writeFile(target,data);}
 extension=await chromium.launchPersistentContext(dir+'/profile',{headless:true,executablePath:process.env.SENTRY_VERIFY_BROWSER_EXECUTABLE,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging'],viewport:{width:420,height:660}});
 await extension.route('https://*.ingest.*sentry.io/**',collect('extension'));
 await extension.route(base+'/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"fixture-private-content"}'}));
 const cdp=await extension.browser().newBrowserCDPSession();const {id}=await cdp.send('Extensions.loadUnpacked',{path:path.resolve(unpack)});
 const popup=await extension.newPage();await popup.addInitScript(()=>{chrome.tabs.query=async()=>[{url:'https://github.com/example/fixture'}];});
 const popupDelivery=popup.waitForResponse(r=>r.url().includes('.ingest.')&&r.request().method()==='POST');await popup.goto(`chrome-extension://${id}/popup.html`);assert.equal((await popupDelivery).status(),200);
 await popup.screenshot({path:dir+'/extension-handled-failure.png',fullPage:true});await popup.close();
 const events={};for(const [service,envelopes]of Object.entries(bodies)){
  assert.ok(envelopes.length);assert.ok(envelopes.every(body=>!body.includes('fixture-private-content')&&!body.includes('example/fixture')));
  events[service]=envelopes.flatMap(body=>{const lines=body.split('\n'),items=[];for(let i=1;i<lines.length-1;i++){try{if(JSON.parse(lines[i]).type==='event')items.push(JSON.parse(lines[i+1]));}catch{}}return items;});
 }
 assert.ok(events.frontend.length&&events.extension.length);
 if(propagated)assert.equal(propagated.trace_id,events.frontend[0].contexts.trace.trace_id);
 const result={at:new Date().toISOString(),source:'actual production web bundle and downloaded extension ZIP; controlled anonymous API fixtures',
  event_ids:Object.fromEntries(Object.entries(events).map(([service,list])=>[service,list.map(e=>e.event_id)])),
  releases:Object.fromEntries(Object.entries(events).map(([service,list])=>[service,list.map(e=>e.release)])),
  browser_api_worker:propagated,privacy_canaries_removed:true,extension_version:manifest.version,native_mv3_loaded:true};
 await writeFile('docs/sentry-production-browser-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await extension?.close();}
