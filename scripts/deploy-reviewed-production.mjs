// Called by the manually dispatched, protected production release workflow.
// Authentication stays in the environment, never command-line arguments.
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
assert.equal(process.env.GITHUB_REF, 'refs/heads/main', 'Production releases require main');
assert.ok(process.env.VERCEL_TOKEN && process.env.SENTRY_AUTH_TOKEN, 'Release credentials required');
function command(exe, args) {
  const result = spawnSync(exe, args, {encoding:'utf8', env:process.env});
  if (result.error || result.status !== 0) throw Error('Production release command failed: '+exe);
  return (result.stdout || '')+'\n'+(result.stderr || '');
}
const output = command('npx', ['vercel@60.1.3','deploy','--prebuilt','--prod','--skip-domain','--yes']);
const url = output.match(/https:\/\/patchgoblin-[a-z0-9-]+\.vercel\.app/g)?.at(-1);
assert.ok(url, 'Ready production deployment URL required');
console.log('Ready production build: '+url);
// CLI promotion reads team settings that a project-scoped token cannot access.
// Address the already-verified project directly without expanding token scope.
const project=process.env.VERCEL_PROJECT_ID,team=process.env.VERCEL_ORG_ID;
assert.ok(project && team, 'Explicit production project and team required');
async function api(path,method='GET') {
  const response=await fetch('https://api.vercel.com'+path,{method,headers:{Authorization:'Bearer '+process.env.VERCEL_TOKEN},signal:AbortSignal.timeout(60000)});
  assert.ok(response.ok, 'Project-scoped release API failed: '+response.status);
  const body=await response.text();
  return body?JSON.parse(body):null;
}
const deployment=await api('/v13/deployments/'+new URL(url).hostname+'?teamId='+encodeURIComponent(team));
assert.equal(deployment.projectId,project);assert.equal(deployment.target,'production');assert.equal(deployment.readyState,'READY');
await api('/v10/projects/'+encodeURIComponent(project)+'/promote/'+encodeURIComponent(deployment.id)+'?teamId='+encodeURIComponent(team),'POST');
let promoted=false;
for(let attempt=0;attempt<30;attempt++) {
  const current=await api('/v9/projects/'+encodeURIComponent(project)+'?teamId='+encodeURIComponent(team));
  if(current.targets?.production?.id===deployment.id){promoted=true;break;}
  await new Promise(resolve=>setTimeout(resolve,1000));
}
assert.ok(promoted,'Production alias promotion could not be verified');
command(process.execPath, ['scripts/record-sentry-deploy.mjs','vercel',url]);
console.log('Production promoted: '+url);
