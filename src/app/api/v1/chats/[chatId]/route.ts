import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, ForbiddenError, NotFoundError, ValidationError } from '@/lib/api-response';
import { Chat, ChatCall, ChatInvite, Message } from '@/models/Messaging';
import { User } from '@/models/User';
import { Media } from '@/models/Media';
import { ChatInviteStatus, ChatType, GroupPrivacy, GroupStatus, GroupVisibility, MediaType, MessageType } from '@/types/enums';
import { extractUrls } from '@/lib/utils';
import { isValidStickerUrl } from '@/lib/stickers';
import { fetchLinkSnapshot } from '@/services/link-preview.service';
import { serializeMedia } from '@/services/media.service';
import { enforceCensorForUser } from '@/services/censor-blacklist.service';
import {
  generateGroupInviteCode,
  hashGroupPassword,
  sanitizeGroupForClient,
  verifyGroupPassword,
} from '@/services/group-seed.service';
import { emitToChat, emitToUser } from '@/lib/realtime-emitter';
import { dispatchNotification } from '@/services/notification.service';
import { settleGroupWalletPayment } from '@/services/wallet.service';
import {
  getActiveChatTypingUsers,
  publishChatRealtimeEvent,
  publishUserRealtimeEvent,
  setChatTypingState,
} from '@/lib/firebase/realtime';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ chatId: string }> }
) {
  try {
    await connectDB();
    const { user } = await requireAuth(req);
    const { chatId } = await context.params;
    const chat = await Chat.findById(chatId)
      .populate('participants.userId', 'username firstName lastName avatar verified lastActive')
      .lean();
    if (!chat) throw new NotFoundError('Conversation not found.');

    const uid = String(user._id);
    const mePart = chat.participants.find(
      (p) => String((p.userId as { _id?: unknown })?._id || p.userId) === uid
    );

    const inviteCodeParam = (new URL(req.url).searchParams.get('inviteCode') || '').trim().toUpperCase();
    const safeGroup = sanitizeGroupForClient(chat.group as unknown as Record<string, unknown>);

    if (!mePart) {
      const isPublicGroup =
        chat.type === ChatType.GROUP &&
        chat.group?.status === GroupStatus.ACTIVE &&
        (chat.group?.visibility === GroupVisibility.PUBLIC ||
          (inviteCodeParam && chat.group?.inviteCode?.toUpperCase() === inviteCodeParam));

      if (isPublicGroup) {
        const isPending = (chat.group?.pendingJoinUserIds || []).some((id) => String(id) === uid);
        const isBanned = (chat.group?.bannedUserIds || []).some((id) => String(id) === uid);
        return apiSuccess({
          joinPreview: true,
          membershipStatus: isBanned ? 'banned' : isPending ? 'pending' : 'not_joined',
          chat: {
            id: String(chat._id),
            chatUuid: chat.chatUuid,
            type: chat.type,
            group: safeGroup,
            membersCount: chat.participants.length,
          },
          messages: [],
          pinnedMessages: [],
          activeCall: null,
          typingUsers: [],
        });
      }
      throw new ForbiddenError('You are not a participant in this chat.');
    }

    const q = (new URL(req.url).searchParams.get('q') || '').trim();
    const msgFilter: Record<string, unknown> = {
      chatId: chat._id,
      hiddenForUserIds: { $ne: user._id },
      ...(mePart.clearedAt ? { createdAt: { $gt: mePart.clearedAt } } : {}),
      ...(q ? { content: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {}),
    };

    const pinnedIds = Array.isArray(chat.pinnedMessageIds) ? chat.pinnedMessageIds : [];
    const activeCallCutoff = new Date(Date.now() - 4 * 60 * 1000);
    const isGroupModerator =
      chat.type === ChatType.GROUP && (mePart.role === 'owner' || mePart.role === 'admin');
    const pendingIds = isGroupModerator ? chat.group?.pendingJoinUserIds || [] : [];
    const bannedIds = isGroupModerator ? chat.group?.bannedUserIds || [] : [];

    const [messages, pinnedRaw, activeCall, pendingUsersRaw, bannedUsersRaw] = await Promise.all([
      Message.find(msgFilter)
        .sort({ createdAt: 1 })
        .limit(120)
        .populate('senderId', 'username firstName lastName avatar verified')
        .populate('mediaId')
        .populate({
          path: 'parentId',
          populate: { path: 'senderId', select: 'username firstName lastName' },
        })
        .lean(),
      pinnedIds.length > 0
        ? Message.find({
          _id: { $in: pinnedIds },
          chatId: chat._id,
          isDeleted: false,
          hiddenForUserIds: { $ne: user._id },
        })
          .populate('senderId', 'username firstName lastName avatar verified')
          .populate('mediaId')
          .lean()
        : Promise.resolve([]),
      ChatCall.findOne({
        chatId: chat._id,
        status: { $in: ['ringing', 'active'] },
        lastActivityAt: { $gt: activeCallCutoff },
      })
        .select('_id callUuid audioOnly status initiatorId participants startedAt')
        .lean(),
      pendingIds.length > 0
        ? User.find({ _id: { $in: pendingIds } })
          .select('_id username firstName lastName avatar verified')
          .lean()
        : Promise.resolve([]),
      bannedIds.length > 0
        ? User.find({ _id: { $in: bannedIds } })
          .select('_id username firstName lastName avatar verified')
          .lean()
        : Promise.resolve([]),
    ]);

    return apiSuccess({
      chat: {
        id: String(chat._id),
        chatUuid: chat.chatUuid,
        type: chat.type,
        group: safeGroup,
        isArchived: Boolean(mePart.isArchived),
        isMuted:
          Boolean(mePart.isMuted) &&
          (!mePart.mutedUntil || new Date(mePart.mutedUntil).getTime() > Date.now()),
        mutedUntil: mePart.mutedUntil || null,
        pinnedMessageIds: pinnedIds.map((id) => String(id)),
        pendingJoinUsers: pendingUsersRaw.map((u) => ({
          _id: String(u._id),
          username: u.username,
          firstName: u.firstName,
          lastName: u.lastName,
          avatar: u.avatar,
          verified: Boolean(u.verified),
        })),
        bannedUsers: bannedUsersRaw.map((u) => ({
          _id: String(u._id),
          username: u.username,
          firstName: u.firstName,
          lastName: u.lastName,
          avatar: u.avatar,
          verified: Boolean(u.verified),
        })),
        participants: chat.participants.map((p) => ({
          user: p.userId,
          role: p.role,
          isMuted:
            Boolean(p.isMuted) && (!p.mutedUntil || new Date(p.mutedUntil).getTime() > Date.now()),
          mutedUntil: p.mutedUntil || null,
          lastReadAt: p.lastReadAt,
        })),
      },
      messages: messages.map((m) => ({
        ...m,
        id: String(m._id),
        sender: m.senderId,
        media: m.mediaId ? serializeMedia(m.mediaId as never) : null,
      })),
      pinnedMessages: pinnedRaw.map((m) => ({
        ...m,
        id: String(m._id),
        sender: m.senderId,
        media: m.mediaId ? serializeMedia(m.mediaId as never) : null,
      })),
      activeCall: activeCall
        ? {
          id: String(activeCall._id),
          callUuid: activeCall.callUuid,
          audioOnly: Boolean(activeCall.audioOnly),
          status: activeCall.status,
          initiatorId: String(activeCall.initiatorId),
          participantCount: activeCall.participants?.length || 0,
          startedAt: activeCall.startedAt,
        }
        : null,
      typingUsers: getActiveChatTypingUsers(String(chat._id), String(user._id)),
    });
  } catch (err) {
    return apiError(err);
  }
}

const sendMessageSchema = z.object({
  type: z.nativeEnum(MessageType).default(MessageType.TEXT),
  content: z.string().max(5000).optional(),
  clientTempId: z.string().max(100).optional(),
  mediaId: z.string().optional(),
  gifUrl: z.string().url().optional(),
  stickerUrl: z.string().min(1).max(300).optional(),
  pollQuestion: z.string().trim().min(1).max(300).optional(),
  pollOptions: z.array(z.string().trim().min(1).max(120)).min(2).max(10).optional(),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      label: z.string().max(240).optional(),
    })
    .optional(),
  parentId: z.string().optional(),
  contextRef: z
    .object({
      kind: z.enum(['product', 'job']),
      id: z.string(),
      hashId: z.string().optional(),
      title: z.string(),
      priceLabel: z.string().optional(),
      imageUrl: z.string().optional(),
    })
    .optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ chatId: string }> }
) {
  try {
    const { user } = await requireAuth(req);
    const { chatId } = await context.params;
    const body = sendMessageSchema.parse(await req.json());

    const chat = await Chat.findById(chatId);
    if (!chat) throw new NotFoundError('Conversation not found.');
    const mePart = chat.participants.find((p) => String(p.userId) === String(user._id));
    if (!mePart) throw new ForbiddenError('Not a participant.');

    if (chat.type === ChatType.GROUP && chat.group) {
      if (chat.group.status === GroupStatus.SUSPENDED) {
        throw new ForbiddenError('This group is currently suspended.');
      }
      const stillMuted =
        Boolean(mePart.isMuted) &&
        (!mePart.mutedUntil || new Date(mePart.mutedUntil).getTime() > Date.now());
      if (stillMuted) {
        throw new ForbiddenError('You are muted in this group.');
      }
      if (chat.group.postingMode === 'admins_only' && mePart.role === 'member') {
        throw new ForbiddenError('Only group admins can send messages in this room.');
      }
    }

    if (
      !body.content?.trim() &&
      !body.mediaId &&
      !body.gifUrl &&
      !body.stickerUrl &&
      !(body.pollQuestion && body.pollOptions?.length) &&
      !body.location
    ) {
      throw new ValidationError('Message content, GIF, sticker, poll, location, or attachment is required.');
    }

    const urls = body.content ? extractUrls(body.content) : [];
    const linkSnapshot =
      urls.length > 0 && !body.mediaId && !body.gifUrl && !body.stickerUrl
        ? await fetchLinkSnapshot(urls[0])
        : null;

    let resolvedMediaId = body.mediaId ? new Types.ObjectId(body.mediaId) : null;
    let resolvedType = body.type;
    let stickerUrl: string | null = null;
    let pollPayload:
      | { question: string; options: Array<{ id: string; text: string; voterIds: Types.ObjectId[] }> }
      | null = null;
    let locationPayload: { lat: number; lng: number; label?: string } | null = null;

    if (body.stickerUrl) {
      if (!isValidStickerUrl(body.stickerUrl)) {
        throw new ValidationError('Invalid sticker asset selected.');
      }
      stickerUrl = body.stickerUrl.trim();
      resolvedType = MessageType.STICKER;
    } else if (body.pollQuestion && body.pollOptions && body.pollOptions.length >= 2) {
      const cleanedOptions = body.pollOptions
        .map((opt) => opt.trim())
        .filter(Boolean)
        .slice(0, 10);
      if (cleanedOptions.length < 2) {
        throw new ValidationError('A poll requires at least 2 choices.');
      }
      pollPayload = {
        question: body.pollQuestion.trim(),
        options: cleanedOptions.map((text, idx) => ({
          id: `opt-${idx + 1}-${crypto.randomBytes(3).toString('hex')}`,
          text,
          voterIds: [],
        })),
      };
      resolvedType = MessageType.POLL;
    } else if (body.location) {
      locationPayload = {
        lat: body.location.lat,
        lng: body.location.lng,
        label: body.location.label?.trim() || '',
      };
      resolvedType = MessageType.LOCATION;
    } else if (body.gifUrl && !resolvedMediaId) {
      const gifMedia = await Media.create({
        ownerId: user._id,
        targetType: 'message',
        externalUrl: body.gifUrl,
        type: MediaType.GIF,
        status: 'processed',
        storageProvider: 'external',
        mime: 'image/gif',
        extension: 'gif',
      });
      resolvedMediaId = gifMedia._id;
      resolvedType = MessageType.GIF;
    }

    let cleanContent = body.content?.trim() || null;
    if (cleanContent) {
      const censored = await enforceCensorForUser({
        text: cleanContent,
        userId: String(user._id),
        email: user.email || '',
        ipAddress: user.ipAddress || '0.0.0.0',
      });
      cleanContent = censored.cleanText;
    }

    const msg = await Message.create({
      chatId: chat._id,
      chatUuid: chat.chatUuid,
      senderId: user._id,
      parentId: body.parentId ? new Types.ObjectId(body.parentId) : null,
      type: resolvedType,
      content: cleanContent,
      mediaId: resolvedMediaId,
      stickerUrl,
      poll: pollPayload,
      location: locationPayload,
      linkSnapshot,
      contextRef: body.contextRef || null,
      deliveredTo: [user._id],
      readBy: [user._id],
    });

    if (resolvedMediaId) {
      await Media.updateOne(
        { _id: resolvedMediaId, ownerId: user._id },
        { $set: { targetType: 'message', targetId: msg._id } }
      );
    }

    const preview =
      cleanContent ||
      (resolvedType === MessageType.STICKER
        ? 'Sticker'
        : resolvedType === MessageType.POLL
          ? `Poll: ${pollPayload?.question || ''}`
          : resolvedType === MessageType.LOCATION
            ? locationPayload?.label || 'Shared location'
            : resolvedType === MessageType.GIF
              ? 'GIF'
              : resolvedType === MessageType.IMAGE
                ? 'Photo'
                : resolvedType === MessageType.AUDIO
                  ? 'Voice message'
                  : resolvedType === MessageType.VIDEO_CIRCLE
                    ? 'Video message'
                    : 'Attachment');

    chat.lastMessageId = msg._id;
    chat.lastMessagePreview = preview.slice(0, 120);
    chat.lastActivity = new Date();
    chat.participants = chat.participants.map((p) => ({
      ...p,
      isHidden: false,
    }));
    await chat.save();

    const populatedMsg = await Message.findById(msg._id)
      .populate('senderId', 'username firstName lastName avatar verified')
      .populate('mediaId')
      .populate({
        path: 'parentId',
        populate: { path: 'senderId', select: 'username firstName lastName' },
      })
      .lean();

    const payload = {
      ...populatedMsg,
      id: String(msg._id),
      clientTempId: body.clientTempId || undefined,
      sender: populatedMsg?.senderId,
      media: populatedMsg?.mediaId ? serializeMedia(populatedMsg.mediaId as never) : null,
    };

    // Fast-path: Fire background realtime broadcasting, typing reset, and push notifications
    // in parallel with Promise.allSettled without blocking the HTTP response.
    void (async () => {
      try {
        await Promise.allSettled([
          emitToChat(String(chat._id), 'chat:message:received', {
            chatId: String(chat._id),
            message: payload,
          }),
          publishChatRealtimeEvent(String(chat._id), 'message', {
            lastMessageId: String(msg._id),
            lastSenderId: String(user._id),
          }),
          setChatTypingState({
            chatId: String(chat._id),
            userId: String(user._id),
            username: user.username,
            firstName: user.firstName || user.username,
            avatar: user.avatar || '/assets/avatars/default-avatar.png',
            typing: false,
          }),
        ]);

        const otherParticipants = chat.participants.filter(
          (p) => String(p.userId) !== String(user._id)
        );

        await Promise.allSettled(
          otherParticipants.flatMap((p) => [
            emitToUser(String(p.userId), 'chat:inbox:update', {
              chatId: String(chat._id),
              lastMessagePreview: chat.lastMessagePreview,
            }),
            publishUserRealtimeEvent(String(p.userId), 'chat:inbox:update', {
              chatId: String(chat._id),
              lastMessagePreview: chat.lastMessagePreview,
            }),
            dispatchNotification({
              recipientId: p.userId,
              actorId: user._id,
              type: 'CHAT_MESSAGE',
              preferenceKey: 'directMessages',
              title:
                chat.type === ChatType.GROUP
                  ? chat.group?.name || 'Group Message'
                  : `@${user.username}`,
              message: preview,
              actionUrl: `/messenger/c/${chat._id}`,
              data: { chatId: String(chat._id), senderId: String(user._id) },
            }),
          ])
        );
      } catch (err) {
        console.error('Background message delivery error:', err);
      }
    })();

    return apiSuccess(payload, undefined, 201);
  } catch (err) {
    return apiError(err);
  }
}

