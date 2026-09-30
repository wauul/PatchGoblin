// One-time supported manifest registration. Secret conversion happens only on the server.
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {writeFile, mkdir} from 'node:fs/promises';
const origin='https://patchgoblin.vercel.app';
const state=randomBytes(32).toString('hex');
const manifest={name:'PatchGoblin CI',url:origin,description:'Evidence-backed CI repair, pipeline creation and maintenance. Verified pull requests; never automatic merges.',
 public:true,redirect_url:'http://127.0.0.1:8791/callback',callback_urls:[origin+'/api/auth/callback'],
 setup_url:origin+'/api/github/setup',setup_on_update:true,request_oauth_on_install:false,
 hook_attributes:{url:origin+'/api/github/webhook',active:true},
 default_permissions:{actions:'read',contents:'write',pull_requests:'write',workflows:'write',checks:'write',metadata:'read'},
 default_events:['workflow_run','push','pull_request','check_run']};
const escape=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:8791');
  if(url.pathname==='/'){
   res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});
   return res.end(`<h1>Register PatchGoblin GitHub App</h1><p>Public App with selected repository installations. Contents, workflows, pull requests and checks write; Actions and metadata read. No secrets, administration or merge automation.</p><form method="post" action="https://github.com/settings/apps/new?state=${state}"><input type="hidden" name="manifest" value="${escape(JSON.stringify(manifest))}"><button>Register on GitHub</button></form>`);
  }
  if(url.pathname==='/callback'&&url.searchParams.get('state')===state&&url.searchParams.has('code')){
   const response=await fetch('https://api.github.com/app-manifests/'+encodeURIComponent(url.searchParams.get('code'))+'/conversions',{method:'POST',headers:{Accept:'application/vnd.github+json','User-Agent':'PatchGoblin'}});
   if(!response.ok)throw new Error('Manifest conversion HTTP '+response.status);
   const app=await response.json();
   const settings={GITHUB_APP_ID:String(app.id),GITHUB_APP_SLUG:app.slug,GITHUB_CLIENT_ID:app.client_id,GITHUB_CLIENT_SECRET:app.client_secret,
    GITHUB_APP_PRIVATE_KEY_B64:Buffer.from(app.pem).toString('base64'),GITHUB_WEBHOOK_SECRET:app.webhook_secret,TOKEN_ENCRYPTION_KEY:randomBytes(32).toString('hex'),APP_URL:origin};
   await mkdir('.local',{recursive:true});
   await writeFile('.local/github-app.env',Object.entries(settings).map(([k,v])=>k+'='+v).join('\n')+'\n');
   await writeFile('.local/github-app-metadata.json',JSON.stringify({id:app.id,slug:app.slug,html_url:app.html_url,permissions:app.permissions,events:app.events},null,2));
   res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});
   res.end(`<h1>GitHub App registered</h1><p>${escape(app.slug)} · ID ${app.id}</p><p>Credentials saved privately on the development machine. No credentials are exposed here.</p><a href="${escape(app.html_url)}">View GitHub App</a>`);
   console.log(JSON.stringify({registered:true,id:app.id,slug:app.slug}));
   return;
  }
  res.writeHead(404);res.end('Not found');
 }catch(error){res.writeHead(500);res.end('Registration failed. Check the supported manifest configuration.');console.error(error.message.replace(/code=\S+/g,'code=[redacted]'));}
});
server.listen(8791,'127.0.0.1',()=>console.log('GitHub App registration server: http://127.0.0.1:8791'));
