'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bookmark, Briefcase } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency } from '@/lib/currency';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';

interface SavedJob {
  id: string;
  hashId: string;
  title: string;
  overview?: string;
  type?: string;
  location?: string;
  income?: number | null;
  isStartIncome?: boolean;
  currency: string;
  isRemote?: boolean;
  isUrgent?: boolean;
  employer?: {
    username: string;
    firstName: string;
    lastName: string;
    avatar: string;
    verified?: boolean;
  };
  applicationStatus?: string | null;
}

export default function SavedJobsPage() {
  const router = useRouter();
  const { user, bootstrap, locale } = useApp();
  const { success } = useToast();
  const [jobs, setJobs] = useState<SavedJob[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSaved = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ jobs: SavedJob[] }>('/jobs?saved=true');
      setJobs(res.jobs || []);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadSaved();
    }, 0);
    return () => clearTimeout(id);
  }, [loadSaved]);

  async function handleToggleBookmark(jobId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await apiFetch<{ bookmarked: boolean }>(`/jobs/${jobId}`, {
        method: 'PATCH',
        json: { action: 'bookmark' },
      });
      if (!res.bookmarked) {
        setJobs((prev) => prev.filter((item) => item.id !== jobId && item.hashId !== jobId));
        success('Removed from saved jobs');
      }
    } catch {
      // ignore
    }
  }

  return (
    <AppShell hideMobileHeader>
      {/* Exact Header matching Bookmarks, Marketplace & Notifications */}
      <div className="sticky top-0 z-20 pt-safe px-safe bg-bg-pr/95 backdrop-blur-md border-b border-bord-pr">
        <div className="px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => router.back()}
              className="md:hidden p-1.5 -ml-1.5 rounded-full text-lab-pr hover:bg-fill-tr cursor-pointer shrink-0"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
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
            className="flex-1 py-2.5 text-center text-par-s font-bold text-lab-pr border-b-2 border-brand-900"
          >
            Jobs
          </Link>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {!user ? (
          <div className="p-8 text-center space-y-4">
            <EmptyState
              icon={Briefcase}
              title="Save jobs for later"
              description="Sign in to view and apply to your saved opportunities."
            />
            <Link href="/auth/login" className="inline-block">
              <Button variant="primary">Sign in</Button>
            </Link>
          </div>
        ) : loading ? (
          <p className="text-lab-sc py-8 text-center">Loading saved jobs...</p>
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No saved jobs"
            description="Bookmark jobs from the Jobs directory that you want to apply to later."
          />
        ) : (
          <div className="space-y-3">
            {jobs.map((j) => (
              <div
                key={j.id}
                className="group relative rounded-2xl border border-bord-card bg-bg-pr p-4 sm:p-5 hover:bg-fill-fv transition-colors shadow-2xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/jobs/${j.hashId || j.id}`} className="flex-1 min-w-0">
                    {j.employer && (
                      <div className="flex items-center gap-2.5 mb-2">
                        <Avatar
                          src={j.employer.avatar}
                          alt={j.employer.username}
                          size="sm"
                          verified={j.employer.verified}
                        />
                        <div className="min-w-0">
                          <p className="text-cap-s font-semibold text-lab-pr truncate">
                            {j.employer.firstName} {j.employer.lastName}
                          </p>
                          <p className="text-cap-s text-lab-sc truncate">@{j.employer.username}</p>
                        </div>
                      </div>
                    )}
                    <h2 className="text-title-3 font-bold text-lab-pr hover:text-brand-900 transition-colors line-clamp-2">
                      {j.title}
                    </h2>
                    {j.overview && (
                      <p className="text-par-s text-lab-sc line-clamp-2 mt-1">{j.overview}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-2.5">
                      {j.income !== null && j.income !== undefined && (
                        <Badge variant="brand">
                          {j.isStartIncome ? 'From ' : ''}
                          {formatCurrency(j.income, j.currency, bootstrap?.currencies, locale)}
                        </Badge>
                      )}
                      {j.isRemote && <Badge variant="success">Remote</Badge>}
                      {j.location && <Badge variant="outline">{j.location}</Badge>}
                      {j.isUrgent && <Badge variant="danger">Urgent</Badge>}
                      {j.applicationStatus && <Badge variant="brand">Applied ({j.applicationStatus})</Badge>}
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => handleToggleBookmark(j.id, e)}
                    className="size-9 rounded-full hover:bg-fill-qt flex items-center justify-center text-brand-900 cursor-pointer shrink-0 transition-colors"
                    title="Remove from saved"
                    aria-label="Remove bookmark"
                  >
                    <Bookmark className="h-4.5 w-4.5 fill-brand-900" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
