import {handleApi,type Env} from '../server/api.js';

export default {fetch(request:Request){
 // Every production URL is protected by Vercel Authentication. Do not trust
 // client-supplied identity headers on this deployment.
 const headers=new Headers(request.headers);headers.delete('oai-authenticated-user-id');
 return handleApi(new Request(request,{headers}),process.env as Env);
}};
