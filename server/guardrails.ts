import {createHmac,randomBytes} from 'node:crypto';
import {isIP} from 'node:net';
import {ProductError,type ProductEnv,type Query} from './platform-core.js';

// Only the Vercel entry point may trust this platform-overwritten header.
export function clientIp(req:Request,env:ProductEnv):string {
 const value=env.VERCEL==='1'?req.headers.get('x-vercel-forwarded-for'):null;
 if(value&&isIP(value))return isIP(value)===6?new URL(`http://[${value}]/`).hostname.slice(1,-1):value;
 const url=new URL(req.url),app=new URL(env.APP_URL||'https://patchgoblin.vercel.app');
 if(env.VERCEL!=='1'&&['127.0.0.1','localhost'].includes(url.hostname)&&['127.0.0.1','localhost'].includes(app.hostname))return '127.0.0.1';
 throw new ProductError(503,'Trusted request identity is unavailable.',true);
}
export async function limitedText(body:Request|Response,max:number):Promise<string> {
 const length=body.headers.get('content-length');
 if(length&&(!/^\d+$/.test(length)||Number(length)>max))throw new ProductError(413,'Request is too large.');
 if(!body.body)return '';
 const reader=body.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>max)throw new ProductError(413,'Request is too large.');chunks.push(next.value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
export function checkMethod(path:string,method:string){
 const methods:Record<string,string[]>={
  '/api/public':['GET'],'/api/bootstrap':['GET'],'/api/auth/login':['GET','POST'],
  '/api/auth/callback':['GET'],'/api/github/webhook':['POST'],'/api/retention':['GET'],
  '/api/auth/logout':['POST'],'/api/github/connect':['GET'],'/api/github/setup':['GET'],
  '/api/github/sync':['POST'],'/api/account/onboarding':['POST'],'/api/account/export':['GET'],
  '/api/account/delete':['POST'],'/api/repositories/settings':['POST'],
  '/api/repositories/health':['GET'],'/api/extension/status':['GET'],'/api/runs':['GET'],
  '/api/jobs':['GET','POST'],
 };
 const allowed=methods[path]||( /^\/api\/jobs\/\d+$/.test(path)?['GET']: /^\/api\/jobs\/\d+\/(cancel|sync|submit)$/.test(path)?['POST']:null);
 if(!allowed)throw new ProductError(404,'Endpoint not found.');
 if(!allowed.includes(method))throw new ProductError(405,'Method is not allowed.');
}
export class Guardrails {
 constructor(private sql:Query,private env:ProductEnv){}
 async rate(subject:string,scope:string,limit:number,seconds=60){
  const key=this.env.TOKEN_ENCRYPTION_KEY;if(!key||!/^[a-fA-F0-9]{64}$/.test(key))throw new ProductError(503,'Request protection is unavailable.',true);
  const digest=createHmac('sha256',Buffer.from(key,'hex')).update(subject).digest('hex');
  const row=(await this.sql('SELECT pg_rate_limit($1,$2,$3,$4) AS allowed',[digest,scope,limit,seconds]))[0];
  if(row?.allowed!==true)throw new ProductError(row?.allowed===false?429:503,'Request limit reached or protection unavailable.',true);
 }
 async feature(name:'jobs'|'webhooks'|'inference'|'sandbox'|'submission'){
  const row=(await this.sql('SELECT pg_feature_allowed($1) AS allowed',[name]))[0];
  if(row?.allowed!==true)throw new ProductError(503,'This operation is temporarily paused.',true);
 }
 async audit(account:number,action:string,resource?:number){await this.sql('SELECT pg_audit($1,$2,$3)',[account,action,resource||null]);}
}
function escapeHtml(text:string){return text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
export function loginChallenge(env:ProductEnv,returnTo:string):Response{
 if(!env.TURNSTILE_SITE_KEY||!env.TURNSTILE_SECRET||!env.TURNSTILE_HOSTNAMES)throw new ProductError(503,'Sign-in verification is not configured.',true);
 const nonce=randomBytes(16).toString('base64');
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in · PatchGoblin</title><style nonce="${nonce}">body{font:1rem system-ui;background:#f8f6ef;color:#202421;margin:0;padding:2rem}main{max-width:28rem;margin:10vh auto}button{font:inherit;background:#294b36;color:white;padding:.8rem 1.2rem;border:0;border-radius:.4rem;cursor:pointer}a{color:#294b36}</style><main><h1>Sign in with GitHub</h1><p>Complete the verification to continue.</p><form method="POST" action="/api/auth/login"><input type="hidden" name="return_to" value="${escapeHtml(returnTo)}"><div class="cf-turnstile" data-sitekey="${escapeHtml(env.TURNSTILE_SITE_KEY)}" data-action="login"></div><p><button type="submit">Continue to GitHub</button></p></form><a href="/">Back to PatchGoblin</a></main><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script></html>`;
 return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':`default-src 'none'; script-src https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src https://challenges.cloudflare.com; style-src 'nonce-${nonce}'; form-action 'self' https://github.com; base-uri 'none'; frame-ancestors 'none'`}});
}
export async function verifyChallenge(token:string|null,env:ProductEnv,fetcher:typeof fetch,ip:string){
 const hosts=(env.TURNSTILE_HOSTNAMES||'').split(',').map(x=>x.trim()).filter(Boolean),app=new URL(env.APP_URL||'https://patchgoblin.vercel.app');
 if(!env.TURNSTILE_SECRET||!hosts.length||!hosts.includes(app.hostname)||env.VERCEL_ENV==='production'&&hosts.some(x=>['localhost','127.0.0.1'].includes(x)))throw new ProductError(503,'Sign-in verification is not configured.',true);
 if(!token||token.length>2048)throw new ProductError(403,'Complete sign-in verification.');
 let result:any;
 try{const r=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret:env.TURNSTILE_SECRET,response:token,remoteip:ip}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();result=JSON.parse(await limitedText(r,10000));}
 catch{throw new ProductError(403,'Verification failed. Return to sign-in and try again.');}
 if(result.success!==true||result.action!=='login'||result.hostname!==app.hostname||!hosts.includes(result.hostname))throw new ProductError(403,'Verification failed. Return to sign-in and try again.');
}
