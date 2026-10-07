import test from 'node:test';
import assert from 'node:assert/strict';
import {containsCredential} from '../scripts/check-source-secrets.mjs';
import {volume} from '../telemetry/volume.ts';
test('secret scanner detects provider keys, private keys and database credentials without local env files',()=>{
 for(const text of ['ghp_'+'a'.repeat(30),'gsk_'+'b'.repeat(32),'-----BEGIN '+'PRIVATE KEY-----','postgresql://'+'user:password@database.invalid/app'])assert.equal(containsCredential(text),true);
 assert.equal(containsCredential('TURNSTILE_SECRET=\nDATABASE_URL=\n'),false);
 assert.equal(containsCredential('postgresql://postgres:guardrails-ci-only@127.0.0.1:5432/guardrails'),false);
});
test('error and log telemetry each have a hard per-process cap',()=>{
 const budget=volume({SENTRY_MAX_EVENTS_PER_MINUTE:2,SENTRY_LOG_SAMPLE_RATE:1});
 assert.deepEqual([budget.event(),budget.event(),budget.event()],[true,true,false]);
 assert.deepEqual([budget.log(),budget.log(),budget.log()],[true,true,false]);
});
