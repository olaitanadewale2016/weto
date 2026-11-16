import { ClientSession, Types } from 'mongoose';
import { withMongoTransaction } from '@/lib/db';
import { Ad, IAdDocument, Wallet, WalletTransaction } from '@/models/Finance';
import { Media } from '@/models/Media';
import {
  AdApproval,
  AdStatus,
  TransactionDirection,
  TransactionStatus,
  TransactionType,
} from '@/types/enums';
import { ValidationError } from '@/lib/api-response';
import { getSettingsGroup } from '@/services/settings.service';
import { ensureWallet } from '@/services/wallet.service';

/**
 * Escrows campaign budget from the advertiser's wallet inside a DB transaction
 * (matching PHP Upsert::allocateBudget + Meta/X prepaid ad credit ledger).
 */
export async function createAdWithWalletBudget(params: {
  userId: Types.ObjectId;
  title: string;
  content: string;
  ctaText: string;
  targetUrl: string;
  totalBudget: number;
  pricePerView: number;
  mediaId: Types.ObjectId | null;
  status: AdStatus;
  approval: AdApproval;
  currency: string;
}): Promise<IAdDocument> {
  const budget = Number(params.totalBudget.toFixed(2));
  await ensureWallet(params.userId);

  return withMongoTransaction(async (session) => {
    const debitedWallet = await debitWalletForAd({
      userId: params.userId,
      amount: budget,
      currency: params.currency,
      action: 'budget_allocation',
      adTitle: params.title,
      session,
    });

    const [created] = await Ad.create(
      [
        {
          userId: params.userId,
          title: params.title,
          content: params.content,
          ctaText: params.ctaText,
          targetUrl: params.targetUrl,
          totalBudget: budget,
          allocatedBudget: budget,
          spentBudget: 0,
          pricePerView: params.pricePerView,
          mediaId: params.mediaId,
          status: params.status,
          approval: params.approval,
        },
      ],
      { session }
    );

    await WalletTransaction.create(
      [
        {
          walletId: debitedWallet._id,
          userId: params.userId,
          amount: budget,
          commission: 0,
          currency: debitedWallet.currency || params.currency,
          transactionType: TransactionType.ADVERTISING,
          isInternal: false,
          direction: TransactionDirection.OUTGOING,
          status: TransactionStatus.COMPLETED,
          idempotencyKey: `ad-alloc-${String(created._id)}-${Date.now()}`,
          metadata: {
            adId: String(created._id),
            action: 'budget_allocation',
            title: params.title,
          },
        },
      ],
      { session }
    );

    if (created.mediaId) {
      await Media.updateOne(
        { _id: created.mediaId, ownerId: params.userId },
        { $set: { targetType: 'ad', targetId: created._id } },
        { session }
      );
    }

    return created;
  });
}

/**
 * Adjusts an existing campaign's escrowed budget: debits additional ad credits on increases
 * or refunds unused allocated credits on decreases, strictly clamped above spentBudget.
 */
export async function adjustAdBudgetInWallet(params: {
  ad: IAdDocument;
  nextBudget: number;
  currency: string;
}): Promise<{ nextAllocated: number }> {
  const nextTotal = Number(params.nextBudget.toFixed(2));
  const currentTotal = Number(params.ad.totalBudget || 0);
  const currentAllocated = Number(params.ad.allocatedBudget || 0);
  const spent = Number(params.ad.spentBudget || 0);

  if (nextTotal < spent) {
    throw new ValidationError(`Campaign budget cannot be lower than already spent amount (${spent}).`);
  }

  const delta = Number((nextTotal - currentTotal).toFixed(2));
  if (Math.abs(delta) < 0.01) {
    return { nextAllocated: currentAllocated };
  }

  await ensureWallet(params.ad.userId);

  return withMongoTransaction(async (session) => {
    if (delta > 0) {
      const debited = await debitWalletForAd({
        userId: params.ad.userId,
        amount: delta,
        currency: params.currency,
        action: 'budget_increase',
        adTitle: params.ad.title || 'Ad Campaign',
        session,
      });

      await WalletTransaction.create(
        [
          {
            walletId: debited._id,
            userId: params.ad.userId,
            amount: delta,
            commission: 0,
            currency: debited.currency || params.currency,
            transactionType: TransactionType.ADVERTISING,
            isInternal: false,
            direction: TransactionDirection.OUTGOING,
            status: TransactionStatus.COMPLETED,
            idempotencyKey: `ad-inc-${String(params.ad._id)}-${Date.now()}`,
            metadata: {
              adId: String(params.ad._id),
              action: 'budget_increase',
              title: params.ad.title,
            },
          },
        ],
        { session }
      );

      return { nextAllocated: Number((currentAllocated + delta).toFixed(2)) };
    }

    const reduction = Math.abs(delta);
    const refundableCap = Math.max(0, Number((currentAllocated - spent).toFixed(2)));
    const refundAmount = Number(Math.min(reduction, refundableCap).toFixed(2));

    if (refundAmount > 0) {
      const credited = await creditWalletRefund({
        userId: params.ad.userId,
        amount: refundAmount,
        currency: params.currency,
        action: 'budget_reduction',
        adId: String(params.ad._id),
        adTitle: params.ad.title || 'Ad Campaign',
        session,
      });
      void credited;
    }

    return { nextAllocated: Number(Math.max(spent, currentAllocated - refundAmount).toFixed(2)) };
  });
}

