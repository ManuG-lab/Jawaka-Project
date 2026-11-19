import { useEffect, useRef, useState } from 'react';
import { ArrowDown, RefreshCw } from 'lucide-react';

const START_OFFSET_PX = 12;
const TRIGGER_THRESHOLD_PX = 68;
const MAX_PULL_PX = 96;

function isEditableOrNestedScroll(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('input, textarea, select, [contenteditable="true"]')) {
    return true;
  }

  let el: HTMLElement | null = target;
  while (el && el !== document.body && el !== document.documentElement) {
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollTop > 1) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

async function refreshPageAndServiceWorker(): Promise<void> {
  try {
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
    // Proceed with standard reload if SW check fails
  }
  window.location.reload();
}

export function PullToRefresh() {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const armedRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const pullDistanceRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    const setDistance = (next: number) => {
      pullDistanceRef.current = next;
      setPullDistance(next);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1) {
        armedRef.current = false;
        return;
      }
      const atTop = window.scrollY <= 1 && document.documentElement.scrollTop <= 1;
      if (!atTop || isEditableOrNestedScroll(e.target)) {
        armedRef.current = false;
        return;
      }
      armedRef.current = true;
      startXRef.current = e.touches[0].clientX;
      startYRef.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!armedRef.current || refreshingRef.current || e.touches.length !== 1) return;

      const dy = e.touches[0].clientY - startYRef.current;
      const dx = Math.abs(e.touches[0].clientX - startXRef.current);

      if (dy <= 0 || dx > dy || window.scrollY > 2) {
        armedRef.current = false;
        if (pullDistanceRef.current !== 0) setDistance(0);
        return;
      }

      if (dy < START_OFFSET_PX) {
        return;
      }

      const damped = Math.min(MAX_PULL_PX, (dy - START_OFFSET_PX) * 0.48);
      setDistance(damped);
    };

    const onTouchEnd = () => {
      if (!armedRef.current) return;
      armedRef.current = false;

      if (pullDistanceRef.current >= TRIGGER_THRESHOLD_PX && !refreshingRef.current) {
        refreshingRef.current = true;
        setRefreshing(true);
        setDistance(52);
        void refreshPageAndServiceWorker();
      } else {
        setDistance(0);
      }
    };

    const onTouchCancel = () => {
      armedRef.current = false;
      if (!refreshingRef.current) setDistance(0);
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchCancel);
    };
  }, []);

  if (pullDistance <= 0 && !refreshing) {
    return null;
  }

  const readyToTrigger = pullDistance >= TRIGGER_THRESHOLD_PX;

  return (
    <div
      aria-live="polite"
      className="fixed left-0 right-0 top-0 z-50 pointer-events-none flex justify-center transition-transform duration-150"
      style={{
        transform: `translateY(${Math.max(8, pullDistance - 24)}px)`,
      }}
    >
      <div className="bg-[#1C1714] text-[#FAF6EE] border border-[#D49B27] shadow-lg px-3.5 py-1.5 flex items-center gap-2 text-xs font-semibold">
        {refreshing ? (
          <>
            <RefreshCw className="w-3.5 h-3.5 text-[#D49B27] animate-spin" />
            <span>Refreshing...</span>
          </>
        ) : readyToTrigger ? (
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
