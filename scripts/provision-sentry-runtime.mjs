// Provision only public DSNs and telemetry settings. The build token is never copied.
import {readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {commitRelease} from './sentry-build.mjs';
const local=Object.fromEntries((await readFile('.local/sentry.env','utf8')).split(/\r?\n/).filter(x=>/^[A-Z_]+=/.test(x)).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
const release=commitRelease();if(!release)throw Error('A commit release is required.');
async function run(command,args,input=''){
 return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:['pipe','pipe','pipe'],shell:false});let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);child.on('error',reject);child.on('exit',async code=>{if(code===0)return resolve();await writeFile('.local/sentry/provision-error.log',output);reject(Error('Runtime provisioning failed; private diagnostics saved.'));});child.stdin.end(input);});
}
const common={SENTRY_ENVIRONMENT:'production',SENTRY_RELEASE:release,SENTRY_ENABLED:'true',SENTRY_ERROR_SAMPLE_RATE:'1',SENTRY_TRACES_SAMPLE_RATE:'0.1',SENTRY_LOGS_ENABLED:'true',SENTRY_LOG_SAMPLE_RATE:'0.1',SENTRY_MAX_EVENTS_PER_MINUTE:'60'};
if(process.argv.includes('--vercel')){
 const settings={...common,SENTRY_DSN:local.SENTRY_API_DSN,SENTRY_RETENTION_MONITOR_SLUG:'new-monitor',VITE_SENTRY_DSN:local.VITE_SENTRY_DSN,VITE_SENTRY_ENVIRONMENT:'production',VITE_SENTRY_ENABLED:'true',VITE_SENTRY_TRACES_SAMPLE_RATE:'0.1',VITE_SENTRY_LOGS_ENABLED:'true',VITE_SENTRY_REPLAY_ENABLED:'false',VITE_SENTRY_REPLAY_PRIVACY_VERIFIED:'false',SENTRY_EXTENSION_DSN:local.SENTRY_EXTENSION_DSN,SENTRY_EXTENSION_ENVIRONMENT:'production'};
 const cli=process.env.APPDATA+'/npm/node_modules/vercel/dist/index.js';
 for(const [key,value] of Object.entries(settings)){if(value===undefined)throw Error('Missing runtime setting '+key);await run(process.execPath,[cli,'env','add',key,'production','--type','config','--yes','--force'],value+'\n');}
 console.log('Vercel public DSNs and runtime settings provisioned; no build token.');
}
if(process.argv.includes('--railway')){
 const variables={...common,SENTRY_DSN:local.SENTRY_WORKER_DSN};if(!variables.SENTRY_DSN)throw Error('Missing worker DSN');
 await writeFile('.local/sentry/runtime.graphql','mutation($input:VariableCollectionUpsertInput!){variableCollectionUpsert(input:$input)}');
 await writeFile('.local/sentry/runtime-vars.json',JSON.stringify({input:{projectId:'c3b25011-ba77-4886-b65e-1cb80d8d2a18',environmentId:'5d649c12-7939-4ba7-9703-3e1367e4f50a',serviceId:'19040b88-a58d-4bf0-92f9-98c4ec0e23f1',skipDeploys:true,replace:false,variables}}));
 await run(process.env.APPDATA+'/npm/node_modules/@railway/cli/bin/railway.exe',['api','--file','.local/sentry/runtime.graphql','--variables','@.local/sentry/runtime-vars.json','--compact']);
 console.log('Railway trusted worker DSN and runtime settings provisioned; no build token.');
}
