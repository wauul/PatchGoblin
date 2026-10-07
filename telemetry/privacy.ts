// No free-form application/provider text crosses the telemetry boundary.
export const services = ['frontend', 'api', 'worker', 'extension'];
export const dataCollection = {userInfo:false,cookies:false,httpHeaders:false,httpBodies:[] as [],urlQueryParams:false,graphQL:{document:false,variables:false},genAI:{inputs:false,outputs:false},databaseQueryData:false,queues:false,stackFrameVariables:false,frameContextLines:0};
const operations = new Set(['request','navigation','database','github','oauth','webhook','wake','retention','job','delivery','drain','reconcile','inspect','reproduce','investigate','patch','verify','submit','inference','provision','destroy','cleanup','persistence','render','popup','check_run','release','verification']);
const statuses = new Set(['ok','error','success','failure','unavailable','queued','cancelled','unsupported','failed','verified','submitted','pending','done','expected','unknown','internal_error','invalid_argument','unauthenticated','permission_denied','resource_exhausted','not_found','deadline_exceeded']);
const pages = new Set(['/', '/dashboard','/onboarding','/workbench','/history','/repositories','/account','/docs','/faq','/support','/privacy','/terms','/extension']);
const apiRoutes = new Set(['/api/public','/api/github/webhook','/api/retention','/api/auth/login','/api/auth/callback','/api/auth/logout','/api/bootstrap','/api/extension/status','/api/github/connect','/api/github/setup','/api/github/sync','/api/account/onboarding','/api/account/export','/api/account/delete','/api/repositories/settings','/api/repositories/health','/api/runs','/api/jobs']);
export function route(value: string): string {
  try { value = new URL(value, 'https://patchgoblin.invalid').pathname; } catch { return 'unknown'; }
  if (/^\/api\/jobs\/\d+(\/(cancel|sync|submit))?$/.test(value)) return value.replace(/\/\d+/, '/:id');
  return pages.has(value) || apiRoutes.has(value) ? value : 'unknown';
}
export function rate(value: unknown, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value); return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}
export function validDsn(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { const u = new URL(value); return u.protocol === 'https:' && !!u.username && !u.password && /^\/\d+$/.test(u.pathname); } catch { return false; }
}
export function configuration(env: Record<string, any>, service: string) {
  const environment = env.SENTRY_ENVIRONMENT || env.VERCEL_ENV || env.RAILWAY_ENVIRONMENT_NAME || 'development';
  const dsn = env.SENTRY_DSN;
  const enabled = validDsn(dsn) && (environment === 'production' || env.SENTRY_VERIFY === 'true') && env.SENTRY_ENABLED !== 'false';
  const sha = env.SENTRY_RELEASE || env.VERCEL_GIT_COMMIT_SHA || env.RAILWAY_GIT_COMMIT_SHA || env.GITHUB_SHA;
  return {enabled, dsn: validDsn(dsn) ? dsn : undefined, environment: ['production','preview','development','test','verification','staging'].includes(environment) ? environment : 'development', release: typeof sha === 'string' && /^(?:patchgoblin@)?[a-f0-9]{40}$/i.test(sha) ? (sha.startsWith('patchgoblin@') ? sha : `patchgoblin@${sha}`) : undefined, service, sampleRate: rate(env.SENTRY_ERROR_SAMPLE_RATE, 1), tracesSampleRate: rate(env.SENTRY_TRACES_SAMPLE_RATE, .1)};
}
export function metadata(input: any): Record<string, any> {
  const output: Record<string, any> = {};
  if (!input || typeof input !== 'object') return output;
  for (const [key,value] of Object.entries(input)) {
    if (key === 'service' && services.includes(String(value))) output[key] = value;
    else if (key === 'environment' && ['production','preview','development','test','verification','staging'].includes(String(value))) output[key] = value;
    else if (['operation','stage'].includes(key) && operations.has(String(value))) output[key] = value;
    else if (key === 'mode' && ['repair','builder','maintenance'].includes(String(value))) output[key] = value;
    else if (key === 'status' && statuses.has(String(value))) output[key] = value;
    else if (key === 'route' && typeof value === 'string') output[key] = route(value);
    else if (key === 'model' && ['openai/gpt-oss-20b','openai/gpt-oss-120b','qwen-coder-7b'].includes(String(value))) output[key] = value;
    else if (['duration_ms','prompt_tokens','completion_tokens','total_tokens','http.status_code'].includes(key) && typeof value === 'number' && Number.isFinite(value) && value >= 0) output[key] = value;
    else if (['request_id','event_id','job_id','delivery_id'].includes(key) && typeof value === 'string' && /^(?:[a-f0-9]{32}|[a-f0-9-]{36})$/i.test(value)) output[key] = value;
  }
  return output;
}
export function traceMetadata(input: any): Record<string,string> {
  if (!input || typeof input !== 'object') return {};
  let trace = input['sentry-trace'];
  // Accept only W3C version 00. Never persist tracestate or arbitrary baggage.
  const parent = input.traceparent;
  if (parent !== undefined && parent !== null) {
    if (typeof parent !== 'string' || !/^00-[a-f0-9]{32}-[a-f0-9]{16}-[a-f0-9]{2}$/.test(parent)) return {};
    const parts = parent.split('-');
    const converted = `${parts[1]}-${parts[2]}-${parseInt(parts[3],16)&1}`;
    if (trace && trace !== converted) return {};
    trace = converted;
  }
  if (typeof trace !== 'string' || !/^[a-f0-9]{32}-[a-f0-9]{16}(?:-[01])?$/.test(trace) || /^0{32}-|^[a-f0-9]{32}-0{16}/.test(trace)) return {};
  const output: Record<string,string> = {'sentry-trace': trace};
  if (parent) output.traceparent = parent;
  // Keep only bounded SDK sampling metadata; never copy arbitrary baggage.
  if (typeof input.baggage === 'string' && input.baggage.length <= 1024) {
    const allowed = /^(sentry-trace_id=[a-f0-9]{32}|sentry-public_key=[a-f0-9]{32}|sentry-org_id=\d{1,20}|sentry-sampled=(true|false)|sentry-sample_rate=(0(?:\.\d{1,10})?|1(?:\.0{1,10})?))$/;
    const items = input.baggage.split(',').map((x:string) => x.trim()).filter((x:string) => allowed.test(x)).slice(0,5);
    if (items.length) output.baggage = items.join(',');
  }
  return output;
}
export function w3cTrace(input: any): Record<string,string> {
  const clean = traceMetadata(input);
  const parts = clean['sentry-trace']?.split('-');
  return parts ? {...clean,traceparent:`00-${parts[0]}-${parts[1]}-${parts[2]==='1'?'01':'00'}`} : {};
}
function stack(stack: any) {
  if (!stack?.frames) return undefined;
  return {frames: stack.frames.slice(-60).map((frame: any) => {
    const name = String(frame.filename || '').replace(/\\/g,'/').split(/[?#]/)[0];
    // Retain only shipped application code locations; no source context/locals.
    const owned = name.match(/(?:^|\/)((?:assets\/[^/]+\.js)|(?:(?:api|server|web|telemetry)\/[\w./-]+\.[cm]?[jt]sx?)|(?:popup\.js|telemetry\.js))$/);
    return owned ? {filename: owned[1]==='popup.js' ? 'app:///popup.js' : owned[1].startsWith('assets/') ? `/`+owned[1] : owned[1], lineno: frame.lineno, colno: frame.colno, in_app: true} : {filename:'[external]',in_app:false};
  })};
}
const traceKeys = ['trace_id','span_id','parent_span_id','sampled'];
function cleanTrace(value: any) {
  const out:any = {};
  for (const key of traceKeys) if (key === 'sampled' ? typeof value?.[key] === 'boolean' : typeof value?.[key] === 'string' && /^[a-f0-9]{16,32}$/.test(value[key])) out[key] = value[key];
  if (operations.has(value?.op)) out.op = value.op;
  if (statuses.has(value?.status)) out.status = value.status;
  return out;
}
export function sanitizeSpan(span: any): any {
  // Support v11 streamed spans (attributes/name) and static spans (data/description).
  const out:any = {};
  for (const key of ['start_timestamp','timestamp','end_timestamp','is_segment','is_remote','segment_id','kind']) if (typeof span[key] === 'number' || typeof span[key] === 'boolean' || (key === 'segment_id' && /^[a-f0-9]{16}$/.test(span[key]))) out[key] = span[key];
  Object.assign(out, cleanTrace(span));
  const input = {...span.attributes,...span.data};
  const clean = metadata(input);
  const operation = clean.operation || (operations.has(span.description) ? span.description : 'request');
  if ('name' in span) {
    out.name = operation;
    out.attributes = {...clean,'sentry.op': operations.has(input['sentry.op']) ? input['sentry.op'] : operation};
    // Streamed spans require SDK release/environment and segment linkage for indexing.
    for (const key of ['sentry.environment','sentry.release','sentry.segment.id','sentry.segment.name','sentry.trace_lifecycle','sentry.sdk.name','sentry.sdk.version']) {
      const value=input[key];
      if (key==='sentry.environment' && ['production','preview','development','test','verification','staging'].includes(value)
        || key==='sentry.release' && typeof value==='string' && /^patchgoblin@[a-f0-9]{40}(?:\+extension\.[\d.]+)?$/.test(value)
        || key==='sentry.segment.id' && typeof value==='string' && /^[a-f0-9]{16}$/.test(value)
        || key==='sentry.segment.name' && operations.has(value)
        || key==='sentry.trace_lifecycle' && value==='stream'
        || key==='sentry.sdk.name' && ['sentry.javascript.node','sentry.javascript.react','sentry.javascript.browser'].includes(value)
        || key==='sentry.sdk.version' && typeof value==='string' && /^\d+\.\d+\.\d+$/.test(value)) out.attributes[key]=value;
    }
  }
  else { out.description = operation; out.op = operations.has(span.op) ? span.op : operation; out.data = clean; }
  if (statuses.has(span.status)) out.status = span.status;
  return out;
}
export function sanitizeEvent(event: any): any {
  const out:any = {};
  for (const key of ['event_id','timestamp','platform','type','level','release','environment','sdk']) if (event[key] !== undefined) out[key] = event[key];
  if(event.debug_meta?.images)out.debug_meta={images:event.debug_meta.images.filter((item:any)=>item.type==='sourcemap'&&/^[a-f0-9-]{36}$/i.test(item.debug_id)).flatMap((item:any)=>{const normalized=stack({frames:[{filename:item.code_file}]})?.frames[0]?.filename;return normalized&&normalized!=='[external]'?[{type:'sourcemap',debug_id:item.debug_id,code_file:normalized}]:[];})};
  out.tags = metadata(event.tags);
  // Correlation IDs are contexts only, never metric/issue dimensions.
  for (const key of ['request_id','event_id','job_id','delivery_id']) delete out.tags[key];
  out.contexts = {operation: metadata(event.contexts?.operation), trace: cleanTrace(event.contexts?.trace)};
  if (event.exception?.values) out.exception = {values: event.exception.values.slice(-4).map((value:any) => ({type: /^[\w.]{1,60}$/.test(value.type) ? value.type : 'Error',value:'PatchGoblin operation failed',stacktrace:stack(value.stacktrace),mechanism: value.mechanism ? {type:'generic',handled:value.mechanism.handled !== false} : undefined}))};
  if (event.message) out.message = 'PatchGoblin operation failed';
  out.breadcrumbs = (event.breadcrumbs || []).map(sanitizeBreadcrumb).filter(Boolean).slice(-20);
  if (event.type === 'transaction') {
    out.transaction = route(event.tags?.route || event.transaction || 'unknown');
    out.transaction_info = {source:'route'};
    out.start_timestamp = event.start_timestamp;
    out.spans = (event.spans || []).slice(0,100).map(sanitizeSpan);
  }
  return out;
}
export function sanitizeBreadcrumb(value: any): any {
  if (value.category !== 'patchgoblin') return null;
  return {category:'patchgoblin',timestamp:value.timestamp,level:value.level,data:metadata(value.data)};
}
export function sanitizeReplay(event:any):any {
  const clean=sanitizeEvent(event);
  for(const key of ['replay_start_timestamp','timestamp','segment_id'])if(typeof event[key]==='number'&&Number.isFinite(event[key])&&event[key]>=0)clean[key]=event[key];
  if(typeof event.replay_id==='string'&&/^[a-f0-9]{32}$/.test(event.replay_id))clean.replay_id=event.replay_id;
  if(['session','buffer'].includes(event.replay_type))clean.replay_type=event.replay_type;
  for(const key of ['error_ids','trace_ids'])clean[key]=(event[key]||[]).filter((id:any)=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id)).slice(0,50);
  clean.urls=(event.urls||[]).slice(0,20).map((url:string)=>route(url));
  clean.segment_names=(event.segment_names||[]).slice(0,20).map((name:string)=>route(name));
  return clean;
}
export function sanitizeLog(log: any): any {
  if (!operations.has(log.message || log.body)) return null;
  const out:any = {};
  for(const key of ['timestamp','trace_id','span_id','level','severity_number','severity_text','message','body'])if(log[key]!==undefined)out[key]=log[key];
  const field = 'attributes' in log ? 'attributes' : 'data';
  out[field] = metadata(log[field]);
  for(const [key,value] of Object.entries(sanitizeSpan({name:'request',attributes:log[field]||{}}).attributes))if(key.startsWith('sentry.')&&key!=='sentry.op')out[field][key]=value;
  return out;
}