/**
 * Refunds any remaining unspent escrowed credits back to the advertiser's wallet when deleting an ad
 * (when platform ads.refundUnspentOnDelete is enabled).
 */
export async function deleteAdAndRefundUnspent(params: {
  ad: IAdDocument;
  currency: string;
}): Promise<number> {
  const adsCfg = await getSettingsGroup('ads');
  const shouldRefund = adsCfg.refundUnspentOnDelete !== false;
  const allocated = Number(params.ad.allocatedBudget || 0);
  const spent = Number(params.ad.spentBudget || 0);
  const unspentAllocated = Math.max(0, Number((allocated - spent).toFixed(2)));
  const remainingTotal = Math.max(0, Number((Number(params.ad.totalBudget || 0) - spent).toFixed(2)));
  const refundAmount = shouldRefund ? Number(Math.min(unspentAllocated, remainingTotal).toFixed(2)) : 0;

  await withMongoTransaction(async (session) => {
    if (refundAmount > 0) {
      await ensureWallet(params.ad.userId);
      await creditWalletRefund({
        userId: params.ad.userId,
        amount: refundAmount,
        currency: params.currency,
        action: 'unspent_budget_refund',
        adId: String(params.ad._id),
        adTitle: params.ad.title || 'Ad Campaign',
        session,
      });
    }

    if (params.ad.mediaId) {
      await Media.deleteOne({ _id: params.ad.mediaId }, { session });
    }
    await Ad.deleteOne({ _id: params.ad._id }, { session });
  });

  return refundAmount;
}

/**
 * Atomic pay-as-you-go impression deduction honoring Admin billing controls:
 *   - billingModel ('viewable_cpm' | 'every_impression' | 'cpc' | 'hybrid')
 *   - chargeIntervalMinutes cooldown (0 for every_impression)
 *   - maxDailySpendPerAd daily cap (0 = unlimited)
 *   - auto-completes campaign when spentBudget >= totalBudget
 */
export async function recordAdShowAndCharge(adId: Types.ObjectId) {
  const adsCfg = await getSettingsGroup('ads');
  const now = new Date();
  const todayUtc = now.toISOString().slice(0, 10);
  const billingModel = adsCfg.billingModel || 'viewable_cpm';
  const minChargeGapMs =
    billingModel === 'every_impression'
      ? 0
      : Math.max(0, Number(adsCfg.chargeIntervalMinutes || 10)) * 60_000;
  const chargeCutoff = new Date(now.getTime() - minChargeGapMs);

  const current = await Ad.findById(adId).lean();
  if (!current) return;

  if (
    current.status !== AdStatus.PUBLISHED ||
    current.approval !== AdApproval.APPROVED
  ) {
    await Ad.updateOne({ _id: adId }, { $set: { lastShowAt: now } });
    return;
  }

  // In CPC-only model, impressions increment viewsCount & lastShowAt without spending wallet credits
  if (billingModel === 'cpc') {
    await Ad.updateOne(
      { _id: adId },
      { $set: { lastShowAt: now }, $inc: { viewsCount: 1 } }
    );
    return;
  }

  await Ad.updateOne({ _id: adId }, { $set: { lastShowAt: now } });

  const remaining = Number((Number(current.totalBudget || 0) - Number(current.spentBudget || 0)).toFixed(2));
  if (remaining <= 0) {
    await Ad.updateOne({ _id: adId }, { $set: { status: AdStatus.COMPLETED } });
    return;
  }

  const maxDaily = Number(adsCfg.maxDailySpendPerAd || 0);
  const sameDay = current.dailySpentDate === todayUtc;
  const spentToday = sameDay ? Number(current.dailySpent || 0) : 0;
  if (maxDaily > 0 && spentToday >= maxDaily) {
    return;
  }

  const unitCost = Math.max(0.01, Number(current.pricePerView || adsCfg.pricePerView || 25));
  const dailyHeadroom = maxDaily > 0 ? Math.max(0, maxDaily - spentToday) : unitCost;
  const charge = Number(Math.min(unitCost, remaining, dailyHeadroom).toFixed(2));
  if (charge <= 0) return;

  const completesAfterCharge =
    Number((Number(current.spentBudget || 0) + charge).toFixed(2)) >= Number(current.totalBudget || 0);

  await Ad.findOneAndUpdate(
    {
      _id: adId,
      status: AdStatus.PUBLISHED,
      approval: AdApproval.APPROVED,
      $expr: { $lt: ['$spentBudget', '$totalBudget'] },
      ...(minChargeGapMs > 0
        ? {
            $or: [
              { lastChargeAt: null },
              { lastChargeAt: { $lte: chargeCutoff } },
            ],
          }
        : {}),
    },
    {
      $set: {
        lastShowAt: now,
        lastChargeAt: now,
        dailySpentDate: todayUtc,
        dailySpent: Number((spentToday + charge).toFixed(2)),
        ...(completesAfterCharge ? { status: AdStatus.COMPLETED } : {}),
      },
      $inc: {
        viewsCount: 1,
        spentBudget: charge,
      },
    }
  );
}

