// Ephemeral UI verification when the controlled browser cannot install extensions.
// Native chrome.tabs is simulated; session/status and destination URLs are real.
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
const destination='web/public/__extension_verify';
await mkdir(destination,{recursive:true});
for(const name of ['popup.js','context.js','popup.css','goblin.svg'])await copyFile('extension/'+name,destination+'/'+name);
const html=(await readFile('extension/popup.html','utf8')).replace('<header>','<p class="foot">Development harness: active-tab API is simulated. Status and web actions use the real production backend. Native extension permissions and cookie behavior are not tested here.</p><header>').replace('<script type="module" src="popup.js">','<script src="browser-api.js"></script><script type="module" src="popup.js">');
await writeFile(destination+'/index.html',html);
await writeFile(destination+'/browser-api.js',`const activeUrl=new URLSearchParams(location.search).get('url')||'https://github.com/wauul/patchgoblin-product-lab';
globalThis.chrome={tabs:{query:async()=>[{url:activeUrl}],create:({url})=>location.assign(url)}};`);
console.log('Ephemeral extension UI harness created; native tab API is explicitly simulated.');
