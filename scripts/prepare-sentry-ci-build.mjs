// Fetch only this project's build settings. Project-scoped tokens cannot read
// team settings, which `vercel pull` currently requests unnecessarily.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {VERCEL_TOKEN,VERCEL_ORG_ID,VERCEL_PROJECT_ID,VITE_SENTRY_DSN,SENTRY_EXTENSION_DSN}=process.env;
assert.ok(VERCEL_TOKEN&&VERCEL_ORG_ID&&VERCEL_PROJECT_ID,'Vercel CI configuration is required');
assert.ok(VITE_SENTRY_DSN&&SENTRY_EXTENSION_DSN,'Public monitoring DSNs are required');
const response=await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(VERCEL_PROJECT_ID)}?teamId=${encodeURIComponent(VERCEL_ORG_ID)}`,{headers:{Authorization:`Bearer ${VERCEL_TOKEN}`}});
assert.equal(response.status,200,'Project-scoped Vercel build-settings access failed');
const project=await response.json();
assert.equal(project.id,VERCEL_PROJECT_ID);assert.equal(project.accountId,VERCEL_ORG_ID);
assert.equal(project.name,'patchgoblin','CI must target PatchGoblin');
const settings={};
for(const key of ['createdAt','framework','devCommand','installCommand','buildCommand','outputDirectory','rootDirectory','directoryListing','nodeVersion','analyticsId']){
 if(project[key]!==undefined)settings[key]=project[key];
}
assert.equal(settings.nodeVersion,'24.x','Reverify the emitted runtime after a Node major change');
await mkdir('.vercel',{recursive:true});
await writeFile('.vercel/project.json',JSON.stringify({projectId:project.id,orgId:project.accountId,projectName:project.name,settings},null,2)+'\n');
// Runtime secrets are supplied by Vercel on deployment, never pulled for maps.
console.log('Prepared PatchGoblin build settings using project-scoped access; no runtime secrets retrieved.');
