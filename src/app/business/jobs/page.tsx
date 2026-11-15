'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { BusinessPortalHeader } from '@/components/business/BusinessPortalHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency } from '@/lib/currency';
import { useApp } from '@/components/providers/AppContext';

interface MyJob {
  id: string;
  hashId: string;
  title: string;
  status: string;
  income?: number | null;
  currency: string;
}

export default function BusinessJobsPage() {
  const { bootstrap, locale } = useApp();
  const [jobs, setJobs] = useState<MyJob[]>([]);

  useEffect(() => {
    apiFetch<{ jobs: MyJob[] }>('/jobs?mine=true')
      .then((res) => setJobs(res.jobs || []))
      .catch(() => setJobs([]));
  }, []);

  return (
    <div className="space-y-6">
        <BusinessPortalHeader title="My Job Openings" subtitle="Review your posted jobs and inspect incoming applicants." />
        <div className="flex justify-end">
          <Link href="/jobs">
            <Button variant="primary">Browse / Post Jobs</Button>
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {jobs.map((j) => (
            <Link key={j.id} href={`/jobs/${j.hashId || j.id}`} className="rounded-3xl border border-bord-card bg-bg-pr p-5 flex items-center justify-between">
              <div>
                <p className="font-bold text-lab-pr">{j.title}</p>
                <p className="text-cap-l text-lab-sc">
                  {j.income ? formatCurrency(j.income, j.currency, bootstrap?.currencies, locale) : 'Negotiable'}
                </p>
              </div>
              <Badge variant="brand">{j.status}</Badge>
            </Link>
          ))}
        </div>
      </div>
  );
}
