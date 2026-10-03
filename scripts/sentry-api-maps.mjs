// Run AFTER vercel build and BEFORE deploy --prebuilt. Function maps are private.
import {readdir,stat} from 'node:fs/promises';
import {uploadMaps,uploadConfig} from './sentry-build.mjs';
const root='.vercel/output/functions';
async function maps(path){const result=[];for(const name of await readdir(path)){const full=path+'/'+name;if((await stat(full)).isDirectory())result.push(...await maps(full));else if(name.endsWith('.map'))result.push(full);}return result;}
const config=uploadConfig('api');
let found=[];try{found=await maps(root);}catch{}
if(!found.length){
 console.warn('[Sentry] No generated API maps found. Verify deployed frames before claiming readable stacks.');
 if(process.env.SENTRY_REQUIRE_UPLOAD==='true')throw Error('API source maps are required but absent.');
}else if(config.ready)await uploadMaps('api',root);
else console.warn('[Sentry] Private API maps found; upload is not configured.');
