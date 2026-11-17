'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  sendEmailVerification,
  signInWithPopup,
  signInWithRedirect,
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
import { clearBootstrapCache, useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';

function formatFirebaseAuthError(err: unknown): { title: string; description: string; ignore?: boolean } {
  const code = (err as { code?: string })?.code || '';
  const rawMsg = err instanceof Error ? err.message : String(err || '');

  if (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request' ||
    code === 'auth/null-user'
  ) {
    return { title: '', description: '', ignore: true };
  }

  if (code === 'auth/unauthorized-domain') {
    const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
    return {
      title: 'Domain not authorized in Firebase',
      description: `"${host}" is not in Firebase Console > Authentication > Settings > Authorized Domains. Add it to allow Google signup.`,
    };
  }

  if (code === 'auth/operation-not-supported-in-this-environment') {
    return {
      title: 'Google Sign-In unavailable in PWA container',
      description: 'Google popup/redirect is restricted in this standalone PWA. Please create an account using email & password, or open Weto in your mobile browser.',
    };
  }

  if (code === 'auth/network-request-failed') {
    return {
      title: 'Network error',
      description: 'Could not connect to Firebase authentication servers. Please check your connection.',
    };
  }

  const cleanMsg = rawMsg
    .replace(/^Firebase:\s*/i, '')
    .replace(/^Error\s*\((auth\/[^)]+)\)\.?/i, '$1')
    .trim();

  return {
    title: 'Google sign up failed',
    description: cleanMsg || 'Unable to authenticate with Google.',
  };
}

export default function SignupPage() {
  const { user, loading: appLoading, bootstrap, refreshBootstrap } = useApp();
  const { error, success } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const redirectCheckedRef = useRef(false);

  const appName = bootstrap?.config?.appName || 'Weto';

  // If already authenticated, redirect to home immediately
  useEffect(() => {
    if (user && !appLoading) {
      window.location.assign('/');
    }
  }, [user, appLoading]);

  // Handle Google OAuth redirect result — always check on mount
  useEffect(() => {
    if (!isFirebaseClientConfigured() || redirectCheckedRef.current) return;
    redirectCheckedRef.current = true;
    try {
      const auth = getFirebaseClientAuth();
      getRedirectResult(auth)
        .then(async (cred) => {
          if (cred?.user) {
            setLoading(true);
            try {
              const idToken = await cred.user.getIdToken(true);
              await completeSession(idToken);
            } catch (err: unknown) {
              const formatted = formatFirebaseAuthError(err);
              if (!formatted.ignore && formatted.description) {
                error(formatted.title, formatted.description);
              }
            } finally {
              setLoading(false);
            }
          }
        })
        .catch((err: unknown) => {
          const formatted = formatFirebaseAuthError(err);
          if (!formatted.ignore && formatted.description) {
            error(formatted.title, formatted.description);
          }
        });
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function completeSession(idToken: string) {
    clearBootstrapCache();
    // Pre-store idToken so Bearer auth works during the session POST itself
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('cp_token', idToken); } catch { /* ignore */ }
    }
    const res = await apiFetch<{
      token?: string;
      idToken?: string;
      user: { status: string; onboardingStep?: string };
    }>('/auth/session', {
      method: 'POST',
      json: { idToken },
    });
    const sessionToken = res.token || res.idToken || idToken;
    if (typeof window !== 'undefined' && sessionToken) {
      try { localStorage.setItem('cp_token', sessionToken); } catch { /* ignore */ }
    }
    await refreshBootstrap();
    success('Account created!');
    setTimeout(() => {
      if (res.user.status === 'onboarding') {
        window.location.assign(`/onboarding/step/${res.user.onboardingStep || 'profile'}`);
      } else {
        window.location.assign('/');
      }
    }, 300);
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
      const fbCode = (err as { code?: string })?.code || '';
      const msg =
        fbCode === 'auth/email-already-in-use'
          ? 'An account with this email already exists. Please sign in instead.'
          : fbCode === 'auth/weak-password'
          ? 'Password is too weak. Please use at least 6 characters.'
          : err instanceof Error
          ? err.message.replace(/^Firebase:\s*/i, '')
          : 'Registration failed';
      error('Registration failed', msg);
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
      let cred = null;
      try {
        cred = await signInWithPopup(auth, googleAuthProvider);
      } catch (popupErr: unknown) {
        const pCode = (popupErr as { code?: string })?.code;

        // If user dismissed popup, return cleanly
        if (pCode === 'auth/popup-closed-by-user' || pCode === 'auth/cancelled-popup-request') {
          setLoading(false);
          return;
        }

        // If domain is unauthorized, show helpful message immediately
        if (pCode === 'auth/unauthorized-domain') {
          throw popupErr;
        }

        // Attempt redirect flow if popup was blocked or unsupported (PWA standalone)
        if (
          pCode === 'auth/popup-blocked' ||
          pCode === 'auth/operation-not-supported-in-this-environment' ||
          (popupErr instanceof Error && popupErr.message.toLowerCase().includes('popup'))
        ) {
          try { sessionStorage.setItem('cp_google_redirect', '1'); } catch { /* ignore */ }
          await signInWithRedirect(auth, googleAuthProvider);
          return;
        }
        throw popupErr;
      }

      if (cred?.user) {
        const idToken = await cred.user.getIdToken();
        await completeSession(idToken);
      }
    } catch (err: unknown) {
      const formatted = formatFirebaseAuthError(err);
      if (!formatted.ignore) {
        error(formatted.title, formatted.description);
      }
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
