import {capturePopup} from './telemetry';
// Instrument only the popup's document; no content scripts or GitHub page hooks.
import('./popup.js').catch(capturePopup);
