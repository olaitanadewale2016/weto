'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Copy,
  Wallet,
} from 'lucide-react';
import { BusinessPortalHeader } from '@/components/business/BusinessPortalHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency } from '@/lib/currency';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';

interface WalletPayload {
  wallet: {
    id: string;
    walletNumber: string;
    balance: number;
    currency: string;
  };
  limits: {
    withdrawMin: number;
    withdrawMax: number;
    commissionWithdraw: number;
    cashoutMethods: Array<{ key: string; name: string }>;
  };
  transactions: Array<{
    id: string;
    tnxId: string;
    amount: number;
    commission?: number;
    currency: string;
    transactionType: string;
    direction: 'incoming' | 'outgoing';
    status: string;
    sourceName?: string;
    note?: string | null;
    createdAt: string;
  }>;
  cashouts: Array<{
    id: string;
    requestCode: string;
    amount: number;
    toPay: number;
    commissionPercentage: number;
    currency: string;
    paymentMethod: string;
    credentials: string;
    status: 'pending' | 'paid' | 'rejected' | 'cancelled';
    reviewerNotes?: string | null;
    createdAt: string;
  }>;
}

export default function BusinessWalletPage() {
  const { bootstrap, locale } = useApp();
  const { error, success } = useToast();
  const [data, setData] = useState<WalletPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [credentials, setCredentials] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadWallet = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<WalletPayload>('/wallet');
      setData(res);
      const firstMethod = res.limits?.cashoutMethods?.[0]?.name || 'Bank Transfer';
      setPaymentMethod((prev) => prev || firstMethod);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadWallet();
    }, 0);
    return () => clearTimeout(id);
  }, [loadWallet]);

  async function handleCopyWallet() {
    if (!data?.wallet?.walletNumber) return;
    try {
      await navigator.clipboard.writeText(data.wallet.walletNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      success('Wallet number copied');
    } catch {
      error('Could not copy wallet number');
    }
  }

  async function handleRequestCashout(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(withdrawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      error('Enter a valid withdrawal amount');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/wallet', {
        method: 'POST',
        json: {
          action: 'cashout',
          amount,
          paymentMethod,
          credentials: credentials.trim(),
        },
      });
      success('Withdrawal request submitted');
      setWithdrawOpen(false);
      setWithdrawAmount('');
      setCredentials('');
      await loadWallet();
    } catch (err) {
      error('Withdrawal failed', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <BusinessPortalHeader
          title="Business Wallet"
          subtitle="Manage creator earnings, ad spend, and payout withdrawal requests."
        />
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/wallet">
            <Button variant="outline" size="sm">
              Deposit & Transfer
            </Button>
          </Link>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setWithdrawAmount(String(data?.limits?.withdrawMin ?? 10000));
              setWithdrawOpen(true);
            }}
            disabled={!data || (data.wallet.balance || 0) <= 0}
          >
            <ArrowUpRight className="h-4 w-4" /> Request Withdrawal
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-lab-sc py-8">Loading business wallet...</p>
      ) : !data ? (
        <div className="rounded-3xl border border-bord-card bg-bg-pr p-6 space-y-3">
          <p className="text-par-n text-lab-sc">
            Sign in to view your live wallet ledger and payout history.
          </p>
          <Link href="/wallet">
            <Button variant="primary">Open Wallet</Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="rounded-3xl border border-bord-card bg-bg-pr p-6 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-cap-l text-lab-sc">
                <Wallet className="h-4 w-4 text-brand-900" />
                <span>Available Business Balance</span>
              </div>
              <p className="text-title-1 font-bold text-lab-pr">
                {formatCurrency(
                  data.wallet.balance,
                  data.wallet.currency,
                  bootstrap?.currencies,
                  locale
                )}
              </p>
              <button
                type="button"
                onClick={handleCopyWallet}
                className="inline-flex items-center gap-1.5 text-cap-l text-lab-sc hover:text-lab-pr cursor-pointer"
              >
                <span className="font-mono">{data.wallet.walletNumber}</span>
                {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-right">
              <div className="rounded-2xl bg-fill-qt px-4 py-3">
                <p className="text-cap-s text-lab-sc">Withdrawal Fee</p>
                <p className="font-bold text-lab-pr">{data.limits.commissionWithdraw}%</p>
              </div>
              <div className="rounded-2xl bg-fill-qt px-4 py-3">
                <p className="text-cap-s text-lab-sc">Min / Max Payout</p>
                <p className="font-bold text-lab-pr">
                  {formatCurrency(data.limits.withdrawMin, data.wallet.currency, bootstrap?.currencies, locale)} –{' '}
                  {formatCurrency(data.limits.withdrawMax, data.wallet.currency, bootstrap?.currencies, locale)}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-3xl border border-bord-card bg-bg-pr overflow-hidden">
              <div className="px-5 py-4 border-b border-bord-pr flex items-center justify-between">
                <h2 className="text-par-m font-bold text-lab-pr">Withdrawal Requests</h2>
                <span className="text-cap-s text-lab-sc">{data.cashouts.length} total</span>
              </div>
              {data.cashouts.length === 0 ? (
                <p className="p-6 text-center text-cap-l text-lab-sc">No withdrawal requests yet.</p>
              ) : (
                <div className="divide-y divide-bord-pr">
                  {data.cashouts.map((c) => (
                    <div key={c.id} className="p-4 flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-par-n text-lab-pr">
                            {formatCurrency(c.amount, c.currency, bootstrap?.currencies, locale)}
                          </span>
                          <Badge
                            variant={
                              c.status === 'paid'
                                ? 'success'
                                : c.status === 'rejected'
                                  ? 'danger'
                                  : 'warning'
                            }
                          >
                            {c.status}
                          </Badge>
                        </div>
                        <p className="text-cap-l text-lab-sc">
                          {c.paymentMethod} · Net{' '}
                          {formatCurrency(c.toPay, c.currency, bootstrap?.currencies, locale)}
                        </p>
                        <p className="text-cap-s text-lab-tr break-all">{c.credentials}</p>
                        {c.reviewerNotes && (
                          <p className="text-cap-s text-lab-sc">Note: {c.reviewerNotes}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0 text-cap-s text-lab-tr">
                        <p className="font-mono">{c.requestCode}</p>
                        <p>{new Date(c.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-bord-card bg-bg-pr overflow-hidden">
              <div className="px-5 py-4 border-b border-bord-pr flex items-center justify-between">
                <h2 className="text-par-m font-bold text-lab-pr">Recent Ledger Activity</h2>
                <Link href="/wallet" className="text-cap-l text-brand-900 hover:underline font-medium">
                  Full ledger
                </Link>
              </div>
              {data.transactions.length === 0 ? (
                <p className="p-6 text-center text-cap-l text-lab-sc">No transactions recorded yet.</p>
              ) : (
                <div className="divide-y divide-bord-pr">
                  {data.transactions.slice(0, 10).map((t) => (
                    <div key={t.id} className="p-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="h-9 w-9 rounded-full bg-fill-qt flex items-center justify-center shrink-0">
                          {t.direction === 'incoming' ? (
                            <ArrowDownLeft className="h-4 w-4 text-green-600" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4 text-lab-sc" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-par-n text-lab-pr capitalize truncate">
                            {t.transactionType.replace(/_/g, ' ')} · {t.sourceName || 'Wallet'}
                          </p>
                          <p className="text-cap-s text-lab-sc truncate">
                            {new Date(t.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p
                          className={`font-bold text-par-n ${
                            t.direction === 'incoming' ? 'text-green-600' : 'text-lab-pr'
                          }`}
                        >
                          {t.direction === 'incoming' ? '+' : '-'}
                          {formatCurrency(t.amount, t.currency, bootstrap?.currencies, locale)}
                        </p>
                        <p className="text-cap-s text-lab-tr capitalize">{t.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}

      <Modal open={withdrawOpen} onClose={() => setWithdrawOpen(false)} title="Request Payout Withdrawal">
        <form onSubmit={handleRequestCashout} className="space-y-4">
          <Input
            label={`Amount (${data?.wallet.currency || 'NGN'})`}
            type="number"
            min={data?.limits.withdrawMin || 10000}
            max={data?.limits.withdrawMax || undefined}
            step="any"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            hint={
              data?.limits
                ? `Min: ${formatCurrency(data.limits.withdrawMin, data.wallet.currency || 'NGN', bootstrap?.currencies, locale)} · Max: ${formatCurrency(data.limits.withdrawMax, data.wallet.currency || 'NGN', bootstrap?.currencies, locale)}`
                : undefined
            }
            required
          />
          <Select
            label="Payout Method"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
          >
            {(data?.limits.cashoutMethods?.length
              ? data.limits.cashoutMethods
              : [{ key: 'bank', name: 'Bank Transfer' }]
            ).map((m) => (
              <option key={m.key} value={m.name}>
                {m.name}
              </option>
            ))}
          </Select>
          <Input
            label="Destination Account / Credentials"
            placeholder="Bank name, account number, or payout handle"
            value={credentials}
            onChange={(e) => setCredentials(e.target.value)}
            required
          />
          <Button type="submit" variant="primary" className="w-full" loading={submitting}>
            Submit Withdrawal Request
          </Button>
        </form>
      </Modal>
    </div>
  );
}
