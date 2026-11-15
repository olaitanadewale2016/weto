'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { linkWithPopup } from 'firebase/auth';
import { ArrowLeft, Link2 } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/button';
import { AccountManagerPanel } from '@/components/modals/AccountSwitcherModal';
import {
  getFirebaseClientAuth,
  googleAuthProvider,
  isFirebaseClientConfigured,
} from '@/lib/firebase/client';
import { useToast } from '@/components/providers/ToastProvider';

export default function LinkAccountPage() {
  const router = useRouter();
  const { success, error } = useToast();
  const [linkingGoogle, setLinkingGoogle] = useState(false);

  async function handleLinkGoogle() {
    if (!isFirebaseClientConfigured()) {
      error('Google account linking is not configured.');
      return;
    }

    setLinkingGoogle(true);
    try {
      const auth = getFirebaseClientAuth();
      if (!auth.currentUser) {
        router.push('/auth/login');
        return;
      }
      await linkWithPopup(auth.currentUser, googleAuthProvider);
      success('Google account linked successfully!');
      router.push('/settings');
    } catch (err) {
      error(err instanceof Error ? err.message : 'Unable to link Google account.');
    } finally {
      setLinkingGoogle(false);
    }
  }

  return (
    <AuthShell
      heading="Switch or link accounts"
      subheading="Manage your connected Weto profiles or connect Google sign-in for one-click authentication."
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-par-m font-bold text-lab-pr">Linked Weto Profiles</h2>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1 text-cap-l font-semibold text-lab-sc hover:text-lab-pr"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Settings
            </Link>
          </div>
          <AccountManagerPanel redirectOnSwitch="/home" />
        </div>

        <div className="border-t border-bord-pr pt-5 space-y-3">
          <h3 className="text-par-s font-bold text-lab-pr">External Sign-In Provider</h3>
          <div className="rounded-xl border border-bord-pr bg-fill-qt p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-full bg-bg-pr border border-bord-pr flex items-center justify-center shrink-0">
                <Link2 className="h-4 w-4 text-lab-pr" />
              </div>
              <div className="min-w-0">
                <p className="text-par-s font-semibold text-lab-pr">Google Authentication</p>
                <p className="text-cap-s text-lab-sc truncate">
                  Connect Google for one-click sign-in
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleLinkGoogle}
              loading={linkingGoogle}
              disabled={!isFirebaseClientConfigured()}
            >
              Link Google
            </Button>
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
