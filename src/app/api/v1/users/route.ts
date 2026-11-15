import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import { getOptionalAuth, requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess } from '@/lib/api-response';
import { User } from '@/models/User';
import { Follow } from '@/models/SocialGraph';
import { FollowStatus, UserStatus } from '@/types/enums';
import { getBlockedUserIdsFor } from '@/services/relations.service';
import { resolveMediaUrl } from '@/lib/media-url';

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const authCtx = await getOptionalAuth(req);
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode') || 'search';
    const q = (searchParams.get('q') || '').trim();
    const limit = Math.min(30, Math.max(1, Number(searchParams.get('limit') || 15)));
    const page = Math.max(1, Number(searchParams.get('page') || 1));

    const blockedIds = authCtx ? await getBlockedUserIdsFor(String(authCtx.user._id)) : [];

    if (mode === 'recommended') {
      const myFollowingIds = authCtx
        ? await Follow.find({ followerId: authCtx.user._id }).distinct('followingId')
        : [];

      const excludeIds = [
        ...(authCtx ? [authCtx.user._id] : []),
        ...blockedIds,
        ...myFollowingIds,
      ];

      const users = await User.find({
        _id: { $nin: excludeIds },
        status: UserStatus.ACTIVE,
        deletedAt: null,
        'privacySettings.searchPrivacy': { $ne: true },
      })
        .sort({ verified: -1, followersCount: -1 })
        .limit(limit)
        .select('username firstName lastName avatar bio verified followersCount type caption')
        .lean();

      return apiSuccess(
        users.map((u) => ({
          id: String(u._id),
          username: u.username,
          firstName: u.firstName,
          lastName: u.lastName,
          avatar: resolveMediaUrl(u.avatar) || '/assets/avatars/default-avatar.png',
          bio: u.bio,
          caption: u.caption,
          verified: u.verified,
          followersCount: u.followersCount,
          type: u.type,
        }))
      );
    }

    const filter: Record<string, unknown> = {
      status: UserStatus.ACTIVE,
      deletedAt: null,
      'privacySettings.searchPrivacy': { $ne: true },
      ...(blockedIds.length > 0 ? { _id: { $nin: blockedIds } } : {}),
    };

    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { username: { $regex: escaped, $options: 'i' } },
        { firstName: { $regex: escaped, $options: 'i' } },
        { lastName: { $regex: escaped, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ verified: -1, followersCount: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('username firstName lastName avatar bio verified followersCount type caption')
        .lean(),
      User.countDocuments(filter),
    ]);

    // Attach follow state if authenticated
    let followingSet = new Set<string>();
    if (authCtx) {
      const rels = await Follow.find({
        followerId: authCtx.user._id,
        followingId: { $in: users.map((u) => u._id) },
        status: FollowStatus.FOLLOWING,
      })
        .select('followingId')
        .lean();
      followingSet = new Set(rels.map((r) => String(r.followingId)));
    }

    return apiSuccess(
      users.map((u) => ({
        id: String(u._id),
        username: u.username,
        firstName: u.firstName,
        lastName: u.lastName,
        avatar: resolveMediaUrl(u.avatar) || '/assets/avatars/default-avatar.png',
        bio: u.bio,
        caption: u.caption,
        verified: u.verified,
        followersCount: u.followersCount,
        type: u.type,
        isFollowing: followingSet.has(String(u._id)),
      })),
      { page, limit, total }
    );
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const body = (await req.json()) as { tipKey?: string };
    if (body.tipKey) {
      await User.updateOne(
        { _id: user._id },
        { $set: { [`tips.${body.tipKey}`]: true } }
      );
    }
    return apiSuccess({ dismissed: true });
  } catch (err) {
    return apiError(err);
  }
}
