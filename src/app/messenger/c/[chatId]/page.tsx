'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { MessengerClient } from '@/components/messenger/MessengerClient';

export default function MessengerChatPage() {
  const params = useParams<{ chatId: string }>();
  return (
    <AppShell fullWidth hideMobileChrome>
      <MessengerClient activeChatId={params.chatId} />
    </AppShell>
  );
}
