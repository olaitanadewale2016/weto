import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { getOptionalAuth, requireAuth } from '@/lib/auth/session';
import {
  apiError,
  apiSuccess,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/lib/api-response';
import { Ad, IAdDocument } from '@/models/Finance';
import { Media } from '@/models/Media';
import { AdApproval, AdStatus, UserRole } from '@/types/enums';
import { getSettingsGroup } from '@/services/settings.service';
import { serializeMedia } from '@/services/media.service';
import { getViewerSignalProfile, scoreAdFacebookAuction } from '@/services/feed-ranking.service';
import { getBlockedUserIdsFor } from '@/services/relations.service';
import {
  adjustAdBudgetInWallet,
  createAdWithWalletBudget,
  deleteAdAndRefundUnspent,
  recordAdClickAndCharge,
  recordAdShowAndCharge,
} from '@/services/ad-billing.service';

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const mine = searchParams.get('mine') === 'true';

    if (mine) {
      const { user } = await requireAuth(req);
      const ads = await Ad.find({ userId: user._id })
        .sort({ createdAt: -1 })
        .populate('mediaId')
        .lean();
      return apiSuccess(
        ads.map((a) => ({
          ...a,
          id: String(a._id),
          media: a.mediaId ? serializeMedia(a.mediaId as never) : null,
        }))
      );
    }

    const features = await getSettingsGroup('features');
    if (!features.ads) return apiSuccess(null);

    const prevAdId = searchParams.get('prevAdId');
    const excludeParam = searchParams.get('excludeIds') || '';
    const skipHiddenParam = searchParams.get('hiddenIds') || '';
    const shouldDeferTrack = searchParams.get('track') === 'false';
    const excludedIdSet = new Set(
      [prevAdId, ...excludeParam.split(',')]
        .map((s) => (s || '').trim())
        .filter((s) => Types.ObjectId.isValid(s))
    );
    const hiddenIdSet = new Set(
      skipHiddenParam
        .split(',')
        .map((s) => s.trim())
        .filter((s) => Types.ObjectId.isValid(s))
    );

    const authCtx = await getOptionalAuth(req);
    const [adsCfg, blockedIds, viewerSignals] = await Promise.all([
      getSettingsGroup('ads'),
      authCtx ? getBlockedUserIdsFor(String(authCtx.user._id)) : Promise.resolve([]),
      authCtx ? getViewerSignalProfile(authCtx.user._id) : Promise.resolve(null),
    ]);

    const now = new Date();
    const nowMs = now.getTime();
    const todayUtc = now.toISOString().slice(0, 10);
    const refreshIntervalMs = (adsCfg.refreshIntervalMinutes || 5) * 60_000;
    const maxDaily = Number(adsCfg.maxDailySpendPerAd || 0);
    const excludeAdvParam = searchParams.get('excludeAdvertisers') || '';
    const recentAdvSet = new Set(
      excludeAdvParam
        .split(',')
        .map((s) => s.trim())
        .filter((s) => Types.ObjectId.isValid(s))
    );

    const baseQuery: Record<string, unknown> = {
      status: AdStatus.PUBLISHED,
      approval: AdApproval.APPROVED,
      $expr: { $lt: ['$spentBudget', '$totalBudget'] },
      ...(blockedIds.length > 0 ? { userId: { $nin: blockedIds } } : {}),
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
      ],
    };

    const topicRegex =
      viewerSignals && viewerSignals.interestTokens.size > 0
        ? Array.from(viewerSignals.interestTokens)
          .slice(0, 6)
          .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('|')
        : '';

    // Scalable O(log N) Multi-Bucket Facebook Ad Auction Retrieval (handles 10,000+ concurrent campaigns):
    // 1. Fairness / Least-recently-shown pool  2. High-Bid + Proven CTR pool
    // 3. Cold-start learning phase (<10 views) 4. Topic/interest relevance pool
    type CandidateRow = {
      _id: Types.ObjectId;
      userId?: Types.ObjectId | unknown;
      title?: string | null;
      content?: string | null;
      pricePerView: number;
      totalBudget: number;
      spentBudget: number;
      viewsCount: number;
      clicksCount?: number;
      lastShowAt?: Date | null;
      dailySpent?: number;
      dailySpentDate?: string | null;
    };

    const [fairnessPool, topBidPool, learningPool, relevancePool] = (await Promise.all([
      Ad.find(baseQuery).sort({ lastShowAt: 1, pricePerView: -1 }).limit(20).lean(),
      Ad.find(baseQuery).sort({ pricePerView: -1, clicksCount: -1 }).limit(20).lean(),
      Ad.find({ ...baseQuery, viewsCount: { $lt: 10 } }).sort({ createdAt: -1 }).limit(12).lean(),
      topicRegex
        ? Ad.find({
          ...baseQuery,
          $or: [
            { title: { $regex: topicRegex, $options: 'i' } },
            { content: { $regex: topicRegex, $options: 'i' } },
          ],
        })
          .sort({ pricePerView: -1 })
          .limit(12)
          .lean()
        : Promise.resolve([]),
    ])) as unknown as [CandidateRow[], CandidateRow[], CandidateRow[], CandidateRow[]];

    const dedupMap = new Map<string, CandidateRow>();
    for (const row of [...fairnessPool, ...topBidPool, ...learningPool, ...relevancePool]) {
      const idStr = String(row._id);
      if (hiddenIdSet.has(idStr)) continue;
      if (maxDaily > 0 && row.dailySpentDate === todayUtc && Number(row.dailySpent || 0) >= maxDaily) {
        continue;
      }
      if (!dedupMap.has(idStr)) dedupMap.set(idStr, row);
    }

    const candidates = Array.from(dedupMap.values());
    if (!candidates.length) return apiSuccess(null);

    const scoredCandidates = candidates
      .map((ad) => {
        const baseScore = scoreAdFacebookAuction({
          ad,
          nowMs,
          refreshIntervalMs,
          viewerSignals,
          isExcluded: excludedIdSet.has(String(ad._id)),
        });
        const advIdStr = ad.userId ? String(ad.userId) : '';
        const advertiserDiversity = advIdStr && recentAdvSet.has(advIdStr) ? 0.45 : 1.0;
        return { ad, score: baseScore * advertiserDiversity };
      })
      .sort((a, b) => b.score - a.score);

    // Weighted top-K lottery across top 3 scored winners balances yield + fair rotation across large campaign pools
    const topPool = scoredCandidates.slice(0, Math.min(3, scoredCandidates.length));
    const totalScore = topPool.reduce((sum, entry) => sum + Math.max(0.001, entry.score), 0);
    let pick = (crypto.randomInt(0, 10000) / 10000) * totalScore;
    let chosenId = topPool[0].ad._id;
    for (const entry of topPool) {
      pick -= Math.max(0.001, entry.score);
      if (pick <= 0) {
        chosenId = entry.ad._id;
        break;
      }
    }

    const ad = (await Ad.findById(chosenId)
      .populate('mediaId')
      .populate('userId', 'username firstName lastName avatar verified')
      .lean()) as (IAdDocument & { mediaId?: unknown; userId?: unknown }) | null;

    if (!ad) return apiSuccess(null);

    // Execute PHP AdShowAction charge immediately unless client defers to MRC viewport tracking
    if (!shouldDeferTrack) {
      await recordAdShowAndCharge(ad._id).catch(() => undefined);
    }

    return apiSuccess({
      id: String(ad._id),
      title: ad.title,
      content: ad.content,
      ctaText: ad.ctaText,
      targetUrl: ad.targetUrl,
      viewsCount: ad.viewsCount || 0,
      clicksCount: ad.clicksCount || 0,
      advertiser: ad.userId,
      media: ad.mediaId ? serializeMedia(ad.mediaId as never) : null,
    });
  } catch (err) {
    return apiError(err);
  }
}

