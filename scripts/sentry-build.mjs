import {execFileSync} from 'node:child_process';
import {SentryCli} from '@sentry/cli';
export function commitRelease(env=process.env) {
  let sha=env.SENTRY_RELEASE || env.VERCEL_GIT_COMMIT_SHA || env.RAILWAY_GIT_COMMIT_SHA || env.GITHUB_SHA;
  if(!sha)try{sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{}
  if(!/^(?:patchgoblin@)?[a-f0-9]{40}$/i.test(sha||''))return undefined;
  return sha.startsWith('patchgoblin@')?sha:`patchgoblin@${sha}`;
}
export function uploadConfig(service,env=process.env) {
  const project=env[`SENTRY_PROJECT_${service.toUpperCase()}`];
  const ready=!!(env.SENTRY_AUTH_TOKEN&&env.SENTRY_ORG&&project&&commitRelease(env));
  if(!ready&&(env.VERCEL_ENV==='production'||env.SENTRY_ENVIRONMENT==='production'||env.SENTRY_REQUIRE_UPLOAD==='true')){
    console.warn(`[Sentry] ${service}: production source-map upload unavailable (org, project, build token, release required).`);
    if(env.SENTRY_REQUIRE_UPLOAD==='true')throw Error('Required Sentry source-map upload is not configured.');
  }
  return {ready,org:env.SENTRY_ORG,project,release:commitRelease(env)};
}
export async function uploadMaps(service,directory,release=commitRelease(),urlPrefix='~/') {
  const config=uploadConfig(service);
  if(!config.ready)return false;
  const cli=new SentryCli(undefined,{org:config.org,project:config.project,authToken:process.env.SENTRY_AUTH_TOKEN});
  await cli.releases.new(release,{projects:[config.project]});
  await cli.execute(['sourcemaps','inject',directory]);
  await cli.execute(['sourcemaps','upload','--release',release,'--url-prefix',urlPrefix,directory]);
  await cli.releases.finalize(release);
  // Deployment tracking is recorded only after the deployment succeeds.
  return true;
}
