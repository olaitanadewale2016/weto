'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { sendPasswordResetEmail } from 'firebase/auth';
import { LockOpen, MailCheck } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { getFirebaseClientAuth, isFirebaseClientConfigured } from '@/lib/firebase/client';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';

export default function ForgotPasswordPage() {
  const { bootstrap } = useApp();
  const { error, success } = useToast();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const appName = bootstrap?.config?.appName || 'Weto';

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!isFirebaseClientConfigured()) {
      error('Firebase is not configured');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(getFirebaseClientAuth(), email.trim());
      setSent(true);
      success('Reset link sent', 'Check your inbox for password reset instructions.');
    } catch (err) {
      error('Could not send reset email', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      {sent ? (
        <div className="text-center space-y-3 py-4">
          <div className="flex justify-center">
            <div className="size-8 text-green-900 mb-2">
              <MailCheck className="size-8" />
            </div>
          </div>
          <h1 className="text-title-2 text-lab-pr2 font-semibold">Check your email</h1>
          <p className="text-par-m text-lab-sc">
            We sent a password reset link to <span className="font-semibold text-lab-pr">{email}</span>.
          </p>
          <div className="pt-4">
            <Link
              href="/auth/login"
              className="w-full py-3.5 px-6 text-par-n block text-center bg-fill-tr text-brand-900 font-semibold hover:bg-fill-sc smoothing rounded-full"
            >
              Back to login
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleReset}>
          <div className="mb-6 text-center">
            <div className="flex justify-center">
              <div className="size-8 text-lab-pr2 mb-2">
                <LockOpen className="size-8" />
              </div>
            </div>
            <h1 className="text-title-2 text-lab-pr2 font-semibold">Restore access</h1>
            <p className="text-par-m text-lab-sc">
              Enter your email address to recover access to your {appName} account.
            </p>
          </div>

          <div className="block">
            <div className="mb-3">
              <div className="rounded-xl relative overflow-hidden border-2 border-transparent hover:border-brand-900 focus-within:border-brand-900 smoothing">
                <input
                  type="email"
                  className="block w-full bg-input-pr tracking-normal outline-hidden text-par-m text-lab-pr px-4 h-12"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="mb-6">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-6 text-par-n block bg-fill-tr text-brand-900 font-semibold hover:bg-fill-sc smoothing rounded-full cursor-pointer disabled:opacity-60"
              >
                {loading ? 'Sending...' : 'Continue'}
              </button>
              <Link
                href="/auth/login"
                className="w-full py-3.5 px-6 text-par-n block text-center bg-transparent text-lab-sc hover:text-brand-900 smoothing rounded-full"
              >
                Back to login
              </Link>
            </div>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
