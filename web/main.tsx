import './telemetry';
import {createRoot} from 'react-dom/client';
import RecoveryBoundary from './RecoveryBoundary';
import {Analytics} from '@vercel/analytics/react';
import ProductApp from './ProductApp';
createRoot(document.getElementById('root')!).render(<RecoveryBoundary><ProductApp/><Analytics/></RecoveryBoundary>);
