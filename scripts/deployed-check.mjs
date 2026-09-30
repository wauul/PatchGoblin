// Owner-private service verification. Secret is supplied through a raw, non-echoing stdin.
import {writeFileSync,readFileSync} from 'node:fs';
if(process.stdin.isTTY)process.stdin.setRawMode(true);
process.stdin.resume();console.log('Ready for private verification credential on stdin (input is hidden).');
const config=await new Promise(resolve=>{let text='';const collect=chunk=>{text+=chunk;if(/[\r\n]/.test(text)){process.stdin.off('data',collect);resolve(JSON.parse(text.trim()));}};process.stdin.on('data',collect);});process.stdin.pause();
writeFileSync('.local/site-service.json',JSON.stringify(config),{mode:0o600});
const r=await fetch(config.url+'/api/bootstrap',{headers:{'OAI-Sites-Authorization':'Bearer '+config.token}});
console.log(JSON.stringify({status:r.status,body:(await r.text()).replaceAll(config.token,'[REDACTED]')}));
