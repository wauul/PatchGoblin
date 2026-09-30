import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
const assets={};
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())await walk(p);else{const ext=path.extname(p);assets['/'+path.relative('dist/client',p).replaceAll('\\','/')]={body:await readFile(p,'utf8'),type:({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[ext]||'text/plain'};}}}
await walk('dist/client');
await mkdir('.local',{recursive:true});
await writeFile('.local/assets.ts','export const assets='+JSON.stringify(assets));
await mkdir('dist/server',{recursive:true});
await build({entryPoints:['server/index.ts'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,plugins:[{name:'embedded-assets',setup(b){b.onResolve({filter:/generated-assets/},()=>({path:path.resolve('.local/assets.ts')}));}}]});
console.log('Built frontend and Worker with embedded assets.');
