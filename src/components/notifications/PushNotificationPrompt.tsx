'use client';

import React, { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp } from '@/components/providers/AppContext';

const DISMISS_KEY = 'cp_push_prompt_dismissed';
const COOLDOWN_DAYS = 5;

export function PushNotificationPrompt() {
  const { user, enablePushNotifications } = useApp();
  const [visible, setVisible] = useState(false);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    if (!user) {
      setVisible(false);
      return;
    }

    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }

    // Only prompt if permission is currently default (not granted or denied)
    if (Notification.permission !== 'default') {
      return;
    }

    // Check if dismissed recently
    try {
      const dismissedAt = localStorage.getItem(DISMISS_KEY);
      if (dismissedAt) {
        const diffMs = Date.now() - Number(dismissedAt);
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays < COOLDOWN_DAYS) {
          return;
        }
      }
    } catch {
      // ignore
    }

    // Delay prompt slightly so page loads gracefully first
    const timer = setTimeout(() => {
      setVisible(true);
    }, 2500);

    return () => clearTimeout(timer);
  }, [user]);

  const handleDismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  };

  const handleEnable = async () => {
    setEnabling(true);
    try {
      const ok = await enablePushNotifications();
      if (ok) {
        setVisible(false);
      }
    } finally {
      setEnabling(false);
    }
  };

  if (!visible) return null;

  return (
    <aside
      aria-label="Push notification prompt"
      className="fixed z-50 bottom-20 md:bottom-6 right-3 md:right-6 left-3 sm:left-auto sm:w-96 rounded-2xl border border-bord-pr bg-bg-pr/98 backdrop-blur-md p-4 shadow-2xl transition-all animate-in fade-in slide-in-from-bottom-4 duration-300"
    >
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-full bg-brand-900/10 text-brand-900 flex items-center justify-center shrink-0 mt-0.5">
          <Bell className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-par-n font-bold text-lab-pr">
              Enable Push Notifications
            </h4>
            <button
              type="button"
              onClick={handleDismiss}
              className="p-1 -mr-1 rounded-full text-lab-tr hover:text-lab-pr hover:bg-fill-sc cursor-pointer"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="text-cap-l text-lab-sc mt-1 leading-snug">
            Get instant real-time alerts for new messages and activity, just like a native app.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={enabling}
              onClick={handleEnable}
              className="flex-1 text-cap-l"
            >
              Turn on notifications
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={enabling}
              onClick={handleDismiss}
              className="text-cap-l text-lab-sc hover:text-lab-pr"
            >
              Not now
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
