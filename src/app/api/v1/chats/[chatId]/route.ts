import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, ForbiddenError, NotFoundError, ValidationError } from '@/lib/api-response';
import { Chat, ChatInvite, Message } from '@/models/Messaging';
import { Media } from '@/models/Media';
import { ChatInviteStatus, ChatType, MediaType, MessageType } from '@/types/enums';
import { extractUrls } from '@/lib/utils';
import { fetchLinkSnapshot } from '@/services/link-preview.service';
import { serializeMedia } from '@/services/media.service';
import { emitToChat, emitToUser } from '@/lib/realtime-emitter';
import { dispatchNotification } from '@/services/notification.service';
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

    const mePart = chat.participants.find(
      (p) => String((p.userId as { _id?: unknown })?._id || p.userId) === String(user._id)
    );
    if (!mePart) throw new ForbiddenError('You are not a participant in this chat.');

    const q = (new URL(req.url).searchParams.get('q') || '').trim();
    const msgFilter: Record<string, unknown> = {
      chatId: chat._id,
      hiddenForUserIds: { $ne: user._id },
      ...(mePart.clearedAt ? { createdAt: { $gt: mePart.clearedAt } } : {}),
      ...(q ? { content: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {}),
    };

    const messages = await Message.find(msgFilter)
      .sort({ createdAt: 1 })
      .limit(100)
      .populate('senderId', 'username firstName lastName avatar verified')
      .populate('mediaId')
      .populate({
        path: 'parentId',
        populate: { path: 'senderId', select: 'username firstName lastName' },
      })
      .lean();

    return apiSuccess({
      chat: {
        id: String(chat._id),
        chatUuid: chat.chatUuid,
        type: chat.type,
        group: chat.group,
        isArchived: Boolean(mePart.isArchived),
        participants: chat.participants.map((p) => ({
          user: p.userId,
          role: p.role,
          lastReadAt: p.lastReadAt,
        })),
      },
      messages: messages.map((m) => ({
        ...m,
        id: String(m._id),
        sender: m.senderId,
        media: m.mediaId ? serializeMedia(m.mediaId as never) : null,
      })),
      typingUsers: getActiveChatTypingUsers(String(chat._id), String(user._id)),
    });
  } catch (err) {
    return apiError(err);
  }
}

const sendMessageSchema = z.object({
  type: z.nativeEnum(MessageType).default(MessageType.TEXT),
  content: z.string().max(5000).optional(),
  mediaId: z.string().optional(),
  gifUrl: z.string().url().optional(),
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
    const isMember = chat.participants.some((p) => String(p.userId) === String(user._id));
    if (!isMember) throw new ForbiddenError('Not a participant.');

    if (!body.content?.trim() && !body.mediaId && !body.gifUrl) {
      throw new ValidationError('Message content, GIF, or attachment is required.');
    }

    const urls = body.content ? extractUrls(body.content) : [];
    const linkSnapshot =
      urls.length > 0 && !body.mediaId && !body.gifUrl ? await fetchLinkSnapshot(urls[0]) : null;

    let resolvedMediaId = body.mediaId ? new Types.ObjectId(body.mediaId) : null;
    let resolvedType = body.type;

    if (body.gifUrl && !resolvedMediaId) {
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

    const msg = await Message.create({
      chatId: chat._id,
      chatUuid: chat.chatUuid,
      senderId: user._id,
      parentId: body.parentId ? new Types.ObjectId(body.parentId) : null,
      type: resolvedType,
      content: body.content?.trim() || null,
      mediaId: resolvedMediaId,
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
      body.content?.trim() ||
      (resolvedType === MessageType.GIF
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
      sender: populatedMsg?.senderId,
      media: populatedMsg?.mediaId ? serializeMedia(populatedMsg.mediaId as never) : null,
    };

    await setChatTypingState({
      chatId: String(chat._id),
      userId: String(user._id),
      username: user.username,
      firstName: user.firstName || user.username,
      avatar: user.avatar || '/assets/avatars/default-avatar.png',
      typing: false,
    });

    await emitToChat(String(chat._id), 'chat:message:received', {
      chatId: String(chat._id),
      message: payload,
    });
    publishChatRealtimeEvent(String(chat._id), 'message', {
      lastMessageId: String(msg._id),
      lastSenderId: String(user._id),
    });

    for (const p of chat.participants) {
      if (String(p.userId) === String(user._id)) continue;
      await emitToUser(String(p.userId), 'chat:inbox:update', {
        chatId: String(chat._id),
        lastMessagePreview: chat.lastMessagePreview,
      });
      publishUserRealtimeEvent(String(p.userId), 'chat:inbox:update', {
        chatId: String(chat._id),
        lastMessagePreview: chat.lastMessagePreview,
      });
      await dispatchNotification({
        recipientId: p.userId,
        actorId: user._id,
        type: 'CHAT_MESSAGE',
        preferenceKey: 'directMessages',
        title: chat.type === ChatType.GROUP ? chat.group?.name || 'Group Message' : `@${user.username}`,
        message: preview,
        actionUrl: `/messenger/c/${chat._id}`,
        data: { chatId: String(chat._id), senderId: String(user._id) },
      });
    }

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
  ]),
  lastReadMessageId: z.string().optional(),
  groupName: z.string().optional(),
  groupDescription: z.string().optional(),
  groupAvatar: z.string().optional(),
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
        if (!chat.participants.some((p) => String(p.userId) === String(user._id))) {
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

    const meIndex = chat.participants.findIndex((p) => String(p.userId) === String(user._id));
    if (meIndex === -1) throw new ForbiddenError('Not a participant.');

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
    } else if (body.action === 'hide') {
      chat.participants[meIndex].isHidden = true;
      await chat.save();
    } else if (body.action === 'clear') {
      chat.participants[meIndex].clearedAt = new Date();
      await chat.save();
    } else if (body.action === 'leave_group' && chat.type === ChatType.GROUP) {
      if (chat.participants[meIndex].role === 'owner') {
        throw new ForbiddenError('Group owner cannot leave without deleting or transferring ownership.');
      }
      chat.participants.splice(meIndex, 1);
      await chat.save();
    } else if (body.action === 'update_group' && chat.type === ChatType.GROUP && chat.group) {
      if (String(chat.group.ownerId) !== String(user._id)) {
        throw new ForbiddenError('Only the group owner can update group settings.');
      }
      if (body.groupName) chat.group.name = body.groupName.trim();
      if (body.groupDescription !== undefined) chat.group.description = body.groupDescription.trim();
      if (body.groupAvatar) chat.group.avatar = body.groupAvatar;
      await chat.save();
    } else if (body.action === 'remove_participant' && chat.type === ChatType.GROUP && body.targetUserId) {
      if (String(chat.group?.ownerId) !== String(user._id)) {
        throw new ForbiddenError('Only group owner can remove participants.');
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
