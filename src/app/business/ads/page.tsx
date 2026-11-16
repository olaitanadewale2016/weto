'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Edit3, ExternalLink, Megaphone, Pause, Play, Plus, Trash2, Wallet } from 'lucide-react';
import { BusinessPortalHeader } from '@/components/business/BusinessPortalHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import { apiFetch, uploadFileToR2 } from '@/lib/api-client';
import { formatCurrency } from '@/lib/currency';
import { resolveMediaUrl } from '@/lib/media-url';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';

interface AdCampaign {
  id: string;
  title: string;
  content: string;
  ctaText: string;
  targetUrl: string;
  totalBudget: number;
  spentBudget: number;
  currency?: string;
  viewsCount: number;
  clicksCount?: number;
  status: string;
  approval: string;
  media?: { publicUrl?: string; url?: string; type?: string } | null;
}

export default function BusinessAdsPage() {
  const { bootstrap, locale } = useApp();
  const defaultCurrency = bootstrap?.config?.defaultCurrency || 'NGN';
  const minAdBudget = Number(bootstrap?.config?.ads?.minBudget ?? 5000);
  const defaultAdBudget = Number(bootstrap?.config?.ads?.defaultBudget ?? 25000);
  const pricePerAdView = Number(bootstrap?.config?.ads?.pricePerView ?? 25);
  const { error, success } = useToast();
  const [ads, setAds] = useState<AdCampaign[]>([]);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletCurrency, setWalletCurrency] = useState<string>(defaultCurrency);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'paused' | 'pending'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingAdId, setEditingAdId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [ctaText, setCtaText] = useState('Learn More');
  const [targetUrl, setTargetUrl] = useState('https://');
  const [totalBudget, setTotalBudget] = useState(String(defaultAdBudget));
  const [mediaId, setMediaId] = useState<string | undefined>();
  const [creativePreview, setCreativePreview] = useState<{ url: string; type: string } | null>(null);
  const [uploadingCreative, setUploadingCreative] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadAds = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, walletRes] = await Promise.all([
        apiFetch<AdCampaign[]>('/ads?mine=true'),
        apiFetch<{ wallet?: { balance?: number; currency?: string } }>('/wallet').catch(() => null),
      ]);
      setAds(Array.isArray(rows) ? rows : []);
      if (walletRes?.wallet && typeof walletRes.wallet.balance === 'number') {
        setWalletBalance(walletRes.wallet.balance);
        if (walletRes.wallet.currency) setWalletCurrency(walletRes.wallet.currency);
      }
    } catch {
      setAds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadAds();
    }, 0);
    return () => clearTimeout(id);
  }, [loadAds]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const localPreview = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video/') || /\.(mp4|m4v|webm|mov|mkv|3gp)$/i.test(file.name);
    setCreativePreview({ url: localPreview, type: isVideo ? 'video' : 'image' });
    setUploadingCreative(true);
    try {
      const up = await uploadFileToR2(file, 'ads', 'ad');
      setMediaId(up.mediaId);
      setCreativePreview({ url: resolveMediaUrl(up.publicUrl) || up.publicUrl, type: up.mediaType });
      success('Creative uploaded to Cloudflare R2');
    } catch (err) {
      setCreativePreview(null);
      error('Upload failed', err instanceof Error ? err.message : undefined);
    } finally {
      setUploadingCreative(false);
      setTimeout(() => URL.revokeObjectURL(localPreview), 2500);
    }
  }

  function openNewModal() {
    setEditingAdId(null);
    setTitle('');
    setContent('');
    setCtaText('Learn More');
    setTargetUrl('https://');
    setTotalBudget(String(defaultAdBudget));
    setMediaId(undefined);
    setCreativePreview(null);
    setCreateOpen(true);
  }

  function openEditModal(ad: AdCampaign) {
    setEditingAdId(ad.id);
    setTitle(ad.title || '');
    setContent(ad.content || '');
    setCtaText(ad.ctaText || 'Learn More');
    setTargetUrl(ad.targetUrl || 'https://');
    setTotalBudget(String(ad.totalBudget || defaultAdBudget));
    setMediaId(undefined);
    const existingUrl = ad.media?.publicUrl || ad.media?.url;
    setCreativePreview(existingUrl ? { url: existingUrl, type: ad.media?.type || 'image' } : null);
    setCreateOpen(true);
  }

  async function handleCreateOrEdit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingAdId) {
        await apiFetch('/ads', {
          method: 'PATCH',
          json: {
            adId: editingAdId,
            action: 'edit',
            title: title.trim(),
            content: content.trim(),
            ctaText: ctaText.trim() || 'Learn More',
            targetUrl: targetUrl.trim(),
            totalBudget: Number(totalBudget) || minAdBudget,
            ...(mediaId ? { mediaId } : {}),
          },
        });
        success('Ad campaign updated!');
      } else {
        await apiFetch('/ads', {
          method: 'POST',
          json: {
            title: title.trim(),
            content: content.trim(),
            ctaText: ctaText.trim() || 'Learn More',
            targetUrl: targetUrl.trim(),
            totalBudget: Number(totalBudget) || minAdBudget,
            mediaId,
            publishNow: true,
          },
        });
        success('Ad campaign created!');
      }
      setCreateOpen(false);
      setEditingAdId(null);
      setTitle('');
      setContent('');
      setMediaId(undefined);
      setCreativePreview(null);
      await loadAds();
    } catch (err) {
      error(editingAdId ? 'Could not update ad' : 'Could not create ad', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  async function adAction(adId: string, action: 'pause' | 'publish' | 'delete') {
    if (action === 'delete' && !window.confirm('Delete this ad campaign? Any unspent budget will be refunded to your wallet.')) return;
    try {
      const res = await apiFetch<{ updated?: boolean; refundedAmount?: number }>('/ads', {
        method: 'PATCH',
        json: { adId, action },
      });
      if (action === 'delete' && res?.refundedAmount && res.refundedAmount > 0) {
        success(
          `Campaign deleted · ${formatCurrency(res.refundedAmount, walletCurrency, bootstrap?.currencies, locale)} refunded to wallet`
        );
      } else {
        success(`Campaign ${action === 'delete' ? 'deleted' : `${action}d`}`);
      }
      await loadAds();
    } catch (err) {
      error('Action failed', err instanceof Error ? err.message : undefined);
    }
  }

  const visibleAds = ads.filter((ad) => {
    if (statusFilter === 'published') return ad.status === 'published' && ad.approval === 'approved';
    if (statusFilter === 'paused') return ad.status === 'paused' || ad.status === 'completed';
    if (statusFilter === 'pending') return ad.approval === 'pending' || ad.approval === 'rejected';
    return true;
  });

  return (
    <>
      <div className="space-y-6">
        <BusinessPortalHeader title="Advertisement Manager" subtitle="Create, fund, and monitor promoted feed campaigns." />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: 'all', label: `All (${ads.length})` },
              { key: 'published', label: 'Active' },
              { key: 'paused', label: 'Paused / Completed' },
              { key: 'pending', label: 'Review' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key as 'all' | 'published' | 'paused' | 'pending')}
                className={`rounded-full px-3.5 py-1.5 text-cap-l font-semibold transition-colors cursor-pointer ${statusFilter === tab.key
                  ? 'bg-lab-pr text-bg-pr'
                  : 'bg-fill-qt text-lab-sc hover:text-lab-pr'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            {walletBalance !== null && (
              <Link
                href="/business/wallet"
                className="inline-flex items-center gap-2 rounded-full border border-bord-pr bg-fill-qt/60 hover:bg-fill-qt px-3.5 py-1.5 text-cap-l text-lab-pr transition-colors"
              >
                <Wallet className="h-3.5 w-3.5 text-brand-900" />
                <span>
                  Ad Credit:{' '}
                  <strong>{formatCurrency(walletBalance, walletCurrency, bootstrap?.currencies, locale)}</strong>
                </span>
              </Link>
            )}
            <Button variant="primary" size="sm" onClick={openNewModal}>
              <Plus className="h-4 w-4" /> New Campaign
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="text-center text-lab-sc py-8">Loading campaigns...</p>
        ) : visibleAds.length === 0 ? (
          <EmptyState icon={Megaphone} title="No ad campaigns found" description="Launch your first campaign to reach Weto feeds." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleAds.map((ad) => (
              <div key={ad.id} className="rounded-3xl border border-bord-card bg-bg-pr overflow-hidden flex flex-col">
                {(ad.media?.publicUrl || ad.media?.url) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveMediaUrl(ad.media.publicUrl || ad.media.url) || ad.media.publicUrl || ad.media.url || '/assets/ads/default-preview.png'}
                    alt={ad.title}
                    className="h-40 w-full object-cover bg-fill-qt"
                    onError={(e) => {
                      if (e.currentTarget.dataset.fallbackApplied === '1') return;
                      e.currentTarget.dataset.fallbackApplied = '1';
                      e.currentTarget.src = '/assets/ads/default-preview.png';
                    }}
                  />
                )}
                <div className="p-5 space-y-3 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-par-l font-bold text-lab-pr">{ad.title}</h3>
                    <div className="flex gap-1.5 flex-wrap">
                      <Badge
                        variant={
                          ad.status === 'published'
                            ? 'success'
                            : ad.status === 'paused'
                              ? 'warning'
                              : 'outline'
                        }
                      >
                        {ad.status}
                      </Badge>
                      <Badge
                        variant={
                          ad.approval === 'approved'
                            ? 'success'
                            : ad.approval === 'rejected'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {ad.approval}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-par-n text-lab-sc line-clamp-2">{ad.content}</p>
                  {ad.approval === 'pending' && (
                    <p className="text-cap-s text-amber-700 dark:text-amber-400">
                      Pending moderation review before impressions begin delivering.
                    </p>
                  )}
                  {ad.approval === 'rejected' && (
                    <p className="text-cap-s text-red-900">
                      This campaign creative was rejected by moderation.
                    </p>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-2xl bg-fill-pr p-3 text-center">
                    <div>
                      <p className="text-cap-s text-lab-sc">Views</p>
                      <p className="font-bold text-lab-pr">{ad.viewsCount}</p>
                    </div>
                    <div>
                      <p className="text-cap-s text-lab-sc">Clicks</p>
                      <p className="font-bold text-lab-pr">{ad.clicksCount ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-cap-s text-lab-sc">Spent</p>
                      <p className="font-bold text-lab-pr">
                        {formatCurrency(ad.spentBudget, ad.currency || defaultCurrency, bootstrap?.currencies, locale)}
                      </p>
                    </div>
                    <div>
                      <p className="text-cap-s text-lab-sc">Budget</p>
                      <p className="font-bold text-brand-900">
                        {formatCurrency(ad.totalBudget, ad.currency || defaultCurrency, bootstrap?.currencies, locale)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                    <a
                      href={ad.targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-cap-l text-brand-900 hover:underline truncate max-w-[160px]"
                    >
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{ad.ctaText}</span>
                    </a>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEditModal(ad)}>
                        <Edit3 className="h-3.5 w-3.5" /> Edit
                      </Button>
                      {ad.status === 'published' ? (
                        <Button size="sm" variant="outline" onClick={() => adAction(ad.id, 'pause')}>
                          <Pause className="h-3.5 w-3.5" /> Pause
                        </Button>
                      ) : (
                        <Button size="sm" variant="primary" onClick={() => adAction(ad.id, 'publish')}>
                          <Play className="h-3.5 w-3.5" /> Resume
                        </Button>
                      )}
                      <Button size="sm" variant="danger" onClick={() => adAction(ad.id, 'delete')}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setEditingAdId(null);
        }}
        title={editingAdId ? 'Edit Ad Campaign' : 'Create Ad Campaign'}
      >
        <form onSubmit={handleCreateOrEdit} className="space-y-4">
          {walletBalance !== null && (
            <div className="rounded-xl border border-bord-pr bg-fill-qt/50 px-3.5 py-2.5 text-cap-l text-lab-sc flex items-center justify-between gap-2">
              <span>
                Wallet Balance:{' '}
                <strong className="text-lab-pr">
                  {formatCurrency(walletBalance, walletCurrency, bootstrap?.currencies, locale)}
                </strong>
              </span>
              <Link href="/business/wallet" className="font-semibold text-brand-900 hover:underline shrink-0">
                Top up
              </Link>
            </div>
          )}
          <Input label="Headline" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <Textarea label="Ad Copy" value={content} onChange={(e) => setContent(e.target.value)} required />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="CTA Button Text" value={ctaText} onChange={(e) => setCtaText(e.target.value)} required />
            <Input
              label={`Total Budget (${defaultCurrency})`}
              type="number"
              min={minAdBudget}
              step="100"
              value={totalBudget}
              onChange={(e) => setTotalBudget(e.target.value)}
              hint={`Min: ${formatCurrency(minAdBudget, defaultCurrency, bootstrap?.currencies, locale)} · Rate: ${formatCurrency(pricePerAdView, defaultCurrency, bootstrap?.currencies, locale)}/view`}
              required
            />
          </div>
          <Input label="Destination URL" type="url" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} required />
          <div className="space-y-2">
            <label className="block text-cap-l font-semibold text-lab-pr">Banner / Video Creative</label>
            {creativePreview && (
              <div className="rounded-xl overflow-hidden border border-bord-pr bg-fill-qt max-h-40 flex items-center justify-center">
                {creativePreview.type === 'video' ? (
                  <video src={creativePreview.url} controls className="max-h-40 w-full object-contain" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resolveMediaUrl(creativePreview.url) || creativePreview.url} alt="Ad creative preview" className="max-h-40 w-full object-contain" />
                )}
              </div>
            )}
            <input type="file" accept="image/*,video/*" disabled={uploadingCreative} onChange={handleUpload} className="text-cap-l block w-full" />
            {uploadingCreative && <p className="text-cap-s text-brand-900">Uploading creative to Cloudflare R2...</p>}
          </div>
          <Button type="submit" variant="primary" className="w-full" loading={submitting || uploadingCreative}>
            {editingAdId ? 'Save Campaign Changes' : 'Launch Campaign'}
          </Button>
        </form>
      </Modal>
    </>
  );
}
