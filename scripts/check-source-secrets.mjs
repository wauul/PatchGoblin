import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const secrets=[];
for(const file of ['.env','.local/neon.env','.local/groq.env','.local/railway.env','.local/github-app.env','.local/product-ops.env']){
 try{for(const line of (await readFile(file,'utf8')).split(/\r?\n/)){const m=line.match(/^([A-Z_]+)=(.*)$/);if(m&&/TOKEN|SECRET|PRIVATE_KEY|ENCRYPTION_KEY|DATABASE_URL|API_KEY/.test(m[1])){const value=m[2].replace(/^['"]|['"]$/g,'');if(value.length>12)secrets.push({name:m[1],value});}}}catch{}
}
const staged=execFileSync('git',['diff','--cached','--text'],{encoding:'utf8',maxBuffer:5_000_000});
let assets='';for(const name of await readdir('dist/client/assets'))if(/\.(js|css)$/.test(name))assets+=await readFile('dist/client/assets/'+name,'utf8');
for(const secret of secrets)if(staged.includes(secret.value)||assets.includes(secret.value))throw Error('Secret detected: '+secret.name);
console.log('Actual provider credentials are absent from staged source and built browser assets.');
