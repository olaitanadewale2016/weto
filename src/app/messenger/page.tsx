'use client';

import React from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { MessengerClient } from '@/components/messenger/MessengerClient';

export default function MessengerPage() {
  return (
    <AppShell fullWidth hideMobileChrome>
      <MessengerClient />
    </AppShell>
  );
}
