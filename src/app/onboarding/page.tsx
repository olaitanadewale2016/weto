'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/providers/AppContext';

export default function OnboardingIndexPage() {
  const router = useRouter();
  const { user, loading } = useApp();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/auth/login');
      return;
    }
    if (user.status === 'onboarding') {
      router.replace(`/onboarding/step/${user.onboardingStep || 'profile'}`);
    } else {
      router.replace('/');
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-pr">
      <div className="size-8 rounded-full border-2 border-brand-900 border-t-transparent animate-spin" />
    </div>
  );
}
