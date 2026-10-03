import * as Sentry from '@sentry/react';
import {volume} from '../telemetry/volume';
import {configuration,dataCollection,metadata,route,sanitizeEvent,sanitizeSpan,sanitizeBreadcrumb,sanitizeLog} from '../telemetry/privacy';

const env = (import.meta as any).env || {};
const config = configuration({SENTRY_DSN:env.VITE_SENTRY_DSN,SENTRY_ENVIRONMENT:env.VITE_SENTRY_ENVIRONMENT || (env.PROD?'production':'development'),SENTRY_VERIFY:env.VITE_SENTRY_VERIFY,SENTRY_ENABLED:env.VITE_SENTRY_ENABLED,SENTRY_RELEASE:env.VITE_SENTRY_RELEASE,SENTRY_ERROR_SAMPLE_RATE:env.VITE_SENTRY_ERROR_SAMPLE_RATE,SENTRY_TRACES_SAMPLE_RATE:env.VITE_SENTRY_TRACES_SAMPLE_RATE},'frontend');
const reported = new WeakSet<object>();
const budget = volume({SENTRY_MAX_EVENTS_PER_MINUTE:env.VITE_SENTRY_MAX_EVENTS_PER_MINUTE,SENTRY_LOG_SAMPLE_RATE:env.VITE_SENTRY_LOG_SAMPLE_RATE});
export const replayPages = ['/', '/docs','/faq','/extension'];
export function replayAllowed(path: string, enabled: unknown, verified: unknown) {
  return enabled === 'true' && verified === 'true' && replayPages.includes(path);
}
export const replayOptions = {
  maskAllText:true,maskAllInputs:true,blockAllMedia:true,
  maskAttributes:['href','src','title','alt','aria-label','data-repo','data-job'],
  block:['.sentry-block','[data-sentry-block]','pre','code','.diff','.logs','.evidence','#root[data-private]'],
  networkDetailAllowUrls:[],networkCaptureBodies:false,
  beforeAddRecordingEvent:(event:any)=> {
    if (event.type === 5 || event.type === 6) return null;
    return event;
  },
};
if (config.enabled) {
  try {
    Sentry.init({...config,dataCollection,maxBreadcrumbs:20,
      integrations:defaults=>[...defaults.filter(x=>!['Breadcrumbs','HttpContext','BrowserSession','BrowserApiErrors'].includes(x.name)),Sentry.browserTracingIntegration({beforeStartSpan:options=>({...options,name:route(location.pathname),attributes:{route:route(location.pathname)}})})],
      tracePropagationTargets:[/^\/api(?:\/|$)/,new RegExp('^'+location.origin.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/api(?:/|$)')],
      replaysSessionSampleRate:0,replaysOnErrorSampleRate:0,
      beforeSend:(event,hint)=>{const error=hint.originalException;if(error&&typeof error==='object'){if(reported.has(error))return null;reported.add(error);}return budget.event()?sanitizeEvent(event):null;},
      beforeSendSpan:span=>sanitizeSpan({...span,attributes:{...span.attributes,service:'frontend',route:route(location.pathname)}}),beforeBreadcrumb:sanitizeBreadcrumb,beforeSendLog:log=>env.VITE_SENTRY_LOGS_ENABLED === 'true'&&budget.log()?sanitizeLog(log):null,
    });
    Sentry.setTag('service','frontend');
    if (replayAllowed(location.pathname,env.VITE_SENTRY_REPLAY_ENABLED,env.VITE_SENTRY_REPLAY_PRIVACY_VERIFIED)) void import('./replay').then(({startReplay})=>startReplay()).catch(()=>{});
  } catch { /* Monitoring must not block rendering. */ }
}
export function captureFrontend(error: unknown, operation='request'):string|undefined {
  if (!Sentry.isEnabled()) return;
  try { return Sentry.captureException(error,{tags:metadata({service:'frontend',operation,route:route(location.pathname)})}); } catch { return; }
}
export async function monitoredApi(path:string, init:RequestInit) {
  let response:Response;
  try { response = await fetch('/api'+path,init); }
  catch(error) { captureFrontend(error);throw error; }
  if (response.status>=500) {
    if (!response.headers.get('X-Sentry-Event-ID')) captureFrontend(new Error('PatchGoblin API unavailable'));
    try { Sentry.logger.warn('request',metadata({service:'frontend',operation:'request',route:route('/api'+path),'http.status_code':response.status,status:'error'})); } catch { /* best effort */ }
  }
  return response;
}
