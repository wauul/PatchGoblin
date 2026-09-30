// Temporary loopback-only setup flow. Tokens never enter stdout or source control.
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
const server=createServer(async(req,res)=>{
 if(req.method==='GET'){res.setHeader('Content-Type','text/html');res.end('<html><title>PatchGoblin secure setup</title><body><h1>PatchGoblin integration setup</h1><form method="POST"><label>Scoped GitHub token <input name="token" type="password" autocomplete="off" required></label><button>Store locally</button></form></body></html>');return;}
 if(req.headers.origin!=='http://127.0.0.1:8790'){res.writeHead(403);res.end();return;}
 let body='';for await(const chunk of req){body+=chunk;if(body.length>2048){res.writeHead(413);res.end();return;}}
 const token=new URLSearchParams(body).get('token');if(!token?.startsWith('github_pat_')){res.writeHead(400);res.end('Invalid token format');return;}
 await mkdir('.local',{recursive:true});await writeFile('.env',`GITHUB_TOKEN=${token}\nCONTROL_REPO=wauul/PatchGoblin\nALLOWED_REPOS=wauul/patchgoblin-lab\nOWNER_LOGIN=wauul\n`,{mode:0o600});
 res.setHeader('Content-Type','text/html');res.end('<h1>Integration stored</h1><p>The scoped credential is in your ignored local environment file.</p>');
 console.log('Scoped credential stored.');setTimeout(()=>server.close(),500);
});server.listen(8790,'127.0.0.1',()=>console.log('Loopback credential setup ready.'));
