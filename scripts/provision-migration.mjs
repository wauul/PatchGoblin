// Deployment credentials are read from ignored files and passed on stdin.
// Never print child-process output that could contain a generated token.
import {readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const env={};
for(const file of ['.env','.local/neon.env','.local/groq.env']){
 for(const line of (await readFile(file,'utf8')).split(/\r?\n/)){
  const match=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);if(match)env[match[1]]=match[2].replace(/^['"]|['"]$/g,'');
 }
}
async function run(command,args,input){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{stdio:['pipe','pipe','pipe'],shell:false});let output='',error='';
  child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>error+=x);
  child.on('error',reject);child.on('exit',async code=>{
   if(code===0)return resolve(output);
   await writeFile('.local/last-provision-error.txt',output+'\n'+error);
   reject(new Error(command+' failed with exit '+code+' (private diagnostic saved)'));
  });
  child.stdin.end(input||'');
 });
}
const ids={projectId:'c3b25011-ba77-4886-b65e-1cb80d8d2a18',environmentId:'5d649c12-7939-4ba7-9703-3e1367e4f50a',serviceId:'19040b88-a58d-4bf0-92f9-98c4ec0e23f1'};
const rail=process.platform==='win32'?process.env.APPDATA+'/npm/node_modules/@railway/cli/bin/railway.exe':'railway';
if(process.argv.includes('--railway')){
 let railwayToken;
 try{railwayToken=(await readFile('.local/railway.env','utf8')).match(/^RAILWAY_TOKEN=(.+)$/m)?.[1];}catch{}
 if(!railwayToken){
  await writeFile('.local/create-token.graphql','mutation($input: ProjectTokenCreateInput!){projectTokenCreate(input:$input)}');
  await writeFile('.local/create-token-vars.json',JSON.stringify({input:{projectId:ids.projectId,environmentId:ids.environmentId,name:'PatchGoblin isolated sandboxes'}}));
  const result=JSON.parse(await run(rail,['api','--file','.local/create-token.graphql','--variables','@.local/create-token-vars.json','--compact']));
  railwayToken=result.data?.projectTokenCreate||result.projectTokenCreate;
  if(typeof railwayToken!=='string')throw Error('Project token creation returned no token');
 }
 let wake;
 try{wake=(await readFile('.local/railway.env','utf8')).match(/^WORKER_WAKE_TOKEN=(.+)$/m)?.[1];}catch{}
 wake||=randomBytes(32).toString('hex');
 await writeFile('.local/railway.env','RAILWAY_TOKEN='+railwayToken+'\nWORKER_WAKE_TOKEN='+wake+'\n');
 await writeFile('.local/variables.graphql','mutation($input:VariableCollectionUpsertInput!){variableCollectionUpsert(input:$input)}');
 await writeFile('.local/variables-vars.json',JSON.stringify({input:{...ids,skipDeploys:true,replace:false,variables:{
  GITHUB_TOKEN:env.GITHUB_TOKEN,GROQ_API_KEY:env.GROQ_API_KEY,DATABASE_URL:env.DATABASE_URL,
  RAILWAY_TOKEN:railwayToken,WORKER_WAKE_TOKEN:wake,OWNER_LOGIN:'wauul',ALLOWED_REPOS:'wauul/patchgoblin-lab',
  MODEL_BASE_URL:'https://api.groq.com/openai/v1',MODEL_NAME:'openai/gpt-oss-20b',MODEL_CONTEXT_TOKENS:'12000',
  MAX_MODEL_TOKENS:'12000',MAX_STEPS:'6',MAX_ATTEMPTS:'2',JOB_TIMEOUT_SECONDS:'600',APP_URL:'https://patchgoblin.vercel.app',PORT:'8080'
 }}}));
 await run(rail,['api','--file','.local/variables.graphql','--variables','@.local/variables-vars.json','--compact']);
 await writeFile('.local/service-config.graphql','mutation($environmentId:String!,$serviceId:String!,$input:ServiceInstanceUpdateInput!){serviceInstanceUpdate(environmentId:$environmentId,serviceId:$serviceId,input:$input)}');
 await writeFile('.local/service-config-vars.json',JSON.stringify({environmentId:ids.environmentId,serviceId:ids.serviceId,input:{sleepApplication:true,numReplicas:1,region:'europe-west4-drams3a',healthcheckPath:'/health',healthcheckTimeout:120,restartPolicyMaxRetries:3,restartPolicyType:'ON_FAILURE',dockerfilePath:'Dockerfile.worker'}}));
 await run(rail,['api','--file','.local/service-config.graphql','--variables','@.local/service-config-vars.json','--compact']);
 console.log('Railway project-scoped credentials and sleeping worker configuration saved.');
}
if(process.argv.includes('--vercel')){
 const more=await readFile('.local/railway.env','utf8');
 const wake=more.match(/^WORKER_WAKE_TOKEN=(.+)$/m)[1];
 const domain=JSON.parse(await run(rail,['domain','list','--service','worker','--json']));
 await writeFile('.local/worker-domain.json',JSON.stringify(domain));
 const domains=domain.domains||domain.serviceDomains||domain;
 const workerDomain=Array.isArray(domains)?domains.find(d=>d.domain||d.domainName):null;
 const url=workerDomain?.domain||workerDomain?.domainName;
 if(!url)throw Error('Worker domain could not be determined; inspect ignored domain metadata');
 const variables={GITHUB_TOKEN:env.GITHUB_TOKEN,DATABASE_URL:env.DATABASE_URL,CONTROL_REPO:'wauul/PatchGoblin',OWNER_LOGIN:'wauul',ALLOWED_REPOS:'wauul/patchgoblin-lab',VERCEL_PRIVATE_OWNER_MODE:'true',WORKER_URL:'https://'+url,WORKER_WAKE_TOKEN:wake};
 // Invoke the installed JS CLI directly; Windows .cmd wrappers require a shell.
 const vercelCli=process.env.APPDATA+'/npm/node_modules/vercel/dist/index.js';
 for(const [key,value] of Object.entries(variables)){
  await run(process.execPath,[vercelCli,'env','add',key,'production','--yes'],value+'\n');
 }
 console.log('Vercel production environment saved; worker endpoint: https://'+url);
}
