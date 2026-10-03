import * as Sentry from '@sentry/node';
import {randomUUID} from 'node:crypto';
import {volume} from '../telemetry/volume.js';
import {configuration,dataCollection,metadata,route,sanitizeEvent,sanitizeSpan,sanitizeBreadcrumb,sanitizeLog,traceMetadata} from '../telemetry/privacy.js';

let initialized = false;
const captured = new WeakMap<object,string>();
export function initTelemetry(env: Record<string,string|undefined> = process.env, options: Pick<Sentry.NodeOptions,'transport'> = {}) {
  if (initialized) return;
  const config = configuration(env,'api');
  if (!config.enabled) return;
  const budget=volume(env);
  try {
    Sentry.init({...config,...options,traceLifecycle:'static',beforeSendTransaction:sanitizeEvent,defaultIntegrations:false, integrations:[Sentry.onUncaughtExceptionIntegration(),Sentry.onUnhandledRejectionIntegration()],dataCollection,includeServerName:false,maxBreadcrumbs:20,transportOptions:{bufferSize:30},tracePropagationTargets:[],beforeSend:(event,hint)=>expectedError(hint.originalException)||!budget.event()?null:sanitizeEvent(event),beforeSendSpan:Sentry.withStaticSpan(sanitizeSpan),beforeBreadcrumb:sanitizeBreadcrumb,beforeSendLog:log=>env.SENTRY_LOGS_ENABLED === 'true'&&budget.log()?sanitizeLog(log):null});
    Sentry.setTag('service','api'); initialized = true;
  } catch { /* A malformed/unavailable telemetry configuration never blocks startup. */ }
}
export function expectedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'AbortError') return true;
  const e = error as Error & {status?:number;expected?:boolean};
  if (e.expected === true || (e.constructor.name === 'ProductError' && !!e.status && e.status < 500)) return true;
  return /^(PG_RATE_LIMIT|PG_ACTIVE_JOB|PG_REPO_DISABLED)$/.test(e.message.split('\n')[0]);
}
export function captureFault(error: unknown, operation: string): string|undefined {
  if (expectedError(error) || !Sentry.isEnabled()) return;
  if (typeof error === 'object' && error && captured.has(error)) return captured.get(error);
  try {
    const id = Sentry.captureException(error,{tags:metadata({operation,service:'api'})});
    if (typeof error === 'object' && error) captured.set(error,id);
    return id;
  } catch { return; }
}
export function operationalLog(operation: string, data: Record<string,any> = {}) {
  try { Sentry.logger.info(operation,metadata({...data,service:'api',operation})); } catch { /* best effort */ }
}
export function responseStatus(status:number){
 try {const active=Sentry.getActiveSpan();active?.setAttribute('http.status_code',status);active?.setAttribute('status',status>=500?'error':'ok');active?.setStatus({code:status>=500?2:1,...(status>=500?{message:'internal_error'}:{})});}catch{/* best effort */}
}
export function span<T>(operation: string, fn:()=>Promise<T>): Promise<T> {
  if (!Sentry.isEnabled()) return fn();
  // The SDK invokes the callback exactly once. Do not retry application work on telemetry errors.
  let called=false;
  let result:Promise<T>|undefined;
  const invoke=()=>{called=true;return result=fn();};
  try {return Sentry.startSpan({name:operation,op:operation,attributes:{operation,service:'api',route:String(Sentry.getIsolationScope().getScopeData().tags.route||'unknown')}},invoke);}
  catch(error){if(!called)return fn();if(result)return result;throw error;}
}
export function durableTrace() { try { return traceMetadata(Sentry.getTraceData()); } catch { return {}; } }
export async function flushTelemetry() { try { await Sentry.flush(1500); } catch { /* no application impact */ } }
export function requestScope<T>(request:Request, fn:(requestId:string)=>Promise<T>):Promise<T> {
  const requestId = randomUUID();
  if(!Sentry.isEnabled())return fn(requestId);
  let called=false;let result:Promise<T>|undefined;
  const invoke=()=>{called=true;return result=fn(requestId);};
  try {
   const fresh = new Sentry.Scope();fresh.setClient(Sentry.getClient());
   return Sentry.withIsolationScope(fresh,scope => {
    scope.setTag('service','api');scope.setTag('operation','request');scope.setTag('route',route(request.url));scope.setContext('operation',{request_id:requestId});
    const trace=traceMetadata({'sentry-trace':request.headers.get('sentry-trace'),baggage:request.headers.get('baggage')});
    return Sentry.continueTrace({sentryTrace:trace['sentry-trace'],baggage:trace.baggage},()=>span('request',invoke));
   });
  }catch(error){if(!called)return fn(requestId);if(result)return result;throw error;}
}
export function retentionCheckIn(status:'in_progress'|'ok'|'error',checkInId?:string):string|undefined {
 try {
  if(!Sentry.isEnabled())return;
  const configured=process.env.SENTRY_RETENTION_MONITOR_SLUG;
  const monitorSlug=configured&&/^[a-z0-9-]{1,100}$/.test(configured)?configured:'patchgoblin-daily-retention';
  if(status==='in_progress')return Sentry.captureCheckIn({monitorSlug,status},{schedule:{type:'crontab',value:'0 8 * * *'},timezone:'Etc/UTC',checkinMargin:10,maxRuntime:2,failureIssueThreshold:1,recoveryThreshold:1});
  if(checkInId)return Sentry.captureCheckIn({checkInId,monitorSlug,status});
 }catch{return;}
}
initTelemetry();
