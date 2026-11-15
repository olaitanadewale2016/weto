'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

type NetworkState = 'hidden' | 'offline' | 'reconnecting' | 'online';

/**
 * Replicates PHP `NetworkStatusBar.vue` and extends it for Next.js PWA:
 * - Detects browser `offline` / `online` events and iOS PWA foreground wakeups (`visibilitychange`)
 * - Polls `/api/v1/geo` every 5s while offline so mobile PWAs detect recovered connectivity reliably
 * - On reconnection: runs `onReconnect()`, calls `router.refresh()`, and dispatches `weto:network-restored`
 *   so active pages (Feed, Messenger, Notifications, Marketplace) reload fresh data automatically.
 */
export function NetworkStatusBar({
  onReconnect,
}: {
  onReconnect?: () => Promise<void> | void;
}) {
  const router = useRouter();
  const [networkState, setNetworkState] = useState<NetworkState>('hidden');
  const [checking, setChecking] = useState(false);
  const wasOfflineRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onReconnectRef = useRef(onReconnect);

  useEffect(() => {
    onReconnectRef.current = onReconnect;
  }, [onReconnect]);

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const triggerRestoredFlow = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/v1/geo', { method: 'GET', cache: 'no-store' });
      if (!res.ok) {
        setNetworkState('offline');
        wasOfflineRef.current = true;
        return false;
      }

      wasOfflineRef.current = false;
      clearHideTimer();
      setNetworkState('online');

      try {
        await onReconnectRef.current?.();
      } catch {
        // non-blocking bootstrap refresh
      }

      router.refresh();
      window.dispatchEvent(new CustomEvent('weto:network-restored'));

      hideTimerRef.current = setTimeout(() => {
        setNetworkState('hidden');
      }, 3500);
      return true;
    } catch {
      setNetworkState('offline');
      wasOfflineRef.current = true;
      return false;
    } finally {
      setChecking(false);
    }
  }, [router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOffline = () => {
      clearHideTimer();
      wasOfflineRef.current = true;
      setNetworkState('offline');
    };

    const handleOnline = () => {
      if (wasOfflineRef.current) {
        setNetworkState('reconnecting');
        void triggerRestoredFlow();
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (!navigator.onLine) {
          handleOffline();
        } else if (wasOfflineRef.current) {
          setNetworkState('reconnecting');
          void triggerRestoredFlow();
        }
      }
    };

    if (!navigator.onLine) {
      const t = setTimeout(handleOffline, 0);
      window.addEventListener('offline', handleOffline);
      window.addEventListener('online', handleOnline);
      document.addEventListener('visibilitychange', handleVisibility);
      return () => {
        clearTimeout(t);
        clearHideTimer();
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('online', handleOnline);
        document.removeEventListener('visibilitychange', handleVisibility);
      };
    }

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearHideTimer();
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [triggerRestoredFlow]);

  // Lightweight probe while offline (useful for iOS PWA resuming from airplane/tunnel)
  useEffect(() => {
    if (networkState !== 'offline') return;
    const interval = setInterval(() => {
      if (navigator.onLine) {
        void triggerRestoredFlow();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [networkState, triggerRestoredFlow]);

  if (networkState === 'hidden') return null;

  const isOffline = networkState === 'offline';
  const isReconnecting = networkState === 'reconnecting';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed left-0 right-0 bottom-[calc(3.75rem+max(0.5rem,env(safe-area-inset-bottom)))] md:bottom-0 z-[110] px-4 py-2 text-white text-par-s font-medium shadow-md transition-colors ${
        isOffline || isReconnecting ? 'bg-red-900' : 'bg-green-900'
      }`}
    >
      <div className="max-w-3xl mx-auto flex items-center justify-center gap-2.5 flex-wrap">
        {isOffline ? (
          <>
            <WifiOff className="size-4 shrink-0" />
            <span>You are offline — waiting for connection</span>
            <button
              type="button"
              onClick={() => void triggerRestoredFlow()}
              disabled={checking}
              className="inline-flex items-center gap-1 rounded-full bg-white/15 hover:bg-white/25 px-2.5 py-0.5 text-cap-s font-semibold cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`size-3 ${checking ? 'animate-spin' : ''}`} />
              Retry
            </button>
          </>
        ) : isReconnecting ? (
          <>
            <RefreshCw className="size-4 shrink-0 animate-spin" />
            <span>Reconnecting &amp; syncing content...</span>
          </>
        ) : (
          <>
            <Wifi className="size-4 shrink-0" />
            <span>Back online — content refreshed</span>
          </>
        )}
      </div>
    </div>
  );
}