/**
 * Atomic click recording & optional CPC / Hybrid ad credit deduction.
 */
export async function recordAdClickAndCharge(adId: Types.ObjectId) {
  const adsCfg = await getSettingsGroup('ads');
  const billingModel = adsCfg.billingModel || 'viewable_cpm';

  await Ad.updateOne({ _id: adId }, { $inc: { clicksCount: 1 } });

  if (billingModel !== 'cpc' && billingModel !== 'hybrid') {
    return;
  }

  const current = await Ad.findById(adId).lean();
  if (
    !current ||
    current.status !== AdStatus.PUBLISHED ||
    current.approval !== AdApproval.APPROVED
  ) {
    return;
  }

  const remaining = Number((Number(current.totalBudget || 0) - Number(current.spentBudget || 0)).toFixed(2));
  if (remaining <= 0) {
    await Ad.updateOne({ _id: adId }, { $set: { status: AdStatus.COMPLETED } });
    return;
  }

  const now = new Date();
  const todayUtc = now.toISOString().slice(0, 10);
  const maxDaily = Number(adsCfg.maxDailySpendPerAd || 0);
  const sameDay = current.dailySpentDate === todayUtc;
  const spentToday = sameDay ? Number(current.dailySpent || 0) : 0;
  if (maxDaily > 0 && spentToday >= maxDaily) {
    return;
  }

  const clickCost = Math.max(0.01, Number(adsCfg.pricePerClick || 75));
  const dailyHeadroom = maxDaily > 0 ? Math.max(0, maxDaily - spentToday) : clickCost;
  const charge = Number(Math.min(clickCost, remaining, dailyHeadroom).toFixed(2));
  if (charge <= 0) return;

  const completesAfterCharge =
    Number((Number(current.spentBudget || 0) + charge).toFixed(2)) >= Number(current.totalBudget || 0);

  await Ad.findOneAndUpdate(
    {
      _id: adId,
      status: AdStatus.PUBLISHED,
      approval: AdApproval.APPROVED,
      $expr: { $lt: ['$spentBudget', '$totalBudget'] },
    },
    {
      $set: {
        lastChargeAt: now,
        dailySpentDate: todayUtc,
        dailySpent: Number((spentToday + charge).toFixed(2)),
        ...(completesAfterCharge ? { status: AdStatus.COMPLETED } : {}),
      },
      $inc: { spentBudget: charge },
    }
  );
}

async function debitWalletForAd(params: {
  userId: Types.ObjectId;
  amount: number;
  currency: string;
  action: string;
  adTitle: string;
  session: ClientSession | null;
}) {
  const wallet = await Wallet.findOneAndUpdate(
    { userId: params.userId, balance: { $gte: params.amount } },
    { $inc: { balance: -params.amount } },
    { new: true, session: params.session }
  );

  if (!wallet) {
    const existing = await Wallet.findOne({ userId: params.userId }).session(params.session);
    const available = Number(existing?.balance || 0);
    throw new ValidationError(
      `Insufficient wallet balance (${available} ${existing?.currency || params.currency}) to allocate ${params.amount} ${params.currency} for "${params.adTitle}". Please top up your wallet first.`
    );
  }

  return wallet;
}

async function creditWalletRefund(params: {
  userId: Types.ObjectId;
  amount: number;
  currency: string;
  action: string;
  adId: string;
  adTitle: string;
  session: ClientSession | null;
}) {
  const wallet = await Wallet.findOneAndUpdate(
    { userId: params.userId },
    { $inc: { balance: params.amount } },
    { new: true, session: params.session }
  );
  if (!wallet) return null;

  await WalletTransaction.create(
    [
      {
        walletId: wallet._id,
        userId: params.userId,
        amount: params.amount,
        commission: 0,
        currency: wallet.currency || params.currency,
        transactionType: TransactionType.REFUND,
        isInternal: false,
        direction: TransactionDirection.INCOMING,
        status: TransactionStatus.COMPLETED,
        idempotencyKey: `ad-ref-${params.action}-${params.adId}-${Date.now()}`,
        metadata: {
          adId: params.adId,
          action: params.action,
          title: params.adTitle,
        },
      },
    ],
    { session: params.session }
  );

  return wallet;
}
