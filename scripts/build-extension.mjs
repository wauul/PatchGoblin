import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {zipSync} from 'fflate';
const entries={};
await copyFile('web/public/goblin.svg','extension/goblin.svg');
await copyFile('web/public/theme-init.js','extension/theme.js');
await copyFile('web/public/fonts/public-sans-400-700.woff2','extension/public-sans.woff2');
await copyFile('web/public/fonts/public-sans-OFL.txt','extension/public-sans-OFL.txt');
await copyFile('web/locales/fr.json','extension/fr.json');
// ZIP stores wall-clock time without a timezone; use the same local date everywhere.
// Ship runtime assets only, never publication notes or development files.
const files=['context.js','fr.json','goblin.svg','locale.js','manifest.json','popup.css','popup.html','popup.js','public-sans-OFL.txt','public-sans.woff2','theme.js',...['16','32','48','128'].map(size=>`icons/icon-${size}.png`)];
const manifest=JSON.parse(await readFile('extension/manifest.json','utf8'));
if(manifest.manifest_version!==3)throw Error('Chrome Web Store package requires Manifest V3');
for(const name of files.sort())entries[name]=[new Uint8Array(await readFile('extension/'+name)),{mtime:new Date(1980,0,1,0,0,0)}];
await mkdir('dist/extension',{recursive:true});await writeFile('dist/extension/patchgoblin-extension.zip',zipSync(entries,{level:9}));
await copyFile('dist/extension/patchgoblin-extension.zip','web/public/patchgoblin-extension.zip');
console.log('Extension package built: dist/extension/patchgoblin-extension.zip');
