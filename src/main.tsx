import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initPwaServiceWorker } from './lib/pwaRefresh';

initPwaServiceWorker();

createRoot(document.getElementById('root')!).render(<App />);
