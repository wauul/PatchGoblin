// Private line protocol from the Python worker. No repository or model string
// is ever interpolated into a VM shell command. Credentials stay in this process.
import {Sandbox} from 'railway';
import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
let sandbox;
const methods={
 async init(input){
  sandbox=await Sandbox.create({idleTimeoutMinutes:3,networkIsolation:'ISOLATED'});
  process.stdout.write(JSON.stringify({event:'created',sandbox_id:sandbox.id})+'\n');
  // No env, domains, secrets, or environment private-network access on the VM.
  for(const name of ['sandbox_rpc.py','sandbox.py','project.py','security.py','github.py','state_codec.py']){
   await sandbox.files.write('/opt/patchgoblin/worker/'+name,await readFile(new URL('../worker/'+name,import.meta.url),'utf8'));
  }
  await sandbox.files.write('/opt/patchgoblin/worker/__init__.py','');
  const setup=await sandbox.exec('python3 -m venv /opt/patchgoblin/venv && /opt/patchgoblin/venv/bin/pip install --disable-pip-version-check httpx==0.28.1 PyYAML==6.0.3 packaging==25.0',{timeoutSec:120});
  if(setup.exitCode!==0)throw Error('Trusted sandbox tool setup failed');
  const result=await methods.run({...input,op:'init'});return {...result,sandbox_id:sandbox.id};
 },
 async run(input){
  if(!sandbox)throw Error('Sandbox is not initialized');
  await sandbox.files.write('/opt/patchgoblin/request.json',JSON.stringify(input));
  const result=await sandbox.exec('/opt/patchgoblin/venv/bin/python -m worker.sandbox_rpc',{cwd:'/opt/patchgoblin',timeoutSec:Math.min(300,input.remaining_seconds||120)});
  if(result.timedOut||result.exitCode!==0)throw Error('Remote sandbox command failed or exceeded its deadline');
  const text=await sandbox.files.read('/opt/patchgoblin/result.json');if(text.length>250000)throw Error('Sandbox result exceeds transfer budget');
  return JSON.parse(text);
 },
 async close(){if(sandbox){await sandbox.destroy();sandbox=null;}return {closed:true};},
 async destroy(input){const vm=await Sandbox.connect(input.sandbox_id);await vm.destroy();return {closed:true};}
};
try{
 for await(const line of createInterface({input:process.stdin})){
  try{const input=JSON.parse(line);if(!Object.hasOwn(methods,input.op))throw Error('Unknown bridge operation');process.stdout.write(JSON.stringify(await methods[input.op](input))+'\n');}
  catch{process.stdout.write(JSON.stringify({error:'Railway sandbox operation failed; inspect deployment access and resource limits.'})+'\n');}
 }
}finally{await methods.close().catch(()=>{});}
