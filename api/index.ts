import {handleProduct} from '../server/platform.js';

export default {fetch(request:Request){
 // The canonical product is public; handleProduct authenticates private routes
 // with its GitHub session. Client-supplied hosting identity is never trusted.
 const headers=new Headers(request.headers);headers.delete('oai-authenticated-user-id');
 return handleProduct(new Request(request,{headers}),process.env);
}};
