// Actual authenticated retention handler with a SQL double: no real deletion.
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import * as Sentry from '@sentry/node';
import {initTelemetry,flushTelemetry} from '../server/telemetry.ts';
import {handleProduct} from '../server/platform.ts';
const local=Object.fromEntries((await readFile('.local/sentry.env','utf8')).split(/\r?\n/).filter(x=>/^[A-Z_]+=/.test(x)).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
const release='patchgoblin@'+execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
process.env.SENTRY_RETENTION_MONITOR_SLUG='new-monitor';
initTelemetry({SENTRY_DSN:local.SENTRY_API_DSN,SENTRY_ENVIRONMENT:'production',SENTRY_RELEASE:release,SENTRY_TRACES_SAMPLE_RATE:'1'});
let calls=0;
const response=await handleProduct(new Request('https://patchgoblin.vercel.app/api/retention',{headers:{authorization:'Bearer controlled-fixture'}}),{CRON_SECRET:'controlled-fixture'},async()=>{throw Error('No worker or external request expected');},async sql=>{assert.equal(sql,'SELECT pg_retention()');calls++;return [];});
assert.equal(response.status,200);assert.equal(calls,1);
await flushTelemetry();await Sentry.close(5000);
const result={at:new Date().toISOString(),release,monitor_slug:'new-monitor',status:response.status,source:'local actual authenticated retention handler with controlled SQL double; no production database mutation; scheduled Vercel execution still pending'};
await writeFile('docs/sentry-cron-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
