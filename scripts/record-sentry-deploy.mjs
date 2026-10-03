// Run only after the existing hosting deployment has succeeded.
import {SentryCli} from '@sentry/cli';
import {commitRelease,uploadConfig} from './sentry-build.mjs';
const [provider,url]=process.argv.slice(2);
if(!['vercel','railway'].includes(provider)||!url?.startsWith('https://'))throw Error('Provide a successful deployment provider and URL.');
const services=provider==='vercel'?['frontend','api']:['worker'];
const release=commitRelease();
for(const service of services){
 const config=uploadConfig(service);if(!config.ready)throw Error('Deployment tracking is not configured.');
 const cli=new SentryCli(undefined,{org:config.org,project:config.project,authToken:process.env.SENTRY_AUTH_TOKEN});
 await cli.releases.new(release,{projects:[config.project]});
 await cli.releases.finalize(release);
 await cli.releases.newDeploy(release,{env:'production',name:provider,url,projects:[config.project]});
 console.log('Recorded successful '+service+' deployment for '+release);
}
