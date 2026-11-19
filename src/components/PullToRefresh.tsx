import { useEffect, useRef, useState } from 'react';
import { ArrowDown, RefreshCw } from 'lucide-react';
import { forceRefreshApp } from '../lib/pwaRefresh';

const TRIGGER_THRESHOLD_PX = 68;
const MAX_PULL_PX = 104;

function isTouchBlockedTarget(target: EventTarget | null): boolean {
  let node = target as HTMLElement | null;
  while (node && node !== document.body) {
    // Do not hijack drags inside open modals, drawers, or form inputs
    if (
      node.dataset.noPtr !== undefined ||
      node.classList.contains('fixed') ||
      node.tagName === 'INPUT' ||
      node.tagName === 'TEXTAREA' ||
      node.tagName === 'SELECT'
    ) {
      return true;
    }
    if (node.scrollTop > 2) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

export function PullToRefresh() {
  const [pullPx, setPullPx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const trackingRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (e.touches.length !== 1) return;
      if (window.scrollY > 2) return;
      if (isTouchBlockedTarget(e.target)) return;

      trackingRef.current = true;
      startXRef.current = e.touches[0].clientX;
      startYRef.current = e.touches[0].clientY;
      pullRef.current = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!trackingRef.current || refreshingRef.current) return;
      if (e.touches.length !== 1) {
        trackingRef.current = false;
        pullRef.current = 0;
        setPullPx(0);
        return;
      }

      if (window.scrollY > 2) {
        trackingRef.current = false;
        pullRef.current = 0;
        setPullPx(0);
        return;
      }

      const dx = e.touches[0].clientX - startXRef.current;
      const dy = e.touches[0].clientY - startYRef.current;

      // Ignore horizontal swipes (e.g. horizontal category pills / tables)
      if (pullRef.current === 0 && Math.abs(dx) > Math.abs(dy)) {
        trackingRef.current = false;
        return;
      }

      if (dy <= 0) {
        pullRef.current = 0;
        setPullPx(0);
        return;
      }

      // Apply slight resistance after 12px intentional pull
      if (dy > 12) {
        const damped = Math.min(MAX_PULL_PX, Math.round((dy - 12) * 0.55));
        pullRef.current = damped;
        setPullPx(damped);
      }
    };

    const onTouchEnd = () => {
      if (!trackingRef.current) return;
      trackingRef.current = false;

      if (pullRef.current >= TRIGGER_THRESHOLD_PX && !refreshingRef.current) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPullPx(56);
        void forceRefreshApp();
      } else {
        pullRef.current = 0;
        setPullPx(0);
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  if (pullPx <= 0 && !refreshing) return null;

  const readyToRelease = pullPx >= TRIGGER_THRESHOLD_PX;

  return (
    <div
      aria-live="polite"
      className="no-print fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
      style={{
        transform: `translateY(${Math.max(0, pullPx - 44)}px)`,
        transition: refreshing ? 'transform 160ms ease-out' : 'none',
      }}
    >
      <div className="bg-[#1C1714] text-[#FAF6EE] border border-[#D49B27] shadow-lg px-4 py-2 flex items-center gap-2 text-xs font-semibold">
        {refreshing ? (
          <>
            <RefreshCw className="w-3.5 h-3.5 text-[#D49B27] animate-spin" />
            <span>Refreshing Jawaka...</span>
          </>
        ) : readyToRelease ? (
          <>
            <RefreshCw className="w-3.5 h-3.5 text-[#D49B27]" />
            <span>Release to refresh</span>
          </>
        ) : (
          <>
            <ArrowDown className="w-3.5 h-3.5 text-[#D49B27]" />
            <span>Pull down to refresh</span>
          </>
        )}
      </div>
    </div>
  );
}
