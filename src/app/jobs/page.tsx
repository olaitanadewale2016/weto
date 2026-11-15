'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bookmark, Briefcase, Plus, Search } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency } from '@/lib/currency';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';

interface JobItem {
  id: string;
  hashId: string;
  title: string;
  overview?: string;
  type: string;
  income?: number | null;
  isStartIncome?: boolean;
  currency: string;
  location?: string;
  isRemote: boolean;
  isUrgent: boolean;
  isBookmarked?: boolean;
  applicationStatus?: string | null;
  employer?: { username: string; firstName: string; lastName: string; avatar: string; verified?: boolean };
  category?: { localization?: { en?: string } };
}

export default function JobsPage() {
  const { user, bootstrap, locale } = useApp();
  const { error, success } = useToast();

  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [overview, setOverview] = useState('');
  const [description, setDescription] = useState('');
  const [jobType, setJobType] = useState('vacancy');
  const [income, setIncome] = useState('');
  const [currency, setCurrency] = useState('');
  const selectedCurrency = currency || bootstrap?.config?.defaultCurrency || 'NGN';
  const [location, setLocation] = useState('');
  const [isRemote, setIsRemote] = useState(true);
  const [isUrgent, setIsUrgent] = useState(false);
  const [newCategoryId, setNewCategoryId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set('q', q.trim());
      if (categoryId) qs.set('categoryId', categoryId);
      if (remoteOnly) qs.set('remote', 'true');
      const res = await apiFetch<{ jobs: JobItem[]; categories: Array<{ id: string; name: string }> }>(
        `/jobs?${qs.toString()}`
      );
      setJobs(res.jobs || []);
      setCategories(res.categories || []);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [q, categoryId, remoteOnly]);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadJobs();
    }, 0);
    return () => clearTimeout(id);
  }, [loadJobs]);

  async function handleCreateJob(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch('/jobs', {
        method: 'POST',
        json: {
          title: title.trim(),
          overview: overview.trim(),
          description: description.trim(),
          categoryId: newCategoryId || undefined,
          type: jobType,
          income: income ? Number(income) : null,
          isStartIncome: true,
          currency: selectedCurrency,
          location: location.trim() || undefined,
          isRemote,
          isUrgent,
          publishNow: true,
        },
      });
      success('Job listing posted!');
      setCreateOpen(false);
      setTitle('');
      setOverview('');
      setDescription('');
      loadJobs();
    } catch (err) {
      error('Could not post job', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] md:top-0 z-20 bg-bg-pr/95 backdrop-blur-xs border-b border-bord-tr px-4 py-3.5 flex items-center justify-between gap-2">
        <h1 className="text-title-3 font-bold text-lab-pr">Jobs</h1>
        {user && (
          <div className="flex items-center gap-2">
            <Link href="/saved/jobs">
              <Button variant="outline" size="sm">
                <Bookmark className="h-4 w-4" /> Saved
              </Button>
            </Link>
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Post Job
            </Button>
          </div>
        )}
      </div>

      {/* Filter Bar matching PHP JobsIndex */}
      <div className="p-4 border-b border-bord-tr space-y-3">
        <div className="relative rounded-full border border-bord-card/80 bg-bg-pr focus-within:border-bord-pr transition-colors">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-lab-sc" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search role, skills, or location..."
            className="w-full h-11 rounded-full bg-transparent pl-10 pr-4 text-par-n text-lab-pr2 placeholder:text-lab-tr outline-hidden"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[160px]">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <Switch checked={remoteOnly} onCheckedChange={setRemoteOnly} label="Remote only" />
        </div>
      </div>

      {loading ? (
        <p className="text-center text-lab-sc py-12">Loading job listings...</p>
      ) : jobs.length === 0 ? (
        <div className="p-6">
          <EmptyState icon={Briefcase} title="No jobs matched" description="Try broadening your search filters." />
        </div>
      ) : (
        <div className="divide-y divide-bord-tr">
          {jobs.map((job) => (
            <Link
              key={job.id}
              href={`/jobs/${job.hashId || job.id}`}
              className="p-4 cursor-pointer smoothing hover:bg-fill-fv flex gap-3 transition-colors"
            >
              <div className="shrink-0">
                <Avatar src={job.employer?.avatar} alt={job.employer?.username} size="md" verified={job.employer?.verified} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-2">
                  <h3 className="text-title-3 font-semibold text-lab-pr2 leading-tight line-clamp-2 mb-1">
                    {job.title}
                  </h3>
                  {job.isUrgent && <Badge variant="danger">Urgent</Badge>}
                </div>
                <p className="text-par-s text-lab-pr2 font-semibold">
                  {job.income !== null && job.income !== undefined
                    ? `${job.isStartIncome ? 'From ' : ''}${formatCurrency(job.income, job.currency, bootstrap?.currencies, locale)}, `
                    : ''}
                  <span className="font-medium">
                    {job.employer?.firstName} {job.employer?.lastName} (@{job.employer?.username})
                  </span>
                </p>
                {job.overview && (
                  <p className="text-par-m text-lab-pr3 line-clamp-2 mt-1">{job.overview}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-2 text-par-n text-lab-sc">
                  <span>{job.isRemote ? 'Remote' : job.location || 'On-site'}</span>
                  {job.applicationStatus && (
                    <Badge variant="brand">Applied ({job.applicationStatus})</Badge>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Post a Job Opening">
        <form onSubmit={handleCreateJob} className="space-y-4">
          <Input label="Job Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <Input label="Short Overview" value={overview} onChange={(e) => setOverview(e.target.value)} />
          <Textarea label="Full Job Description" value={description} onChange={(e) => setDescription(e.target.value)} required />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Category" value={newCategoryId} onChange={(e) => setNewCategoryId(e.target.value)}>
              <option value="">General</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Select label="Type" value={jobType} onChange={(e) => setJobType(e.target.value)}>
              <option value="vacancy">Vacancy (Hiring)</option>
              <option value="project">Freelance Project</option>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input
              label="Compensation"
              type="number"
              min="0"
              value={income}
              onChange={(e) => setIncome(e.target.value)}
            />
            <Select label="Currency" value={selectedCurrency} onChange={(e) => setCurrency(e.target.value)}>
              {(bootstrap?.currencies?.length
                ? bootstrap.currencies
                : [{ code: bootstrap?.config?.defaultCurrency || 'NGN', name: bootstrap?.config?.defaultCurrency || 'NGN', symbol: '₦' }]
              ).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} ({c.symbol})
                </option>
              ))}
            </Select>
            <Input label="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <Switch checked={isRemote} onCheckedChange={setIsRemote} label="Remote friendly" />
          <Switch checked={isUrgent} onCheckedChange={setIsUrgent} label="Mark as Urgent hiring" />
          <Button type="submit" variant="primary" className="w-full" loading={submitting}>
            Publish Job
          </Button>
        </form>
      </Modal>
    </AppShell>
  );
}
