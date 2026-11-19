'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';

const MessengerClient = dynamic(
  () => import('@/components/messenger/MessengerClient').then((mod) => mod.MessengerClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-bg-pr">
        <div className="flex flex-col items-center gap-3 text-lab-sc">
          <div className="size-8 rounded-full border-2 border-brand-900 border-t-transparent animate-spin" />
          <p className="text-par-s">Loading conversation...</p>
        </div>
      </div>
    ),
  }
);

export default function MessengerChatPage() {
  const params = useParams<{ chatId: string }>();
  return (
    <AppShell fullWidth hideDesktopSidebar hideMobileChrome>
      <MessengerClient activeChatId={params.chatId} />
    </AppShell>
  );
}
