'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Award,
  CheckCircle2,
  Circle,
  Coins,
  HeartHandshake,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import { BusinessPortalHeader } from '@/components/business/BusinessPortalHeader';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency } from '@/lib/currency';
import { formatRelativeTime } from '@/lib/i18n';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';

interface MonetizationDashboard {
  userType: string;
  isAuthor: boolean;
  authorshipRequest: {
    id: string;
    status: string;
    createdAt: string;
  } | null;
  eligibility: {
    items: Array<{
      key: string;
      label: string;
      met: boolean;
      hint: string;
    }>;
    metCount: number;
    totalCount: number;
    allMet: boolean;
  };
  monetization: {
    tipsEnabled: boolean;
    subscriptionsEnabled: boolean;
    monthlyPrice: number;
    currency: string;
    description: string;
    totalEarnings: number;
  };
  stats: {
    activeSubscribersCount: number;
    totalEarnings: number;
    tipsCount: number;
    monthlyRecurringEstimate: number;
    commissionRate: number;
  };
  recentTransactions: Array<{
    id: string;
    amount: number;
    commission: number;
    currency: string;
    kind: string;
    supporterName: string;
    supporterUsername: string;
    note: string;
    createdAt: string;
  }>;
  mySubscriptions: Array<{
    id: string;
    creatorId: string;
    creatorUsername: string;
    creatorName: string;
    creatorAvatar: string;
    creatorVerified: boolean;
    amount: number;
    currency: string;
    currentPeriodEnd: string;
  }>;
}

