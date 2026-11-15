'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Megaphone, Pause, Play, Plus, Trash2 } from 'lucide-react';
import { BusinessPortalHeader } from '@/components/business/BusinessPortalHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import { apiFetch, uploadFileToR2 } from '@/lib/api-client';
import { formatCurrency } from '@/lib/currency';
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
  status: string;
  approval: string;
  media?: { publicUrl?: string; url?: string } | null;
}

export default function BusinessAdsPage() {
  const { bootstrap, locale } = useApp();
  const defaultCurrency = bootstrap?.config?.defaultCurrency || 'NGN';
  const { error, success } = useToast();
  const [ads, setAds] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [ctaText, setCtaText] = useState('Learn More');
  const [targetUrl, setTargetUrl] = useState('https://');
  const [totalBudget, setTotalBudget] = useState('50');
  const [mediaId, setMediaId] = useState<string | undefined>();
  const [creativePreview, setCreativePreview] = useState<{ url: string; type: string } | null>(null);
  const [uploadingCreative, setUploadingCreative] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadAds = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await apiFetch<AdCampaign[]>('/ads?mine=true');
      setAds(Array.isArray(rows) ? rows : []);
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
    setUploadingCreative(true);
    try {
      const up = await uploadFileToR2(file, 'ads', 'ad');
      setMediaId(up.mediaId);
      setCreativePreview({ url: up.publicUrl, type: up.mediaType });
      success('Creative uploaded to Cloudflare R2');
    } catch (err) {
      error('Upload failed', err instanceof Error ? err.message : undefined);
    } finally {
      setUploadingCreative(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch('/ads', {
        method: 'POST',
        json: {
          title: title.trim(),
          content: content.trim(),
          ctaText: ctaText.trim() || 'Learn More',
          targetUrl: targetUrl.trim(),
          totalBudget: Number(totalBudget) || 10,
          mediaId,
          publishNow: true,
        },
      });
      success('Ad campaign created!');
      setCreateOpen(false);
      setTitle('');
      setContent('');
      setMediaId(undefined);
      setCreativePreview(null);
      loadAds();
    } catch (err) {
      error('Could not create ad', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  async function adAction(adId: string, action: 'pause' | 'publish' | 'delete') {
    try {
      await apiFetch('/ads', { method: 'PATCH', json: { adId, action } });
      success(`Campaign ${action}d`);
      loadAds();
    } catch (err) {
      error('Action failed', err instanceof Error ? err.message : undefined);
    }
  }

  return (
    <>
      <div className="space-y-6">
        <BusinessPortalHeader title="Advertisement Manager" subtitle="Create, fund, and monitor promoted feed campaigns." />

        <div className="flex justify-end">
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New Campaign
          </Button>
        </div>

        {loading ? (
          <p className="text-center text-lab-sc py-8">Loading campaigns...</p>
        ) : ads.length === 0 ? (
          <EmptyState icon={Megaphone} title="No ad campaigns yet" description="Launch your first campaign to reach Weto feeds." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ads.map((ad) => (
              <div key={ad.id} className="rounded-3xl border border-bord-card bg-bg-pr overflow-hidden flex flex-col">
                {(ad.media?.publicUrl || ad.media?.url) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ad.media.publicUrl || ad.media.url} alt={ad.title} className="h-40 w-full object-cover" />
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
                  <div className="grid grid-cols-3 gap-2 rounded-2xl bg-fill-pr p-3 text-center">
                    <div>
                      <p className="text-cap-s text-lab-sc">Views</p>
                      <p className="font-bold text-lab-pr">{ad.viewsCount}</p>
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
                  <div className="flex items-center justify-end gap-2 pt-2">
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
            ))}
          </div>
        )}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Ad Campaign">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input label="Headline" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <Textarea label="Ad Copy" value={content} onChange={(e) => setContent(e.target.value)} required />
          <div className="grid grid-cols-2 gap-3">
            <Input label="CTA Button Text" value={ctaText} onChange={(e) => setCtaText(e.target.value)} required />
            <Input label={`Total Budget (${defaultCurrency})`} type="number" min="1" step="1" value={totalBudget} onChange={(e) => setTotalBudget(e.target.value)} required />
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
                  <img src={creativePreview.url} alt="Ad creative preview" className="max-h-40 w-full object-contain" />
                )}
              </div>
            )}
            <input type="file" accept="image/*,video/*" disabled={uploadingCreative} onChange={handleUpload} className="text-cap-l" />
            {uploadingCreative && <p className="text-cap-s text-brand-900">Uploading creative to Cloudflare R2...</p>}
          </div>
          <Button type="submit" variant="primary" className="w-full" loading={submitting}>
            Launch Campaign
          </Button>
        </form>
      </Modal>
    </>
  );
}
