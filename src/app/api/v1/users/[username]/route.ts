import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import { getOptionalAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, ForbiddenError, NotFoundError } from '@/lib/api-response';
import { User } from '@/models/User';
import { Block, Follow, Mute } from '@/models/SocialGraph';
import { FollowStatus, UserStatus } from '@/types/enums';
import { isObjectIdLike } from '@/lib/hashids';
import { resolveMediaUrl } from '@/lib/media-url';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ username: string }> }
) {
  try {
    await connectDB();
    const { username } = await context.params;
    const authCtx = await getOptionalAuth(req);
    const clean = decodeURIComponent(username).replace(/^@/, '').toLowerCase();

    const target = await User.findOne(
      isObjectIdLike(clean)
        ? { _id: clean, deletedAt: null }
        : { username: clean, deletedAt: null }
    ).lean();

    if (!target || target.status === UserStatus.BLOCKED || target.status === UserStatus.SUSPENDED) {
      throw new NotFoundError('User profile not found.');
    }

    const isSelf = authCtx ? String(authCtx.user._id) === String(target._id) : false;

    if (authCtx && !isSelf) {
      const blocked = await Block.exists({
        $or: [
          { blockerId: authCtx.user._id, blockedId: target._id },
          { blockerId: target._id, blockedId: authCtx.user._id },
        ],
      });
      if (blocked) throw new ForbiddenError('This profile is unavailable.');
    }

    let followState: string | null = null;
    let isMuted = false;

    if (authCtx && !isSelf) {
      const [rel, muted] = await Promise.all([
        Follow.findOne({ followerId: authCtx.user._id, followingId: target._id }).lean(),
        Mute.exists({ muterId: authCtx.user._id, mutedId: target._id }),
      ]);
      followState = rel?.status || null;
      isMuted = Boolean(muted);
    }

    const priv = target.privacySettings;
    const canSee = (hidden: boolean) => isSelf || !hidden;

    // Fetch followers / followings lists if requested via ?tab=followers|followings
    const tab = new URL(req.url).searchParams.get('tab');
    if (tab === 'followers' || tab === 'followings') {
      const match =
        tab === 'followers'
          ? { followingId: target._id, status: FollowStatus.FOLLOWING }
          : { followerId: target._id, status: FollowStatus.FOLLOWING };
      const field = tab === 'followers' ? 'followerId' : 'followingId';

      const edges = await Follow.find(match)
        .sort({ createdAt: -1 })
        .limit(50)
        .populate(field, 'username firstName lastName avatar verified bio')
        .lean();

      return apiSuccess(
        edges.map((e) => {
          const u = e[field] as unknown as {
            _id: unknown;
            username: string;
            firstName: string;
            lastName: string;
            avatar: string;
            verified: boolean;
            bio: string;
          };
          return u
            ? {
                id: String(u._id),
                username: u.username,
                firstName: u.firstName,
                lastName: u.lastName,
                avatar: resolveMediaUrl(u.avatar) || '/assets/avatars/default-avatar.png',
                verified: u.verified,
                bio: u.bio,
              }
            : null;
        }).filter(Boolean)
      );
    }

    return apiSuccess({
      id: String(target._id),
      username: target.username,
      firstName: target.firstName,
      lastName: target.lastName,
      caption: target.caption,
      category: target.category,
      bio: target.bio,
      website: target.website,
      avatar: resolveMediaUrl(target.avatar) || '/assets/avatars/default-avatar.png',
      cover: resolveMediaUrl(target.cover) || '/assets/covers/default-cover.png',
      verified: target.verified,
      type: target.type,
      publicationsCount: target.publicationsCount,
      followersCount: target.followersCount,
      followingCount: target.followingCount,
      socialLinks: target.socialLinks || [],
      email: canSee(Boolean(priv?.emailPrivacy)) ? target.email : null,
      phone: canSee(Boolean(priv?.phonePrivacy)) ? target.phone : null,
      country: canSee(Boolean(priv?.countryPrivacy)) ? target.country : null,
      city: canSee(Boolean(priv?.cityPrivacy)) ? target.city : null,
      gender: canSee(Boolean(priv?.genderPrivacy)) ? target.gender : null,
      lastActive: canSee(Boolean(priv?.lastSeenPrivacy)) ? target.lastActive : null,
      createdAt: target.createdAt,
      monetization: {
        tipsEnabled: Boolean(target.monetization?.tipsEnabled),
        subscriptionsEnabled: Boolean(target.monetization?.subscriptionsEnabled),
        monthlyPrice: Number(target.monetization?.monthlyPrice ?? 5),
        currency: target.monetization?.currency || 'USD',
        description: target.monetization?.description || '',
      },
      viewerContext: {
        isSelf,
        isFollowing: followState === FollowStatus.FOLLOWING,
        isRequested: followState === FollowStatus.REQUESTED,
        isMuted,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
