// Build-only local configuration. Never import this module from application code.
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const env={...process.env};
for(const line of (await readFile('.local/sentry.env','utf8')).split(/\r?\n/)){
 const match=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);if(match)env[match[1]]=match[2].replace(/^['"]|['"]$/g,'');
}
env.SENTRY_ENVIRONMENT||='production';env.VITE_SENTRY_ENVIRONMENT||='production';env.SENTRY_EXTENSION_ENVIRONMENT||='production';
// Vercel's Windows builder reads PATH case-sensitively before spawning cmd.exe.
const pathKey=Object.keys(env).find(k=>k.toUpperCase()==='PATH');
if(pathKey&&pathKey!=='PATH'){env.PATH=env[pathKey];delete env[pathKey];}
const [entry,...args]=process.argv.slice(2);if(!entry)throw Error('Provide a Node build entry point.');
const child=spawn(process.execPath,[entry,...args],{env,stdio:'inherit',shell:false});
child.on('error',()=>{console.error('Build process could not start.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
