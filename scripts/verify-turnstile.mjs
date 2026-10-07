// Verify the locally stored widget secret without printing it or exporting it.
// A dummy response only establishes secret validity; it is not a real-token test.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const env=Object.fromEntries((await readFile('.local/guardrails.env','utf8')).trim().split(/\r?\n/).map(line=>line.split(/=(.*)/s).slice(0,2)));
assert.ok(env.TURNSTILE_SECRET&&env.TURNSTILE_SITE_KEY,'Local widget configuration required');
const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret:env.TURNSTILE_SECRET,response:'XXXX.DUMMY.TOKEN.XXXX'}),signal:AbortSignal.timeout(10000)});
assert.equal(response.status,200,'Siteverify unavailable');
const result=await response.json();
assert.equal(result.success,false);
assert.ok(result['error-codes']?.includes('invalid-input-response')&&!result['error-codes']?.includes('invalid-input-secret'),'Widget secret validity could not be confirmed');
console.log('Turnstile secret accepted; dummy token rejected. Fresh real-token success/replay verification still required.');
