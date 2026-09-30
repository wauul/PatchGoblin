import {handleApi, type Env} from './api';
import {assets} from './generated-assets';
export default {async fetch(request:Request,env:Env){
 const path=new URL(request.url).pathname;
 if(env.PRODUCTION_URL){
  const target=new URL(request.url);const production=new URL(env.PRODUCTION_URL);
  if(production.protocol!=='https:')throw new Error('Production redirect must use HTTPS');
  target.protocol=production.protocol;target.host=production.host;
  if(request.method!=='GET'&&request.method!=='HEAD')return Response.json({error:'PatchGoblin moved to '+production.origin+'. Open the new app to start a job.'},{status:410});
  return Response.redirect(target.toString(),308);
 }
 if(path.startsWith('/api/'))return handleApi(request,env);
 const asset=assets[path]||assets['/index.html'];
 return new Response(asset.body,{headers:{'Content-Type':asset.type,'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"}});
}};
