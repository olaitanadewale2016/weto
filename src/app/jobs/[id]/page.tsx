'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Bookmark, CheckCircle2, MapPin, Send, Trash2, Wifi } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch, uploadFileToR2 } from '@/lib/api-client';
import { formatCurrency } from '@/lib/currency';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';

interface JobDetail {
  id: string;
  hashId: string;
  title: string;
  overview?: string;
  description: string;
  income?: number | null;
  currency: string;
  location?: string;
  isRemote: boolean;
  isUrgent: boolean;
  isBookmarked: boolean;
  myApplication?: { status: string; coverLetter: string } | null;
  employer: {
    _id: string;
    username: string;
    firstName: string;
    lastName: string;
    avatar: string;
    verified?: boolean;
  };
  applications?: Array<{
    _id: string;
    status: string;
    coverLetter: string;
    applicantId: { username: string; firstName: string; lastName: string; avatar: string; email?: string };
  }>;
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, bootstrap, locale } = useApp();
  const { error, success } = useToast();

  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [coverLetter, setCoverLetter] = useState('');
  const [resumeMediaId, setResumeMediaId] = useState<string | undefined>();
  const [resumeFilename, setResumeFilename] = useState<string | null>(null);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [applying, setApplying] = useState(false);

  const loadJob = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<JobDetail>(`/jobs/${params.id}`);
      setJob(data);
    } catch {
      setJob(null);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadJob();
    }, 0);
    return () => clearTimeout(id);
  }, [loadJob]);

  async function handleResumeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingResume(true);
    try {
      const up = await uploadFileToR2(file, 'jobs', 'job_attachment');
      setResumeMediaId(up.mediaId);
      setResumeFilename(up.filename || file.name);
      success('Resume attached');
    } catch (err) {
      error('Resume upload failed', err instanceof Error ? err.message : undefined);
    } finally {
      setUploadingResume(false);
    }
  }

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !job) {
      router.push('/auth/login');
      return;
    }
    setApplying(true);
    try {
      await apiFetch(`/jobs/${job.id}`, {
        method: 'POST',
        json: { coverLetter: coverLetter.trim(), resumeMediaId },
      });
      success('Application submitted!');
      loadJob();
    } catch (err) {
      error('Could not apply', err instanceof Error ? err.message : undefined);
    } finally {
      setApplying(false);
    }
  }

  async function toggleBookmark() {
    if (!user || !job) return;
    try {
      const res = await apiFetch<{ bookmarked: boolean }>(`/jobs/${job.id}`, {
        method: 'PATCH',
        json: { action: 'bookmark' },
      });
      setJob((j) => (j ? { ...j, isBookmarked: res.bookmarked } : j));
    } catch {
      // ignore
    }
  }

  async function deleteJob() {
    if (!job) return;
    try {
      await apiFetch(`/jobs/${job.id}`, { method: 'DELETE' });
      success('Job deleted');
      router.push('/jobs');
    } catch (err) {
      error('Delete failed', err instanceof Error ? err.message : undefined);
    }
  }

  if (loading) {
    return (
      <AppShell fullWidth>
        <div className="p-8 text-center text-lab-sc">Loading job details...</div>
      </AppShell>
    );
  }

  if (!job) {
    return (
      <AppShell fullWidth>
        <div className="p-8 text-center text-lab-sc">Job listing not found.</div>
      </AppShell>
    );
  }

  const isOwner = user && String(job.employer._id) === user.id;

  return (
    <AppShell fullWidth>
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
        <Link href="/jobs" className="inline-flex items-center gap-2 text-par-n text-lab-sc hover:text-lab-pr">
          <ArrowLeft className="h-4 w-4" /> Back to Jobs
        </Link>

        <div className="rounded-3xl border border-bord-card bg-bg-pr p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-title-1 font-bold text-lab-pr">{job.title}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {job.income !== null && job.income !== undefined && (
                  <Badge variant="brand">
                    {formatCurrency(job.income, job.currency, bootstrap?.currencies, locale)}
                  </Badge>
                )}
                {job.isRemote && <Badge variant="success"><Wifi className="h-3 w-3" /> Remote</Badge>}
                {job.location && <Badge variant="outline"><MapPin className="h-3 w-3" /> {job.location}</Badge>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={toggleBookmark}>
                <Bookmark className={`h-4 w-4 ${job.isBookmarked ? 'fill-current text-lab-pr' : 'text-lab-pr3'}`} />
              </Button>
              {isOwner && (
                <Button variant="danger" size="icon" onClick={deleteJob}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <Link href={`/@${job.employer.username}`} className="flex items-center gap-3 pt-2">
            <Avatar src={job.employer.avatar} alt={job.employer.username} verified={job.employer.verified} size="md" />
            <div>
              <p className="text-par-n font-bold text-lab-pr">
                {job.employer.firstName} {job.employer.lastName}
              </p>
              <p className="text-cap-l text-lab-sc">@{job.employer.username}</p>
            </div>
          </Link>

          <div className="border-t border-bord-pr pt-4 space-y-2">
            {job.overview && <p className="text-par-m font-medium text-lab-pr">{job.overview}</p>}
            <p className="text-par-n text-lab-sc whitespace-pre-wrap leading-relaxed">{job.description}</p>
          </div>
        </div>

        {/* Employer Applications View OR Applicant Form */}
        {isOwner ? (
          <div className="rounded-3xl border border-bord-card bg-bg-pr p-6 space-y-4">
            <h2 className="text-title-3 font-bold text-lab-pr">
              Applicants ({job.applications?.length || 0})
            </h2>
            {!job.applications || job.applications.length === 0 ? (
              <p className="text-par-n text-lab-sc">No candidates have applied yet.</p>
            ) : (
              <div className="space-y-3">
                {job.applications.map((app) => (
                  <div key={app._id} className="rounded-2xl border border-bord-pr p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <Avatar src={app.applicantId?.avatar} alt={app.applicantId?.username} size="sm" />
                        <div>
                          <p className="text-par-n font-bold text-lab-pr">
                            {app.applicantId?.firstName} {app.applicantId?.lastName}
                          </p>
                          <p className="text-cap-s text-lab-sc">@{app.applicantId?.username}</p>
                        </div>
                      </div>
                      <Badge variant="brand">{app.status}</Badge>
                    </div>
                    {app.coverLetter && <p className="text-par-n text-lab-sc">{app.coverLetter}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : job.myApplication ? (
          <div className="rounded-3xl border border-green-900/30 bg-green-900/10 p-5 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-900 shrink-0" />
            <div>
              <p className="font-bold text-lab-pr">Application Submitted ({job.myApplication.status})</p>
              <p className="text-cap-l text-lab-sc">The employer has received your application.</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleApply} className="rounded-3xl border border-bord-card bg-bg-pr p-6 space-y-4">
            <h2 className="text-title-3 font-bold text-lab-pr">Apply for this role</h2>
            <Textarea
              label="Cover Letter"
              placeholder="Introduce yourself and highlight relevant experience..."
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              required
            />
            <div className="space-y-1.5">
              <label className="block text-cap-l font-semibold text-lab-pr">Attach Resume / CV (optional)</label>
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                disabled={uploadingResume}
                onChange={handleResumeUpload}
                className="text-cap-l block w-full"
              />
              {uploadingResume ? (
                <p className="text-cap-s text-brand-900">Uploading resume to Cloudflare R2...</p>
              ) : resumeFilename ? (
                <p className="text-cap-s text-green-900 font-medium">Attached: {resumeFilename}</p>
              ) : null}
            </div>
            <Button type="submit" variant="primary" size="lg" loading={applying || uploadingResume}>
              <Send className="h-4 w-4" /> Submit Application
            </Button>
          </form>
        )}
      </div>
    </AppShell>
  );
}
