'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, TrendingUp, Wallet } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency } from '@/lib/currency';
import { getListingPromotionPlans } from '@/lib/promotions';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';

interface ProductPromoteModalProps {
  open: boolean;
  onClose: () => void;
  product: {
    id: string;
    title: string;
    isPromoted?: boolean;
    promotedUntil?: string | null;
  } | null;
  onPromoted: (payload: { productId: string; isPromoted: boolean; promotedUntil: string }) => void;
}

export function ProductPromoteModal({
  open,
  onClose,
  product,
  onPromoted,
}: ProductPromoteModalProps) {
  const { bootstrap, locale, refreshBootstrap } = useApp();
  const { success, error } = useToast();
  const [selectedPlan, setSelectedPlan] = useState<'3d' | '7d' | '14d'>('7d');
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletCurrency, setWalletCurrency] = useState<string>(
    bootstrap?.config?.defaultCurrency || 'NGN'
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const t = setTimeout(() => {
      apiFetch<{ wallet?: { balance: number; currency: string } }>('/wallet')
        .then((res) => {
          if (!active || !res.wallet) return;
          setWalletBalance(res.wallet.balance);
          setWalletCurrency(res.wallet.currency || 'NGN');
        })
        .catch(() => {
          if (!active) return;
          setWalletBalance(null);
        });
    }, 0);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [open]);

  if (!product) return null;

  const plans = getListingPromotionPlans(bootstrap?.config?.promotions);
  const currentPlan = plans.find((p) => p.id === selectedPlan) || plans[1];
  const insufficient = walletBalance !== null && walletBalance < currentPlan.price;

  async function handlePromote() {
    if (!product) return;
    setSubmitting(true);
    try {
      const res = await apiFetch<{ isPromoted: boolean; promotedUntil: string }>(
        `/marketplace/${product.id}`,
        {
          method: 'PATCH',
          json: {
            action: 'promote',
            promotionPlan: selectedPlan,
          },
        }
      );
      success(
        product.isPromoted ? 'Promotion extended' : 'Listing promoted',
        `"${product.title}" now appears at the top of Marketplace results.`
      );
      onPromoted({
        productId: product.id,
        isPromoted: res.isPromoted,
        promotedUntil: res.promotedUntil,
      });
      void refreshBootstrap();
      onClose();
    } catch (err) {
      error('Promotion failed', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Promote marketplace listing"
      description={`Boost "${product.title}" to the top of Marketplace search & category grids with a Promoted badge.`}
    >
      <div className="space-y-4">
        {product.isPromoted && product.promotedUntil ? (
          <div className="rounded-2xl bg-brand-900/10 border border-brand-900/20 px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-par-s text-lab-pr">
              <TrendingUp className="size-4 text-brand-900 shrink-0" />
              <span>
                Currently promoted until{' '}
                <strong>{new Date(product.promotedUntil).toLocaleDateString()}</strong>. Choosing a
                plan extends it automatically.
              </span>
            </div>
          </div>
        ) : null}

        <div className="space-y-2.5">
          {plans.map((plan) => {
            const active = selectedPlan === plan.id;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlan(plan.id)}
                className={cn(
                  'w-full text-left rounded-2xl border p-3.5 transition-colors cursor-pointer flex items-start justify-between gap-3',
                  active
                    ? 'border-brand-900 bg-brand-900/5'
                    : 'border-bord-card bg-bg-pr hover:bg-fill-qt/60'
                )}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-par-m text-lab-pr">{plan.label}</span>
                    <Badge variant={active ? 'brand' : 'default'}>{plan.badgeText}</Badge>
                  </div>
                  <p className="text-cap-l text-lab-sc leading-snug">{plan.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-bold text-par-m text-lab-pr">
                    {formatCurrency(plan.price, walletCurrency, bootstrap?.currencies, locale)}
                  </span>
                  <span
                    className={cn(
                      'size-5 rounded-full border flex items-center justify-center',
                      active
                        ? 'border-brand-900 bg-brand-900 text-white'
                        : 'border-bord-pr bg-bg-pr'
                    )}
                  >
                    {active ? <Check className="size-3" /> : null}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="rounded-2xl bg-fill-qt/70 border border-bord-tr px-4 py-3 flex items-center justify-between gap-3 text-par-s">
          <div className="flex items-center gap-2 text-lab-sc">
            <Wallet className="size-4 shrink-0 text-lab-pr2" />
            <span>Wallet balance</span>
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
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={submitting}
            disabled={insufficient}
            onClick={handlePromote}
          >
            <TrendingUp className="size-4" />
            {insufficient
              ? 'Insufficient balance'
              : `Pay ${formatCurrency(currentPlan.price, walletCurrency, bootstrap?.currencies, locale)} & Promote`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
