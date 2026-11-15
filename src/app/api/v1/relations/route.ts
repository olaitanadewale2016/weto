import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess } from '@/lib/api-response';
import {
  respondFollowRequest,
  toggleBlock,
  toggleFollow,
  toggleMute,
} from '@/services/relations.service';
import { Block, Follow } from '@/models/SocialGraph';
import { FollowStatus } from '@/types/enums';

const relationActionSchema = z.object({
  action: z.enum(['follow', 'accept_follow', 'reject_follow', 'mute', 'block']),
  targetUserId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const body = relationActionSchema.parse(await req.json());
    const uid = String(user._id);

    if (body.action === 'follow') {
      return apiSuccess(await toggleFollow(uid, body.targetUserId));
    }
    if (body.action === 'accept_follow' || body.action === 'reject_follow') {
      return apiSuccess(
        await respondFollowRequest(uid, body.targetUserId, body.action === 'accept_follow')
      );
    }
    if (body.action === 'mute') {
      return apiSuccess(await toggleMute(uid, body.targetUserId));
    }
    if (body.action === 'block') {
      return apiSuccess(await toggleBlock(uid, body.targetUserId));
    }

    return apiSuccess({});
  } catch (err) {
    return apiError(err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const kind = new URL(req.url).searchParams.get('kind') || 'blocks';

    if (kind === 'follow_requests') {
      const requests = await Follow.find({
        followingId: user._id,
        status: FollowStatus.REQUESTED,
      })
        .populate('followerId', 'username firstName lastName avatar verified')
        .lean();
      return apiSuccess(requests);
    }

    const blocks = await Block.find({ blockerId: user._id })
      .populate('blockedId', 'username firstName lastName avatar verified')
      .lean();

    return apiSuccess(
      blocks
        .map((b) => {
          const target = b.blockedId as unknown as {
            _id: unknown;
            username: string;
            firstName: string;
            lastName: string;
            avatar: string;
            verified: boolean;
          };
          return target
            ? {
                id: String(target._id),
                username: target.username,
                firstName: target.firstName,
                lastName: target.lastName,
                avatar: target.avatar,
                verified: target.verified,
                blockedAt: b.createdAt,
              }
            : null;
        })
        .filter(Boolean)
    );
  } catch (err) {
    return apiError(err);
  }
}
