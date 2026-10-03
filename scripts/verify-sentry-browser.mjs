// Controlled fixtures only. No production endpoint, real account or repository jobs.
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {unzipSync} from 'fflate';
const {chromium}=createRequire(import.meta.url)('playwright');
const dir=path.resolve('.local/sentry/verification');await mkdir(dir,{recursive:true});
const fake='https://12345678901234567890123456789012@o123.ingest.sentry.io/456';
const live=process.env.SENTRY_LIVE_VERIFY==='true';
const env={...process.env,VITE_SENTRY_DSN:live?process.env.VITE_SENTRY_DSN:fake,VITE_SENTRY_VERIFY:'true',VITE_SENTRY_ENVIRONMENT:'verification',VITE_SENTRY_TRACES_SAMPLE_RATE:'1',SENTRY_EXTENSION_DSN:live?process.env.SENTRY_EXTENSION_DSN:fake,SENTRY_EXTENSION_ENVIRONMENT:'verification',SENTRY_VERIFY:'true',SENTRY_VERIFICATION_PACKAGE:'true'};
if(!live)delete env.SENTRY_AUTH_TOKEN;
const build=spawn(process.execPath,['scripts/build-extension.mjs'],{env,stdio:'inherit'});
await new Promise((resolve,reject)=>{build.on('exit',code=>code===0?resolve():reject(Error('Verification extension build failed')));build.on('error',reject);});
const fixture=path.resolve('web/sentry-verify.tsx');
const fixtureHtml=path.resolve('web/sentry-verify.html');
await writeFile(fixture,`import React from 'react';import{createRoot}from'react-dom/client';import RecoveryBoundary from './RecoveryBoundary';function Crash(){throw new Error('fixture-private-content');return null}createRoot(document.getElementById('root')!).render(<RecoveryBoundary><Crash/></RecoveryBoundary>);`);
await writeFile(fixtureHtml,'<html lang="en"><head><script src="/theme-init.js"></script></head><body><div id="root"></div><script type="module" src="/sentry-verify.tsx"></script></body></html>');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5199','--strictPort'],{env,stdio:['ignore','pipe','pipe']});
let serverOutput='';server.stdout.on('data',d=>serverOutput+=d);server.stderr.on('data',d=>serverOutput+=d);
let browser,extensionBrowser;
const received={frontend:[],extension:[]};
try {
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Verification dev server did not start: '+serverOutput.slice(-2000))),60000);const tick=setInterval(()=>{if(serverOutput.includes('127.0.0.1:5199')){clearTimeout(timeout);clearInterval(tick);resolve();}},200);server.on('exit',()=>{clearInterval(tick);clearTimeout(timeout);reject(Error('Verification server stopped'));});});
 browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({viewport:{width:390,height:844}});
 await ctx.route('https://*.ingest.*sentry.io/**',async r=>{received.frontend.push(r.request().postData());if(live)await r.continue();else await r.fulfill({status:200,contentType:'application/json',body:'{}',headers:{'access-control-allow-origin':'*'}});});
 const page=await ctx.newPage();
 const firstDelivery=page.waitForResponse(r=>r.url().includes('.ingest.')&&r.request().method()==='POST');
 await page.goto('http://127.0.0.1:5199/sentry-verify.html');
 await page.getByRole('button',{name:'Reload page'}).waitFor();
 await page.screenshot({path:dir+'/recovery-en.png',fullPage:true});
 const count=await page.locator('[role=alert]').count();assert.equal(count,1);
 const primary=await page.getByRole('button',{name:'Reload page'}).boundingBox();assert.ok(primary.height>=44);
 await page.waitForFunction(()=>document.querySelector('small'));
 assert.equal((await firstDelivery).status(),200);
 await page.evaluate(()=>localStorage.setItem('patchgoblin-language','fr'));await page.reload();
 await page.getByRole('button',{name:'Recharger la page'}).waitFor();await page.screenshot({path:dir+'/recovery-fr.png',fullPage:true});
 await page.getByRole('button',{name:'Recharger la page'}).click();await page.getByRole('button',{name:'Recharger la page'}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const zip=unzipSync(new Uint8Array(await readFile(dir+'/patchgoblin-extension.zip')));
 const unpack=dir+'/unpacked';await mkdir(unpack,{recursive:true});
 for(const [name,data]of Object.entries(zip)){assert.ok(!name.endsWith('.map'));const output=path.join(unpack,name);assert.ok(output.startsWith(path.resolve(unpack)+path.sep));await mkdir(path.dirname(output),{recursive:true});await writeFile(output,data);}
 extensionBrowser=await chromium.launchPersistentContext(dir+'/chromium-profile',{headless:true,...(process.env.SENTRY_VERIFY_BROWSER_EXECUTABLE?{executablePath:process.env.SENTRY_VERIFY_BROWSER_EXECUTABLE}:{channel:process.env.SENTRY_VERIFY_BROWSER_CHANNEL||'chromium'}),ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging'],viewport:{width:420,height:660}});
 await extensionBrowser.route('https://*.ingest.*sentry.io/**',async r=>{received.extension.push(r.request().postData());if(live)await r.continue();else await r.fulfill({status:200,contentType:'application/json',body:'{}',headers:{'access-control-allow-origin':'*'}});});
 await extensionBrowser.route('https://patchgoblin.vercel.app/api/**',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"fixture-private-content"}'}));
 const extensions=await extensionBrowser.newPage();
 const debuggerSession=await extensionBrowser.browser().newBrowserCDPSession();
 const {id}=await debuggerSession.send('Extensions.loadUnpacked',{path:path.resolve(unpack)});assert.ok(id);
 const github=await extensionBrowser.newPage();await github.route('https://github.com/**',r=>r.fulfill({contentType:'text/html',body:'<h1>Controlled test tab</h1>'}));await github.goto('https://github.com/example/fixture');
 const popup=await extensionBrowser.newPage();
 // A browser action popup is not the active tab. Supply only its controlled URL.
 await popup.addInitScript(()=>{chrome.tabs.query=async()=>[{url:'https://github.com/example/fixture'}];});
 const handledDelivery=popup.waitForResponse(r=>r.url().includes('.ingest.')&&r.request().method()==='POST');
 await popup.goto(`chrome-extension://${id}/popup.html`);
 assert.equal((await handledDelivery).status(),200);
 await popup.locator('#open').waitFor();await popup.screenshot({path:dir+'/extension-popup.png',fullPage:true});
 const popupDelivery=popup.waitForResponse(r=>r.url().includes('.ingest.')&&r.request().method()==='POST');
 await popup.evaluate(()=>queueMicrotask(()=>{throw new Error('fixture-private-content');}));
 await new Promise((resolve,reject)=>{const deadline=Date.now()+10000;const tick=setInterval(()=>{if(received.extension.length){clearInterval(tick);resolve();}else if(Date.now()>deadline){clearInterval(tick);reject(Error('No popup telemetry envelope'));}},50);});
 assert.equal((await popupDelivery).status(),200);
 await popup.close();
 for(const envelopes of Object.values(received)){assert.ok(envelopes.length);for(const body of envelopes){assert.ok(!body.includes('fixture-private-content'));assert.ok(!body.includes('example/fixture'));}}
 const ids=Object.fromEntries(Object.entries(received).map(([service,bodies])=>[service,bodies.map(body=>{try{return JSON.parse(body.split('\n')[0]).event_id;}catch{return;}}).filter(Boolean)]));
 const result={at:new Date().toISOString(),frontend_recovery:{english:true,french:true,reload:true,width:390,button_height:primary.height},packaged_extension:{manifest_v3:true,native_chromium_load:true,isolated_popup:true,shutdown:true},transport:live?'Actual Sentry network delivery attempted; receipt must be confirmed in Sentry':'Playwright intercept of actual SDK envelopes; not Sentry SaaS receipt',frontend_envelopes:received.frontend.length,extension_envelopes:received.extension.length,event_ids:ids,privacy_canaries_removed:true};
 await writeFile(live?'docs/sentry-live-browser-verification.json':'docs/sentry-browser-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
} finally {
 await browser?.close();await extensionBrowser?.close();server.kill();
 // Delete only the exact temporary fixture created above, inside the workspace.
 await rm(fixture,{force:true});
 await rm(fixtureHtml,{force:true});
}
