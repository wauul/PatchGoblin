// Explicit verification only: real SDK transport, controlled SQL double, no real jobs.
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {initTelemetry,durableTrace,flushTelemetry} from '../server/telemetry.ts';
import {handleProduct} from '../server/platform.ts';
const local=Object.fromEntries((await readFile('.local/sentry.env','utf8')).split(/\r?\n/).filter(x=>/^[A-Z_]+=/.test(x)).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
const release='patchgoblin@'+execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
initTelemetry({SENTRY_DSN:local.SENTRY_API_DSN,SENTRY_ENVIRONMENT:'verification',SENTRY_VERIFY:'true',SENTRY_RELEASE:release,SENTRY_TRACES_SAMPLE_RATE:'1'});
const traceId=randomUUID().replaceAll('-','');let persisted:Record<string,string>={};
const response=await handleProduct(new Request('https://patchgoblin.vercel.app/api/bootstrap',{headers:{cookie:'__Host-pg-session=controlled-fixture','sentry-trace':`${traceId}-1234567890abcdef-1`}}),{},fetch,async()=>{persisted=durableTrace();throw new TypeError('verification-private-content');});
await flushTelemetry();
const result={at:new Date().toISOString(),runtime:'local Node SDK and actual product catch path with SQL double',release,trace_id:traceId,event_id:response.headers.get('X-Sentry-Event-ID'),request_id:response.headers.get('X-Request-ID'),status:response.status,telemetry:persisted};
await writeFile('.local/sentry/verification/api-parent.json',JSON.stringify(result));
await writeFile('docs/sentry-live-api-verification.json',JSON.stringify({...result,telemetry:undefined},null,2)+'\n');
console.log(JSON.stringify({...result,telemetry:undefined}));
