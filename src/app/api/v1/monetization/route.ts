import crypto from 'crypto';
import { Types } from 'mongoose';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectDB, withMongoTransaction } from '@/lib/db';
import { getOptionalAuth, requireAuth } from '@/lib/auth/session';
import {
  apiError,
  apiSuccess,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/lib/api-response';
import { User, IUserDocument } from '@/models/User';
import { AuthorshipRequest } from '@/models/SocialGraph';
import { CreatorSubscription, Wallet, WalletTransaction } from '@/models/Finance';
import { ensureWallet } from '@/services/wallet.service';
import { getSettingsGroup } from '@/services/settings.service';
import { dispatchNotification } from '@/services/notification.service';
import { calculateCommission } from '@/lib/utils';
import {
  ASRStatus,
  TransactionDirection,
  TransactionStatus,
  TransactionType,
  UserRole,
  UserType,
} from '@/types/enums';

function buildEligibilityChecklist(user: Pick<
  IUserDocument,
  'avatar' | 'cover' | 'firstName' | 'lastName' | 'username' | 'bio' | 'caption' | 'publicationsCount'
>) {
  const hasAvatar = Boolean(user.avatar && !user.avatar.includes('default-avatar'));
  const hasCover = Boolean(user.cover && !user.cover.includes('default-cover'));
  const hasName = Boolean(`${user.firstName || ''} ${user.lastName || ''}`.trim().length >= 2);
  const hasBio = Boolean((user.bio || '').trim().length > 0 || (user.caption || '').trim().length > 0);
  const hasPost = Number(user.publicationsCount || 0) >= 1;

  const items = [
    {
      key: 'name',
      label: 'Display name completed',
      met: hasName,
      hint: 'Add your first and last name in Profile settings.',
    },
    {
      key: 'avatar',
      label: 'Profile photo uploaded',
      met: hasAvatar,
      hint: 'Upload a recognizable profile avatar instead of the default placeholder.',
    },
    {
      key: 'cover',
      label: 'Profile cover uploaded',
      met: hasCover,
      hint: 'Set a custom header banner on your profile.',
    },
    {
      key: 'bio',
      label: 'Bio or creator headline written',
      met: hasBio,
      hint: 'Describe your content, expertise, or community offer in your bio.',
    },
    {
      key: 'publications',
      label: 'At least 1 publication published',
      met: hasPost,
      hint: 'Share your first post so visitors can preview your content.',
    },
  ];

  const metCount = items.filter((item) => item.met).length;
  return {
    items,
    metCount,
    totalCount: items.length,
    allMet: metCount === items.length,
  };
}

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const usernameParam = searchParams.get('username')?.trim().toLowerCase();
    const creatorIdParam = searchParams.get('creatorId')?.trim();

    if (usernameParam || creatorIdParam) {
      const authCtx = await getOptionalAuth(req);
      const creator = await User.findOne(
        creatorIdParam && Types.ObjectId.isValid(creatorIdParam)
          ? { _id: creatorIdParam, deletedAt: null }
          : { username: usernameParam, deletedAt: null }
      )
        .select('username firstName lastName avatar verified type monetization')
        .lean();

      if (!creator) throw new NotFoundError('Creator profile not found.');

      const now = new Date();
      const [subscribersCount, existingSub] = await Promise.all([
        CreatorSubscription.countDocuments({
          creatorId: creator._id,
          status: 'active',
          currentPeriodEnd: { $gt: now },
        }),
        authCtx
          ? CreatorSubscription.findOne({
              creatorId: creator._id,
              subscriberId: authCtx.user._id,
              status: 'active',
              currentPeriodEnd: { $gt: now },
            }).lean()
          : null,
      ]);

      return apiSuccess({
        creator: {
          id: String(creator._id),
          username: creator.username,
          firstName: creator.firstName,
          lastName: creator.lastName,
          avatar: creator.avatar,
          verified: creator.verified,
          isAuthor: creator.type === UserType.AUTHOR,
        },
        monetization: {
          tipsEnabled: Boolean(creator.monetization?.tipsEnabled),
          subscriptionsEnabled: Boolean(creator.monetization?.subscriptionsEnabled),
          monthlyPrice: Number(creator.monetization?.monthlyPrice ?? 5),
          currency: creator.monetization?.currency || 'USD',
          description: creator.monetization?.description || '',
        },
        subscribersCount,
        viewerSubscribed: Boolean(existingSub),
        subscriptionPeriodEnd: existingSub?.currentPeriodEnd || null,
      });
    }

    const { user } = await requireAuth(req);
    const now = new Date();
    const [walletCfg, appCfg, authorshipRequest, activeSubscribersCount, recentTxs, mySubscriptions] =
      await Promise.all([
        getSettingsGroup('wallet'),
        getSettingsGroup('app'),
        AuthorshipRequest.findOne({ userId: user._id }).sort({ createdAt: -1 }).lean(),
        CreatorSubscription.countDocuments({
          creatorId: user._id,
          status: 'active',
          currentPeriodEnd: { $gt: now },
        }),
        WalletTransaction.find({
          userId: user._id,
          transactionType: TransactionType.PAYMENT,
          direction: TransactionDirection.INCOMING,
          'metadata.monetizationKind': { $in: ['tip', 'subscription'] },
        })
          .sort({ createdAt: -1 })
          .limit(20)
          .lean(),
        CreatorSubscription.find({
          subscriberId: user._id,
          status: 'active',
          currentPeriodEnd: { $gt: now },
        })
          .sort({ createdAt: -1 })
          .populate('creatorId', 'username firstName lastName avatar verified')
          .lean(),
      ]);

    const monthlyPrice = Number(user.monetization?.monthlyPrice ?? 5);
    const monetization = {
      tipsEnabled: Boolean(user.monetization?.tipsEnabled),
      subscriptionsEnabled: Boolean(user.monetization?.subscriptionsEnabled),
      monthlyPrice,
      currency: user.monetization?.currency || appCfg.defaultCurrency || 'USD',
      description: user.monetization?.description || '',
      totalEarnings: Number(user.monetization?.totalEarnings ?? 0),
    };

    const tipsCount = recentTxs.filter(
      (tx) => (tx.metadata as Record<string, unknown>)?.monetizationKind === 'tip'
    ).length;

    return apiSuccess({
      userType: user.type,
      isAuthor: user.type === UserType.AUTHOR || user.role === UserRole.ADMIN || user.role === UserRole.ROOT,
      authorshipRequest: authorshipRequest
        ? {
            id: String(authorshipRequest._id),
            status: authorshipRequest.status,
            createdAt: authorshipRequest.createdAt,
          }
        : null,
      eligibility: buildEligibilityChecklist(user),
      monetization,
      stats: {
        activeSubscribersCount,
        totalEarnings: monetization.totalEarnings,
        tipsCount,
        monthlyRecurringEstimate: Number((activeSubscribersCount * monthlyPrice).toFixed(2)),
        commissionRate: Number(walletCfg.commissionTransfer ?? 0),
      },
      recentTransactions: recentTxs.map((tx) => ({
        id: String(tx._id),
        amount: tx.amount,
        commission: tx.commission,
        currency: tx.currency,
        kind: String((tx.metadata as Record<string, unknown>)?.monetizationKind || 'tip'),
        supporterName: String((tx.metadata as Record<string, unknown>)?.sourceName || 'Supporter'),
        supporterUsername: String((tx.metadata as Record<string, unknown>)?.senderUsername || ''),
        note: String((tx.metadata as Record<string, unknown>)?.message || ''),
        createdAt: tx.createdAt,
      })),
      mySubscriptions: mySubscriptions.map((sub) => {
        const c = sub.creatorId as unknown as {
          _id?: unknown;
          username?: string;
          firstName?: string;
          lastName?: string;
          avatar?: string;
          verified?: boolean;
        } | null;
        return {
          id: String(sub._id),
          creatorId: c ? String(c._id) : String(sub.creatorId),
          creatorUsername: c?.username || '',
          creatorName: c ? `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.username : 'Creator',
          creatorAvatar: c?.avatar || '/assets/avatars/default-avatar.png',
          creatorVerified: Boolean(c?.verified),
          amount: sub.amount,
          currency: sub.currency,
          currentPeriodEnd: sub.currentPeriodEnd,
        };
      }),
    });
  } catch (err) {
    return apiError(err);
  }
}

const patchMonetizationSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('request_authorship'),
  }),
  z.object({
    action: z.literal('update_settings'),
    tipsEnabled: z.boolean(),
    subscriptionsEnabled: z.boolean(),
    monthlyPrice: z.number().min(1).max(5000),
    currency: z.string().min(3).max(6).optional(),
    description: z.string().max(400).optional(),
  }),
]);

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const body = patchMonetizationSchema.parse(await req.json());

    if (body.action === 'request_authorship') {
      if (user.type === UserType.AUTHOR) {
        throw new ConflictError('You are already an approved author.');
      }
      const pending = await AuthorshipRequest.exists({
        userId: user._id,
        status: ASRStatus.PENDING,
      });
      if (pending) {
        throw new ConflictError('Your authorship application is already pending review.');
      }
      const checklist = buildEligibilityChecklist(user);
      if (checklist.metCount < 3) {
        throw new ValidationError(
          'Please complete at least your display name, bio, and profile media before applying.'
        );
      }
      const created = await AuthorshipRequest.create({
        userId: user._id,
        status: ASRStatus.PENDING,
      });
      return apiSuccess({
        requested: true,
        authorshipRequest: {
          id: String(created._id),
          status: created.status,
          createdAt: created.createdAt,
        },
      });
    }

    const canMonetize =
      user.type === UserType.AUTHOR ||
      user.role === UserRole.ADMIN ||
      user.role === UserRole.ROOT;
    if (!canMonetize) {
      throw new ForbiddenError(
        'Creator Authorship approval is required before enabling monetization.'
      );
    }

    const appCfg = await getSettingsGroup('app');
    const currency = (body.currency || appCfg.defaultCurrency || 'USD').toUpperCase();

    user.monetization = {
      tipsEnabled: body.tipsEnabled,
      subscriptionsEnabled: body.subscriptionsEnabled,
      monthlyPrice: Number(body.monthlyPrice.toFixed(2)),
      currency,
      description: (body.description || '').trim(),
      totalEarnings: Number(user.monetization?.totalEarnings ?? 0),
    };
    await user.save();

    return apiSuccess({ updated: true, monetization: user.monetization });
  } catch (err) {
    return apiError(err);
  }
}

const supportActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('tip'),
    creatorId: z.string().min(1),
    amount: z.number().min(1).max(10000),
    message: z.string().max(180).optional(),
  }),
  z.object({
    action: z.literal('subscribe'),
    creatorId: z.string().min(1),
  }),
  z.object({
    action: z.literal('cancel_subscription'),
    creatorId: z.string().min(1),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const body = supportActionSchema.parse(await req.json());

    if (!Types.ObjectId.isValid(body.creatorId)) {
      throw new ValidationError('Invalid creator ID.');
    }
    if (String(user._id) === body.creatorId) {
      throw new ValidationError('You cannot support or subscribe to your own profile.');
    }

    const creator = await User.findOne({ _id: body.creatorId, deletedAt: null });
    if (!creator) throw new NotFoundError('Creator not found.');

    if (body.action === 'cancel_subscription') {
      await CreatorSubscription.updateOne(
        { creatorId: creator._id, subscriberId: user._id },
        { $set: { status: 'cancelled' } }
      );
      return apiSuccess({ cancelled: true });
    }

    const walletCfg = await getSettingsGroup('wallet');
    const supporterName =
      `${user.firstName || ''} ${user.lastName || ''}`.trim() || `@${user.username}`;
    const creatorName =
      `${creator.firstName || ''} ${creator.lastName || ''}`.trim() || `@${creator.username}`;

    if (body.action === 'tip') {
      if (!creator.monetization?.tipsEnabled) {
        throw new ValidationError('This creator has not enabled fan tips yet.');
      }

      const supporterWallet = await ensureWallet(user._id);
      const creatorWallet = await ensureWallet(creator._id);
      const { gross, fee, net } = calculateCommission(body.amount, walletCfg.commissionTransfer);
      const tnxRef = `TIP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const note = body.message?.trim() || undefined;

      await withMongoTransaction(async (session) => {
        const debited = await Wallet.findOneAndUpdate(
          { _id: supporterWallet._id, balance: { $gte: gross } },
          { $inc: { balance: -gross } },
          { new: true, session }
        );
        if (!debited) {
          throw new ValidationError('Insufficient wallet balance to send this tip.');
        }

        await Wallet.updateOne(
          { _id: creatorWallet._id },
          { $inc: { balance: net } },
          { session }
        );

        await User.updateOne(
          { _id: creator._id },
          { $inc: { 'monetization.totalEarnings': net } },
          { session }
        );

        const idemBase = `tip_${user._id}_${creator._id}_${crypto.randomUUID()}`;
        await WalletTransaction.create(
          [
            {
              walletId: supporterWallet._id,
              userId: user._id,
              amount: gross,
              commission: fee,
              currency: supporterWallet.currency,
              transactionType: TransactionType.PAYMENT,
              isInternal: true,
              direction: TransactionDirection.OUTGOING,
              status: TransactionStatus.COMPLETED,
              idempotencyKey: `${idemBase}_out`,
              metadata: {
                tnxId: tnxRef,
                monetizationKind: 'tip',
                sourceName: `Tip to ${creatorName}`,
                receiverId: String(creator._id),
                receiverUsername: creator.username,
                ...(note ? { message: note } : {}),
              },
            },
            {
              walletId: creatorWallet._id,
              userId: creator._id,
              amount: net,
              commission: fee,
              currency: creatorWallet.currency,
              transactionType: TransactionType.PAYMENT,
              isInternal: true,
              direction: TransactionDirection.INCOMING,
              status: TransactionStatus.COMPLETED,
              idempotencyKey: `${idemBase}_in`,
              metadata: {
                tnxId: tnxRef,
                monetizationKind: 'tip',
                sourceName: supporterName,
                senderId: String(user._id),
                senderUsername: user.username,
                ...(note ? { message: note } : {}),
              },
            },
          ],
          { session }
        );
      });

      await dispatchNotification({
        recipientId: creator._id,
        actorId: user._id,
        type: 'creator_tip',
        category: 'important',
        title: 'New Creator Tip',
        message: `${supporterName} sent you a ${net.toFixed(2)} ${creatorWallet.currency} tip!`,
        entityType: 'user',
        entityId: String(user._id),
        actionUrl: '/business/monetization',
      });

      return apiSuccess({ tipped: true, gross, net, fee });
    }

    // Subscribe action
    if (!creator.monetization?.subscriptionsEnabled) {
      throw new ValidationError('Community subscriptions are not enabled for this creator.');
    }

    const monthlyPrice = Number(creator.monetization?.monthlyPrice ?? 5);
    const existingSub = await CreatorSubscription.findOne({
      creatorId: creator._id,
      subscriberId: user._id,
      status: 'active',
      currentPeriodEnd: { $gt: new Date() },
    });
    if (existingSub) {
      throw new ConflictError('You already have an active membership to this community.');
    }

    const supporterWallet = await ensureWallet(user._id);
    const creatorWallet = await ensureWallet(creator._id);
    const { gross, fee, net } = calculateCommission(monthlyPrice, walletCfg.commissionTransfer);
    const tnxRef = `SUB-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await withMongoTransaction(async (session) => {
      const debited = await Wallet.findOneAndUpdate(
        { _id: supporterWallet._id, balance: { $gte: gross } },
        { $inc: { balance: -gross } },
        { new: true, session }
      );
      if (!debited) {
        throw new ValidationError('Insufficient wallet balance for this community membership.');
      }

      await Wallet.updateOne(
        { _id: creatorWallet._id },
        { $inc: { balance: net } },
        { session }
      );

      await User.updateOne(
        { _id: creator._id },
        { $inc: { 'monetization.totalEarnings': net } },
        { session }
      );

      await CreatorSubscription.findOneAndUpdate(
        { creatorId: creator._id, subscriberId: user._id },
        {
          $set: {
            amount: monthlyPrice,
            currency: creator.monetization?.currency || supporterWallet.currency,
            status: 'active',
            lastPaidAt: new Date(),
            currentPeriodEnd: periodEnd,
          },
        },
        { upsert: true, new: true, session }
      );

      const idemBase = `sub_${user._id}_${creator._id}_${crypto.randomUUID()}`;
      await WalletTransaction.create(
        [
          {
            walletId: supporterWallet._id,
            userId: user._id,
            amount: gross,
            commission: fee,
            currency: supporterWallet.currency,
            transactionType: TransactionType.PAYMENT,
            isInternal: true,
            direction: TransactionDirection.OUTGOING,
            status: TransactionStatus.COMPLETED,
            idempotencyKey: `${idemBase}_out`,
            metadata: {
              tnxId: tnxRef,
              monetizationKind: 'subscription',
              sourceName: `Community membership: ${creatorName}`,
              receiverId: String(creator._id),
              receiverUsername: creator.username,
            },
          },
          {
            walletId: creatorWallet._id,
            userId: creator._id,
            amount: net,
            commission: fee,
            currency: creatorWallet.currency,
            transactionType: TransactionType.PAYMENT,
            isInternal: true,
            direction: TransactionDirection.INCOMING,
            status: TransactionStatus.COMPLETED,
            idempotencyKey: `${idemBase}_in`,
            metadata: {
              tnxId: tnxRef,
              monetizationKind: 'subscription',
              sourceName: supporterName,
              senderId: String(user._id),
              senderUsername: user.username,
            },
          },
        ],
        { session }
      );
    });

    await dispatchNotification({
      recipientId: creator._id,
      actorId: user._id,
      type: 'community_subscription',
      category: 'important',
      title: 'New Community Member',
      message: `${supporterName} joined your creator community membership!`,
      entityType: 'user',
      entityId: String(user._id),
      actionUrl: '/business/monetization',
    });

    return apiSuccess({
      subscribed: true,
      currentPeriodEnd: periodEnd.toISOString(),
    });
  } catch (err) {
    return apiError(err);
  }
}
