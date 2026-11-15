import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { Block, Follow, Mute } from '@/models/SocialGraph';
import { User } from '@/models/User';
import { FollowStatus, PrivacyPermit, UserStatus } from '@/types/enums';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/api-response';
import { dispatchNotification } from './notification.service';

export async function toggleFollow(followerId: string, targetUserId: string) {
  if (followerId === targetUserId) {
    throw new ValidationError('You cannot follow yourself.');
  }

  await connectDB();
  const [followerObjId, targetObjId] = [
    new Types.ObjectId(followerId),
    new Types.ObjectId(targetUserId),
  ];

  const blocked = await Block.exists({
    $or: [
      { blockerId: followerObjId, blockedId: targetObjId },
      { blockerId: targetObjId, blockedId: followerObjId },
    ],
  });
  if (blocked) {
    throw new ForbiddenError('Follow action unavailable due to block.');
  }

  const targetUser = await User.findOne({
    _id: targetObjId,
    deletedAt: null,
    status: UserStatus.ACTIVE,
  });
  if (!targetUser) throw new NotFoundError('User not found.');

  const existing = await Follow.findOne({ followerId: followerObjId, followingId: targetObjId });
  if (existing) {
    const wasFollowing = existing.status === FollowStatus.FOLLOWING;
    await Follow.deleteOne({ _id: existing._id });
    if (wasFollowing) {
      await Promise.all([
        User.updateOne({ _id: followerObjId, followingCount: { $gt: 0 } }, { $inc: { followingCount: -1 } }),
        User.updateOne({ _id: targetObjId, followersCount: { $gt: 0 } }, { $inc: { followersCount: -1 } }),
      ]);
    }
    return { following: false, requested: false };
  }

  const requiresApproval = targetUser.permitSettings?.followers === PrivacyPermit.APPROVED;
  if (targetUser.permitSettings?.followers === PrivacyPermit.NOBODY) {
    throw new ForbiddenError('This user does not accept new followers.');
  }

  const status = requiresApproval ? FollowStatus.REQUESTED : FollowStatus.FOLLOWING;
  await Follow.create({ followerId: followerObjId, followingId: targetObjId, status });

  if (status === FollowStatus.FOLLOWING) {
    await Promise.all([
      User.updateOne({ _id: followerObjId }, { $inc: { followingCount: 1 } }),
      User.updateOne({ _id: targetObjId }, { $inc: { followersCount: 1 } }),
      dispatchNotification({
        recipientId: targetObjId,
        actorId: followerObjId,
        type: 'FOLLOWED',
        preferenceKey: 'followers',
        title: 'New Follower',
        message: 'has started following you',
        actionUrl: `/@${targetUser.username}`,
      }),
    ]);
    return { following: true, requested: false };
  } else {
    await dispatchNotification({
      recipientId: targetObjId,
      actorId: followerObjId,
      type: 'FOLLOWED_REQUESTED',
      preferenceKey: 'followRequest',
      title: 'Follow Request',
      message: 'has requested to follow you',
      actionUrl: '/notifications',
    });
    return { following: false, requested: true };
  }
}

export async function respondFollowRequest(
  targetUserId: string,
  requesterId: string,
  accept: boolean
) {
  await connectDB();
  const follow = await Follow.findOne({
    followerId: new Types.ObjectId(requesterId),
    followingId: new Types.ObjectId(targetUserId),
    status: FollowStatus.REQUESTED,
  });
  if (!follow) throw new NotFoundError('Follow request not found.');

  if (!accept) {
    await Follow.deleteOne({ _id: follow._id });
    return { accepted: false };
  }

  follow.status = FollowStatus.FOLLOWING;
  await follow.save();

  await Promise.all([
    User.updateOne({ _id: follow.followerId }, { $inc: { followingCount: 1 } }),
    User.updateOne({ _id: follow.followingId }, { $inc: { followersCount: 1 } }),
    dispatchNotification({
      recipientId: follow.followerId,
      actorId: follow.followingId,
      type: 'FOLLOW_ACCEPTED',
      preferenceKey: 'followers',
      title: 'Follow Request Accepted',
      message: 'has accepted your follow request',
      actionUrl: '/home',
    }),
  ]);

  return { accepted: true };
}

export async function toggleMute(muterId: string, mutedId: string) {
  if (muterId === mutedId) throw new ValidationError('You cannot mute yourself.');
  await connectDB();
  const existing = await Mute.findOne({ muterId, mutedId });
  if (existing) {
    await Mute.deleteOne({ _id: existing._id });
    return { muted: false };
  }
  await Mute.create({ muterId, mutedId });
  return { muted: true };
}

export async function toggleBlock(blockerId: string, blockedId: string) {
  if (blockerId === blockedId) throw new ValidationError('You cannot block yourself.');
  await connectDB();
  const [blockerObjId, blockedObjId] = [new Types.ObjectId(blockerId), new Types.ObjectId(blockedId)];

  const existing = await Block.findOne({ blockerId: blockerObjId, blockedId: blockedObjId });
  if (existing) {
    await Block.deleteOne({ _id: existing._id });
    return { blocked: false };
  }

  await Block.create({ blockerId: blockerObjId, blockedId: blockedObjId });

  // Mirror ColibriPlus BlockService: auto-mute and sever bi-directional follows
  await Mute.updateOne(
    { muterId: blockerObjId, mutedId: blockedObjId },
    { $setOnInsert: { muterId: blockerObjId, mutedId: blockedObjId } },
    { upsert: true }
  );

  const follows = await Follow.find({
    $or: [
      { followerId: blockerObjId, followingId: blockedObjId },
      { followerId: blockedObjId, followingId: blockerObjId },
    ],
  });

  for (const f of follows) {
    if (f.status === FollowStatus.FOLLOWING) {
      await Promise.all([
        User.updateOne({ _id: f.followerId, followingCount: { $gt: 0 } }, { $inc: { followingCount: -1 } }),
        User.updateOne({ _id: f.followingId, followersCount: { $gt: 0 } }, { $inc: { followersCount: -1 } }),
      ]);
    }
    await Follow.deleteOne({ _id: f._id });
  }

  return { blocked: true };
}

export async function getBlockedUserIdsFor(userId: string): Promise<Types.ObjectId[]> {
  await connectDB();
  const uid = new Types.ObjectId(userId);
  const rows = await Block.find({
    $or: [{ blockerId: uid }, { blockedId: uid }],
  }).lean();

  const ids = new Set<string>();
  for (const r of rows) {
    if (String(r.blockerId) !== userId) ids.add(String(r.blockerId));
    if (String(r.blockedId) !== userId) ids.add(String(r.blockedId));
  }
  return Array.from(ids).map((id) => new Types.ObjectId(id));
}
