import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {sentryVitePlugin} from '@sentry/vite-plugin';
// @ts-ignore Build helper is also used by the extension packager.
import {commitRelease,uploadConfig} from './scripts/sentry-build.mjs';
const config=uploadConfig('frontend');
export default defineConfig({
 plugins:[react(),...(config.ready?[sentryVitePlugin({org:config.org,project:config.project,authToken:process.env.SENTRY_AUTH_TOKEN,telemetry:false,release:{name:config.release},sourcemaps:{filesToDeleteAfterUpload:['dist/client/**/*.map']}})]:[])],
 define:{'import.meta.env.VITE_SENTRY_RELEASE':JSON.stringify(commitRelease()),'import.meta.env.VITE_SENTRY_ENVIRONMENT':JSON.stringify(process.env.VITE_SENTRY_ENVIRONMENT||process.env.VERCEL_ENV||'development'),'import.meta.env.VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG':JSON.stringify(process.env.VERCEL_OBSERVABILITY_CLIENT_CONFIG||'')},
 root:'web',build:{outDir:'../dist/client',emptyOutDir:true,sourcemap:config.ready?'hidden':false},
 server:{proxy:{'/api':process.env.PATCHGOBLIN_API_URL||'http://127.0.0.1:8787'}},
});