const createAdSchema = z.object({
  title: z.string().min(2).max(120),
  content: z.string().min(2).max(1000),
  ctaText: z.string().min(1).max(40).default('Learn More'),
  targetUrl: z.string().url(),
  totalBudget: z.number().min(1),
  mediaId: z.string().optional(),
  publishNow: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const body = createAdSchema.parse(await req.json());
    const [adsCfg, appCfg] = await Promise.all([
      getSettingsGroup('ads'),
      getSettingsGroup('app'),
    ]);

    const minBudget = Math.max(1, Number(adsCfg.minBudget || 5000));
    const defaultCurrency = appCfg.defaultCurrency || 'NGN';
    if (body.totalBudget < minBudget) {
      throw new ValidationError(
        `Minimum ad campaign budget is ${minBudget} ${defaultCurrency}.`
      );
    }

    const ad = await createAdWithWalletBudget({
      userId: user._id,
      title: body.title.trim(),
      content: body.content.trim(),
      ctaText: body.ctaText.trim(),
      targetUrl: body.targetUrl,
      totalBudget: body.totalBudget,
      pricePerView: Number(adsCfg.pricePerView || 25),
      mediaId: body.mediaId && Types.ObjectId.isValid(body.mediaId) ? new Types.ObjectId(body.mediaId) : null,
      status: body.publishNow ? AdStatus.PUBLISHED : AdStatus.DRAFT,
      approval: adsCfg.defaultApproval ? AdApproval.APPROVED : AdApproval.PENDING,
      currency: defaultCurrency,
    });

    return apiSuccess({ id: String(ad._id), approval: ad.approval }, undefined, 201);
  } catch (err) {
    return apiError(err);
  }
}

