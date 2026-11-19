import { registerSW } from 'virtual:pwa-register';

type Listener = (updateAvailable: boolean) => void;

let updateAvailable = false;
let updateSWFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
const listeners = new Set<Listener>();

function notifyListeners() {
  for (const l of listeners) {
    l(updateAvailable);
  }
}

export function subscribePwaUpdate(listener: Listener): () => void {
  listeners.add(listener);
  listener(updateAvailable);
  return () => {
    listeners.delete(listener);
  };
}

export function initPwaServiceWorker(): void {
  if (typeof window === 'undefined') return;

  updateSWFn = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateAvailable = true;
      notifyListeners();
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      // Check for updated SW whenever mobile PWA returns to foreground
      const checkForUpdate = () => {
        if (document.visibilityState === 'hidden') return;
        void registration.update().catch(() => undefined);
      };

      document.addEventListener('visibilitychange', checkForUpdate);
      window.addEventListener('focus', checkForUpdate);
      setInterval(() => {
        void registration.update().catch(() => undefined);
      }, 5 * 60 * 1000);
    },
  });
}

export async function forceRefreshApp(): Promise<void> {
  if (typeof window === 'undefined') return;

  // Hard fallback so reload always completes even if SW is inactive or slow
  const fallbackReload = window.setTimeout(() => {
    window.location.reload();
  }, 450);

  try {
    if (updateSWFn && updateAvailable) {
      await updateSWFn(true);
      return;
    }

    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update().catch(() => undefined);
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }
    }
  } catch {
    // fallback timer below will reload
  }

  window.clearTimeout(fallbackReload);
  window.location.reload();
}
