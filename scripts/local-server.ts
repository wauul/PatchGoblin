import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {handleApi} from '../server/api';
const env:Record<string,string>={...process.env} as Record<string,string>;
if(existsSync('.env'))for(const line of readFileSync('.env','utf8').split(/\r?\n/)){const m=line.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2];}
env.LOCAL_USER='local-owner';
createServer(async(req,res)=>{try{const chunks:Buffer[]=[];for await(const c of req)chunks.push(c);const request=new Request('http://127.0.0.1:8787'+req.url,{method:req.method,headers:req.headers as Record<string,string>,...(req.method!=='GET'&&req.method!=='HEAD'?{body:Buffer.concat(chunks)}:{})});const r=await handleApi(request,env);res.writeHead(r.status,Object.fromEntries(r.headers));res.end(await r.text());}catch{res.writeHead(500);res.end('Local server error');}}).listen(8787,'127.0.0.1',()=>console.log('Local API: http://127.0.0.1:8787'));
