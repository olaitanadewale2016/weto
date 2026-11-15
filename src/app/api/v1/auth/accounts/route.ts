import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ACTIVE_ACCOUNT_COOKIE_NAME, getClientIp, requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, ConflictError, ForbiddenError, NotFoundError } from '@/lib/api-response';
import { User } from '@/models/User';
import { DeletionFeedback } from '@/models/SocialGraph';
import { Post } from '@/models/Post';
import { getFirebaseAuth, isFirebaseAdminConfigured } from '@/lib/firebase/admin';
import { UserStatus, UserType } from '@/types/enums';
import { ensureWallet } from '@/services/wallet.service';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const masterId = user.ownerAccountId || user._id;
    const accounts = await User.find({
      deletedAt: null,
      $or: [{ _id: masterId }, { ownerAccountId: masterId }],
    })
      .select('username firstName lastName avatar verified role type ownerAccountId')
      .lean();

    return apiSuccess({
      activeAccountId: String(user._id),
      accounts: accounts.map((a) => ({
        id: String(a._id),
        username: a.username,
        firstName: a.firstName,
        lastName: a.lastName,
        avatar: a.avatar,
        verified: a.verified,
        isMaster: !a.ownerAccountId,
      })),
    });
  } catch (err) {
    return apiError(err);
  }
}

const createLinkedSchema = z.object({
  action: z.enum(['create', 'switch', 'delete_account']),
  targetAccountId: z.string().optional(),
  firstName: z.string().min(2).max(32).optional(),
  lastName: z.string().max(32).optional(),
  username: z.string().min(2).max(32).regex(/^[a-zA-Z0-9._]+$/).optional(),
  feedbackMessage: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const body = createLinkedSchema.parse(await req.json());

    if (body.action === 'create') {
      const masterId = user.ownerAccountId || user._id;
      const count = await User.countDocuments({ ownerAccountId: masterId, deletedAt: null });
      if (count >= 5) {
        throw new ForbiddenError('Maximum linked accounts limit (5) reached.');
      }
      const username = (
        body.username || `${user.username}_${crypto.randomInt(100, 999)}`
      ).toLowerCase();
      const exists = await User.exists({ username });
      if (exists) throw new ConflictError('Username is already taken.');

      const linked = await User.create({
        ownerAccountId: masterId,
        firstName: body.firstName || user.firstName,
        lastName: body.lastName || '',
        username,
        email: `${username}+linked@users.colibriplus.local`,
        status: UserStatus.ACTIVE,
        type: UserType.READER,
        language: user.language,
        theme: user.theme,
        avatar: '/assets/avatars/default-avatar.png',
        onboardingStep: null,
      });
      await ensureWallet(linked._id);
      return apiSuccess({ accountId: String(linked._id), username: linked.username }, undefined, 201);
    }

    if (body.action === 'switch') {
      if (!body.targetAccountId) throw new NotFoundError('Target account ID is required.');
      const masterId = user.ownerAccountId || user._id;
      const target = await User.findOne({
        _id: body.targetAccountId,
        deletedAt: null,
        $or: [{ _id: masterId }, { ownerAccountId: masterId }],
      });
      if (!target) throw new NotFoundError('Linked account not found.');

      const res = NextResponse.json({
        status: 'success',
        data: { activeAccountId: String(target._id), username: target.username },
      });
      res.cookies.set(ACTIVE_ACCOUNT_COOKIE_NAME, String(target._id), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      });
      return res;
    }

    if (body.action === 'delete_account') {
      const ip = await getClientIp(req);
      await DeletionFeedback.create({
        feedbackMessage: body.feedbackMessage || '',
        username: user.username,
        fullName: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        phone: user.phone,
        registeredAt: user.createdAt,
        publications: user.publicationsCount,
        followers: user.followersCount,
        following: user.followingCount,
        ipAddress: ip,
        userAgent: req.headers.get('user-agent') || '',
        deletedAt: new Date(),
      });

      user.deletedAt = new Date();
      user.status = UserStatus.SUSPENDED;
      await user.save();
      await Post.deleteMany({ userId: user._id });

      if (user.firebaseUid && !user.ownerAccountId && isFirebaseAdminConfigured()) {
        await getFirebaseAuth().deleteUser(user.firebaseUid).catch(() => {});
      }

      const res = apiSuccess({ deleted: true });
      res.cookies.delete('__session');
      res.cookies.delete(ACTIVE_ACCOUNT_COOKIE_NAME);
      return res;
    }

    return apiSuccess({});
  } catch (err) {
    return apiError(err);
  }
}
