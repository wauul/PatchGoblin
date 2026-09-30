// Development verification only: local UI → deployed owner-private API. Browser never sees the credential.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync('.local/site-service.json','utf8'));
createServer(async(req,res)=>{try{
 if(req.headers.origin&&!/^http:\/\/127\.0\.0\.1:\d+$/.test(req.headers.origin)){res.writeHead(403);res.end();return;}
 if(!req.url?.startsWith('/api/')){res.writeHead(404);res.end();return;}
 const chunks:Buffer[]=[];for await(const c of req)chunks.push(c);
 const r=await fetch(config.url+req.url,{method:req.method,headers:{'OAI-Sites-Authorization':'Bearer '+config.token,'Content-Type':'application/json','Origin':config.url},...(req.method!=='GET'&&req.method!=='HEAD'?{body:Buffer.concat(chunks)}:{})});
 res.writeHead(r.status,{'Content-Type':r.headers.get('Content-Type')||'application/json'});res.end(await r.text());
}catch{res.writeHead(502);res.end('{"error":"Deployed API verification proxy unavailable"}');}}).listen(8787,'127.0.0.1',()=>console.log('Local UI is connected to the deployed private backend.'));
