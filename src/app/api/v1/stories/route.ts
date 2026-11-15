import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, ValidationError } from '@/lib/api-response';
import { StoryFrame, StoryView } from '@/models/Story';
import { Follow } from '@/models/SocialGraph';
import { Media } from '@/models/Media';
import { User } from '@/models/User';
import { FollowStatus, StoryPrivacy, StoryStatus, StoryType } from '@/types/enums';
import { getBlockedUserIdsFor } from '@/services/relations.service';
import { serializeMedia } from '@/services/media.service';
import { extractMentions } from '@/lib/utils';
import { dispatchNotification } from '@/services/notification.service';
import { publishFeedRealtimeEvent } from '@/lib/firebase/realtime';

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { user } = await requireAuth(req);
    const blockedIds = await getBlockedUserIdsFor(String(user._id));
    const followingIds = await Follow.find({
      followerId: user._id,
      status: FollowStatus.FOLLOWING,
    }).distinct('followingId');

    const now = new Date();
    const frames = await StoryFrame.find({
      status: StoryStatus.ACTIVE,
      userId: { $nin: blockedIds },
      $or: [{ expiresAt: { $gt: now } }, { isHighlight: true }],
    })
      .sort({ createdAt: 1 })
      .populate('userId', 'username firstName lastName avatar verified')
      .populate('mediaId')
      .lean();

    const visibleFrames = frames.filter((f) => {
      const ownerId = String((f.userId as { _id: unknown })?._id || f.userId);
      if (ownerId === String(user._id)) return true;
      if (f.privacy === StoryPrivacy.ALL) return true;
      if (f.privacy === StoryPrivacy.FOLLOWERS) {
        return followingIds.some((fid) => String(fid) === ownerId);
      }
      if (f.privacy === StoryPrivacy.SELECTED_USERS) {
        return f.allowedUserIds?.some((aid) => String(aid) === String(user._id));
      }
      return false;
    });

    const viewedIds = new Set(
      (
        await StoryView.find({
          userId: user._id,
          storyFrameId: { $in: visibleFrames.map((f) => f._id) },
        })
          .select('storyFrameId')
          .lean()
      ).map((v) => String(v.storyFrameId))
    );

    const grouped = new Map<
      string,
      {
        storyUuid: string;
        user: unknown;
        isOwner: boolean;
        hasUnviewed: boolean;
        latestAt: number;
        frames: unknown[];
      }
    >();

    for (const f of visibleFrames) {
      const u = f.userId as { _id: unknown };
      const uid = String(u?._id || f.userId);
      const isOwner = uid === String(user._id);
      const isViewed = viewedIds.has(String(f._id));
      const frameTime = f.createdAt ? new Date(f.createdAt).getTime() : 0;
      const existing = grouped.get(uid) || {
        storyUuid: f.storyUuid,
        user: u,
        isOwner,
        hasUnviewed: false,
        latestAt: frameTime,
        frames: [],
      };
      if (!isViewed && !isOwner) existing.hasUnviewed = true;
      if (frameTime > existing.latestAt) existing.latestAt = frameTime;
      existing.frames.push({
        id: String(f._id),
        storyUuid: f.storyUuid,
        type: f.type,
        content: f.content,
        privacy: f.privacy,
        isHighlight: f.isHighlight,
        durationSeconds: f.durationSeconds,
        viewsCount: f.viewsCount,
        isViewed,
        media: f.mediaId ? serializeMedia(f.mediaId as never) : null,
        meta: f.meta,
        createdAt: f.createdAt,
        expiresAt: f.expiresAt,
      });
      grouped.set(uid, existing);
    }

    const sorted = Array.from(grouped.values()).sort((a, b) => {
      if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
      if (a.hasUnviewed !== b.hasUnviewed) return a.hasUnviewed ? -1 : 1;
      return b.latestAt - a.latestAt;
    });

    return apiSuccess(sorted);
  } catch (err) {
    return apiError(err);
  }
}

const createStorySchema = z.object({
  type: z.nativeEnum(StoryType),
  content: z.string().max(1000).optional(),
  mediaId: z.string().optional(),
  privacy: z.nativeEnum(StoryPrivacy).default(StoryPrivacy.ALL),
  allowedUserIds: z.array(z.string()).optional(),
  isHighlight: z.boolean().default(false),
  durationSeconds: z.number().int().min(3).max(60).default(5),
  bgColor: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const body = createStorySchema.parse(await req.json());

    if (body.type !== StoryType.TEXT && !body.mediaId) {
      throw new ValidationError('Media upload is required for image/video stories.');
    }

    // Reuse active storyUuid for user if one exists
    const existing = await StoryFrame.findOne({ userId: user._id }).select('storyUuid').lean();
    const storyUuid = existing?.storyUuid || crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const frame = await StoryFrame.create({
      storyUuid,
      userId: user._id,
      content: body.content || null,
      type: body.type,
      status: StoryStatus.ACTIVE,
      privacy: body.privacy,
      allowedUserIds: (body.allowedUserIds || []).map((id) => new Types.ObjectId(id)),
      isHighlight: body.isHighlight,
      durationSeconds: body.durationSeconds,
      mediaId: body.mediaId ? new Types.ObjectId(body.mediaId) : null,
      meta: body.bgColor ? { bgColor: body.bgColor } : {},
      expiresAt,
    });

    if (body.mediaId) {
      await Media.updateOne(
        { _id: body.mediaId, ownerId: user._id },
        { $set: { targetType: 'story_frame', targetId: frame._id } }
      );
    }

    if (body.content) {
      const mentions = extractMentions(body.content);
      if (mentions.length > 0) {
        const users = await User.find({ username: { $in: mentions } }).select('_id').lean();
        for (const mu of users) {
          await dispatchNotification({
            recipientId: mu._id,
            actorId: user._id,
            type: 'STORY_MENTIONED',
            category: 'mentions',
            preferenceKey: 'mentions',
            title: 'Mentioned in a story',
            message: `@${user.username} mentioned you in their story.`,
            actionUrl: `/stories/${storyUuid}`,
          });
        }
      }
    }

    publishFeedRealtimeEvent('story:created', { storyUuid, frameId: String(frame._id) });
    return apiSuccess({ id: String(frame._id), storyUuid }, undefined, 201);
  } catch (err) {
    return apiError(err);
  }
}
