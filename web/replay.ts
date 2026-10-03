// Loaded only after the explicit privacy gate passes.
import {replayIntegration,addIntegration,getReplay,addEventProcessor} from '@sentry/react';
import {replayOptions} from './telemetry';
import {sanitizeReplay} from '../telemetry/privacy';
export function startReplay(){
 addEventProcessor((event:any)=>event.type==='replay_event'?sanitizeReplay(event):event);
 addIntegration(replayIntegration(replayOptions));getReplay()?.start();
}
