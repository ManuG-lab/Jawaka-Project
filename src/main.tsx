import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

const AUTO_RELOAD_KEY = 'jawaka_sw_auto_reload_at';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    try {
      const last = Number(sessionStorage.getItem(AUTO_RELOAD_KEY) || 0);
      if (Date.now() - last < 5000) return;
      sessionStorage.setItem(AUTO_RELOAD_KEY, String(Date.now()));
    } catch {
      // ignore storage errors
    }
    reloading = true;
    window.location.reload();
  });
}

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;

    const checkForUpdates = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (registration.installing) return;
      void registration
        .update()
        .then(() => {
          if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        })
        .catch(() => undefined);
    };

    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }

    window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        checkForUpdates();
      }
    }, 60 * 1000);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkForUpdates();
      }
    });

    window.addEventListener('online', checkForUpdates);
  },
});

createRoot(document.getElementById('root')!).render(<App />);
