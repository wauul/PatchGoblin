import {BrowserClient,Scope,defaultStackParser,makeFetchTransport} from '@sentry/browser';
import {volume} from '../telemetry/volume';
import {configuration,dataCollection,metadata,sanitizeEvent,sanitizeSpan,sanitizeLog} from '../telemetry/privacy';

declare const __SENTRY_EXTENSION_CONFIG__: Record<string,string>;
const env = typeof __SENTRY_EXTENSION_CONFIG__ === 'undefined' ? {} : __SENTRY_EXTENSION_CONFIG__;
const config = configuration(env,'extension');
let client:BrowserClient|undefined;
const scope = new Scope();
const seen = new WeakSet<object>();
const budget=volume(env);
if (config.enabled) {
  try {
    client = new BrowserClient({...config,release:env.EXTENSION_RELEASE,integrations:[],dataCollection,
      transport:options=>makeFetchTransport({...options,fetchOptions:{keepalive:true},bufferSize:10}),stackParser:defaultStackParser,
      beforeSend:event=>budget.event()?sanitizeEvent(event):null,beforeSendSpan:sanitizeSpan,beforeSendLog:log=>env.SENTRY_LOGS_ENABLED==='true'&&budget.log()?sanitizeLog(log):null,
    });
    scope.setClient(client);scope.setTag('service','extension');client.init();
    window.addEventListener('error',event=>capturePopup(event.error || new Error('Popup runtime failure')));
    window.addEventListener('unhandledrejection',event=>capturePopup(event.reason));
    window.addEventListener('pagehide',()=>{void flushPopup();});
  } catch { client=undefined; }
}
export function capturePopup(error:unknown) {
  if (!client) return;
  if ((error as any)?.expected === true) return;
  if (error&&typeof error==='object') { if(seen.has(error))return;seen.add(error); }
  try { scope.captureException(error,{tags:metadata({service:'extension',operation:'popup'})});void flushPopup(); } catch { /* best effort */ }
}
export async function flushPopup() { try { await client?.flush(750); } catch { /* Popup may close at any time. */ } }
