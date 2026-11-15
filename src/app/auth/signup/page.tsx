'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { Eye, EyeOff } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { apiFetch } from '@/lib/api-client';
import {
  getFirebaseClientAuth,
  googleAuthProvider,
  isFirebaseClientConfigured,
} from '@/lib/firebase/client';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';

export default function SignupPage() {
  const router = useRouter();
  const { bootstrap, refreshBootstrap } = useApp();
  const { error, success } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const appName = bootstrap?.config?.appName || 'Weto';

  async function completeSession(idToken: string) {
    const res = await apiFetch<{ user: { status: string; onboardingStep?: string } }>('/auth/session', {
      method: 'POST',
      json: { idToken },
    });
    await refreshBootstrap();
    success('Account created!');
    if (res.user.status === 'onboarding') {
      router.push(`/onboarding/step/${res.user.onboardingStep || 'profile'}`);
    } else {
      router.push('/');
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!isFirebaseClientConfigured()) {
      error('Firebase not configured', 'Please populate NEXT_PUBLIC_FIREBASE_* environment variables.');
      return;
    }
    setLoading(true);
    try {
      const auth = getFirebaseClientAuth();
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (name.trim()) {
        await updateProfile(cred.user, { displayName: name.trim() });
      }
      sendEmailVerification(cred.user).catch(() => undefined);
      const idToken = await cred.user.getIdToken(true);
      await completeSession(idToken);
    } catch (err) {
      error('Registration failed', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignup() {
    if (!isFirebaseClientConfigured()) {
      error('Firebase not configured');
      return;
    }
    setLoading(true);
    try {
      const auth = getFirebaseClientAuth();
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      await completeSession(idToken);
    } catch (err) {
      error('Google sign up failed', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <form onSubmit={handleSignup}>
        <div className="mb-6 text-center">
          <h1 className="text-title-2 text-lab-pr2 font-semibold">Sign up for {appName}</h1>
          <p className="text-par-m text-lab-sc">Join the community and create your account</p>
        </div>

        <div className="block">
          <div className="flex flex-col gap-3 mb-6">
            <button
              type="button"
              onClick={handleGoogleSignup}
              disabled={loading}
              className="rounded-full border border-bord-pr block leading-none cursor-pointer hover:bg-fill-fv smoothing"
            >
              <div className="flex relative h-12 items-center">
                <div className="absolute left-3 top-3 size-6 block overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="w-full" src="/assets/social-logos/google.png" alt="Google" />
                </div>
                <span className="text-center block w-full text-lab-pr2 text-par-s md:text-par-n font-semibold">
                  Sign up with Google
                </span>
              </div>
            </button>
          </div>

          <div className="mb-6 flex items-center gap-4 leading-none">
            <div className="h-px flex-1 bg-fill-pr" />
            <div className="text-par-s text-lab-sc">or continue with</div>
            <div className="h-px flex-1 bg-fill-pr" />
          </div>

          <div className="mb-3 space-y-3">
            <div className="rounded-xl relative overflow-hidden border-2 border-transparent hover:border-brand-900 focus-within:border-brand-900 smoothing">
              <input
                type="text"
                className="block w-full bg-input-pr tracking-normal outline-hidden text-par-m text-lab-pr px-4 h-12"
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

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

            <div className="rounded-xl relative overflow-hidden border-2 border-transparent hover:border-brand-900 focus-within:border-brand-900 smoothing">
              <input
                type={showPassword ? 'text' : 'password'}
                className="block w-full bg-input-pr tracking-normal outline-hidden text-par-m text-lab-pr px-4 pr-12 h-12"
                placeholder="Minimum 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
              <span className="absolute right-0 top-0 h-full inline-flex items-center justify-center px-4 bg-input-pr">
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="size-5 cursor-pointer text-lab-sc outline-hidden"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </span>
            </div>
          </div>

          <div className="mb-6">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-6 text-par-n block bg-fill-tr text-brand-900 font-semibold hover:bg-fill-sc smoothing rounded-full cursor-pointer disabled:opacity-60"
            >
              {loading ? 'Creating account...' : 'Continue'}
            </button>
            <Link
              href="/auth/login"
              className="w-full py-3.5 px-6 text-par-n block text-center bg-transparent text-lab-sc hover:text-brand-900 smoothing rounded-full"
            >
              Already have an account?
            </Link>
          </div>

          <p className="text-par-s text-lab-sc text-center">
            By continuing you agree to our{' '}
            <Link href="/document/terms" className="text-brand-900 hover:underline">
              Terms of Use
            </Link>{' '}
            and{' '}
            <Link href="/document/privacy" className="text-brand-900 hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </form>
    </AuthShell>
  );
}
