import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="no-print bg-[#D49B27] text-[#1C1714] px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 border-b border-[#1C1714]">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Offline Mode — Showing cached menu & tickets. Reconnect to place or pay orders.</span>
    </div>
  );
}
