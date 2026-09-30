import {BACKEND,recognize,actionUrl} from './context.js';
const browserApi=globalThis.chrome||globalThis.browser;
const status=document.getElementById('status');
let context=null;
function open(url){browserApi.tabs.create({url});}
document.getElementById('open').addEventListener('click',()=>open(actionUrl(context)));
document.getElementById('repair').addEventListener('click',()=>open(actionUrl(context,'repair')));
document.getElementById('builder').addEventListener('click',()=>open(actionUrl(context,'builder')));
document.getElementById('install').addEventListener('click',()=>open('https://github.com/apps/patchgoblin-ci/installations/new'));
async function initialize(){
 const [tab]=await browserApi.tabs.query({active:true,currentWindow:true});context=recognize(tab?.url);
 document.getElementById('repository').textContent=context?.repo||'A little help for your CI.';
 if(!context){status.textContent='Open a GitHub repository or Actions run to use repository actions.';return;}
 try{
  const url=new URL('/api/extension/status',BACKEND);url.searchParams.set('repo',context.repo);if(context.run)url.searchParams.set('run',context.run);
  const response=await fetch(url,{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(response.status===401){status.textContent='Sign in on PatchGoblin to check installation and job status. Then reopen this popup.';return;}
  if(!response.ok)throw Error('Backend status is unavailable');
  const data=await response.json();
  if(!data.installed){status.textContent='This repository is not available in your selected installation. Install the App or refresh access in the web dashboard.';document.getElementById('install').hidden=false;return;}
  status.textContent=`Installed · ${data.enabled&&!data.paused?'Available':data.paused?'Paused':'Disabled'} · ${data.can_push?'Write access':'Read access'}`;
  const available=data.enabled&&!data.paused&&data.can_push;
  document.getElementById('repair').disabled=!(available&&context.run&&data.run_conclusion==='failure');
  document.getElementById('builder').disabled=!(available&&data.workflow_count===0);
  for(const job of data.jobs){const a=document.createElement('a');a.textContent=`Job #${job.id} · ${job.mode} · ${job.status}`;a.href=BACKEND+'/workbench?job='+job.id;a.addEventListener('click',event=>{event.preventDefault();open(a.href);});document.getElementById('jobs').append(a);}
 }catch{status.textContent='PatchGoblin is unavailable or your browser blocks session cookies. Open the web app to reconnect; no job was started.';}
}
initialize().catch(()=>{status.textContent='This browser could not read the active tab. Open PatchGoblin directly.';});
