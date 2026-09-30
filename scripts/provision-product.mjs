// Add only this project's secrets. No credential is printed or passed on command lines.
import {readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const values={};
for(const name of ['.env','.local/neon.env','.local/groq.env','.local/railway.env','.local/github-app.env']){
 for(const line of (await readFile(name,'utf8')).split(/\r?\n/)){const match=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);if(match)values[match[1]]=match[2].replace(/^['"]|['"]$/g,'');}
}
async function run(command,args,input){return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:['pipe','pipe','pipe'],shell:false});let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.on('error',reject);child.on('exit',async code=>{if(code===0)return resolve(out);await writeFile('.local/product-provision-error.txt',out+'\n'+err);reject(Error('Provisioning failed; private diagnostics saved.'));});child.stdin.end(input||'');});}
const rail=process.env.APPDATA+'/npm/node_modules/@railway/cli/bin/railway.exe';
if(process.argv.includes('--railway')){
 const variables=Object.fromEntries(['GITHUB_APP_ID','GITHUB_APP_PRIVATE_KEY_B64','GITHUB_APP_SLUG'].map(k=>[k,values[k]]));
 await writeFile('.local/product-railway.graphql','mutation($input:VariableCollectionUpsertInput!){variableCollectionUpsert(input:$input)}');
 await writeFile('.local/product-railway-vars.json',JSON.stringify({input:{projectId:'c3b25011-ba77-4886-b65e-1cb80d8d2a18',environmentId:'5d649c12-7939-4ba7-9703-3e1367e4f50a',serviceId:'19040b88-a58d-4bf0-92f9-98c4ec0e23f1',skipDeploys:true,replace:false,variables}}));
 await run(rail,['api','--file','.local/product-railway.graphql','--variables','@.local/product-railway-vars.json','--compact']);
 console.log('Worker installation credentials provisioned.');
}
if(process.argv.includes('--vercel')){
 const userResponse=await fetch('https://api.github.com/user',{headers:{Authorization:'Bearer '+values.GITHUB_TOKEN,Accept:'application/vnd.github+json'}});if(!userResponse.ok)throw Error('Cannot verify original operator ID');const user=await userResponse.json();if(user.login!=='wauul')throw Error('Operator mismatch');
 let cron;try{cron=(await readFile('.local/product-ops.env','utf8')).match(/^CRON_SECRET=(.*)$/m)?.[1];}catch{}cron||=randomBytes(32).toString('hex');await writeFile('.local/product-ops.env','CRON_SECRET='+cron+'\n');
 const env=Object.fromEntries(['GITHUB_APP_ID','GITHUB_APP_SLUG','GITHUB_CLIENT_ID','GITHUB_CLIENT_SECRET','GITHUB_APP_PRIVATE_KEY_B64','GITHUB_WEBHOOK_SECRET','TOKEN_ENCRYPTION_KEY','APP_URL'].map(k=>[k,values[k]]));env.LEGACY_GITHUB_ACCOUNT_ID=String(user.id);env.CRON_SECRET=cron;
 const cli=process.env.APPDATA+'/npm/node_modules/vercel/dist/index.js';for(const [name,value] of Object.entries(env))await run(process.execPath,[cli,'env','add',name,'production','--yes'],value+'\n');
 console.log('GitHub OAuth, App, encryption and retention secrets provisioned on Vercel.');
}
