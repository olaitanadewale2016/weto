'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { linkWithPopup } from 'firebase/auth';
import { Link2 } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/button';
import { getFirebaseClientAuth, googleAuthProvider, isFirebaseClientConfigured } from '@/lib/firebase/client';
import { useToast } from '@/components/providers/ToastProvider';

export default function LinkAccountPage() {
  const router = useRouter();
  const { success, error } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleLinkGoogle() {
    if (!isFirebaseClientConfigured()) {
      error('Firebase not configured');
      return;
    }
    const auth = getFirebaseClientAuth();
    if (!auth.currentUser) {
      router.push('/auth/login');
      return;
    }
    setLoading(true);
    try {
      await linkWithPopup(auth.currentUser, googleAuthProvider);
      success('Google account linked successfully');
      router.push('/settings');
    } catch (err) {
      error('Failed to link Google account', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      heading="Link Social Provider"
      subheading="Connect Google sign-in to your existing Weto account for one-click authentication."
    >
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-2 text-brand-900">
          <Link2 className="h-5 w-5" />
          <span className="text-par-m font-medium text-lab-pr">Google Authentication</span>
        </div>
        <Button variant="primary" size="lg" className="w-full" onClick={handleLinkGoogle} loading={loading}>
          Link Google Account
        </Button>
      </div>
    </AuthShell>
  );
}
