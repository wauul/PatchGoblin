import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {zipSync} from 'fflate';
import {build} from 'esbuild';
import {commitRelease,uploadMaps} from './sentry-build.mjs';
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
const privateDir='.local/sentry/extension';
await mkdir(privateDir,{recursive:true});
const dsn=process.env.SENTRY_EXTENSION_DSN||'';
let telemetryOrigin;
try{const u=new URL(dsn);if(u.protocol==='https:'&&!u.password&&u.username&&/^\/\d+$/.test(u.pathname))telemetryOrigin=u.origin;}catch{}
const environment=process.env.SENTRY_EXTENSION_ENVIRONMENT||process.env.VERCEL_ENV||'development';
const extensionRelease=`${commitRelease()||'patchgoblin@unknown'}+extension.${manifest.version}`;
const config={SENTRY_DSN:telemetryOrigin?dsn:'',SENTRY_ENVIRONMENT:environment,SENTRY_VERIFY:process.env.SENTRY_VERIFY||'false',SENTRY_ENABLED:process.env.SENTRY_EXTENSION_ENABLED||'true',SENTRY_ERROR_SAMPLE_RATE:process.env.SENTRY_EXTENSION_ERROR_SAMPLE_RATE||'1',SENTRY_TRACES_SAMPLE_RATE:'0',SENTRY_LOGS_ENABLED:process.env.SENTRY_EXTENSION_LOGS_ENABLED||'false',SENTRY_LOG_SAMPLE_RATE:process.env.SENTRY_EXTENSION_LOG_SAMPLE_RATE||'0.1',SENTRY_MAX_EVENTS_PER_MINUTE:process.env.SENTRY_EXTENSION_MAX_EVENTS_PER_MINUTE||'60',EXTENSION_RELEASE:extensionRelease};
await build({entryPoints:['extension/entry.ts'],outfile:privateDir+'/popup.js',bundle:true,format:'esm',platform:'browser',target:'chrome120',minify:true,sourcemap:'external',define:{__SENTRY_EXTENSION_CONFIG__:JSON.stringify(config)}});
await uploadMaps('extension',privateDir,extensionRelease,'app:///');
if(telemetryOrigin){manifest.host_permissions.push(telemetryOrigin+'/*');}
manifest.content_security_policy.extension_pages=`script-src 'self'; object-src 'none'; connect-src https://patchgoblin.vercel.app${telemetryOrigin?' '+telemetryOrigin:''}`;
for(const name of files.sort())entries[name]=[new Uint8Array(await readFile('extension/'+name)),{mtime:new Date(1980,0,1,0,0,0)}];
entries['manifest.json']=[new TextEncoder().encode(JSON.stringify(manifest,null,1)),{mtime:new Date(1980,0,1,0,0,0)}];
entries['popup.js']=[new TextEncoder().encode((await readFile(privateDir+'/popup.js','utf8')).replace(/\/\/# sourceMappingURL=.*$/gm,'')),{mtime:new Date(1980,0,1,0,0,0)}];
const output=process.env.SENTRY_VERIFICATION_PACKAGE==='true'?'.local/sentry/verification/patchgoblin-extension.zip':'dist/extension/patchgoblin-extension.zip';
await mkdir(output.slice(0,output.lastIndexOf('/')),{recursive:true});await writeFile(output,zipSync(entries,{level:9}));
if(process.env.SENTRY_VERIFICATION_PACKAGE!=='true')await copyFile(output,'web/public/patchgoblin-extension.zip');
console.log('Extension package built: '+output);
