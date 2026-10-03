// Loaded only after the explicit privacy gate passes.
import {replayIntegration,addIntegration,getReplay} from '@sentry/react';
import {replayOptions} from './telemetry';
export function startReplay(){addIntegration(replayIntegration(replayOptions));getReplay()?.start();}
