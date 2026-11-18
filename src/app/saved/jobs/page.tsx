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
    <AppShell fullWidth hideMobileHeader>
      <div className="sticky top-0 z-20 bg-bg-pr/95 backdrop-blur-md pt-safe px-safe border-b border-bord-pr px-4 py-3 flex items-center gap-3">
        <Link href="/jobs" className="p-1.5 rounded-full hover:bg-fill-sc" aria-label="Back to jobs">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-title-3 font-bold text-lab-pr">Saved Jobs</h1>
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
