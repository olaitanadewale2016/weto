import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, ForbiddenError, NotFoundError } from '@/lib/api-response';
import { StoryFrame, StoryView } from '@/models/Story';
import { Chat, Message } from '@/models/Messaging';
import { ChatType, MessageType, UserRole } from '@/types/enums';
import { deleteMediaRecord } from '@/services/media.service';
import { emitToChat, emitToUser } from '@/lib/realtime-emitter';
import { publishChatRealtimeEvent, publishUserRealtimeEvent } from '@/lib/firebase/realtime';
import { dispatchNotification } from '@/services/notification.service';
import { isStoryExpired } from '@/services/story-expiration.service';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ frameId: string }> }
) {
  try {
    const { user } = await requireAuth(req);
    const { frameId } = await context.params;
    const frame = await StoryFrame.findById(frameId);
    if (!frame || isStoryExpired(frame)) {
      throw new NotFoundError('Story frame not found or has expired.');
    }

    if (String(frame.userId) !== String(user._id) && user.role !== UserRole.ROOT) {
      throw new ForbiddenError('Only the story owner can inspect viewers.');
    }

    const views = await StoryView.find({ storyFrameId: frame._id })
      .sort({ viewedAt: -1 })
      .populate('userId', 'username firstName lastName avatar verified')
      .lean();

    return apiSuccess(
      views.map((v) => ({
        user: v.userId,
        reaction: v.reaction,
        viewedAt: v.viewedAt,
      }))
    );
  } catch (err) {
    return apiError(err);
  }
}

const storyActionSchema = z.object({
  action: z.enum(['view', 'react', 'reply']),
  reaction: z.string().max(16).optional(),
  replyText: z.string().min(1).max(1000).optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ frameId: string }> }
) {
  try {
    const { user } = await requireAuth(req);
    const { frameId } = await context.params;
    const body = storyActionSchema.parse(await req.json());
    const frame = await StoryFrame.findById(frameId);
    if (!frame || isStoryExpired(frame)) {
      throw new NotFoundError('Story frame not found or has expired.');
    }

    if (body.action === 'view' || body.action === 'react') {
      const existing = await StoryView.findOne({ storyFrameId: frame._id, userId: user._id });
      if (!existing) {
        await StoryView.create({
          storyFrameId: frame._id,
          userId: user._id,
          reaction: body.reaction || null,
          viewedAt: new Date(),
        });
        await StoryFrame.updateOne({ _id: frame._id }, { $inc: { viewsCount: 1 } });
      } else if (body.reaction) {
        existing.reaction = body.reaction;
        await existing.save();
      }
      return apiSuccess({ recorded: true });
    }

    if (body.action === 'reply' && body.replyText) {
      let chat = await Chat.findOne({
        type: ChatType.DIRECT,
        'participants.userId': { $all: [user._id, frame.userId] },
      });
      if (!chat) {
        chat = await Chat.create({
          chatUuid: crypto.randomUUID(),
          type: ChatType.DIRECT,
          participants: [
            { userId: user._id, role: 'member' },
            { userId: frame.userId, role: 'member' },
          ],
          lastActivity: new Date(),
        });
      }

      const msg = await Message.create({
        chatId: chat._id,
        chatUuid: chat.chatUuid,
        senderId: user._id,
        type: MessageType.TEXT,
        content: `[Story Reply] ${body.replyText}`,
      });

      chat.lastMessageId = msg._id;
      chat.lastMessagePreview = msg.content;
      chat.lastActivity = new Date();
      await chat.save();

      await Promise.all([
        emitToChat(String(chat._id), 'chat:message:received', { message: msg.toObject() }),
        emitToUser(String(frame.userId), 'chat:inbox:update', { chatId: String(chat._id) }),
      ]);
      publishChatRealtimeEvent(String(chat._id), 'message', {
        lastMessageId: String(msg._id),
        lastSenderId: String(user._id),
      });
      publishUserRealtimeEvent(String(frame.userId), 'chat:inbox:update', {
        chatId: String(chat._id),
        lastMessagePreview: msg.content,
      });
      if (String(frame.userId) !== String(user._id)) {
        await dispatchNotification({
          recipientId: frame.userId,
          actorId: user._id,
          type: 'CHAT_MESSAGE',
          preferenceKey: 'directMessages',
          title: `@${user.username}`,
          message: `Replied to your story: ${body.replyText}`,
          actionUrl: `/messenger/c/${chat._id}`,
          data: { chatId: String(chat._id), senderId: String(user._id) },
        });
      }

      return apiSuccess({ sent: true, chatId: String(chat._id) });
    }

    return apiSuccess({});
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ frameId: string }> }
) {
  try {
    const { user } = await requireAuth(req);
    const { frameId } = await context.params;
    const frame = await StoryFrame.findById(frameId);
    if (!frame) throw new NotFoundError('Story frame not found.');

    const isAllowed =
      String(frame.userId) === String(user._id) ||
      user.role === UserRole.ROOT ||
      user.role === UserRole.ADMIN;
    if (!isAllowed) throw new ForbiddenError('Cannot delete this story frame.');

    if (frame.mediaId) {
      await deleteMediaRecord(String(frame.mediaId));
    }
    await StoryView.deleteMany({ storyFrameId: frame._id });
    await StoryFrame.deleteOne({ _id: frame._id });

    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
