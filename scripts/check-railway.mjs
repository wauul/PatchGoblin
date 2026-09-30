import {Sandbox} from 'railway';
import {readFile,writeFile} from 'node:fs/promises';
for(const line of (await readFile('.local/railway.env','utf8')).split(/\r?\n/)){
 const match=line.match(/^([A-Z_]+)=(.*)$/);if(match)process.env[match[1]]=match[2];
}
process.env.RAILWAY_ENVIRONMENT_ID='5d649c12-7939-4ba7-9703-3e1367e4f50a';
let sandbox;
try{
 sandbox=await Sandbox.create({idleTimeoutMinutes:3,networkIsolation:'ISOLATED'});
 await writeFile('.local/sandbox-smoke-id.txt',sandbox.id);
 const result=await sandbox.exec('docker info --format "{{.ServerVersion}}"; python3 --version',{timeoutSec:30});
 console.log(JSON.stringify({id:sandbox.id,exit_code:result.exitCode,output:result.stdout,stderr:result.stderr}));
}catch(error){console.log(JSON.stringify({error:String(error.message).replace(/Bearer\s+\S+|gsk_\S+|postgres(?:ql)?:\/\/\S+/g,'[REDACTED]')}));process.exitCode=1;}
finally{if(sandbox){await sandbox.destroy();console.log('Disposable sandbox destroyed.');}}