export default function BusinessMonetizationPage() {
  const { bootstrap, locale } = useApp();
  const { success, error } = useToast();

  const [data, setData] = useState<MonetizationDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [saving, setSaving] = useState(false);

  const [tipsEnabled, setTipsEnabled] = useState(false);
  const [subscriptionsEnabled, setSubscriptionsEnabled] = useState(false);
  const [monthlyPrice, setMonthlyPrice] = useState('5');
  const [currency, setCurrency] = useState('USD');
  const [description, setDescription] = useState('');

  const defaultCurrency = bootstrap?.config?.defaultCurrency || 'USD';

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<MonetizationDashboard>('/monetization');
      setData(res);
      setTipsEnabled(res.monetization.tipsEnabled);
      setSubscriptionsEnabled(res.monetization.subscriptionsEnabled);
      setMonthlyPrice(String(res.monetization.monthlyPrice || 5));
      setCurrency(res.monetization.currency || defaultCurrency);
      setDescription(res.monetization.description || '');
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [defaultCurrency]);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadDashboard();
    }, 0);
    return () => clearTimeout(id);
  }, [loadDashboard]);

  async function handleRequestAuthorship() {
    setApplying(true);
    try {
      await apiFetch('/monetization', {
        method: 'PATCH',
        json: { action: 'request_authorship' },
      });
      success('Application submitted!', 'An admin will review your creator authorship request shortly.');
      await loadDashboard();
    } catch (err) {
      error('Could not submit application', err instanceof Error ? err.message : undefined);
    } finally {
      setApplying(false);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    const parsedPrice = Number(monthlyPrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 1) {
      error('Monthly membership price must be at least 1.');
      return;
    }

    setSaving(true);
    try {
      await apiFetch('/monetization', {
        method: 'PATCH',
        json: {
          action: 'update_settings',
          tipsEnabled,
          subscriptionsEnabled,
          monthlyPrice: parsedPrice,
          currency: currency.trim().toUpperCase() || 'USD',
          description,
        },
      });
      success('Monetization settings saved');
      await loadDashboard();
    } catch (err) {
      error('Save failed', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelMembership(creatorId: string) {
    if (!window.confirm('Cancel renewal for this community membership?')) return;
    try {
      await apiFetch('/monetization', {
        method: 'POST',
        json: { action: 'cancel_subscription', creatorId },
      });
      success('Membership cancelled');
      await loadDashboard();
    } catch (err) {
      error('Could not cancel membership', err instanceof Error ? err.message : undefined);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <BusinessPortalHeader
          title="Community Monetization"
          subtitle="Earn recurring community memberships and fan tips directly into your Weto Wallet."
        />
        <Link href="/business/wallet">
          <Button variant="outline">
            <Wallet className="h-4 w-4" /> Payout Wallet
          </Button>
        </Link>
      </div>

      {loading ? (
        <p className="text-lab-sc py-8 text-center">Loading monetization studio...</p>
      ) : !data ? (
        <EmptyState
          icon={Coins}
          title="Could not load monetization studio"
          description="Sign in again or retry in a moment."
        />
      ) : (
        <>
          {/* KPI Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-3xl border border-bord-card bg-bg-pr p-5">
              <div className="flex items-center justify-between text-cap-l text-lab-sc mb-2">
                <span>Total Earnings</span>
                <Coins className="h-4 w-4 text-brand-900" />
              </div>
              <p className="text-title-2 font-bold text-lab-pr">
                {formatCurrency(
                  data.stats.totalEarnings,
                  data.monetization.currency,
                  bootstrap?.currencies,
                  locale
                )}
              </p>
            </div>

            <div className="rounded-3xl border border-bord-card bg-bg-pr p-5">
              <div className="flex items-center justify-between text-cap-l text-lab-sc mb-2">
                <span>Active Members</span>
                <Users className="h-4 w-4 text-brand-900" />
              </div>
              <p className="text-title-2 font-bold text-lab-pr">
                {data.stats.activeSubscribersCount}
              </p>
            </div>

            <div className="rounded-3xl border border-bord-card bg-bg-pr p-5">
              <div className="flex items-center justify-between text-cap-l text-lab-sc mb-2">
                <span>Monthly Recurring</span>
                <Sparkles className="h-4 w-4 text-brand-900" />
              </div>
              <p className="text-title-2 font-bold text-lab-pr">
                {formatCurrency(
                  data.stats.monthlyRecurringEstimate,
                  data.monetization.currency,
                  bootstrap?.currencies,
                  locale
                )}
              </p>
            </div>

            <div className="rounded-3xl border border-bord-card bg-bg-pr p-5">
              <div className="flex items-center justify-between text-cap-l text-lab-sc mb-2">
                <span>Creator Status</span>
                <Award className="h-4 w-4 text-brand-900" />
              </div>
              <div className="pt-1">
                <Badge variant={data.isAuthor ? 'success' : 'default'}>
                  {data.isAuthor
                    ? 'Approved Creator'
                    : data.authorshipRequest?.status === 'pending'
                      ? 'Review Pending'
                      : 'Reader Account'}
                </Badge>
              </div>
            </div>
          </div>

          {/* Authorship Eligibility & Application Card (PHP document/author parity) */}
          <div className="rounded-3xl border border-bord-card bg-bg-pr p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-brand-900" />
                  <h2 className="text-par-l font-bold text-lab-pr">
                    Creator Authorship &amp; Monetization Eligibility
                  </h2>
                </div>
                <p className="text-par-s text-lab-sc">
                  Complete your profile checklist ({data.eligibility.metCount}/
                  {data.eligibility.totalCount} complete) to apply for Creator Authorship and unlock
                  paid community memberships and fan tips.
                </p>
              </div>

              {data.isAuthor ? (
                <Badge variant="success">Creator Monetization Active</Badge>
              ) : data.authorshipRequest?.status === 'pending' ? (
                <Badge variant="brand">Application Under Review</Badge>
              ) : (
                <Button
                  variant="primary"
                  loading={applying}
                  onClick={handleRequestAuthorship}
                >
                  Apply for Creator Authorship
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.eligibility.items.map((item) => (
                <div
                  key={item.key}
                  className={cn(
                    'rounded-2xl border px-4 py-3 flex items-start gap-3',
                    item.met
                      ? 'border-green-500/25 bg-green-500/5'
                      : 'border-bord-tr bg-bg-sc/50'
                  )}
                >
                  {item.met ? (
                    <CheckCircle2 className="size-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="size-4 text-lab-tr shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <p className="text-par-s font-semibold text-lab-pr">{item.label}</p>
                    {!item.met && (
                      <p className="text-cap-s text-lab-sc mt-0.5">{item.hint}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Creator Offer Configuration */}
          <form
            onSubmit={handleSaveSettings}
            className="rounded-3xl border border-bord-card bg-bg-pr p-6 space-y-5"
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-par-l font-bold text-lab-pr">
                  Community Offer &amp; Payout Settings
                </h2>
                <p className="text-par-s text-lab-sc">
                  Funds go straight to your Wallet ({data.stats.commissionRate}% platform fee on
                  support transactions).
                </p>
              </div>
              {!data.isAuthor && (
                <Badge variant="default">Requires Authorship Approval</Badge>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="rounded-2xl border border-bord-tr p-4 flex items-center justify-between gap-3 cursor-pointer">
                <div>
                  <p className="text-par-n font-semibold text-lab-pr flex items-center gap-2">
                    <HeartHandshake className="size-4 text-brand-900" />
                    Enable One-Time Fan Tips
                  </p>
                  <p className="text-cap-l text-lab-sc mt-0.5">
                    Show a Support / Tip button on your profile so supporters can tip you anytime.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={tipsEnabled}
                  disabled={!data.isAuthor}
                  onChange={(e) => setTipsEnabled(e.target.checked)}
                  className="size-5 accent-brand-900 cursor-pointer"
                />
              </label>

              <label className="rounded-2xl border border-bord-tr p-4 flex items-center justify-between gap-3 cursor-pointer">
                <div>
                  <p className="text-par-n font-semibold text-lab-pr flex items-center gap-2">
                    <Sparkles className="size-4 text-brand-900" />
                    Enable Community Subscriptions
                  </p>
                  <p className="text-cap-l text-lab-sc mt-0.5">
                    Let fans join your monthly paid creator community pass.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={subscriptionsEnabled}
                  disabled={!data.isAuthor}
                  onChange={(e) => setSubscriptionsEnabled(e.target.checked)}
                  className="size-5 accent-brand-900 cursor-pointer"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Monthly membership price"
                type="number"
                min={1}
                step="0.5"
                value={monthlyPrice}
                disabled={!data.isAuthor}
                onChange={(e) => setMonthlyPrice(e.target.value)}
              />
              <Input
                label="Monetization currency"
                value={currency}
                disabled={!data.isAuthor}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={6}
              />
            </div>

            <Textarea
              label="Member benefits & community pitch"
              placeholder="Tell followers what they support or unlock by joining your monthly community..."
              value={description}
              disabled={!data.isAuthor}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={400}
              rows={3}
            />

            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={saving} disabled={!data.isAuthor}>
                Save Monetization Settings
              </Button>
            </div>
          </form>

          {/* Recent Supporter Activity & Active Memberships I Back */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-3xl border border-bord-card bg-bg-pr p-6 space-y-4">
              <h2 className="text-par-l font-bold text-lab-pr">Recent Supporter Earnings</h2>
              {data.recentTransactions.length === 0 ? (
                <p className="text-par-s text-lab-sc py-6 text-center">
                  No tips or memberships received yet.
                </p>
              ) : (
                <div className="divide-y divide-bord-tr">
                  {data.recentTransactions.map((tx) => (
                    <div key={tx.id} className="py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-par-n font-semibold text-lab-pr truncate">
                          {tx.supporterName}{' '}
                          <Badge variant={tx.kind === 'subscription' ? 'brand' : 'default'}>
                            {tx.kind === 'subscription' ? 'Membership' : 'Tip'}
                          </Badge>
                        </p>
                        {tx.note && (
                          <p className="text-cap-l text-lab-sc mt-0.5 line-clamp-2">
                            &ldquo;{tx.note}&rdquo;
                          </p>
                        )}
                        <p className="text-cap-s text-lab-tr mt-0.5">
                          {formatRelativeTime(tx.createdAt, locale)}
                        </p>
                      </div>
                      <span className="font-bold text-par-n text-green-700 dark:text-green-400 shrink-0">
                        +{formatCurrency(tx.amount, tx.currency, bootstrap?.currencies, locale)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-bord-card bg-bg-pr p-6 space-y-4">
              <h2 className="text-par-l font-bold text-lab-pr">Communities I Support</h2>
              {data.mySubscriptions.length === 0 ? (
                <p className="text-par-s text-lab-sc py-6 text-center">
                  You have not joined any paid creator communities yet.
                </p>
              ) : (
                <div className="divide-y divide-bord-tr">
                  {data.mySubscriptions.map((sub) => (
                    <div key={sub.id} className="py-3 flex items-center justify-between gap-3">
                      <Link
                        href={`/@${sub.creatorUsername}`}
                        className="flex items-center gap-3 min-w-0"
                      >
                        <Avatar
                          src={sub.creatorAvatar}
                          alt={sub.creatorName}
                          verified={sub.creatorVerified}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="text-par-n font-semibold text-lab-pr truncate">
                            {sub.creatorName}
                          </p>
                          <p className="text-cap-s text-lab-sc">
                            {formatCurrency(
                              sub.amount,
                              sub.currency,
                              bootstrap?.currencies,
                              locale
                            )}
                            /mo · Ends {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                          </p>
                        </div>
                      </Link>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-900 shrink-0"
                        onClick={() => void handleCancelMembership(sub.creatorId)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
