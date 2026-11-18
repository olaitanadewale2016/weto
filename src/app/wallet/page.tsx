'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency } from '@/lib/currency';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';
import { formatLocalizedDate } from '@/lib/i18n';

interface WalletRecipientItem {
  walletNumber: string;
  user: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    name: string;
    avatar: string;
    verified: boolean;
  };
}

interface WalletTransactionItem {
  id: string;
  transactionType: string;
  direction?: string;
  amount: number;
  commission: number;
  currency: string;
  status: string;
  metadata?: Record<string, unknown>;
  description?: string;
  sourceName?: string;
  tnxId?: string;
  note?: string | null;
  createdAt: string;
}

interface WalletPayload {
  wallet: { id: string; walletNumber: string; balance: number; currency: string };
  limits: {
    depositMin: number;
    depositMax: number;
    transferMin: number;
    transferMax: number;
    withdrawMin: number;
    withdrawMax: number;
    commissionTransfer: number;
    commissionWithdraw: number;
    cashoutMethods: Array<{ key: string; name: string }>;
  };
  providers: Array<{ id: string; name: string; key: string; enabled?: boolean }>;
  recentReceivers?: WalletRecipientItem[];
  transactions: WalletTransactionItem[];
  cashouts: Array<{
    id: string;
    amount: number;
    currency: string;
    paymentMethod: string;
    status: string;
    reviewerNotes?: string | null;
    createdAt: string;
  }>;
}

