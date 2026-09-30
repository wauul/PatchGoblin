// Run operations against the deployed backend using the existing private service credential.
import {readFileSync,writeFileSync} from 'node:fs';
const config=JSON.parse(readFileSync('.local/site-service.json','utf8'));
const command=process.argv[2], arg=process.argv[3];
let path='/api/bootstrap',body;
if(command==='runs')path='/api/runs?repo=wauul/patchgoblin-lab';
if(command==='history')path='/api/jobs';
if(command==='start'){path='/api/jobs';body={repo:'wauul/patchgoblin-lab',mode:arg,ref:'main',run_id:arg==='repair'?36706671284:null,key:crypto.randomUUID()};}
if(['job','submit','cancel'].includes(command)){path='/api/jobs/'+arg+(command==='job'?'':'/'+command);if(command!=='job')body={};}
const r=await fetch(config.url+path,{method:body===undefined?'GET':'POST',headers:{'OAI-Sites-Authorization':'Bearer '+config.token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
const text=await r.text();console.log(JSON.stringify({status:r.status,body:JSON.parse(text)}));
if(command==='start'&&r.ok)writeFileSync('.local/last-job.json',text);
