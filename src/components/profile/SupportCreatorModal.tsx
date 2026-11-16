'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Award, CheckCircle2, HeartHandshake, Wallet } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency } from '@/lib/currency';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';

interface SupportCreatorModalProps {
  open: boolean;
  onClose: () => void;
  creator: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    monetization?: {
      tipsEnabled: boolean;
      subscriptionsEnabled: boolean;
      monthlyPrice: number;
      currency: string;
      description?: string;
    };
  };
  initialTab?: 'tip' | 'subscribe';
  onCompleted?: () => void;
}

const TIP_PRESETS = [500, 1000, 2500, 5000];

export function SupportCreatorModal({
  open,
  onClose,
  creator,
  initialTab = 'tip',
  onCompleted,
}: SupportCreatorModalProps) {
  const { bootstrap, locale, refreshBootstrap } = useApp();
  const { success, error } = useToast();

  const tipsEnabled = Boolean(creator.monetization?.tipsEnabled);
  const subsEnabled = Boolean(creator.monetization?.subscriptionsEnabled);
  const [mode, setMode] = useState<'tip' | 'subscribe'>(
    initialTab === 'subscribe' && subsEnabled ? 'subscribe' : tipsEnabled ? 'tip' : 'subscribe'
  );
  const [tipAmount, setTipAmount] = useState<string>('1000');
  const [note, setNote] = useState('');
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletCurrency, setWalletCurrency] = useState(
    creator.monetization?.currency || bootstrap?.config?.defaultCurrency || 'NGN'
  );
  const [viewerSubscribed, setViewerSubscribed] = useState(false);
  const [subscriptionPeriodEnd, setSubscriptionPeriodEnd] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const t = setTimeout(() => {
      setMode(
        initialTab === 'subscribe' && subsEnabled
          ? 'subscribe'
          : tipsEnabled
            ? 'tip'
            : 'subscribe'
      );
      Promise.all([
        apiFetch<{ wallet?: { balance: number; currency: string } }>('/wallet').catch(() => null),
        apiFetch<{ viewerSubscribed: boolean; subscriptionPeriodEnd: string | null }>(
          `/monetization?creatorId=${encodeURIComponent(creator.id)}`
        ).catch(() => null),
      ]).then(([walletRes, monoRes]) => {
        if (!active) return;
        if (walletRes?.wallet) {
          setWalletBalance(walletRes.wallet.balance);
          setWalletCurrency(walletRes.wallet.currency || 'NGN');
        }
        if (monoRes) {
          setViewerSubscribed(Boolean(monoRes.viewerSubscribed));
          setSubscriptionPeriodEnd(monoRes.subscriptionPeriodEnd || null);
        }
      });
    }, 0);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [open, creator.id, initialTab, tipsEnabled, subsEnabled]);

  const creatorName = `${creator.firstName} ${creator.lastName}`.trim() || `@${creator.username}`;
  const monthlyPrice = Number(creator.monetization?.monthlyPrice ?? 5000);
  const parsedTip = Number(tipAmount);
  const activeCost = mode === 'tip' ? (Number.isFinite(parsedTip) ? parsedTip : 0) : monthlyPrice;
  const insufficient = walletBalance !== null && activeCost > 0 && walletBalance < activeCost;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'tip' && (!Number.isFinite(parsedTip) || parsedTip < 50)) {
      error('Enter a valid tip amount (minimum 50).');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'tip') {
        await apiFetch('/monetization', {
          method: 'POST',
          json: {
            action: 'tip',
            creatorId: creator.id,
            amount: parsedTip,
            message: note.trim() || undefined,
          },
        });
        success('Tip sent!', `You supported ${creatorName} with ${formatCurrency(parsedTip, walletCurrency, bootstrap?.currencies, locale)}.`);
      } else {
        const res = await apiFetch<{ subscribed: boolean; currentPeriodEnd: string }>(
          '/monetization',
          {
            method: 'POST',
            json: {
              action: 'subscribe',
              creatorId: creator.id,
            },
          }
        );
        setViewerSubscribed(true);
        setSubscriptionPeriodEnd(res.currentPeriodEnd);
        success('Joined community!', `You are now a member of ${creatorName}'s community.`);
      }
      void refreshBootstrap();
      onCompleted?.();
      onClose();
    } catch (err) {
      error('Payment failed', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Support ${creatorName}`}
      description="Back your favorite creator directly from your Weto Wallet."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {tipsEnabled && subsEnabled && (
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-fill-qt">
            <button
              type="button"
              onClick={() => setMode('tip')}
              className={cn(
                'py-2 px-3 rounded-xl text-par-s font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5',
                mode === 'tip' ? 'bg-bg-pr text-lab-pr shadow-sm' : 'text-lab-sc hover:text-lab-pr'
              )}
            >
              <HeartHandshake className="size-4" /> Send Tip
            </button>
            <button
              type="button"
              onClick={() => setMode('subscribe')}
              className={cn(
                'py-2 px-3 rounded-xl text-par-s font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5',
                mode === 'subscribe'
                  ? 'bg-bg-pr text-lab-pr shadow-sm'
                  : 'text-lab-sc hover:text-lab-pr'
              )}
            >
              <Award className="size-4" /> Membership
            </button>
          </div>
        )}

        {mode === 'tip' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {TIP_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTipAmount(String(preset))}
                  className={cn(
                    'px-3.5 py-2 rounded-xl border text-par-s font-semibold cursor-pointer transition-colors',
                    Number(tipAmount) === preset
                      ? 'border-brand-900 bg-brand-900/10 text-brand-900'
                      : 'border-bord-pr bg-bg-pr text-lab-pr hover:bg-fill-qt'
                  )}
                >
                  {formatCurrency(preset, walletCurrency, bootstrap?.currencies, locale)}
                </button>
              ))}
            </div>

            <Input
              label={`Custom amount (${walletCurrency})`}
              type="number"
              min={50}
              step="50"
              value={tipAmount}
              onChange={(e) => setTipAmount(e.target.value)}
            />

            <Textarea
              label="Optional appreciation note"
              placeholder={`Say thanks to @${creator.username}...`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={180}
              rows={2}
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-bord-card bg-bg-sc/50 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Award className="size-5 text-brand-900 shrink-0" />
                <div>
                  <p className="font-bold text-par-m text-lab-pr">Monthly Community Pass</p>
                  <p className="text-cap-l text-lab-sc">30 days direct creator support</p>
                </div>
              </div>
              <Badge variant="brand">
                {formatCurrency(
                  monthlyPrice,
                  creator.monetization?.currency || walletCurrency,
                  bootstrap?.currencies,
                  locale
                )}
                /mo
              </Badge>
            </div>

            {creator.monetization?.description ? (
              <p className="text-par-s text-lab-pr2 leading-relaxed">
                {creator.monetization.description}
              </p>
            ) : (
              <p className="text-par-s text-lab-sc">
                Unlock ongoing community supporter recognition and help fund future publications.
              </p>
            )}

            {viewerSubscribed ? (
              <div className="rounded-xl bg-green-500/10 border border-green-500/25 px-3 py-2.5 flex items-center gap-2 text-par-s text-green-700 dark:text-green-400">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>
                  Active supporter until{' '}
                  {subscriptionPeriodEnd
                    ? new Date(subscriptionPeriodEnd).toLocaleDateString()
                    : 'next cycle'}
                </span>
              </div>
            ) : null}
          </div>
        )}

        <div className="rounded-2xl bg-fill-qt/70 border border-bord-tr px-4 py-3 flex items-center justify-between gap-3 text-par-s">
          <div className="flex items-center gap-2 text-lab-sc">
            <Wallet className="size-4 shrink-0 text-lab-pr2" />
            <span>Your Wallet balance</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-lab-pr">
              {walletBalance !== null
                ? formatCurrency(walletBalance, walletCurrency, bootstrap?.currencies, locale)
                : 'Loading...'}
            </span>
            {insufficient ? (
              <Link
                href="/wallet"
                onClick={onClose}
                className="text-cap-s font-semibold text-brand-900 hover:underline"
              >
                Add funds
              </Link>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          {mode === 'subscribe' && viewerSubscribed ? (
            <Button variant="secondary" type="button" onClick={onClose}>
              Subscribed
            </Button>
          ) : (
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              disabled={insufficient}
            >
              {insufficient
                ? 'Insufficient balance'
                : mode === 'tip'
                  ? 'Send Tip'
                  : 'Join Community'}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
