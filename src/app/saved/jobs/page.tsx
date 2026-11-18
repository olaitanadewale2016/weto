'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Briefcase } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { EmptyState } from '@/components/ui/empty-state';
import { apiFetch } from '@/lib/api-client';

interface SavedJob {
  id: string;
  hashId: string;
  title: string;
  location?: string;
  income?: number | null;
  currency: string;
}

export default function SavedJobsPage() {
  const [jobs, setJobs] = useState<SavedJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ jobs: SavedJob[] }>('/jobs?saved=true')
      .then((res) => setJobs(res.jobs || []))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell hideMobileHeader>
      <div className="sticky top-0 z-20 bg-bg-pr/95 backdrop-blur-md pt-safe px-safe border-b border-bord-pr">
        <div className="px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/"
              className="md:hidden p-1.5 -ml-1.5 rounded-full text-lab-pr hover:bg-fill-tr shrink-0"
              aria-label="Back to home"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-title-3 font-bold text-lab-pr truncate">Saved &amp; Bookmarks</h1>
              <p className="text-cap-l text-lab-sc truncate">Posts, products, and jobs you saved for later.</p>
            </div>
          </div>
        </div>

        {/* Tab Switcher: Posts vs Products vs Jobs */}
        <div className="flex border-t border-bord-tr/60 px-2">
          <Link
            href="/bookmarks"
            className="flex-1 py-2.5 text-center text-par-s font-semibold text-lab-sc hover:text-lab-pr border-b-2 border-transparent transition-colors"
          >
            Posts
          </Link>
          <Link
            href="/saved/products"
            className="flex-1 py-2.5 text-center text-par-s font-semibold text-lab-sc hover:text-lab-pr border-b-2 border-transparent transition-colors"
          >
            Products
          </Link>
          <Link
            href="/saved/jobs"
            className="flex-1 py-2.5 text-center text-par-s font-semibold text-brand-900 border-b-2 border-brand-900"
          >
            Jobs
          </Link>
        </div>
      </div>
      <div className="p-4 sm:p-6 space-y-5">

        {loading ? (
          <p className="text-lab-sc py-8 text-center">Loading saved jobs...</p>
        ) : jobs.length === 0 ? (
          <EmptyState icon={Briefcase} title="No saved jobs" description="Bookmark jobs you want to apply to later." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {jobs.map((j) => (
              <Link
                key={j.id}
                href={`/jobs/${j.hashId || j.id}`}
                className="rounded-3xl border border-bord-card bg-bg-pr p-5 hover:shadow-vertical-qt"
              >
                <p className="font-bold text-lab-pr">{j.title}</p>
                <p className="text-cap-l text-lab-sc mt-1">
                  {j.income ? `${j.currency} ${j.income.toLocaleString()}` : 'Competitive'} · {j.location || 'Remote'}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