const patchAdSchema = z.object({
  adId: z.string().min(1),
  action: z.enum(['impression', 'click', 'pause', 'publish', 'delete', 'edit']),
  title: z.string().min(2).max(120).optional(),
  content: z.string().min(2).max(1000).optional(),
  ctaText: z.string().min(1).max(40).optional(),
  targetUrl: z.string().url().optional(),
  totalBudget: z.number().min(1).optional(),
  mediaId: z.string().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    await connectDB();
    const body = patchAdSchema.parse(await req.json());
    const ad = await Ad.findById(body.adId);
    if (!ad) throw new NotFoundError('Ad campaign not found.');

    if (body.action === 'impression') {
      await recordAdShowAndCharge(ad._id);
      return apiSuccess({ recorded: true });
    }

    if (body.action === 'click') {
      await recordAdClickAndCharge(ad._id);
      return apiSuccess({ recorded: true });
    }

    const { user } = await requireAuth(req);
    const isOwner = String(ad.userId) === String(user._id);
    const isAdmin = user.role === UserRole.ROOT || user.role === UserRole.ADMIN;
    if (!isOwner && !isAdmin) throw new ForbiddenError('Cannot modify this campaign.');

    if (body.action === 'edit') {
      if (body.title !== undefined) ad.title = body.title.trim();
      if (body.content !== undefined) ad.content = body.content.trim();
      if (body.ctaText !== undefined) ad.ctaText = body.ctaText.trim();
      if (body.targetUrl !== undefined) ad.targetUrl = body.targetUrl;
      if (body.totalBudget !== undefined) {
        const [adsCfg, appCfg] = await Promise.all([
          getSettingsGroup('ads'),
          getSettingsGroup('app'),
        ]);
        const minBudget = Math.max(1, Number(adsCfg.minBudget || 5000));
        const defaultCurrency = appCfg.defaultCurrency || 'NGN';
        if (body.totalBudget < minBudget) {
          throw new ValidationError(
            `Minimum ad campaign budget is ${minBudget} ${defaultCurrency}.`
          );
        }
        const nextBudget = Math.max(ad.spentBudget, body.totalBudget);
        const { nextAllocated } = await adjustAdBudgetInWallet({
          ad,
          nextBudget,
          currency: defaultCurrency,
        });
        ad.totalBudget = nextBudget;
        ad.allocatedBudget = nextAllocated;
        if (ad.status === AdStatus.COMPLETED && ad.totalBudget > ad.spentBudget) {
          ad.status = AdStatus.PUBLISHED;
        }
      }
      if (body.mediaId !== undefined && Types.ObjectId.isValid(body.mediaId)) {
        ad.mediaId = new Types.ObjectId(body.mediaId);
        await Media.updateOne(
          { _id: ad.mediaId, ...(isAdmin ? {} : { ownerId: user._id }) },
          { $set: { targetType: 'ad', targetId: ad._id } }
        );
      }
      await ad.save();
    } else if (body.action === 'pause') {
      ad.status = AdStatus.PAUSED;
      await ad.save();
    } else if (body.action === 'publish') {
      if (ad.spentBudget >= ad.totalBudget) {
        throw new ValidationError(
          'Campaign budget is exhausted. Increase total budget before resuming delivery.'
        );
      }
      ad.status = AdStatus.PUBLISHED;
      await ad.save();
    } else if (body.action === 'delete') {
      const appCfg = await getSettingsGroup('app');
      const refundedAmount = await deleteAdAndRefundUnspent({
        ad,
        currency: appCfg.defaultCurrency || 'NGN',
      });
      return apiSuccess({ updated: true, refundedAmount });
    }

    return apiSuccess({ updated: true });
  } catch (err) {
    return apiError(err);
  }
}
