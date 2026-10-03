import {createRoot} from 'react-dom/client';
import {Analytics} from '@vercel/analytics/react';
import ProductApp from './ProductApp';
createRoot(document.getElementById('root')!).render(<><ProductApp/><Analytics/></>);
