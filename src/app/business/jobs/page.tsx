'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  Edit3,
  ExternalLink,
  Plus,
  Power,
  Trash2,
  Users,
} from 'lucide-react';
import { BusinessPortalHeader } from '@/components/business/BusinessPortalHeader';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency } from '@/lib/currency';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';

interface MyJob {
  id: string;
  hashId: string;
  title: string;
  overview?: string;
  description?: string;
  type?: string;
  status: string;
  approval?: string;
  income?: number | null;
  currency: string;
  location?: string | null;
  isRemote?: boolean;
  isUrgent?: boolean;
  applicationsCount?: number;
  viewsCount?: number;
  category?: { _id?: string; id?: string; localization?: Record<string, string> };
}

interface JobCategory {
  id: string;
  name: string;
}

interface JobApplicantRow {
  _id: string;
  status: 'pending' | 'reviewed' | 'shortlisted' | 'rejected' | 'hired';
  coverLetter?: string;
  createdAt?: string;
  applicantId?: {
    _id?: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    email?: string;
    verified?: boolean;
  };
}

export default function BusinessJobsPage() {
  const { bootstrap, locale } = useApp();
  const { error, success } = useToast();
  const defaultCurrency = bootstrap?.config?.defaultCurrency || 'NGN';

  const [jobs, setJobs] = useState<MyJob[]>([]);
  const [categories, setCategories] = useState<JobCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'draft'>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [overview, setOverview] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [jobType, setJobType] = useState<'vacancy' | 'project'>('vacancy');
  const [income, setIncome] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [location, setLocation] = useState('');
  const [isRemote, setIsRemote] = useState(true);
  const [isUrgent, setIsUrgent] = useState(false);
  const [publishNow, setPublishNow] = useState(true);
  const [saving, setSaving] = useState(false);

  const [applicantsModal, setApplicantsModal] = useState<{
    job: MyJob;
    applications: JobApplicantRow[];
    loading: boolean;
  } | null>(null);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ jobs: MyJob[]; categories?: JobCategory[] }>('/jobs?mine=true');
      setJobs(res.jobs || []);
      if (Array.isArray(res.categories)) {
        setCategories(res.categories);
      }
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadJobs();
    }, 0);
    return () => clearTimeout(id);
  }, [loadJobs]);

  function openCreateModal() {
    setEditingJobId(null);
    setTitle('');
    setOverview('');
    setDescription('');
    setCategoryId(categories[0]?.id || '');
    setJobType('vacancy');
    setIncome('');
    setCurrency(defaultCurrency);
    setLocation('');
    setIsRemote(true);
    setIsUrgent(false);
    setPublishNow(true);
    setFormOpen(true);
  }

  function openEditModal(j: MyJob) {
    setEditingJobId(j.id);
    setTitle(j.title || '');
    setOverview(j.overview || '');
    setDescription(j.description || '');
    setCategoryId(j.category?.id || j.category?._id || '');
    setJobType(j.type === 'project' ? 'project' : 'vacancy');
    setIncome(j.income !== undefined && j.income !== null ? String(j.income) : '');
    setCurrency(j.currency || defaultCurrency);
    setLocation(j.location || '');
    setIsRemote(Boolean(j.isRemote ?? true));
    setIsUrgent(Boolean(j.isUrgent ?? false));
    setPublishNow(j.status === 'active');
    setFormOpen(true);
  }

  async function handleSaveJob(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const parsedIncome = income.trim() ? Number(income) : null;
      if (editingJobId) {
        await apiFetch(`/jobs/${editingJobId}`, {
          method: 'PATCH',
          json: {
            action: 'update',
            title: title.trim(),
            overview: overview.trim(),
            description: description.trim(),
            income: parsedIncome !== null && Number.isFinite(parsedIncome) ? parsedIncome : null,
            location: location.trim(),
            isRemote,
            isUrgent,
            status: publishNow ? 'active' : 'draft',
          },
        });
        success('Job listing updated');
      } else {
        await apiFetch('/jobs', {
          method: 'POST',
          json: {
            title: title.trim(),
            overview: overview.trim() || undefined,
            description: description.trim() || undefined,
            categoryId: categoryId || undefined,
            type: jobType,
            income: parsedIncome !== null && Number.isFinite(parsedIncome) ? parsedIncome : null,
            currency: currency || defaultCurrency,
            location: location.trim() || undefined,
            isRemote,
            isUrgent,
            publishNow,
          },
        });
        success('Job listing posted!');
      }
      setFormOpen(false);
      await loadJobs();
    } catch (err) {
      error('Could not save job', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(j: MyJob) {
    const nextStatus = j.status === 'active' ? 'draft' : 'active';
    try {
      await apiFetch(`/jobs/${j.id}`, {
        method: 'PATCH',
        json: { action: 'update', status: nextStatus },
      });
      setJobs((prev) => prev.map((row) => (row.id === j.id ? { ...row, status: nextStatus } : row)));
      success(`Job marked ${nextStatus}`);
    } catch (err) {
      error('Status update failed', err instanceof Error ? err.message : undefined);
    }
  }

  async function deleteJob(jobId: string) {
    if (!window.confirm('Delete this job listing and all submitted applications?')) return;
    try {
      await apiFetch(`/jobs/${jobId}`, { method: 'DELETE' });
      setJobs((prev) => prev.filter((row) => row.id !== jobId));
      success('Job listing deleted');
    } catch (err) {
      error('Delete failed', err instanceof Error ? err.message : undefined);
    }
  }

  async function openApplicants(j: MyJob) {
    setApplicantsModal({ job: j, applications: [], loading: true });
    try {
      const detail = await apiFetch<{ applications?: JobApplicantRow[] }>(`/jobs/${j.id}`);
      setApplicantsModal({
        job: j,
        applications: Array.isArray(detail.applications) ? detail.applications : [],
        loading: false,
      });
    } catch (err) {
      error('Could not load applicants', err instanceof Error ? err.message : undefined);
      setApplicantsModal(null);
    }
  }

  async function updateApplicantStatus(
    jobId: string,
    applicationId: string,
    applicationStatus: JobApplicantRow['status']
  ) {
    try {
      await apiFetch(`/jobs/${jobId}`, {
        method: 'PATCH',
        json: {
          action: 'update_application',
          applicationId,
          applicationStatus,
        },
      });
      setApplicantsModal((prev) =>
        prev
          ? {
              ...prev,
              applications: prev.applications.map((a) =>
                a._id === applicationId ? { ...a, status: applicationStatus } : a
              ),
            }
          : null
      );
      success(`Applicant marked ${applicationStatus}`);
    } catch (err) {
      error('Could not update applicant', err instanceof Error ? err.message : undefined);
    }
  }

  const visibleJobs = jobs.filter((j) => {
    if (statusFilter === 'active') return j.status === 'active';
    if (statusFilter === 'draft') return j.status !== 'active';
    return true;
  });

  return (
    <div className="space-y-6">
      <BusinessPortalHeader
        title="My Job Openings"
        subtitle="Post openings, manage listings, and review incoming candidates."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[
            { key: 'all', label: `All (${jobs.length})` },
            { key: 'active', label: 'Active' },
            { key: 'draft', label: 'Draft / Closed' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key as 'all' | 'active' | 'draft')}
              className={`rounded-full px-3.5 py-1.5 text-cap-l font-semibold transition-colors cursor-pointer ${
                statusFilter === tab.key
                  ? 'bg-lab-pr text-bg-pr'
                  : 'bg-fill-qt text-lab-sc hover:text-lab-pr'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Link href="/jobs">
            <Button variant="outline" size="sm">
              Public Jobs Board
            </Button>
          </Link>
          <Button variant="primary" size="sm" onClick={openCreateModal}>
            <Plus className="h-4 w-4" /> Post Job
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-lab-sc py-8">Loading job listings...</p>
      ) : visibleJobs.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No job openings yet"
          description="Post your first job vacancy or freelance project to start receiving applications."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleJobs.map((j) => (
            <div
              key={j.id}
              className="rounded-3xl border border-bord-card bg-bg-pr p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/jobs/${j.hashId || j.id}`}
                    className="font-bold text-par-m text-lab-pr hover:underline line-clamp-1"
                  >
                    {j.title}
                  </Link>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {j.approval && (
                      <Badge
                        variant={
                          j.approval === 'approved'
                            ? 'success'
                            : j.approval === 'rejected'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {j.approval}
                      </Badge>
                    )}
                    <Badge variant={j.status === 'active' ? 'success' : 'outline'}>
                      {j.status}
                    </Badge>
                  </div>
                </div>

                {j.overview && (
                  <p className="text-cap-l text-lab-sc line-clamp-2">{j.overview}</p>
                )}

                <div className="flex flex-wrap items-center gap-2 text-cap-l text-lab-sc">
                  <span className="font-semibold text-brand-900">
                    {j.income
                      ? formatCurrency(j.income, j.currency, bootstrap?.currencies, locale)
                      : 'Negotiable'}
                  </span>
                  <span>·</span>
                  <span>{j.isRemote ? 'Remote' : j.location || 'On-site'}</span>
                  <span>·</span>
                  <span>{j.applicationsCount ?? 0} applicant(s)</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-bord-tr">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => void openApplicants(j)}
                >
                  <Users className="h-3.5 w-3.5" /> Applicants ({j.applicationsCount ?? 0})
                </Button>
                <Button size="sm" variant="outline" onClick={() => openEditModal(j)}>
                  <Edit3 className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void toggleStatus(j)}
                  title={j.status === 'active' ? 'Move to Draft' : 'Publish Active'}
                >
                  <Power className="h-3.5 w-3.5" />
                </Button>
                <Link href={`/jobs/${j.hashId || j.id}`} title="View public listing">
                  <Button size="sm" variant="ghost">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => void deleteJob(j.id)}
                  title="Delete job"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingJobId ? 'Edit Job Opening' : 'Post New Job Opening'}
      >
        <form onSubmit={handleSaveJob} className="space-y-4">
          <Input
            label="Job Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Senior Product Designer"
            required
          />
          {!editingJobId && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select label="Type" value={jobType} onChange={(e) => setJobType(e.target.value as 'vacancy' | 'project')}>
                <option value="vacancy">Full-Time / Vacancy</option>
                <option value="project">Contract / Project</option>
              </Select>
              {categories.length > 0 && (
                <Select label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          )}
          <Input
            label="Short Overview"
            value={overview}
            onChange={(e) => setOverview(e.target.value)}
            placeholder="Concise role summary"
          />
          <Textarea
            label="Full Job Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Responsibilities, qualifications, benefits..."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={`Compensation (${currency})`}
              type="number"
              min="0"
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              placeholder="Leave empty if negotiable"
            />
            <Input
              label="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Lagos, NG or Worldwide"
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <Switch checked={isRemote} onCheckedChange={setIsRemote} label="Remote friendly" />
            <Switch checked={isUrgent} onCheckedChange={setIsUrgent} label="Urgent hiring" />
            <Switch checked={publishNow} onCheckedChange={setPublishNow} label="Active / Published" />
          </div>
          <Button type="submit" variant="primary" className="w-full" loading={saving}>
            {editingJobId ? 'Save Changes' : 'Publish Job Listing'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={applicantsModal !== null}
        onClose={() => setApplicantsModal(null)}
        title={applicantsModal ? `Applicants · ${applicantsModal.job.title}` : 'Applicants'}
      >
        {applicantsModal && (
          <div className="space-y-3">
            {applicantsModal.loading ? (
              <p className="text-center text-lab-sc py-6">Loading applicants...</p>
            ) : applicantsModal.applications.length === 0 ? (
              <p className="text-center text-lab-sc py-6">No candidates have applied to this role yet.</p>
            ) : (
              applicantsModal.applications.map((app) => {
                const candidate = app.applicantId;
                const fullName =
                  `${candidate?.firstName || ''} ${candidate?.lastName || ''}`.trim() ||
                  candidate?.username ||
                  'Applicant';
                return (
                  <div
                    key={app._id}
                    className="rounded-2xl border border-bord-pr bg-fill-qt/40 p-3.5 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href={candidate?.username ? `/u/${candidate.username}` : '#'}
                        className="flex items-center gap-2.5 min-w-0 hover:opacity-85"
                      >
                        <Avatar src={candidate?.avatar} alt={fullName} fallback={candidate?.username} size="sm" />
                        <div className="min-w-0">
                          <p className="font-semibold text-par-n text-lab-pr truncate">{fullName}</p>
                          <p className="text-cap-s text-lab-sc truncate">
                            @{candidate?.username || 'user'}
                            {candidate?.email ? ` · ${candidate.email}` : ''}
                          </p>
                        </div>
                      </Link>
                      <Select
                        value={app.status}
                        onChange={(e) =>
                          void updateApplicantStatus(
                            applicantsModal.job.id,
                            app._id,
                            e.target.value as JobApplicantRow['status']
                          )
                        }
                        className="h-8 w-36 text-cap-s"
                      >
                        <option value="pending">Pending</option>
                        <option value="reviewed">Reviewed</option>
                        <option value="shortlisted">Shortlisted</option>
                        <option value="hired">Hired</option>
                        <option value="rejected">Rejected</option>
                      </Select>
                    </div>
                    {app.coverLetter && (
                      <p className="text-cap-l text-lab-pr whitespace-pre-wrap rounded-xl bg-bg-pr p-2.5 border border-bord-pr">
                        {app.coverLetter}
                      </p>
                    )}
                    {app.createdAt && (
                      <p className="text-cap-s text-lab-tr">
                        Applied {new Date(app.createdAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
