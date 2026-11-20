import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { getFirebaseAuth, isFirebaseAdminConfigured } from '@/lib/firebase/admin';
import { User } from '@/models/User';
import { Device } from '@/models/Device';
import { Verification } from '@/models/Verification';
import { AuthorshipRequest, Block, Follow, Mute } from '@/models/SocialGraph';
import { Bookmark, Comment, Pin, Post, Reaction } from '@/models/Post';
import { Media } from '@/models/Media';
import { StoryFrame, StoryView } from '@/models/Story';
import { Chat, ChatCall, ChatInvite, Message } from '@/models/Messaging';
import { Notification } from '@/models/Notification';
import { BusinessAccount, JobApplication, JobListing, Product, Store } from '@/models/Commerce';
import { Ad, Cashout, CreatorSubscription, Payment, Wallet, WalletTransaction } from '@/models/Finance';
import { Report } from '@/models/Moderation';
import { ApiKey } from '@/models/System';
import { GameProfile, TicTacToeHistory, TicTacToeMatch } from '@/models/TicTacToe';
import { ChatType, ReportType } from '@/types/enums';
import { deleteMediaRecord } from '@/services/media.service';

export interface PurgeUserAccountResult {
  deletedUserIds: string[];
  deletedUsernames: string[];
  purged: boolean;
}

/**
 * Permanently and completely removes a user account (and any linked sub-accounts
 * if this is a master account) along with ALL associated content, social graph edges,
 * chats/messages/calls, stories, notifications, commerce records, wallet/finance records,
 * R2 media objects, devices, verifications, API keys, games, and Firebase Auth identity.
 */
