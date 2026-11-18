import { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton({ variant = 'header' }: { variant?: 'header' | 'landing' }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const sizeClass = variant === 'landing' ? 'min-h-[48px] px-5 py-3 text-sm' : 'min-h-[40px] px-3 py-1.5 text-xs';

  if (isInstallable) {
    return (
      <button
        onClick={() => void install()}
        className={`${sizeClass} bg-[#D49B27] text-[#1C1714] font-bold flex items-center gap-1.5 hover:brightness-95 transition-all whitespace-nowrap shrink-0`}
      >
        <Download className="w-4 h-4" />
        Install App
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className={`${sizeClass} border border-[#1C1714] bg-[#FFF5D6] text-[#1C1714] font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0`}
        >
          <Share className="w-4 h-4" />
          Install App
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-[#FAF6EE] border border-[#D9CEBC] p-6 shadow-xl">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-display text-xl font-bold text-[#1C1714]">
                  Install Jawaka on iPhone / iPad
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close install instructions"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <ol className="text-sm text-[#61554C] space-y-2 list-decimal list-inside mb-5">
                <li>
                  Tap the <strong className="text-[#1C1714]">Share</strong> icon in Safari's bottom
                  toolbar.
                </li>
                <li>
                  Scroll down and tap <strong className="text-[#1C1714]">Add to Home Screen</strong>.
                </li>
                <li>Open Jawaka from your home screen with persistent sign-in.</li>
              </ol>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[44px] bg-[#1C1714] text-[#FAF6EE] text-sm font-semibold"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
