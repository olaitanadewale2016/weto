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
import {
  generateGroupInviteCode,
  hashGroupPassword,
  sanitizeGroupForClient,
  syncAutoJoinGroupsForUser,
} from '@/services/group-seed.service';

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { user } = await requireAuth(req);
    await syncAutoJoinGroupsForUser(user._id).catch(() => {});

    const { searchParams } = new URL(req.url);
    const tab = searchParams.get('tab') || 'inbox'; // inbox | archive | invites | discover
    const q = (searchParams.get('q') || '').trim().toLowerCase();
    const category = (searchParams.get('category') || '').trim();
    const code = (searchParams.get('code') || '').trim().toUpperCase();

    if (code) {
      const groupChat = await Chat.findOne({
        type: ChatType.GROUP,
        'group.inviteCode': code,
        'group.status': GroupStatus.ACTIVE,
      }).lean();

      if (!groupChat) {
        throw new NotFoundError('Group invite link is invalid or expired.');
      }

      const uid = String(user._id);
      const isJoined = (groupChat.participants || []).some((p) => String(p.userId) === uid);
      const isPending = (groupChat.group?.pendingJoinUserIds || []).some((id) => String(id) === uid);
      const isBanned = (groupChat.group?.bannedUserIds || []).some((id) => String(id) === uid);

      return apiSuccess({
        id: String(groupChat._id),
        chatUuid: groupChat.chatUuid,
        group: sanitizeGroupForClient(groupChat.group as unknown as Record<string, unknown>),
        membersCount: (groupChat.participants || []).length,
        isJoined,
        isPendingApproval: isPending,
        isBanned,
      });
    }

    if (tab === 'discover') {
      const discoverFilter: Record<string, unknown> = {
        type: ChatType.GROUP,
        'group.status': GroupStatus.ACTIVE,
        'group.visibility': GroupVisibility.PUBLIC,
      };
      if (category && category.toLowerCase() !== 'all') {
        discoverFilter['group.category'] = category;
      }

      const groups = await Chat.find(discoverFilter)
        .sort({ 'group.isPinned': -1, lastActivity: -1 })
        .limit(60)
        .lean();

      const uid = String(user._id);
      const items = groups
        .map((g) => {
          const isJoined = (g.participants || []).some((p) => String(p.userId) === uid);
          const isPendingApproval = (g.group?.pendingJoinUserIds || []).some(
            (id) => String(id) === uid
          );
          const isBanned = (g.group?.bannedUserIds || []).some((id) => String(id) === uid);
          return {
            id: String(g._id),
            chatUuid: g.chatUuid,
            type: g.type,
            group: sanitizeGroupForClient(g.group as unknown as Record<string, unknown>),
            membersCount: (g.participants || []).length,
            lastMessagePreview: g.lastMessagePreview,
            lastActivity: g.lastActivity,
            isJoined,
            isPendingApproval,
            isBanned,
          };
        })
        .filter((item) => {
          if (!q) return true;
          const name = String(item.group?.name || '').toLowerCase();
          const desc = String(item.group?.description || '').toLowerCase();
          const cat = String(item.group?.category || '').toLowerCase();
          return name.includes(q) || desc.includes(q) || cat.includes(q);
        });

      return apiSuccess(items);
    }

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
      const me = chat.participants.find(
        (p) => String((p.userId as { _id?: unknown })?._id || p.userId) === String(user._id)
      );
      if (!me || me.isHidden) return false;
      if (tab === 'archive') return me.isArchived;
      return !me.isArchived;
    });

    const enriched = await Promise.all(
      filtered.map(async (chat) => {
        const me = chat.participants.find(
          (p) => String((p.userId as { _id?: unknown })?._id || p.userId) === String(user._id)
        );
        const joinedFloor = me?.joinedAt || user.createdAt;
        const clearedFloor = me?.clearedAt;
        const effectiveFloor =
          clearedFloor && joinedFloor
            ? (new Date(clearedFloor) > new Date(joinedFloor) ? clearedFloor : joinedFloor)
            : (clearedFloor || joinedFloor);

        const unreadCount = await Message.countDocuments({
          chatId: chat._id,
          senderId: { $ne: user._id },
          isDeleted: false,
          readBy: { $ne: user._id },
          ...(effectiveFloor ? { createdAt: { $gt: effectiveFloor } } : {}),
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
          group: sanitizeGroupForClient(chat.group as unknown as Record<string, unknown>),
          interlocutor,
          participants: chat.participants.map((p) => ({
            user: p.userId,
            role: p.role,
            isMuted: Boolean(p.isMuted),
          })),
          lastMessagePreview: chat.lastMessagePreview,
          lastActivity: chat.lastActivity,
          unreadCount,
        };
      })
    );

    const sorted = enriched.sort((a, b) => {
      const aPinned = Boolean((a.group as { isPinned?: boolean } | null)?.isPinned);
      const bPinned = Boolean((b.group as { isPinned?: boolean } | null)?.isPinned);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
    });

    const searched = q
      ? sorted.filter((c) => {
          const name = String(c.group?.name || '').toLowerCase();
          const inter = c.interlocutor as {
            username?: string;
            firstName?: string;
            lastName?: string;
          } | null;
          const interText = inter
            ? `${inter.username || ''} ${inter.firstName || ''} ${inter.lastName || ''}`.toLowerCase()
            : '';
          return (
            name.includes(q) ||
            interText.includes(q) ||
            (c.lastMessagePreview || '').toLowerCase().includes(q)
          );
        })
      : sorted;

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
  category: z.string().max(40).optional(),
  avatar: z.string().max(500).optional(),
  coverImage: z.string().max(500).optional(),
  visibility: z.nativeEnum(GroupVisibility).optional(),
  privacy: z.nativeEnum(GroupPrivacy).optional(),
  postingMode: z.enum(['everyone', 'admins_only']).optional(),
  requiresApproval: z.boolean().optional(),
  password: z.string().max(64).optional(),
  isPaid: z.boolean().optional(),
  entryPrice: z.number().min(0).max(10000000).optional(),
  monetizationNote: z.string().max(240).optional(),
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

    if (!body.groupName) throw new ValidationError('Group name is required.');
    const trimmedName = body.groupName.trim();
    const rawPassword = body.password?.trim() || '';
    const hasPassword = rawPassword.length > 0;
    const slugBase = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);

    const rawPrice = Number(body.entryPrice || 0);
    const isPaid = Boolean(body.isPaid && rawPrice > 0);
    const entryPrice = isPaid ? Number(rawPrice.toFixed(2)) : 0;

    const chat = await Chat.create({
      chatUuid: crypto.randomUUID(),
      type: ChatType.GROUP,
      participants: [{ userId: user._id, role: 'owner', joinedAt: new Date() }],
      group: {
        ownerId: user._id,
        name: trimmedName,
        description: body.groupDescription?.trim() || '',
        avatar: body.avatar?.trim() || '/assets/avatars/presets/avatar-h2mjRO.png',
        coverImage: body.coverImage?.trim() || null,
        category: body.category?.trim() || 'General',
        slug: `${slugBase || 'group'}-${crypto.randomBytes(2).toString('hex')}`,
        inviteCode: generateGroupInviteCode(trimmedName),
        visibility: body.visibility || GroupVisibility.PUBLIC,
        privacy: body.privacy || (body.requiresApproval ? GroupPrivacy.CLOSED : GroupPrivacy.OPEN),
        status: GroupStatus.ACTIVE,
        verified: false,
        postingMode: body.postingMode || 'everyone',
        requiresApproval: Boolean(body.requiresApproval),
        isPasswordProtected: hasPassword,
        passwordHash: hasPassword ? hashGroupPassword(rawPassword) : null,
        isPaid,
        entryPrice,
        monetizationNote: body.monetizationNote?.trim() || '',
      },
      lastMessagePreview: 'Group created',
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
          message: `@${user.username} invited you to join ${trimmedName}.`,
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
