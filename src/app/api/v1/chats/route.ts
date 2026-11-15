import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, ForbiddenError, NotFoundError, ValidationError } from '@/lib/api-response';
import { Chat, ChatInvite, Message } from '@/models/Messaging';
import { User } from '@/models/User';
import { Block } from '@/models/SocialGraph';
import { ChatInviteStatus, ChatType, GroupPrivacy, GroupStatus, GroupVisibility } from '@/types/enums';
import { emitToUser } from '@/lib/realtime-emitter';
import { dispatchNotification } from '@/services/notification.service';

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { user } = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const tab = searchParams.get('tab') || 'inbox'; // inbox | archive | invites
    const q = (searchParams.get('q') || '').trim().toLowerCase();

    if (tab === 'invites') {
      const invites = await ChatInvite.find({
        receiverId: user._id,
        status: ChatInviteStatus.PENDING,
        expiresAt: { $gt: new Date() },
      })
        .sort({ createdAt: -1 })
        .populate('chatId')
        .populate('senderId', 'username firstName lastName avatar verified')
        .lean();

      return apiSuccess(invites);
    }

    const chats = await Chat.find({
      'participants.userId': user._id,
    })
      .sort({ lastActivity: -1 })
      .populate('participants.userId', 'username firstName lastName avatar verified lastActive')
      .lean();

    const filtered = chats.filter((chat) => {
      const me = chat.participants.find((p) => String((p.userId as { _id?: unknown })?._id || p.userId) === String(user._id));
      if (!me || me.isHidden) return false;
      if (tab === 'archive') return me.isArchived;
      return !me.isArchived;
    });

    const enriched = await Promise.all(
      filtered.map(async (chat) => {
        const me = chat.participants.find(
          (p) => String((p.userId as { _id?: unknown })?._id || p.userId) === String(user._id)
        );
        const unreadCount = await Message.countDocuments({
          chatId: chat._id,
          senderId: { $ne: user._id },
          isDeleted: false,
          readBy: { $ne: user._id },
          ...(me?.clearedAt ? { createdAt: { $gt: me.clearedAt } } : {}),
        });

        const interlocutor =
          chat.type === ChatType.DIRECT
            ? chat.participants.find(
                (p) => String((p.userId as { _id?: unknown })?._id || p.userId) !== String(user._id)
              )?.userId
            : null;

        return {
          id: String(chat._id),
          chatUuid: chat.chatUuid,
          type: chat.type,
          group: chat.group,
          interlocutor,
          participants: chat.participants.map((p) => ({
            user: p.userId,
            role: p.role,
          })),
          lastMessagePreview: chat.lastMessagePreview,
          lastActivity: chat.lastActivity,
          unreadCount,
        };
      })
    );

    const searched = q
      ? enriched.filter((c) => {
          const name = c.group?.name?.toLowerCase() || '';
          const inter = c.interlocutor as { username?: string; firstName?: string; lastName?: string } | null;
          const interText = inter
            ? `${inter.username || ''} ${inter.firstName || ''} ${inter.lastName || ''}`.toLowerCase()
            : '';
          return name.includes(q) || interText.includes(q) || (c.lastMessagePreview || '').toLowerCase().includes(q);
        })
      : enriched;

    return apiSuccess(searched);
  } catch (err) {
    return apiError(err);
  }
}

const createChatSchema = z.object({
  type: z.nativeEnum(ChatType).default(ChatType.DIRECT),
  targetUserId: z.string().optional(),
  groupName: z.string().min(2).max(80).optional(),
  groupDescription: z.string().max(500).optional(),
  visibility: z.nativeEnum(GroupVisibility).optional(),
  privacy: z.nativeEnum(GroupPrivacy).optional(),
  memberIds: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const body = createChatSchema.parse(await req.json());

    if (body.type === ChatType.DIRECT) {
      if (!body.targetUserId) throw new ValidationError('targetUserId is required.');
      if (body.targetUserId === String(user._id)) {
        throw new ValidationError('Cannot open a direct chat with yourself.');
      }

      const target = await User.findOne({ _id: body.targetUserId, deletedAt: null });
      if (!target) throw new NotFoundError('Target user not found.');

      const blocked = await Block.exists({
        $or: [
          { blockerId: user._id, blockedId: target._id },
          { blockerId: target._id, blockedId: user._id },
        ],
      });
      if (blocked) throw new ForbiddenError('Cannot message this user.');

      let chat = await Chat.findOne({
        type: ChatType.DIRECT,
        'participants.userId': { $all: [user._id, target._id] },
      });

      if (!chat) {
        chat = await Chat.create({
          chatUuid: crypto.randomUUID(),
          type: ChatType.DIRECT,
          participants: [
            { userId: user._id, role: 'member' },
            { userId: target._id, role: 'member' },
          ],
          lastActivity: new Date(),
        });
      } else {
        await Chat.updateOne(
          { _id: chat._id, 'participants.userId': user._id },
          { $set: { 'participants.$.isHidden': false } }
        );
      }

      return apiSuccess({ id: String(chat._id), chatUuid: chat.chatUuid }, undefined, 201);
    }

    // Group creation
    if (!body.groupName) throw new ValidationError('Group name is required.');
    const chat = await Chat.create({
      chatUuid: crypto.randomUUID(),
      type: ChatType.GROUP,
      participants: [{ userId: user._id, role: 'owner' }],
      group: {
        ownerId: user._id,
        name: body.groupName.trim(),
        description: body.groupDescription?.trim() || '',
        avatar: '/assets/avatars/default-avatar.png',
        visibility: body.visibility || GroupVisibility.PUBLIC,
        privacy: body.privacy || GroupPrivacy.OPEN,
        status: GroupStatus.ACTIVE,
        verified: false,
      },
      lastActivity: new Date(),
    });

    if (body.memberIds && body.memberIds.length > 0) {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      for (const mid of body.memberIds) {
        if (mid === String(user._id)) continue;
        await ChatInvite.updateOne(
          { chatId: chat._id, receiverId: new Types.ObjectId(mid), senderId: user._id },
          {
            $setOnInsert: {
              chatId: chat._id,
              senderId: user._id,
              receiverId: new Types.ObjectId(mid),
              status: ChatInviteStatus.PENDING,
              expiresAt,
            },
          },
          { upsert: true }
        );
        await dispatchNotification({
          recipientId: mid,
          actorId: user._id,
          type: 'GROUP_INVITE',
          title: 'Group Invitation',
          message: `@${user.username} invited you to join ${body.groupName}.`,
          actionUrl: '/messenger',
        });
        await emitToUser(mid, 'chat:invite:new', { chatId: String(chat._id) });
      }
    }

    return apiSuccess({ id: String(chat._id), chatUuid: chat.chatUuid }, undefined, 201);
  } catch (err) {
    return apiError(err);
  }
}
