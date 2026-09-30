import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {handleProduct} from '../server/platform.js';
const env:Record<string,string>={};
for(const file of ['.local/neon.env','.local/github-app.env','.local/github-oauth.env','.local/railway.env'])for(const line of readFileSync(file,'utf8').split(/\r?\n/)){const m=line.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2];}
env.WORKER_URL='https://worker-production-ac16.up.railway.app';
createServer(async(req,res)=>{try{const chunks:Buffer[]=[];for await(const c of req)chunks.push(c);const request=new Request('http://127.0.0.1:8792'+req.url,{method:req.method,headers:req.headers as Record<string,string>,...(req.method!=='GET'&&req.method!=='HEAD'?{body:Buffer.concat(chunks)}:{})});const result=await handleProduct(request,env);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());}catch{res.writeHead(500);res.end('Local API error');}}).listen(8792,'127.0.0.1',()=>console.log('Product API: http://127.0.0.1:8792'));
