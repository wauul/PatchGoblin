// Exercise the emitted native ESM entrypoint, not the TypeScript test loader.
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const entry=pathToFileURL(path.resolve('.vercel/output/functions/api/index.func/api/index.js')).href;
const env={...process.env,SENTRY_DSN:'',SENTRY_ENABLED:'false',DATABASE_URL:''};delete env.SENTRY_AUTH_TOKEN;
const code=`const {default:api}=await import(${JSON.stringify(entry)});const response=await api.fetch(new Request('https://patchgoblin.vercel.app/api/bootstrap'));const body=await response.json();if(response.status!==200||body.connected!==false||body.account!==null)throw Error('Compiled anonymous bootstrap failed');console.log('Compiled Vercel native ESM entrypoint and anonymous bootstrap passed.');`;
const child=spawn(process.execPath,['--input-type=module','-e',code],{env,stdio:'inherit'});
child.on('error',()=>{process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
