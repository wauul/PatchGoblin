import {readFile,readdir,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {zipSync} from 'fflate';
const entries={};
await copyFile('web/public/goblin.svg','extension/goblin.svg');
for(const name of (await readdir('extension')).sort())entries[name]=[new Uint8Array(await readFile('extension/'+name)),{mtime:new Date('1980-01-01T00:00:00Z')}];
entries['goblin.svg']=[new Uint8Array(await readFile('web/public/goblin.svg')),{mtime:new Date('1980-01-01T00:00:00Z')}];
await mkdir('dist/extension',{recursive:true});await writeFile('dist/extension/patchgoblin-extension.zip',zipSync(entries,{level:9}));
await copyFile('dist/extension/patchgoblin-extension.zip','web/public/patchgoblin-extension.zip');
console.log('Extension package built: dist/extension/patchgoblin-extension.zip');