export async function purgeUserAccountCompletely(
  targetUserId: string | Types.ObjectId
): Promise<PurgeUserAccountResult> {
  await connectDB();

  const rootObjectId =
    typeof targetUserId === 'string' ? new Types.ObjectId(targetUserId) : targetUserId;

  const targetUser = await User.findById(rootObjectId)
    .select('_id username email phone firebaseUid ownerAccountId')
    .lean();

  if (!targetUser) {
    return { deletedUserIds: [], deletedUsernames: [], purged: false };
  }

  // If deleting a master account, also purge any linked sub-accounts owned by it
  const linkedChildren = !targetUser.ownerAccountId
    ? await User.find({ ownerAccountId: targetUser._id })
        .select('_id username email phone firebaseUid ownerAccountId')
        .lean()
    : [];

  const allTargets = [targetUser, ...linkedChildren];
  const userIds = allTargets.map((u) => u._id);
  const userIdStrs = userIds.map((id) => String(id));
  const emails = allTargets
    .map((u) => (u.email || '').trim().toLowerCase())
    .filter(Boolean);
  const phones = allTargets
    .map((u) => (u.phone || '').trim())
    .filter(Boolean);

  // 1. Delete Firebase Auth identities so the user cannot re-authenticate with old tokens
  if (isFirebaseAdminConfigured()) {
    const fbAuth = getFirebaseAuth();
    for (const u of allTargets) {
      if (u.firebaseUid) {
        await fbAuth.revokeRefreshTokens(u.firebaseUid).catch(() => {});
        await fbAuth.deleteUser(u.firebaseUid).catch(() => {});
      }
    }
  }

  // 2. Collect IDs of user-owned content before deletion so dependent records can be cascaded
  const [userPosts, userComments, userStories, userProducts, userJobs, userMedia] =
    await Promise.all([
      Post.find({ userId: { $in: userIds } }).select('_id quotePostId').lean(),
      Comment.find({ userId: { $in: userIds } }).select('_id postId').lean(),
      StoryFrame.find({ userId: { $in: userIds } }).select('_id').lean(),
      Product.find({ userId: { $in: userIds } }).select('_id').lean(),
      JobListing.find({ userId: { $in: userIds } }).select('_id').lean(),
      Media.find({ ownerId: { $in: userIds } }).select('_id').lean(),
    ]);

  const postIds = userPosts.map((p) => p._id);
  const storyIds = userStories.map((s) => s._id);
  const productIds = userProducts.map((p) => p._id);
  const jobIds = userJobs.map((j) => j._id);

  // Decrement quotesCount on other users' posts that this user quoted
  const quotedCounts = new Map<string, number>();
  for (const p of userPosts) {
    if (p.quotePostId) {
      const key = String(p.quotePostId);
      quotedCounts.set(key, (quotedCounts.get(key) || 0) + 1);
    }
  }
  for (const [quotedId, count] of quotedCounts.entries()) {
    await Post.updateOne(
      { _id: quotedId, quotesCount: { $gte: count } },
      { $inc: { quotesCount: -count } }
    ).catch(() => {});
  }

  // Collect all comments that will be deleted (both authored by user and attached to user's posts)
  const postComments =
    postIds.length > 0
      ? await Comment.find({ postId: { $in: postIds } }).select('_id').lean()
      : [];
  const allDeletedCommentIds = Array.from(
    new Set([
      ...userComments.map((c) => String(c._id)),
      ...postComments.map((c) => String(c._id)),
    ])
  ).map((id) => new Types.ObjectId(id));

  // Decrement commentsCount on surviving posts where deleted user had commented
  const deletedPostIdSet = new Set(postIds.map((id) => String(id)));
  const survivingPostCommentCounts = new Map<string, number>();
  for (const c of userComments) {
    const pid = String(c.postId);
    if (!deletedPostIdSet.has(pid)) {
      survivingPostCommentCounts.set(pid, (survivingPostCommentCounts.get(pid) || 0) + 1);
    }
  }
  for (const [pid, count] of survivingPostCommentCounts.entries()) {
    await Post.updateOne(
      { _id: pid, commentsCount: { $gte: count } },
      { $inc: { commentsCount: -count } }
    ).catch(() => {});
  }

  // 3. Decrement follower/following counters on connected users BEFORE removing Follow docs
  const [outgoingFollows, incomingFollows] = await Promise.all([
    Follow.find({ followerId: { $in: userIds } }).select('followingId').lean(),
    Follow.find({ followingId: { $in: userIds } }).select('followerId').lean(),
  ]);

  const followeeDecMap = new Map<string, number>();
  for (const f of outgoingFollows) {
    const k = String(f.followingId);
    if (!userIdStrs.includes(k)) {
      followeeDecMap.set(k, (followeeDecMap.get(k) || 0) + 1);
    }
  }
  const followerDecMap = new Map<string, number>();
  for (const f of incomingFollows) {
    const k = String(f.followerId);
    if (!userIdStrs.includes(k)) {
      followerDecMap.set(k, (followerDecMap.get(k) || 0) + 1);
    }
  }

  await Promise.all([
    ...Array.from(followeeDecMap.entries()).map(([uid, count]) =>
      User.updateOne(
        { _id: uid, followersCount: { $gte: count } },
        { $inc: { followersCount: -count } }
      ).catch(() => {})
    ),
    ...Array.from(followerDecMap.entries()).map(([uid, count]) =>
      User.updateOne(
        { _id: uid, followingCount: { $gte: count } },
        { $inc: { followingCount: -count } }
      ).catch(() => {})
    ),
  ]);

  // 4. Clean up Direct Chats (delete completely) and Group Chats (remove user & messages; transfer or delete empty group)
  const directChats = await Chat.find({
    type: ChatType.DIRECT,
    'participants.userId': { $in: userIds },
  })
    .select('_id')
    .lean();
  const directChatIds = directChats.map((c) => c._id);

  if (directChatIds.length > 0) {
    await Promise.all([
      Message.deleteMany({ chatId: { $in: directChatIds } }),
      ChatInvite.deleteMany({ chatId: { $in: directChatIds } }),
      ChatCall.deleteMany({ chatId: { $in: directChatIds } }),
      Chat.deleteMany({ _id: { $in: directChatIds } }),
    ]);
  }

  const userGroupMessages = await Message.find({ senderId: { $in: userIds } })
    .select('_id chatId')
    .lean();
  const deletedMessageIds = userGroupMessages.map((m) => m._id);

  await Promise.all([
    Message.deleteMany({ senderId: { $in: userIds } }),
    Message.updateMany(
      {
        $or: [
          { hiddenForUserIds: { $in: userIds } },
          { deliveredTo: { $in: userIds } },
          { readBy: { $in: userIds } },
        ],
      },
      {
        $pull: {
          hiddenForUserIds: { $in: userIds },
          deliveredTo: { $in: userIds },
          readBy: { $in: userIds },
        },
      }
    ),
    Message.updateMany(
      { 'poll.options.voterIds': { $in: userIds } },
      { $pull: { 'poll.options.$[].voterIds': { $in: userIds } } }
    ),
  ]);

  // Remove user from all group chats & handle ownership transfer / empty group cleanup
  const affectedGroups = await Chat.find({
    type: ChatType.GROUP,
    $or: [
      { 'participants.userId': { $in: userIds } },
      { 'group.ownerId': { $in: userIds } },
      { 'group.paidMemberUserIds': { $in: userIds } },
      { 'group.pendingJoinUserIds': { $in: userIds } },
      { 'group.bannedUserIds': { $in: userIds } },
      ...(deletedMessageIds.length > 0
        ? [
            { lastMessageId: { $in: deletedMessageIds } },
            { pinnedMessageIds: { $in: deletedMessageIds } },
          ]
        : []),
    ],
  });

  const userIdSet = new Set(userIdStrs);
  const deletedMessageIdSet = new Set(deletedMessageIds.map((id) => String(id)));

  for (const grp of affectedGroups) {
    grp.participants = grp.participants.filter((p) => !userIdSet.has(String(p.userId)));
    if (grp.group) {
      if (Array.isArray(grp.group.paidMemberUserIds)) {
        grp.group.paidMemberUserIds = grp.group.paidMemberUserIds.filter(
          (id) => !userIdSet.has(String(id))
        );
      }
      if (Array.isArray(grp.group.pendingJoinUserIds)) {
        grp.group.pendingJoinUserIds = grp.group.pendingJoinUserIds.filter(
          (id) => !userIdSet.has(String(id))
        );
      }
      if (Array.isArray(grp.group.bannedUserIds)) {
        grp.group.bannedUserIds = grp.group.bannedUserIds.filter(
          (id) => !userIdSet.has(String(id))
        );
      }
    }
    if (Array.isArray(grp.pinnedMessageIds) && deletedMessageIdSet.size > 0) {
      grp.pinnedMessageIds = grp.pinnedMessageIds.filter(
        (id) => !deletedMessageIdSet.has(String(id))
      );
    }

    if (grp.participants.length === 0) {
      await Promise.all([
        Message.deleteMany({ chatId: grp._id }),
        ChatInvite.deleteMany({ chatId: grp._id }),
        ChatCall.deleteMany({ chatId: grp._id }),
        Chat.deleteOne({ _id: grp._id }),
      ]);
      continue;
    }

    if (grp.group && userIdSet.has(String(grp.group.ownerId))) {
      const nextOwner =
        grp.participants.find((p) => p.role === 'admin') || grp.participants[0];
      if (nextOwner) {
        nextOwner.role = 'owner';
        grp.group.ownerId = nextOwner.userId;
      }
    }

    if (grp.lastMessageId && deletedMessageIdSet.has(String(grp.lastMessageId))) {
      const latestMsg = await Message.findOne({ chatId: grp._id, isDeleted: false })
        .sort({ createdAt: -1 })
        .select('_id content type')
        .lean();
      grp.lastMessageId = latestMsg?._id || null;
      grp.lastMessagePreview = latestMsg
        ? latestMsg.content?.slice(0, 120) || latestMsg.type
        : null;
    }

    await grp.save().catch(() => {});
  }

  // 5. Purge user reactions, bookmarks, pins, posts, comments, polls
  const unsetPollVotes: Record<string, 1> = {};
  for (const uidStr of userIdStrs) {
    unsetPollVotes[`poll.votesByUser.${uidStr}`] = 1;
  }

  await Promise.all([
    Post.deleteMany({ userId: { $in: userIds } }),
    postIds.length > 0
      ? Post.updateMany({ quotePostId: { $in: postIds } }, { $set: { quotePostId: null, isQuoting: false } })
      : Promise.resolve(),
    Post.updateMany(
      { 'poll.voterIds': { $in: userIds } },
      { $pull: { 'poll.voterIds': { $in: userIds } }, $unset: unsetPollVotes }
    ),
    Comment.deleteMany({
      $or: [
        { userId: { $in: userIds } },
        ...(postIds.length > 0 ? [{ postId: { $in: postIds } }] : []),
      ],
    }),
    Reaction.deleteMany({
      $or: [
        { userId: { $in: userIds } },
        ...(postIds.length > 0 ? [{ targetType: 'post', targetId: { $in: postIds } }] : []),
        ...(allDeletedCommentIds.length > 0
          ? [{ targetType: 'comment', targetId: { $in: allDeletedCommentIds } }]
          : []),
        ...(deletedMessageIds.length > 0
          ? [{ targetType: 'message', targetId: { $in: deletedMessageIds } }]
          : []),
      ],
    }),
    Bookmark.deleteMany({
      $or: [
        { userId: { $in: userIds } },
        ...(postIds.length > 0 ? [{ targetType: 'post', targetId: { $in: postIds } }] : []),
        ...(productIds.length > 0 ? [{ targetType: 'product', targetId: { $in: productIds } }] : []),
        ...(jobIds.length > 0 ? [{ targetType: 'job', targetId: { $in: jobIds } }] : []),
      ],
    }),
    Pin.deleteMany({
      $or: [
        { userId: { $in: userIds } },
        ...(postIds.length > 0 ? [{ targetId: { $in: postIds } }] : []),
      ],
    }),
  ]);

  // 6. Purge stories, social graph, messaging invites/calls, notifications, commerce, finance, moderation, devices, verifications, API keys, games
  await Promise.all([
    StoryFrame.deleteMany({ userId: { $in: userIds } }),
    StoryFrame.updateMany(
      { allowedUserIds: { $in: userIds } },
      { $pull: { allowedUserIds: { $in: userIds } } }
    ),
    StoryView.deleteMany({
      $or: [
        { userId: { $in: userIds } },
        ...(storyIds.length > 0 ? [{ storyFrameId: { $in: storyIds } }] : []),
      ],
    }),
    Follow.deleteMany({
      $or: [{ followerId: { $in: userIds } }, { followingId: { $in: userIds } }],
    }),
    Mute.deleteMany({
      $or: [{ muterId: { $in: userIds } }, { mutedId: { $in: userIds } }],
    }),
    Block.deleteMany({
      $or: [{ blockerId: { $in: userIds } }, { blockedId: { $in: userIds } }],
    }),
    AuthorshipRequest.deleteMany({ userId: { $in: userIds } }),
    ChatInvite.deleteMany({
      $or: [{ senderId: { $in: userIds } }, { receiverId: { $in: userIds } }],
    }),
    ChatCall.deleteMany({ initiatorId: { $in: userIds } }),
    ChatCall.updateMany(
      {
        $or: [
          { targetUserIds: { $in: userIds } },
          { 'participants.userId': { $in: userIds } },
        ],
      },
      {
        $pull: {
          targetUserIds: { $in: userIds },
          participants: { userId: { $in: userIds } },
        },
      }
    ),
    Notification.deleteMany({
      $or: [{ userId: { $in: userIds } }, { actorId: { $in: userIds } }],
    }),
    JobApplication.deleteMany({
      $or: [
        { applicantId: { $in: userIds } },
        { employerId: { $in: userIds } },
        ...(jobIds.length > 0 ? [{ jobId: { $in: jobIds } }] : []),
      ],
    }),
    Product.deleteMany({ userId: { $in: userIds } }),
    JobListing.deleteMany({ userId: { $in: userIds } }),
    Store.deleteMany({ userId: { $in: userIds } }),
    BusinessAccount.deleteMany({ userId: { $in: userIds } }),
    Ad.deleteMany({ userId: { $in: userIds } }),
    CreatorSubscription.deleteMany({
      $or: [{ creatorId: { $in: userIds } }, { subscriberId: { $in: userIds } }],
    }),
    Cashout.deleteMany({ userId: { $in: userIds } }),
    Payment.deleteMany({ userId: { $in: userIds } }),
    WalletTransaction.deleteMany({ userId: { $in: userIds } }),
    Wallet.deleteMany({ userId: { $in: userIds } }),
    Report.deleteMany({
      $or: [
        { reporterId: { $in: userIds } },
        { reportableType: ReportType.USER, reportableId: { $in: userIds } },
        ...(postIds.length > 0 ? [{ reportableId: { $in: postIds } }] : []),
        ...(productIds.length > 0 ? [{ reportableId: { $in: productIds } }] : []),
        ...(jobIds.length > 0 ? [{ reportableId: { $in: jobIds } }] : []),
      ],
    }),
    Device.deleteMany({ userId: { $in: userIds } }),
    Verification.deleteMany({
      $or: [
        { userId: { $in: userIds } },
        ...(emails.length > 0 ? [{ identifier: { $in: emails } }] : []),
        ...(phones.length > 0 ? [{ identifier: { $in: phones } }] : []),
      ],
    }),
    ApiKey.deleteMany({ userId: { $in: userIds } }),
    GameProfile.deleteMany({ userId: { $in: userIds } }),
    TicTacToeHistory.deleteMany({ userId: { $in: userIds } }),
    TicTacToeMatch.deleteMany({
      $or: [
        { invitedUserId: { $in: userIds } },
        { 'player1.userId': { $in: userIdStrs } },
        { 'player2.userId': { $in: userIdStrs } },
      ],
    }),
  ]);

  // 7. Delete R2 objects + Media documents owned by user(s)
  for (const mediaDoc of userMedia) {
    await deleteMediaRecord(String(mediaDoc._id)).catch(async () => {
      await Media.deleteOne({ _id: mediaDoc._id }).catch(() => {});
    });
  }
  await Media.deleteMany({ ownerId: { $in: userIds } }).catch(() => {});

  // 8. Finally, permanently delete the User document(s) themselves from MongoDB
  await User.deleteMany({ _id: { $in: userIds } });

  return {
    deletedUserIds: userIdStrs,
    deletedUsernames: allTargets.map((u) => u.username),
    purged: true,
  };
}
