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
command('npx', ['vercel@60.1.3','promote',url,'--yes']);
command(process.execPath, ['scripts/record-sentry-deploy.mjs','vercel',url]);
console.log('Production promoted: '+url);