const patchChatSchema = z.object({
  action: z.enum([
    'read',
    'archive',
    'unarchive',
    'clear',
    'hide',
    'update_group',
    'remove_participant',
    'leave_group',
    'invite_respond',
    'invite_send',
    'pin_message',
    'unpin_message',
    'forward_message',
    'join_group',
    'cancel_join_request',
    'approve_join',
    'reject_join',
    'set_role',
    'mute_participant',
    'ban_participant',
    'unban_participant',
    'tip_group_owner',
  ]),
  lastReadMessageId: z.string().optional(),
  messageId: z.string().optional(),
  targetChatIds: z.array(z.string()).optional(),
  groupName: z.string().optional(),
  groupDescription: z.string().optional(),
  groupAvatar: z.string().optional(),
  groupCover: z.string().nullable().optional(),
  category: z.string().optional(),
  visibility: z.nativeEnum(GroupVisibility).optional(),
  privacy: z.nativeEnum(GroupPrivacy).optional(),
  postingMode: z.enum(['everyone', 'admins_only']).optional(),
  requiresApproval: z.boolean().optional(),
  password: z.string().max(64).optional(),
  clearPassword: z.boolean().optional(),
  isPaid: z.boolean().optional(),
  entryPrice: z.number().min(0).max(10000000).optional(),
  monetizationNote: z.string().max(240).optional(),
  payFromWallet: z.boolean().optional(),
  tipAmount: z.number().min(50).max(10000000).optional(),
  tipCurrency: z.string().max(8).optional(),
  tipMessage: z.string().max(160).optional(),
  regenerateInviteCode: z.boolean().optional(),
  inviteCode: z.string().optional(),
  role: z.enum(['owner', 'admin', 'member']).optional(),
  muted: z.boolean().optional(),
  durationMinutes: z.number().int().min(1).max(43200).optional(),
  targetUserId: z.string().optional(),
  accept: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ chatId: string }> }
) {
  try {
    const { user } = await requireAuth(req);
    const { chatId } = await context.params;
    const body = patchChatSchema.parse(await req.json());
    const chat = await Chat.findById(chatId);
    if (!chat) throw new NotFoundError('Conversation not found.');

    const uid = String(user._id);

    if (body.action === 'join_group') {
      if (chat.type !== ChatType.GROUP || !chat.group) {
        throw new ValidationError('This conversation is not a group.');
      }
      if (chat.group.status === GroupStatus.SUSPENDED) {
        throw new ForbiddenError('This group is currently suspended.');
      }
      if ((chat.group.bannedUserIds || []).some((id) => String(id) === uid)) {
        throw new ForbiddenError('You are banned from joining this group.');
      }
      if (chat.participants.some((p) => String(p.userId) === uid)) {
        return apiSuccess({ joined: true, status: 'member' });
      }
      const codeMatches =
        Boolean(body.inviteCode) &&
        chat.group.inviteCode?.toUpperCase() === body.inviteCode?.trim().toUpperCase();
      if (chat.group.visibility !== GroupVisibility.PUBLIC && !codeMatches) {
        throw new ForbiddenError('This group is private and requires an invite.');
      }
      if (chat.group.isPasswordProtected) {
        if (!body.password || !verifyGroupPassword(body.password, chat.group.passwordHash)) {
          throw new ForbiddenError('Incorrect group password.');
        }
      }
      if (chat.group.requiresApproval && !codeMatches) {
        const alreadyPending = (chat.group.pendingJoinUserIds || []).some((id) => String(id) === uid);
        if (!alreadyPending) {
          chat.group.pendingJoinUserIds = [...(chat.group.pendingJoinUserIds || []), user._id];
          await chat.save();
          if (chat.group.ownerId) {
            await dispatchNotification({
              recipientId: chat.group.ownerId,
              actorId: user._id,
              type: 'GROUP_INVITE',
              title: 'Group Join Request',
              message: `@${user.username} requested to join ${chat.group.name}.`,
              actionUrl: `/messenger/c/${chat._id}`,
            });
          }
        }
        return apiSuccess({ joined: false, pending: true, status: 'pending' });
      }

      const entryPrice = Number(chat.group.entryPrice || 0);
      const isPaidGroup = Boolean(chat.group.isPaid && entryPrice > 0);
      const alreadyPaid =
        String(chat.group.ownerId) === uid ||
        (chat.group.paidMemberUserIds || []).some((id) => String(id) === uid);

      if (isPaidGroup && !alreadyPaid) {
        if (!body.payFromWallet) {
          throw new ValidationError(
            `This paid group requires an entry fee of NGN ${entryPrice.toLocaleString()}. Confirm wallet payment to join.`
          );
        }
        const settlement = await settleGroupWalletPayment({
          payerId: uid,
          ownerId: String(chat.group.ownerId),
          chatId: String(chat._id),
          groupName: chat.group.name || 'Group',
          amount: entryPrice,
          kind: 'group_entry',
          idempotencyKey: `grp_entry_${chat._id}_${uid}`,
        });
        chat.group.paidMemberUserIds = [...(chat.group.paidMemberUserIds || []), user._id];
        if (!settlement.skippedOwnGroup) {
          chat.group.revenueTotal = Number(((chat.group.revenueTotal || 0) + entryPrice).toFixed(2));
        }
      }

      chat.participants.push({
        userId: user._id,
        role: 'member',
        isArchived: false,
        isHidden: false,
        joinedAt: new Date(),
      });
      chat.group.pendingJoinUserIds = (chat.group.pendingJoinUserIds || []).filter(
        (id) => String(id) !== uid
      );
      await chat.save();
      await emitToChat(String(chat._id), 'chat:inbox:update', { chatId: String(chat._id) });
      return apiSuccess({ joined: true, status: 'member' });
    }

    if (body.action === 'cancel_join_request' && chat.group) {
      chat.group.pendingJoinUserIds = (chat.group.pendingJoinUserIds || []).filter(
        (id) => String(id) !== uid
      );
      await chat.save();
      return apiSuccess({ cancelled: true });
    }

    if (body.action === 'invite_respond') {
      const invite = await ChatInvite.findOne({
        chatId: chat._id,
        receiverId: user._id,
        status: ChatInviteStatus.PENDING,
      });
      if (!invite) throw new NotFoundError('Group invitation not found.');
      if (body.accept) {
        invite.status = ChatInviteStatus.ACCEPTED;
        await invite.save();
        if (!chat.participants.some((p) => String(p.userId) === uid)) {
          chat.participants.push({
            userId: user._id,
            role: 'member',
            isArchived: false,
            isHidden: false,
            joinedAt: new Date(),
          });
          await chat.save();
        }
      } else {
        invite.status = ChatInviteStatus.DECLINED;
        await invite.save();
      }
      return apiSuccess({ accepted: Boolean(body.accept) });
    }

    const meIndex = chat.participants.findIndex((p) => String(p.userId) === uid);
    if (meIndex === -1) throw new ForbiddenError('Not a participant.');
    const myRole = chat.participants[meIndex].role;
    const isOwner = myRole === 'owner' || String(chat.group?.ownerId) === uid;
    const isAdminOrOwner = isOwner || myRole === 'admin';

    if (body.action === 'read') {
      await Message.updateMany(
        { chatId: chat._id, readBy: { $ne: user._id } },
        { $addToSet: { readBy: user._id, deliveredTo: user._id } }
      );
      chat.participants[meIndex].lastReadAt = new Date();
      if (body.lastReadMessageId) {
        chat.participants[meIndex].lastReadMessageId = new Types.ObjectId(body.lastReadMessageId);
      }
      await chat.save();
      await emitToChat(String(chat._id), 'chat:message:read', {
        chatId: String(chat._id),
        userId: String(user._id),
        lastReadMessageId: body.lastReadMessageId,
      });
      publishChatRealtimeEvent(String(chat._id), 'read', {
        lastReadByUserId: String(user._id),
      });
    } else if (body.action === 'archive' || body.action === 'unarchive') {
      chat.participants[meIndex].isArchived = body.action === 'archive';
      await chat.save();
      void emitToUser(uid, 'chat:inbox:update', { chatId: String(chat._id) });
      publishUserRealtimeEvent(uid, 'chat:inbox:update', { chatId: String(chat._id) });
      return apiSuccess({ isArchived: chat.participants[meIndex].isArchived });
    } else if (body.action === 'hide') {
      chat.participants[meIndex].isHidden = true;
      await chat.save();
    } else if (body.action === 'clear') {
      chat.participants[meIndex].clearedAt = new Date();
      await chat.save();
    } else if (body.action === 'leave_group' && chat.type === ChatType.GROUP) {
      if (isOwner) {
        throw new ForbiddenError('Group owner cannot leave without deleting or transferring ownership.');
      }
      if (chat.group?.unleavable) {
        throw new ForbiddenError('This mandatory community group cannot be left.');
      }
      chat.participants.splice(meIndex, 1);
      await chat.save();
    } else if (body.action === 'update_group' && chat.type === ChatType.GROUP && chat.group) {
      if (!isAdminOrOwner) {
        throw new ForbiddenError('Only group admins or owners can update group settings.');
      }
      if (body.groupName?.trim()) chat.group.name = body.groupName.trim().slice(0, 80);
      if (body.groupDescription !== undefined) {
        chat.group.description = body.groupDescription.trim().slice(0, 500);
      }
      if (body.groupAvatar) chat.group.avatar = body.groupAvatar.trim();
      if (body.groupCover !== undefined) chat.group.coverImage = body.groupCover;
      if (body.category?.trim()) chat.group.category = body.category.trim().slice(0, 40);
      if (body.visibility) chat.group.visibility = body.visibility;
      if (body.privacy) chat.group.privacy = body.privacy;
      if (body.postingMode) chat.group.postingMode = body.postingMode;
      if (body.requiresApproval !== undefined) {
        chat.group.requiresApproval = body.requiresApproval;
      }
      if (body.clearPassword) {
        chat.group.isPasswordProtected = false;
        chat.group.passwordHash = null;
      } else if (body.password?.trim()) {
        chat.group.isPasswordProtected = true;
        chat.group.passwordHash = hashGroupPassword(body.password.trim());
      }
      if (body.isPaid !== undefined || body.entryPrice !== undefined) {
        const nextPrice = Math.max(0, Number(body.entryPrice ?? chat.group.entryPrice ?? 0));
        const nextPaid = body.isPaid !== undefined ? Boolean(body.isPaid && nextPrice > 0) : Boolean(chat.group.isPaid && nextPrice > 0);
        chat.group.isPaid = nextPaid;
        chat.group.entryPrice = nextPaid ? Number(nextPrice.toFixed(2)) : 0;
      }
      if (body.monetizationNote !== undefined) {
        chat.group.monetizationNote = body.monetizationNote.trim().slice(0, 240);
      }
      if (body.regenerateInviteCode) {
        chat.group.inviteCode = generateGroupInviteCode(chat.group.name);
      }
      await chat.save();
      await emitToChat(String(chat._id), 'chat:inbox:update', { chatId: String(chat._id) });
    } else if (body.action === 'tip_group_owner' && chat.type === ChatType.GROUP && chat.group) {
      if (!body.tipAmount || body.tipAmount <= 0) {
        throw new ValidationError('Tip amount must be positive.');
      }
      const ownerId = String(chat.group.ownerId);
      if (ownerId === uid) {
        throw new ValidationError('You cannot tip your own group.');
      }
      const settlement = await settleGroupWalletPayment({
        payerId: uid,
        ownerId,
        chatId: String(chat._id),
        groupName: chat.group.name || 'Group',
        amount: body.tipAmount,
        kind: 'group_tip',
        currency: body.tipCurrency?.trim().toUpperCase(),
        note: body.tipMessage?.trim(),
      });
      chat.group.revenueTotal = Number(((chat.group.revenueTotal || 0) + body.tipAmount).toFixed(2));
      const tipMsg = await Message.create({
        chatId: chat._id,
        chatUuid: chat.chatUuid,
        senderId: user._id,
        type: MessageType.SYSTEM,
        content: `@${user.username} supported this group with ${settlement.gross.toLocaleString()} ${settlement.currency || 'NGN'}${body.tipMessage?.trim() ? ` — "${body.tipMessage.trim()}"` : ''}`,
        deliveredTo: [user._id],
        readBy: [user._id],
      });
      chat.lastMessageId = tipMsg._id;
      chat.lastMessagePreview = tipMsg.content;
      chat.lastActivity = new Date();
      await chat.save();
      await emitToChat(String(chat._id), 'chat:message:new', { chatId: String(chat._id), messageId: String(tipMsg._id) });
      await emitToChat(String(chat._id), 'chat:inbox:update', { chatId: String(chat._id) });
    } else if (body.action === 'set_role' && chat.type === ChatType.GROUP && chat.group && body.targetUserId && body.role) {
      if (!isOwner) {
        throw new ForbiddenError('Only the group owner can manage admin roles.');
      }
      const targetPart = chat.participants.find((p) => String(p.userId) === body.targetUserId);
      if (!targetPart) throw new NotFoundError('Participant not found.');
      if (body.role === 'owner') {
        chat.participants[meIndex].role = 'admin';
        targetPart.role = 'owner';
        chat.group.ownerId = new Types.ObjectId(body.targetUserId);
      } else if (body.targetUserId !== uid) {
        targetPart.role = body.role;
      }
      await chat.save();
    } else if (body.action === 'mute_participant' && chat.type === ChatType.GROUP && body.targetUserId) {
      if (!isAdminOrOwner) {
        throw new ForbiddenError('Only group admins can mute members.');
      }
      const targetPart = chat.participants.find((p) => String(p.userId) === body.targetUserId);
      if (!targetPart) throw new NotFoundError('Participant not found.');
      if (targetPart.role === 'owner') {
        throw new ForbiddenError('Group owner cannot be muted.');
      }
      const nextMuted = body.muted !== false;
      targetPart.isMuted = nextMuted;
      targetPart.mutedUntil =
        nextMuted && body.durationMinutes
          ? new Date(Date.now() + body.durationMinutes * 60 * 1000)
          : null;
      await chat.save();
    } else if (body.action === 'ban_participant' && chat.type === ChatType.GROUP && chat.group && body.targetUserId) {
      if (!isAdminOrOwner) {
        throw new ForbiddenError('Only group admins can ban members.');
      }
      const targetPart = chat.participants.find((p) => String(p.userId) === body.targetUserId);
      if (targetPart?.role === 'owner') {
        throw new ForbiddenError('Group owner cannot be banned.');
      }
      chat.participants = chat.participants.filter((p) => String(p.userId) !== body.targetUserId);
      const bannedOid = new Types.ObjectId(body.targetUserId);
      if (!(chat.group.bannedUserIds || []).some((id) => String(id) === body.targetUserId)) {
        chat.group.bannedUserIds = [...(chat.group.bannedUserIds || []), bannedOid];
      }
      await chat.save();
    } else if (body.action === 'unban_participant' && chat.type === ChatType.GROUP && chat.group && body.targetUserId) {
      if (!isAdminOrOwner) {
        throw new ForbiddenError('Only group admins can unban users.');
      }
      chat.group.bannedUserIds = (chat.group.bannedUserIds || []).filter(
        (id) => String(id) !== body.targetUserId
      );
      await chat.save();
    } else if (body.action === 'approve_join' && chat.type === ChatType.GROUP && chat.group && body.targetUserId) {
      if (!isAdminOrOwner) {
        throw new ForbiddenError('Only group admins can approve join requests.');
      }
      chat.group.pendingJoinUserIds = (chat.group.pendingJoinUserIds || []).filter(
        (id) => String(id) !== body.targetUserId
      );
      if (!chat.participants.some((p) => String(p.userId) === body.targetUserId)) {
        chat.participants.push({
          userId: new Types.ObjectId(body.targetUserId),
          role: 'member',
          isArchived: false,
          isHidden: false,
          joinedAt: new Date(),
        });
      }
      await chat.save();
      await dispatchNotification({
        recipientId: body.targetUserId,
        actorId: user._id,
        type: 'GROUP_INVITE',
        title: 'Join Request Approved',
        message: `You were approved to join ${chat.group.name}.`,
        actionUrl: `/messenger/c/${chat._id}`,
      });
    } else if (body.action === 'reject_join' && chat.type === ChatType.GROUP && chat.group && body.targetUserId) {
      if (!isAdminOrOwner) {
        throw new ForbiddenError('Only group admins can review join requests.');
      }
      chat.group.pendingJoinUserIds = (chat.group.pendingJoinUserIds || []).filter(
        (id) => String(id) !== body.targetUserId
      );
      await chat.save();
    } else if (body.action === 'remove_participant' && chat.type === ChatType.GROUP && body.targetUserId) {
      const targetPart = chat.participants.find((p) => String(p.userId) === body.targetUserId);
      if (!isAdminOrOwner || targetPart?.role === 'owner' || (!isOwner && targetPart?.role === 'admin')) {
        throw new ForbiddenError('Insufficient permissions to remove this participant.');
      }
      chat.participants = chat.participants.filter((p) => String(p.userId) !== body.targetUserId);
      await chat.save();
    } else if (body.action === 'invite_send' && chat.type === ChatType.GROUP && body.targetUserId) {
      await ChatInvite.updateOne(
        {
          chatId: chat._id,
          receiverId: new Types.ObjectId(body.targetUserId),
          senderId: user._id,
        },
        {
          $set: {
            status: ChatInviteStatus.PENDING,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        },
        { upsert: true }
      );
      await dispatchNotification({
        recipientId: body.targetUserId,
        actorId: user._id,
        type: 'GROUP_INVITE',
        title: 'Group Invitation',
        message: `@${user.username} invited you to ${chat.group?.name || 'a group'}.`,
        actionUrl: '/messenger',
      });
    } else if (body.action === 'pin_message' && body.messageId) {
      const targetMsg = await Message.findOne({
        _id: body.messageId,
        chatId: chat._id,
        isDeleted: false,
      });
      if (!targetMsg) throw new NotFoundError('Message not found.');
      await Chat.updateOne(
        { _id: chat._id },
        { $addToSet: { pinnedMessageIds: targetMsg._id } }
      );
      await emitToChat(String(chat._id), 'chat:pinned:updated', { chatId: String(chat._id) });
      publishChatRealtimeEvent(String(chat._id), 'pinned', { messageId: body.messageId });
    } else if (body.action === 'unpin_message' && body.messageId) {
      await Chat.updateOne(
        { _id: chat._id },
        { $pull: { pinnedMessageIds: new Types.ObjectId(body.messageId) } }
      );
      await emitToChat(String(chat._id), 'chat:pinned:updated', { chatId: String(chat._id) });
      publishChatRealtimeEvent(String(chat._id), 'unpinned', { messageId: body.messageId });
    } else if (body.action === 'forward_message' && body.messageId && Array.isArray(body.targetChatIds)) {
      const sourceMsg = await Message.findOne({
        _id: body.messageId,
        chatId: chat._id,
        isDeleted: false,
      }).lean();
      if (!sourceMsg) throw new NotFoundError('Source message not found.');

      const targetIds = body.targetChatIds
        .filter((id) => Types.ObjectId.isValid(id))
        .slice(0, 10);
      let forwardedCount = 0;

      for (const targetId of targetIds) {
        const destChat = await Chat.findById(targetId);
        if (!destChat) continue;
        const isDestMember = destChat.participants.some((p) => String(p.userId) === String(user._id));
        if (!isDestMember) continue;

        const fwdMsg = await Message.create({
          chatId: destChat._id,
          chatUuid: destChat.chatUuid,
          senderId: user._id,
          forwardedFromId: sourceMsg._id,
          type: sourceMsg.type,
          content: sourceMsg.content || null,
          mediaId: sourceMsg.mediaId || null,
          stickerUrl: sourceMsg.stickerUrl || null,
          location: sourceMsg.location || null,
          linkSnapshot: sourceMsg.linkSnapshot || null,
          deliveredTo: [user._id],
          readBy: [user._id],
        });

        const preview =
          sourceMsg.content?.trim() ||
          (sourceMsg.type === MessageType.STICKER
            ? 'Forwarded sticker'
            : sourceMsg.type === MessageType.LOCATION
              ? 'Forwarded location'
              : 'Forwarded message');
        destChat.lastMessageId = fwdMsg._id;
        destChat.lastMessagePreview = preview.slice(0, 120);
        destChat.lastActivity = new Date();
        destChat.participants = destChat.participants.map((p) => ({
          ...p,
          isHidden: false,
        }));
        await destChat.save();

        await emitToChat(String(destChat._id), 'chat:message:received', { chatId: String(destChat._id) });
        publishChatRealtimeEvent(String(destChat._id), 'message', { lastMessageId: String(fwdMsg._id) });
        for (const p of destChat.participants) {
          if (String(p.userId) === String(user._id)) continue;
          await emitToUser(String(p.userId), 'chat:inbox:update', {
            chatId: String(destChat._id),
            lastMessagePreview: destChat.lastMessagePreview,
          });
          publishUserRealtimeEvent(String(p.userId), 'chat:inbox:update', {
            chatId: String(destChat._id),
          });
        }
        forwardedCount += 1;
      }

      return apiSuccess({ forwarded: forwardedCount });
    }

    return apiSuccess({ updated: true });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ chatId: string }> }
) {
  try {
    const { user } = await requireAuth(req);
    const { chatId } = await context.params;
    const chat = await Chat.findById(chatId);
    if (!chat) throw new NotFoundError('Chat not found.');

    if (chat.type === ChatType.GROUP && String(chat.group?.ownerId) === String(user._id)) {
      await Message.deleteMany({ chatId: chat._id });
      await ChatInvite.deleteMany({ chatId: chat._id });
      await Chat.deleteOne({ _id: chat._id });
      return apiSuccess({ deleted: true });
    }

    await Chat.updateOne(
      { _id: chat._id, 'participants.userId': user._id },
      { $set: { 'participants.$.isHidden': true, 'participants.$.clearedAt': new Date() } }
    );
    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
