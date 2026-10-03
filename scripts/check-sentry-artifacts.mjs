import {readdir,readFile,stat} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
import assert from 'node:assert/strict';
async function inspect(path){
 for(const name of await readdir(path)){
  const full=path+'/'+name;if((await stat(full)).isDirectory())await inspect(full);
  else {assert.ok(!name.endsWith('.map'),'Public source map: '+full);if(/\.(js|html)$/.test(name)){const text=await readFile(full,'utf8');assert.ok(!/sourceMappingURL=/.test(text),'Public map reference: '+full);if(process.env.SENTRY_AUTH_TOKEN)assert.ok(!text.includes(process.env.SENTRY_AUTH_TOKEN),'Build token leaked: '+full);}}
 }
}
await inspect('dist/client');
try{await stat('.vercel/output/static');await inspect('.vercel/output/static');}catch(error){if(error.code!=='ENOENT')throw error;}
const zip=unzipSync(new Uint8Array(await readFile('dist/extension/patchgoblin-extension.zip')));
for(const [name,bytes] of Object.entries(zip)){
 assert.ok(!name.endsWith('.map'),'Extension source map: '+name);
 if(name.endsWith('.js')){
  const text=strFromU8(bytes);assert.ok(!/sourceMappingURL=/.test(text));
  if(process.env.SENTRY_AUTH_TOKEN)assert.ok(!text.includes(process.env.SENTRY_AUTH_TOKEN));
 }
}
const manifest=JSON.parse(strFromU8(zip['manifest.json']));
assert.equal(manifest.manifest_version,3);assert.deepEqual(manifest.permissions,['activeTab']);
assert.equal(manifest.content_scripts,undefined);assert.equal(manifest.background,undefined);
assert.ok(manifest.content_security_policy.extension_pages.includes("script-src 'self'"));
assert.ok(!manifest.host_permissions.includes('<all_urls>'));
console.log('Public web/extension artifacts contain no maps, build token or extra execution surfaces.');
