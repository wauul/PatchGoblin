import './telemetry';
import {createRoot} from 'react-dom/client';
import RecoveryBoundary from './RecoveryBoundary';
import {Analytics} from '@vercel/analytics/react';
import {SpeedInsights} from '@vercel/speed-insights/react';
import {sanitizeSpeedInsight} from './speed-insights';
import ProductApp from './ProductApp';
createRoot(document.getElementById('root')!).render(<RecoveryBoundary><ProductApp/><Analytics/><SpeedInsights beforeSend={sanitizeSpeedInsight} debug={false} configString={import.meta.env.VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG}/></RecoveryBoundary>);
