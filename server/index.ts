import {handleApi, type Env} from './api';
import {assets} from './generated-assets';
export default {async fetch(request:Request,env:Env){
 const path=new URL(request.url).pathname;
 if(path.startsWith('/api/'))return handleApi(request,env);
 const asset=assets[path]||assets['/index.html'];
 return new Response(asset.body,{headers:{'Content-Type':asset.type,'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"}});
}};