export default function WalletPage() {
  const { user, bootstrap, locale } = useApp();
  const { error, success, info } = useToast();

  const [data, setData] = useState<WalletPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [modalMode, setModalMode] = useState<'deposit' | 'transfer' | 'cashout' | null>(null);
  const [txFilter, setTxFilter] = useState<'all' | 'deposit' | 'transfer' | 'withdrawal'>('all');
  const [selectedTx, setSelectedTx] = useState<WalletTransactionItem | null>(null);

  const [amount, setAmount] = useState('2000');

  function openWalletModal(mode: 'deposit' | 'transfer' | 'cashout') {
    setModalMode(mode);
    const minAmount =
      mode === 'deposit'
        ? data?.limits?.depositMin ?? 2000
        : mode === 'transfer'
          ? data?.limits?.transferMin ?? 1000
          : data?.limits?.withdrawMin ?? 10000;
    setAmount(String(minAmount));
  }
  const [provider, setProvider] = useState<'paystack' | 'stripe' | 'paypal' | 'yoo_kassa' | 'robokassa'>('paystack');
  const [recipient, setRecipient] = useState('');
  const [recipientPreview, setRecipientPreview] = useState<WalletRecipientItem | null>(null);
  const [lookingUpRecipient, setLookingUpRecipient] = useState(false);
  const [transferMessage, setTransferMessage] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
  const [credentials, setCredentials] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadWallet = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<WalletPayload>('/wallet');
      setData(res);
      const firstProvider = res.providers?.[0]?.key || res.providers?.[0]?.id;
      if (firstProvider) {
        setProvider(firstProvider as typeof provider);
      }
      if (res.limits?.cashoutMethods?.[0]?.key) {
        setPaymentMethod(res.limits.cashoutMethods[0].key);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const qs = new URLSearchParams(window.location.search);
    const depositStatus = qs.get('deposit');
    if (depositStatus) {
      let timerId: ReturnType<typeof setTimeout> | null = null;
      if (depositStatus === 'success') {
        success('Wallet deposit completed!');
        timerId = setTimeout(() => {
          void loadWallet();
        }, 0);
      } else if (depositStatus === 'processing') {
        info('Payment is being confirmed and will reflect in your balance shortly.');
        timerId = setTimeout(() => {
          void loadWallet();
        }, 0);
      } else if (depositStatus === 'cancelled') {
        info('Deposit was cancelled.');
      } else {
        error('Deposit could not be completed.');
      }
      window.history.replaceState(null, '', '/wallet');
      return () => {
        if (timerId) clearTimeout(timerId);
      };
    }
  }, [success, info, error, loadWallet]);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadWallet();
    }, 0);
    return () => clearTimeout(id);
  }, [loadWallet]);

  useEffect(() => {
    if (modalMode !== 'transfer') return;
    const clean = recipient.trim();
    if (clean.length < 2) {
      const id = setTimeout(() => {
        setRecipientPreview(null);
        setLookingUpRecipient(false);
      }, 0);
      return () => clearTimeout(id);
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLookingUpRecipient(true);
      try {
        const res = await apiFetch<{ recipient: WalletRecipientItem | null }>(
          `/wallet?lookup=${encodeURIComponent(clean)}`
        );
        if (!cancelled) setRecipientPreview(res.recipient || null);
      } catch {
        if (!cancelled) setRecipientPreview(null);
      } finally {
        if (!cancelled) setLookingUpRecipient(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [modalMode, recipient]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!modalMode) return;
    setSubmitting(true);
    try {
      const numAmount = Number(amount);
      if (modalMode === 'deposit') {
        const res = await apiFetch<{ checkoutUrl?: string }>('/wallet', {
          method: 'POST',
          json: { action: 'deposit', amount: numAmount, provider, currency: data?.wallet.currency },
        });
        if (res.checkoutUrl) {
          window.location.href = res.checkoutUrl;
          return;
        }
      } else if (modalMode === 'transfer') {
        await apiFetch('/wallet', {
          method: 'POST',
          json: {
            action: 'transfer',
            recipient: recipient.trim(),
            amount: numAmount,
            message: transferMessage.trim() || undefined,
            idempotencyKey: `ui_${Date.now()}`,
          },
        });
        success('Transfer completed!');
      } else if (modalMode === 'cashout') {
        await apiFetch('/wallet', {
          method: 'POST',
          json: {
            action: 'cashout',
            amount: numAmount,
            paymentMethod,
            credentials: credentials.trim(),
          },
        });
        success('Withdrawal request submitted for admin review.');
      }
      setModalMode(null);
      setRecipient('');
      setRecipientPreview(null);
      setTransferMessage('');
      setCredentials('');
      loadWallet();
    } catch (err) {
      error('Transaction failed', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell hideMobileHeader>
      <div className="sticky top-0 z-20 pt-safe px-safe bg-bg-pr/95 backdrop-blur-xs border-b border-bord-tr px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="h-8 w-8 rounded-full hover:bg-fill-tr flex items-center justify-center text-lab-pr shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-title-3 font-bold text-lab-pr">Wallet</h1>
        </div>
        <Button size="icon" variant="ghost" onClick={loadWallet} title="Refresh balance">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {loading || !data ? (
        <div className="p-8 text-center text-lab-sc">
          {user ? 'Loading wallet...' : 'Sign in to access your wallet.'}
        </div>
      ) : (
        <div className="p-4 sm:p-5 space-y-8">
          {/* Exact PHP WalletOverview.vue layout & tokens */}
          <div className="space-y-4">
            <div className="flex items-end justify-between gap-2">
              <div>
                <h2 className="text-4xl sm:text-5xl leading-none font-bold text-mint dark:text-green-900">
                  {balanceHidden
                    ? '••••••'
                    : formatCurrency(data.wallet.balance, data.wallet.currency, bootstrap?.currencies, locale)}
                </h2>
                <div className="inline-flex items-center gap-1.5 mt-2">
                  <span className="text-par-n text-lab-sc">
                    Current balance · #{data.wallet.walletNumber}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(data.wallet.walletNumber).then(
                        () => success('Wallet number copied'),
                        () => undefined
                      );
                    }}
                    className="size-5 inline-flex items-center justify-center text-lab-tr hover:text-lab-pr cursor-pointer"
                    aria-label="Copy wallet number"
                    title="Copy wallet number"
                  >
                    <Copy className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setBalanceHidden((v) => !v)}
                    className="size-5 inline-flex items-center justify-center text-lab-tr hover:text-lab-pr cursor-pointer"
                    aria-label={balanceHidden ? 'Show balance' : 'Hide balance'}
                  >
                    {balanceHidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => openWalletModal('deposit')}
                className="h-32 sm:h-40 bg-fill-qt rounded-xl px-3 sm:px-4 py-3 relative cursor-pointer hover:bg-fill-tr transition-all ease-linear text-left flex flex-col justify-between"
              >
                <div>
                  <h4 className="text-par-n text-lab-pr2 font-bold mb-1">Deposit</h4>
                  <p className="text-par-s leading-tight text-lab-sc hidden sm:block">
                    Add funds to wallet
                  </p>
                </div>
                <span className="size-9 sm:size-10 rounded-xl bg-brand-900 text-white inline-flex items-center justify-center ml-auto">
                  <Plus className="size-4" />
                </span>
              </button>

              <button
                type="button"
                onClick={() => openWalletModal('transfer')}
                className="h-32 sm:h-40 bg-fill-qt rounded-xl px-3 sm:px-4 py-3 relative cursor-pointer hover:bg-fill-tr transition-all ease-linear text-left flex flex-col justify-between"
              >
                <div>
                  <h4 className="text-par-n text-lab-pr2 font-bold mb-1">Transfer</h4>
                  <p className="text-par-s leading-tight text-lab-sc hidden sm:block">
                    Send to another user
                  </p>
                </div>
                <span className="size-9 sm:size-10 rounded-xl bg-bg-pr text-lab-pr2 inline-flex items-center justify-center ml-auto border border-bord-tr">
                  <ArrowRight className="size-4" />
                </span>
              </button>

              <button
                type="button"
                onClick={() => openWalletModal('cashout')}
                className="h-32 sm:h-40 bg-fill-qt rounded-xl px-3 sm:px-4 py-3 relative cursor-pointer hover:bg-fill-tr transition-all ease-linear text-left flex flex-col justify-between"
              >
                <div>
                  <h4 className="text-par-n text-lab-pr2 font-bold mb-1">Withdraw</h4>
                  <p className="text-par-s leading-tight text-lab-sc hidden sm:block">
                    Request a payout
                  </p>
                </div>
                <span className="size-9 sm:size-10 rounded-xl bg-bg-pr text-lab-pr2 inline-flex items-center justify-center ml-auto border border-bord-tr">
                  <ArrowUpRight className="size-4" />
                </span>
              </button>
            </div>
          </div>

          {/* Pending/Recent Cashouts */}
          {data.cashouts.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-par-m font-bold text-lab-pr">Withdrawal Requests</h2>
              <div className="space-y-2">
                {data.cashouts.map((c) => {
                  const st = String(c.status || '').toLowerCase();
                  const badgeVariant =
                    st === 'paid' || st === 'approved'
                      ? 'success'
                      : st === 'rejected' || st === 'declined' || st === 'cancelled'
                        ? 'danger'
                        : 'warning';
                  return (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-2xl border border-bord-pr p-3.5"
                    >
                      <div className="min-w-0 pr-3">
                        <p className="text-par-n font-semibold text-lab-pr truncate">
                          {formatCurrency(c.amount, c.currency, bootstrap?.currencies, locale)} · {c.paymentMethod.replace(/_/g, ' ')}
                        </p>
                        <p className="text-cap-s text-lab-sc truncate">
                          {formatLocalizedDate(c.createdAt, locale)}
                          {c.reviewerNotes ? ` · Note: ${c.reviewerNotes}` : ''}
                        </p>
                      </div>
                      <Badge variant={badgeVariant} className="capitalize shrink-0">
                        {c.status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Transaction Ledger */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-par-m font-bold text-lab-pr">Transaction History</h2>
              <div className="flex items-center gap-1.5">
                {(
                  [
                    { key: 'all', label: 'All' },
                    { key: 'deposit', label: 'Deposits' },
                    { key: 'transfer', label: 'Transfers' },
                    { key: 'withdrawal', label: 'Withdrawals' },
                  ] as const
                ).map((pill) => (
                  <button
                    key={pill.key}
                    type="button"
                    onClick={() => setTxFilter(pill.key)}
                    className={`px-3 py-1 rounded-full text-cap-s font-semibold transition-colors cursor-pointer ${txFilter === pill.key
                      ? 'bg-brand-900 text-white'
                      : 'bg-fill-qt text-lab-sc hover:text-lab-pr'
                      }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>
            {(() => {
              const filtered = data.transactions.filter((tx) => {
                if (txFilter === 'all') return true;
                if (txFilter === 'deposit') return tx.transactionType === 'deposit';
                if (txFilter === 'transfer') {
                  return tx.transactionType === 'transfer' || tx.transactionType === 'transfer_in';
                }
                return (
                  tx.transactionType === 'withdraw' ||
                  tx.transactionType === 'withdrawal' ||
                  tx.transactionType === 'refund'
                );
              });
              if (filtered.length === 0) {
                return (
                  <p className="text-par-n text-lab-sc py-6 text-center rounded-2xl border border-bord-pr">
                    No wallet transactions recorded yet.
                  </p>
                );
              }
              return (
                <div className="divide-y divide-bord-pr rounded-3xl border border-bord-pr overflow-hidden">
                  {filtered.map((tx) => {
                    const isCredit =
                      tx.direction === 'incoming' ||
                      tx.transactionType === 'deposit' ||
                      tx.transactionType === 'refund' ||
                      tx.transactionType === 'transfer_in';
                    return (
                      <button
                        key={tx.id}
                        type="button"
                        onClick={() => setSelectedTx(tx)}
                        className="w-full text-left flex items-center justify-between p-4 bg-bg-pr hover:bg-fill-pr/50 transition-colors cursor-pointer"
                      >
                        <div className="min-w-0 pr-3">
                          <p className="text-par-n font-semibold text-lab-pr capitalize truncate">
                            {tx.sourceName && tx.sourceName !== 'Wallet'
                              ? `${tx.transactionType.replace(/_/g, ' ')} · ${tx.sourceName}`
                              : tx.transactionType.replace(/_/g, ' ')}
                          </p>
                          <p className="text-cap-l text-lab-sc truncate">
                            {tx.note || tx.description || formatLocalizedDate(tx.createdAt, locale)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-par-n font-bold ${isCredit ? 'text-green-900' : 'text-lab-pr'}`}>
                            {isCredit ? '+' : '-'}{formatCurrency(tx.amount, tx.currency, bootstrap?.currencies, locale)}
                          </p>
                          <p className="text-cap-s text-lab-tr capitalize">{tx.status}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Transaction Details Modal (PHP TransactionModal.vue parity) */}
      <Modal
        open={selectedTx !== null}
        onClose={() => setSelectedTx(null)}
        title="Transaction Details"
      >
        {selectedTx && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 border-b border-bord-pr pb-3">
              <div>
                <p className="text-par-l font-bold text-lab-pr">
                  {selectedTx.sourceName || 'Wallet Transaction'}
                </p>
                <p className="text-cap-l text-lab-sc capitalize">
                  {selectedTx.transactionType.replace(/_/g, ' ')}
                </p>
              </div>
              <div className="text-right">
                <p
                  className={`text-par-l font-bold ${selectedTx.direction === 'incoming' ||
                    selectedTx.transactionType === 'deposit' ||
                    selectedTx.transactionType === 'refund' ||
                    selectedTx.transactionType === 'transfer_in'
                    ? 'text-green-900'
                    : 'text-lab-pr'
                    }`}
                >
                  {selectedTx.direction === 'incoming' ||
                    selectedTx.transactionType === 'deposit' ||
                    selectedTx.transactionType === 'refund' ||
                    selectedTx.transactionType === 'transfer_in'
                    ? '+'
                    : '-'}
                  {formatCurrency(selectedTx.amount, selectedTx.currency, bootstrap?.currencies, locale)}
                </p>
                <Badge
                  variant={
                    selectedTx.status === 'completed'
                      ? 'success'
                      : selectedTx.status === 'failed'
                        ? 'danger'
                        : 'brand'
                  }
                >
                  {selectedTx.status}
                </Badge>
              </div>
            </div>

            <div className="space-y-2.5 text-par-s">
              <div className="flex justify-between gap-2">
                <span className="text-lab-sc">Date</span>
                <span className="text-lab-pr font-medium">
                  {formatLocalizedDate(selectedTx.createdAt, locale)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-lab-sc">Transaction ID</span>
                <span className="text-lab-pr font-mono font-semibold">
                  {selectedTx.tnxId || selectedTx.id.slice(-10).toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-lab-sc">Commission / Fee</span>
                <span className="text-lab-pr font-medium">
                  {formatCurrency(selectedTx.commission || 0, selectedTx.currency, bootstrap?.currencies, locale)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-lab-sc">Currency</span>
                <span className="text-lab-pr font-medium">{selectedTx.currency}</span>
              </div>
              {selectedTx.note && (
                <div className="pt-2 border-t border-bord-pr">
                  <p className="text-cap-l text-lab-sc mb-1">Note</p>
                  <p className="text-par-s text-lab-pr rounded-xl bg-fill-qt p-3">
                    {selectedTx.note}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={modalMode !== null}
        onClose={() => setModalMode(null)}
        title={
          modalMode === 'deposit'
            ? 'Deposit Funds'
            : modalMode === 'transfer'
              ? 'Transfer Funds'
              : 'Request Withdrawal'
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label={`Amount (${data?.wallet.currency || bootstrap?.config?.defaultCurrency || 'NGN'})`}
            type="number"
            step="any"
            min={
              data?.limits
                ? modalMode === 'deposit'
                  ? data.limits.depositMin
                  : modalMode === 'transfer'
                    ? data.limits.transferMin
                    : data.limits.withdrawMin
                : 1
            }
            max={
              data?.limits
                ? modalMode === 'deposit'
                  ? data.limits.depositMax
                  : modalMode === 'transfer'
                    ? data.limits.transferMax
                    : data.limits.withdrawMax
                : undefined
            }
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            hint={
              data?.limits
                ? (() => {
                    const cur = data?.wallet.currency || bootstrap?.config?.defaultCurrency || 'NGN';
                    const minVal =
                      modalMode === 'deposit'
                        ? data.limits.depositMin
                        : modalMode === 'transfer'
                          ? data.limits.transferMin
                          : data.limits.withdrawMin;
                    const maxVal =
                      modalMode === 'deposit'
                        ? data.limits.depositMax
                        : modalMode === 'transfer'
                          ? data.limits.transferMax
                          : data.limits.withdrawMax;
                    return `Min: ${formatCurrency(minVal, cur, bootstrap?.currencies, locale)} · Max: ${formatCurrency(maxVal, cur, bootstrap?.currencies, locale)}`;
                  })()
                : undefined
            }
          />

          {modalMode === 'deposit' && (
            <div className="space-y-1.5">
              <Select
                label="Payment Provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value as typeof provider)}
              >
                {data?.providers && data.providers.length > 0 ? (
                  data.providers.map((p) => {
                    const val = p.key || p.id;
                    return (
                      <option key={val} value={val}>
                        {p.name}
                      </option>
                    );
                  })
                ) : (
                  <option value="" disabled>
                    No payment gateways enabled in Admin
                  </option>
                )}
              </Select>
              {(!data?.providers || data.providers.length === 0) && (
                <p className="text-cap-s text-red-900">
                  Enable Paystack, Stripe, PayPal, YooKassa, or RoboKassa under Admin → Platform Config → Acquiring.
                </p>
              )}
            </div>
          )}

          {modalMode === 'transfer' && (
            <div className="space-y-3">
              {data?.recentReceivers && data.recentReceivers.length > 0 && (
                <div>
                  <p className="text-cap-l font-medium text-lab-sc mb-1.5">Recent Receivers</p>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {data.recentReceivers.map((rec) => (
                      <button
                        key={rec.user.id}
                        type="button"
                        onClick={() => {
                          setRecipient(rec.walletNumber);
                          setRecipientPreview(rec);
                        }}
                        className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-cap-s shrink-0 cursor-pointer transition-colors ${recipient === rec.walletNumber ||
                          recipient.replace(/^@/, '').toLowerCase() === rec.user.username.toLowerCase()
                          ? 'border-brand-900 bg-brand-900/10 text-lab-pr'
                          : 'border-bord-pr bg-fill-qt text-lab-sc hover:text-lab-pr'
                          }`}
                      >
                        <Avatar src={rec.user.avatar} alt={rec.user.username} size="xs" />
                        <span className="font-semibold">@{rec.user.username}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Input
                label="Recipient (@username or Wallet #)"
                placeholder="@alex_morgan or CW-..."
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                required
              />

              {lookingUpRecipient && (
                <p className="text-cap-s text-lab-sc">Looking up recipient...</p>
              )}
              {!lookingUpRecipient && recipientPreview && (
                <div className="flex items-center gap-2.5 rounded-xl border border-bord-pr bg-fill-qt p-2.5">
                  <Avatar
                    src={recipientPreview.user.avatar}
                    alt={recipientPreview.user.username}
                    size="sm"
                    verified={recipientPreview.user.verified}
                  />
                  <div className="min-w-0">
                    <p className="text-par-s font-bold text-lab-pr truncate">
                      {recipientPreview.user.name}
                    </p>
                    <p className="text-cap-s text-lab-sc truncate">
                      @{recipientPreview.user.username} · #{recipientPreview.walletNumber}
                    </p>
                  </div>
                </div>
              )}

              <Input
                label="Note / Message (optional)"
                placeholder="Thanks!"
                maxLength={140}
                value={transferMessage}
                onChange={(e) => setTransferMessage(e.target.value)}
              />

              {Number(amount) > 0 && data && (
                <div className="rounded-xl border border-bord-pr bg-fill-qt p-3 space-y-1 text-cap-l">
                  <div className="flex justify-between text-lab-sc">
                    <span>Fee ({data.limits.commissionTransfer}%)</span>
                    <span>
                      {formatCurrency(
                        (Number(amount) * data.limits.commissionTransfer) / 100,
                        data.wallet.currency,
                        bootstrap?.currencies,
                        locale
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-lab-pr">
                    <span>Recipient receives</span>
                    <span>
                      {formatCurrency(
                        Number(amount) - (Number(amount) * data.limits.commissionTransfer) / 100,
                        data.wallet.currency,
                        bootstrap?.currencies,
                        locale
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {modalMode === 'cashout' && (
            <>
              <Select
                label="Payout Method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                {data?.limits.cashoutMethods && data.limits.cashoutMethods.length > 0 ? (
                  data.limits.cashoutMethods.map((m) => (
                    <option key={m.key} value={m.key}>{m.name}</option>
                  ))
                ) : (
                  <>
                    <option value="bank_transfer">Bank Transfer / IBAN</option>
                    <option value="paypal">PayPal Payout</option>
                    <option value="stripe">Stripe Express</option>
                  </>
                )}
              </Select>
              <Input
                label="Payout Account Details"
                placeholder="PayPal email or IBAN / Bank details"
                value={credentials}
                onChange={(e) => setCredentials(e.target.value)}
                required
                hint={`Commission: ${data?.limits.commissionWithdraw || 0}%`}
              />
              {Number(amount) > 0 && data && (
                <div className="rounded-xl border border-bord-pr bg-fill-qt p-3 space-y-1 text-cap-l">
                  <div className="flex justify-between text-lab-sc">
                    <span>Fee ({data.limits.commissionWithdraw}%)</span>
                    <span>
                      {formatCurrency(
                        (Number(amount) * data.limits.commissionWithdraw) / 100,
                        data.wallet.currency,
                        bootstrap?.currencies,
                        locale
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-lab-pr">
                    <span>Estimated Payout</span>
                    <span>
                      {formatCurrency(
                        Number(amount) - (Number(amount) * data.limits.commissionWithdraw) / 100,
                        data.wallet.currency,
                        bootstrap?.currencies,
                        locale
                      )}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          <Button type="submit" variant="primary" className="w-full" loading={submitting}>
            <CreditCard className="h-4 w-4" /> Confirm
          </Button>
        </form>
      </Modal>
    </AppShell>
  );
}
