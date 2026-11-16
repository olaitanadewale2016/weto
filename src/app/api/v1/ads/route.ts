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

async function recordAdShowAndCharge(adId: Types.ObjectId) {
  const adsCfg = await getSettingsGroup('ads');
  const ad = await Ad.findById(adId);
  if (!ad) return;

  const now = new Date();
  const minChargeGapMs = (adsCfg.chargeIntervalMinutes || 10) * 60_000;
  const shouldCharge =
    !ad.lastChargeAt || now.getTime() - new Date(ad.lastChargeAt).getTime() > minChargeGapMs;

  ad.lastShowAt = now;
  if (shouldCharge) {
    if (ad.spentBudget >= ad.totalBudget) {
      ad.status = AdStatus.COMPLETED;
    } else {
      ad.lastChargeAt = now;
      ad.viewsCount += 1;
      ad.spentBudget = Number((ad.spentBudget + ad.pricePerView).toFixed(2));
      if (ad.spentBudget >= ad.totalBudget) {
        ad.status = AdStatus.COMPLETED;
      }
    }
  }
  await ad.save();
}

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
    const refreshIntervalMs = (adsCfg.refreshIntervalMinutes || 5) * 60_000;

    // Facebook Ad Auction candidate selection:
    // Active approved ads within schedule window and remaining budget, excluding blocked advertisers
    const candidates = (await Ad.find({
      status: AdStatus.PUBLISHED,
      approval: AdApproval.APPROVED,
      $expr: { $lt: ['$spentBudget', '$totalBudget'] },
      ...(blockedIds.length > 0 ? { userId: { $nin: blockedIds } } : {}),
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
      ],
    })
      .sort({ lastShowAt: 1, pricePerView: -1 })
      .limit(25)
      .lean()) as unknown as Array<
      IAdDocument & { _id: Types.ObjectId; title?: string; content?: string }
    >;

    if (!candidates.length) return apiSuccess(null);

    const scoredCandidates = candidates
      .filter((ad) => !hiddenIdSet.has(String(ad._id)))
      .map((ad) => ({
        ad,
        score: scoreAdFacebookAuction({
          ad,
          nowMs,
          refreshIntervalMs,
          viewerSignals,
          isExcluded: excludedIdSet.has(String(ad._id)),
        }),
      }))
      .sort((a, b) => b.score - a.score);

    if (!scoredCandidates.length) return apiSuccess(null);

    // Top-2 weighted auction lottery prevents strict determinism while favoring highest-value ad
    const topPool = scoredCandidates.slice(0, Math.min(2, scoredCandidates.length));
    const chosenId =
      topPool.length === 2 &&
      topPool[0].score < topPool[1].score * 1.25 &&
      crypto.randomInt(0, 100) < 35
        ? topPool[1].ad._id
        : topPool[0].ad._id;

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
    if (body.totalBudget < minBudget) {
      throw new ValidationError(
        `Minimum ad campaign budget is ${minBudget} ${appCfg.defaultCurrency || 'NGN'}.`
      );
    }

    const ad = await Ad.create({
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
    });

    if (ad.mediaId) {
      await Media.updateOne(
        { _id: ad.mediaId, ownerId: user._id },
        { $set: { targetType: 'ad', targetId: ad._id } }
      );
    }

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
      await Ad.updateOne({ _id: ad._id }, { $inc: { clicksCount: 1 } });
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
        if (body.totalBudget < minBudget) {
          throw new ValidationError(
            `Minimum ad campaign budget is ${minBudget} ${appCfg.defaultCurrency || 'NGN'}.`
          );
        }
        ad.totalBudget = Math.max(ad.spentBudget, body.totalBudget);
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
      ad.status = AdStatus.PUBLISHED;
      await ad.save();
    } else if (body.action === 'delete') {
      if (ad.mediaId) await Media.deleteOne({ _id: ad.mediaId });
      await Ad.deleteOne({ _id: ad._id });
    }

    return apiSuccess({ updated: true });
  } catch (err) {
    return apiError(err);
  }
}
