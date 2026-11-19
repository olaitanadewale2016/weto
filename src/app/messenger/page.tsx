'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { AppShell } from '@/components/layout/AppShell';

const MessengerClient = dynamic(
  () => import('@/components/messenger/MessengerClient').then((mod) => mod.MessengerClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-bg-pr">
        <div className="flex flex-col items-center gap-3 text-lab-sc">
          <div className="size-8 rounded-full border-2 border-brand-900 border-t-transparent animate-spin" />
          <p className="text-par-s">Loading messenger...</p>
        </div>
      </div>
    ),
  }
);

export default function MessengerPage() {
  return (
    <AppShell fullWidth hideDesktopSidebar hideMobileChrome>
      <MessengerClient />
    </AppShell>
  );
}
