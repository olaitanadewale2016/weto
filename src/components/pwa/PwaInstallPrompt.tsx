'use client';

import React, { useEffect, useState } from 'react';
import { Download, PlusSquare, Share, Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useApp } from '@/components/providers/AppContext';

const DISMISS_STORAGE_KEY = 'cp_pwa_install_dismissed_at';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function PwaInstallPrompt() {
  const {
    bootstrap,
    canInstallPwa,
    isPwaInstalled,
    isIosDevice,
    pwaInstallGuideOpen,
    setPwaInstallGuideOpen,
    promptPwaInstall,
  } = useApp();

  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let isSuppressed = false;
    try {
      const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
      if (raw) {
        const ts = Number(raw);
        if (Number.isFinite(ts) && Date.now() - ts < DISMISS_TTL_MS) {
          isSuppressed = true;
        }
      }
    } catch {
      // ignore storage failures
    }
    const id = setTimeout(() => setDismissed(isSuppressed), 0);
    return () => clearTimeout(id);
  }, []);

  const pwaEnabled = bootstrap?.config?.pwaEnabled !== false;
  if (!pwaEnabled || isPwaInstalled) return null;

  const appName = bootstrap?.config?.appName || 'Weto';
  const showFloatingBanner = !dismissed && (canInstallPwa || isIosDevice);

  function handleDismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  }

  return (
    <>
      {showFloatingBanner && (
        <div
          role="region"
          aria-label={`Install ${appName} app`}
          className="fixed bottom-[calc(4.5rem+max(0.5rem,env(safe-area-inset-bottom)))] md:bottom-5 left-3 right-3 md:left-auto md:right-5 md:w-[340px] z-[65] rounded-2xl border border-bord-card bg-bg-pr/95 backdrop-blur-md shadow-vertical-tr p-3.5 flex items-center gap-3"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/pwa/icons/192x192.png"
            alt={appName}
            className="size-11 rounded-xl border border-bord-tr shrink-0 object-cover bg-fill-qt"
          />
          <div className="min-w-0 flex-1">
            <p className="text-par-s font-bold text-lab-pr truncate">Install {appName}</p>
            <p className="text-cap-s text-lab-sc leading-snug line-clamp-2">
              {canInstallPwa
                ? 'Add to your home screen for faster app experience.'
                : 'Tap Install for 2-step iPhone / iPad home screen setup.'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="primary"
              onClick={() => void promptPwaInstall()}
              className="rounded-full"
            >
              <Download className="size-3.5" />
              Install
            </Button>
            <button
              type="button"
              onClick={handleDismiss}
              className="size-7 rounded-full text-lab-sc hover:text-lab-pr hover:bg-fill-qt flex items-center justify-center cursor-pointer"
              aria-label="Dismiss install prompt"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      <Modal
        open={pwaInstallGuideOpen}
        onClose={() => setPwaInstallGuideOpen(false)}
        title={`Install ${appName} App`}
        description="Get instant launch from your home screen with full-screen app navigation."
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-bord-pr bg-fill-qt/50 p-3.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/pwa/icons/192x192.png"
              alt={appName}
              className="size-12 rounded-2xl border border-bord-tr shrink-0 object-cover"
            />
            <div className="min-w-0">
              <p className="font-bold text-par-n text-lab-pr">{appName} App</p>
              <p className="text-cap-s text-lab-sc">Fast, lightweight Progressive Web App</p>
            </div>
          </div>

          {isIosDevice ? (
            <ol className="space-y-3 text-par-s text-lab-pr2">
              <li className="flex items-start gap-3 rounded-xl border border-bord-tr p-3">
                <span className="size-7 rounded-full bg-brand-900/10 text-brand-900 flex items-center justify-center shrink-0">
                  <Share className="size-4" />
                </span>
                <div>
                  <p className="font-semibold text-lab-pr">1. Tap the Share button</p>
                  <p className="text-cap-l text-lab-sc">
                    Open Safari&apos;s Share bar at the bottom or top of your screen.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3 rounded-xl border border-bord-tr p-3">
                <span className="size-7 rounded-full bg-brand-900/10 text-brand-900 flex items-center justify-center shrink-0">
                  <PlusSquare className="size-4" />
                </span>
                <div>
                  <p className="font-semibold text-lab-pr">2. Select &ldquo;Add to Home Screen&rdquo;</p>
                  <p className="text-cap-l text-lab-sc">
                    Scroll down in the Share sheet and tap Add to finish installing.
                  </p>
                </div>
              </li>
            </ol>
          ) : (
            <ol className="space-y-3 text-par-s text-lab-pr2">
              <li className="flex items-start gap-3 rounded-xl border border-bord-tr p-3">
                <span className="size-7 rounded-full bg-brand-900/10 text-brand-900 flex items-center justify-center shrink-0">
                  <Smartphone className="size-4" />
                </span>
                <div>
                  <p className="font-semibold text-lab-pr">1. Open browser menu or address bar</p>
                  <p className="text-cap-l text-lab-sc">
                    Tap the browser install icon in the address bar or open the three-dot menu.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3 rounded-xl border border-bord-tr p-3">
                <span className="size-7 rounded-full bg-brand-900/10 text-brand-900 flex items-center justify-center shrink-0">
                  <Download className="size-4" />
                </span>
                <div>
                  <p className="font-semibold text-lab-pr">2. Choose &ldquo;Install app&rdquo; or &ldquo;Add to Home screen&rdquo;</p>
                  <p className="text-cap-l text-lab-sc">
                    Confirm the prompt to add {appName} directly to your device.
                  </p>
                </div>
              </li>
            </ol>
          )}

          <div className="flex justify-end">
            <Button variant="primary" onClick={() => setPwaInstallGuideOpen(false)}>
              Got it
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
