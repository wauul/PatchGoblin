import {flushTelemetry} from '../server/telemetry.js';
import {waitUntil} from '@vercel/functions';
import {handleProduct} from '../server/platform.js';

export default {async fetch(request:Request){
 // The canonical product is public; handleProduct authenticates private routes
 // with its GitHub session. Client-supplied hosting identity is never trusted.
 const headers=new Headers(request.headers);headers.delete('oai-authenticated-user-id');
 try { return await handleProduct(new Request(request,{headers}),process.env); }
 finally { const pending=flushTelemetry(); try { waitUntil(pending); } catch { await pending; } }
}};
