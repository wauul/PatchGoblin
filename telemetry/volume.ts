import {rate} from './privacy.js';
export function volume(env:Record<string,any>) {
 const raw=Number(env.SENTRY_MAX_EVENTS_PER_MINUTE??60);
 const max=Number.isFinite(raw)&&raw>=0&&raw<=1000?Math.floor(raw):60;
 const logRate=rate(env.SENTRY_LOG_SAMPLE_RATE,.1);
 let window=0,count=0;
 return {event:()=>{const now=Math.floor(Date.now()/60000);if(now!==window){window=now;count=0;}return count++<max;},log:()=>Math.random()<logRate};
}
