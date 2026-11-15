import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { getOptionalAuth, requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, ForbiddenError, NotFoundError } from '@/lib/api-response';
import { Ad, IAdDocument } from '@/models/Finance';
import { Media } from '@/models/Media';
import { AdApproval, AdStatus, UserRole } from '@/types/enums';
import { getSettingsGroup } from '@/services/settings.service';
import { serializeMedia } from '@/services/media.service';

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
    await getOptionalAuth(req);
    const adsCfg = await getSettingsGroup('ads');
    const refreshCutoff = new Date(Date.now() - (adsCfg.refreshIntervalMinutes || 5) * 60_000);

    // Exact PHP AdController algorithm:
    // 1. Random eligible ad not matching prevAdId and past refresh interval cooldown
    const primaryMatch: Record<string, unknown> = {
      status: AdStatus.PUBLISHED,
      approval: AdApproval.APPROVED,
      $expr: { $lt: ['$spentBudget', '$totalBudget'] },
      $or: [{ lastShowAt: null }, { lastShowAt: { $lt: refreshCutoff } }],
      ...(prevAdId && Types.ObjectId.isValid(prevAdId)
        ? { _id: { $ne: new Types.ObjectId(prevAdId) } }
        : {}),
    };

    let sampled = await Ad.aggregate<{ _id: Types.ObjectId }>([
      { $match: primaryMatch },
      { $sample: { size: 1 } },
      { $project: { _id: 1 } },
    ]);

    // 2. Fallback to any active published ad in random order (matches PHP lines 33-35)
    if (!sampled.length) {
      sampled = await Ad.aggregate<{ _id: Types.ObjectId }>([
        {
          $match: {
            status: AdStatus.PUBLISHED,
            approval: AdApproval.APPROVED,
            $expr: { $lt: ['$spentBudget', '$totalBudget'] },
          },
        },
        { $sample: { size: 1 } },
        { $project: { _id: 1 } },
      ]);
    }

    if (!sampled.length) return apiSuccess(null);

    const ad = (await Ad.findById(sampled[0]._id)
      .populate('mediaId')
      .populate('userId', 'username firstName lastName avatar verified')
      .lean()) as (IAdDocument & { mediaId?: unknown; userId?: unknown }) | null;

    if (!ad) return apiSuccess(null);

    // Execute PHP AdShowAction charge & lastShowAt update
    await recordAdShowAndCharge(ad._id).catch(() => undefined);

    return apiSuccess({
      id: String(ad._id),
      title: ad.title,
      content: ad.content,
      ctaText: ad.ctaText,
      targetUrl: ad.targetUrl,
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
    const adsCfg = await getSettingsGroup('ads');

    const ad = await Ad.create({
      userId: user._id,
      title: body.title.trim(),
      content: body.content.trim(),
      ctaText: body.ctaText.trim(),
      targetUrl: body.targetUrl,
      totalBudget: body.totalBudget,
      pricePerView: adsCfg.pricePerView,
      mediaId: body.mediaId ? new Types.ObjectId(body.mediaId) : null,
      status: body.publishNow ? AdStatus.PUBLISHED : AdStatus.DRAFT,
      approval: adsCfg.defaultApproval ? AdApproval.APPROVED : AdApproval.PENDING,
    });

    return apiSuccess({ id: String(ad._id), approval: ad.approval }, undefined, 201);
  } catch (err) {
    return apiError(err);
  }
}

const patchAdSchema = z.object({
  adId: z.string().min(1),
  action: z.enum(['impression', 'pause', 'publish', 'delete']),
});

export async function PATCH(req: NextRequest) {
  try {
    await connectDB();
    const body = patchAdSchema.parse(await req.json());
    const ad = await Ad.findById(body.adId);
    if (!ad) throw new NotFoundError('Ad campaign not found.');

    if (body.action === 'impression') {
      const adsCfg = await getSettingsGroup('ads');
      const now = new Date();
      const minChargeGapMs = adsCfg.chargeIntervalMinutes * 60_000;
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
      return apiSuccess({ recorded: true });
    }

    const { user } = await requireAuth(req);
    const isOwner = String(ad.userId) === String(user._id);
    const isAdmin = user.role === UserRole.ROOT || user.role === UserRole.ADMIN;
    if (!isOwner && !isAdmin) throw new ForbiddenError('Cannot modify this campaign.');

    if (body.action === 'pause') {
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
