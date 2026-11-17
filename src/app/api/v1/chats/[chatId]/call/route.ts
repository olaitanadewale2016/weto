import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, ForbiddenError, NotFoundError, ValidationError } from '@/lib/api-response';
import { Chat, ChatCall, Message } from '@/models/Messaging';
import { ChatType, MessageType } from '@/types/enums';
import { emitToChat, emitToUser } from '@/lib/realtime-emitter';
import { publishChatRealtimeEvent, publishUserRealtimeEvent } from '@/lib/firebase/realtime';
import { dispatchNotification } from '@/services/notification.service';

const STALE_CALL_MS = 4 * 60 * 1000; // Matches Grupo Pro 240s expiry in video_chat_status.php

const callActionSchema = z.object({
  action: z.enum(['start', 'join', 'signal', 'state', 'remote_mute', 'reject', 'leave', 'end']),
  audioOnly: z.boolean().optional(),
  callId: z.string().optional(),
  toUserId: z.string().optional(),
  kind: z.enum(['offer', 'answer', 'ice']).optional(),
  payload: z.unknown().optional(),
  muted: z.boolean().optional(),
  cameraEnabled: z.boolean().optional(),
  screenSharing: z.boolean().optional(),
  targetUserId: z.string().optional(),
});

async function serializeCallForUser(call: InstanceType<typeof ChatCall> | Record<string, unknown>, viewerId: string, afterSignalIso?: string) {
  const doc = call as {
    _id: unknown;
    callUuid: string;
    chatId: unknown;
    chatType: ChatType;
    initiatorId: unknown;
    audioOnly: boolean;
    status: string;
    participants?: Array<{
      userId: { _id?: unknown; username?: string; firstName?: string; lastName?: string; avatar?: string } | unknown;
      muted?: boolean;
      cameraEnabled?: boolean;
      screenSharing?: boolean;
      remoteMutedByAdmin?: boolean;
      joinedAt?: Date;
      lastHeartbeatAt?: Date;
    }>;
    signals?: Array<{
      _id?: unknown;
      fromUserId: unknown;
      toUserId: unknown;
      kind: 'offer' | 'answer' | 'ice';
      payload: unknown;
      createdAt?: Date;
    }>;
    startedAt?: Date;
    endedAt?: Date | null;
  };

  const afterMs = afterSignalIso ? new Date(afterSignalIso).getTime() : 0;
  const incomingSignals = (doc.signals || [])
    .filter((s) => {
      if (String(s.toUserId) !== viewerId) return false;
      if (!Number.isFinite(afterMs) || afterMs <= 0) return true;
      return (s.createdAt ? new Date(s.createdAt).getTime() : 0) > afterMs;
    })
    .slice(-80)
    .map((s) => ({
      id: String(s._id || ''),
      fromUserId: String(s.fromUserId),
      toUserId: String(s.toUserId),
      kind: s.kind,
      payload: s.payload,
      createdAt: s.createdAt,
    }));

  return {
    id: String(doc._id),
    callUuid: doc.callUuid,
    chatId: String(doc.chatId),
    chatType: doc.chatType,
    initiatorId: String(doc.initiatorId),
    audioOnly: Boolean(doc.audioOnly),
    status: doc.status,
    startedAt: doc.startedAt,
    endedAt: doc.endedAt || null,
    participants: (doc.participants || []).map((p) => {
      const u = p.userId as { _id?: unknown; username?: string; firstName?: string; lastName?: string; avatar?: string } | string;
      const uid = typeof u === 'object' && u && '_id' in u ? String(u._id) : String(u);
      return {
        userId: uid,
        user:
          typeof u === 'object' && u && 'username' in u
            ? {
                _id: uid,
                username: u.username || 'user',
                firstName: u.firstName || '',
                lastName: u.lastName || '',
                avatar: u.avatar || '/assets/avatars/default-avatar.png',
              }
            : null,
        muted: Boolean(p.muted),
        cameraEnabled: p.cameraEnabled !== false,
        screenSharing: Boolean(p.screenSharing),
        remoteMutedByAdmin: Boolean(p.remoteMutedByAdmin),
        joinedAt: p.joinedAt,
      };
    }),
    signals: incomingSignals,
  };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ chatId: string }> }
) {
  try {
    await connectDB();
    const { user } = await requireAuth(req);
    const { chatId } = await context.params;
    const chat = await Chat.findById(chatId).lean();
    if (!chat) throw new NotFoundError('Conversation not found.');
    const isMember = chat.participants.some((p) => String(p.userId) === String(user._id));
    if (!isMember) throw new ForbiddenError('Not a participant.');

    const cutoff = new Date(Date.now() - STALE_CALL_MS);
    await ChatCall.updateMany(
      { chatId: chat._id, status: { $in: ['ringing', 'active'] }, lastActivityAt: { $lte: cutoff } },
      { $set: { status: 'ended', endedAt: new Date() } }
    );

    const activeCall = await ChatCall.findOne({
      chatId: chat._id,
      status: { $in: ['ringing', 'active'] },
    })
      .sort({ lastActivityAt: -1 })
      .populate('participants.userId', 'username firstName lastName avatar')
      .lean();

    if (!activeCall) {
      return apiSuccess({ activeCall: null });
    }

    const url = new URL(req.url);
    const afterSignalIso = url.searchParams.get('after') || undefined;
    const serialized = await serializeCallForUser(activeCall, String(user._id), afterSignalIso);
    return apiSuccess({ activeCall: serialized });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ chatId: string }> }
) {
  try {
    await connectDB();
    const { user } = await requireAuth(req);
    const { chatId } = await context.params;
    const body = callActionSchema.parse(await req.json());

    const chat = await Chat.findById(chatId);
    if (!chat) throw new NotFoundError('Conversation not found.');
    const mePart = chat.participants.find((p) => String(p.userId) === String(user._id));
    if (!mePart) throw new ForbiddenError('Not a participant in this chat.');

    const uid = String(user._id);
    const cutoff = new Date(Date.now() - STALE_CALL_MS);
    await ChatCall.updateMany(
      { chatId: chat._id, status: { $in: ['ringing', 'active'] }, lastActivityAt: { $lte: cutoff } },
      { $set: { status: 'ended', endedAt: new Date() } }
    );

    if (body.action === 'start' || body.action === 'join') {
      const audioOnly = Boolean(body.audioOnly);
      let call = await ChatCall.findOne({
        chatId: chat._id,
        status: { $in: ['ringing', 'active'] },
      }).sort({ lastActivityAt: -1 });

      const otherUserIds = chat.participants
        .map((p) => p.userId)
        .filter((pid) => String(pid) !== uid);

      let isNewCall = false;
      if (!call) {
        isNewCall = true;
        call = await ChatCall.create({
          callUuid: crypto.randomUUID(),
          chatId: chat._id,
          chatType: chat.type,
          initiatorId: user._id,
          targetUserIds: otherUserIds,
          audioOnly,
          status: chat.type === ChatType.GROUP ? 'active' : 'ringing',
          participants: [
            {
              userId: user._id,
              muted: false,
              cameraEnabled: !audioOnly,
              screenSharing: false,
              joinedAt: new Date(),
              lastHeartbeatAt: new Date(),
            },
          ],
          signals: [],
          startedAt: new Date(),
          lastActivityAt: new Date(),
        });
      } else {
        const alreadyInCall = call.participants.some((p) => String(p.userId) === uid);
        if (!alreadyInCall) {
          call.participants.push({
            userId: user._id,
            muted: false,
            cameraEnabled: !call.audioOnly,
            screenSharing: false,
            joinedAt: new Date(),
            lastHeartbeatAt: new Date(),
          });
        } else {
          call.participants = call.participants.map((p) =>
            String(p.userId) === uid ? { ...p, lastHeartbeatAt: new Date() } : p
          );
        }
        if (call.status === 'ringing' && String(call.initiatorId) !== uid) {
          call.status = 'active';
        }
        call.lastActivityAt = new Date();
        await call.save();
      }

      if (isNewCall) {
        const systemLabel = audioOnly ? 'user_initiated_audio_call' : 'user_initiated_video_call';
        const sysMsg = await Message.create({
          chatId: chat._id,
          chatUuid: chat.chatUuid,
          senderId: user._id,
          type: MessageType.SYSTEM,
          content: systemLabel,
          deliveredTo: [user._id],
          readBy: [user._id],
        });
        chat.lastMessageId = sysMsg._id;
        chat.lastMessagePreview = audioOnly ? 'Started an audio call' : 'Started a video call';
        chat.lastActivity = new Date();
        await chat.save();

        await emitToChat(String(chat._id), 'chat:message:received', { chatId: String(chat._id) });
        publishChatRealtimeEvent(String(chat._id), 'call:started', {
          callId: String(call._id),
          audioOnly: call.audioOnly,
        });

        const callerName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || `@${user.username}`;
        for (const recipientId of otherUserIds) {
          const callPayload = {
            callId: String(call._id),
            callUuid: call.callUuid,
            chatId: String(chat._id),
            chatType: chat.type,
            chatTitle: chat.type === ChatType.GROUP ? chat.group?.name || 'Group Call' : callerName,
            audioOnly: call.audioOnly,
            caller: {
              id: uid,
              username: user.username,
              name: callerName,
              avatar: user.avatar || '/assets/avatars/default-avatar.png',
            },
          };
          await emitToUser(String(recipientId), 'chat:call:incoming', callPayload);
          publishUserRealtimeEvent(String(recipientId), 'chat:call:incoming', callPayload);
          await dispatchNotification({
            recipientId,
            actorId: user._id,
            type: 'CHAT_CALL',
            preferenceKey: 'directMessages',
            title: callerName,
            message: audioOnly ? 'Incoming audio call' : 'Incoming video call',
            actionUrl: `/messenger/c/${chat._id}?answerCall=${audioOnly ? 'audio' : 'video'}`,
            data: { chatId: String(chat._id), callId: String(call._id), audioOnly: String(audioOnly) },
          });
        }
      } else {
        await emitToChat(String(chat._id), 'chat:call:update', {
          chatId: String(chat._id),
          callId: String(call._id),
          status: call.status,
        });
        publishChatRealtimeEvent(String(chat._id), 'call:joined', { callId: String(call._id) });
      }

      const populated = await ChatCall.findById(call._id)
        .populate('participants.userId', 'username firstName lastName avatar')
        .lean();
      return apiSuccess({
        activeCall: populated ? await serializeCallForUser(populated, uid) : null,
      });
    }

    const activeCall = body.callId
      ? await ChatCall.findOne({ _id: body.callId, chatId: chat._id })
      : await ChatCall.findOne({ chatId: chat._id, status: { $in: ['ringing', 'active'] } }).sort({
          lastActivityAt: -1,
        });

    if (!activeCall) {
      return apiSuccess({ activeCall: null, ended: true });
    }

    if (body.action === 'signal') {
      if (!body.toUserId || !body.kind || body.payload === undefined) {
        throw new ValidationError('Signal requires toUserId, kind, and payload.');
      }
      if (!Types.ObjectId.isValid(body.toUserId)) {
        throw new ValidationError('Invalid target user id.');
      }

      const signalDoc = {
        _id: new Types.ObjectId(),
        fromUserId: user._id,
        toUserId: new Types.ObjectId(body.toUserId),
        kind: body.kind,
        payload: body.payload,
        createdAt: new Date(),
      };
      activeCall.signals.push(signalDoc);
      if (activeCall.signals.length > 250) {
        activeCall.signals = activeCall.signals.slice(-200);
      }
      activeCall.lastActivityAt = new Date();
      await activeCall.save();

      await emitToUser(body.toUserId, 'chat:call:signal', {
        chatId: String(chat._id),
        callId: String(activeCall._id),
        fromUserId: uid,
        kind: body.kind,
        payload: body.payload,
      });
      publishChatRealtimeEvent(String(chat._id), 'call:signal', { fromUserId: uid, toUserId: body.toUserId });
      return apiSuccess({ delivered: true, signalId: String(signalDoc._id) });
    }

    if (body.action === 'state') {
      activeCall.participants = activeCall.participants.map((p) =>
        String(p.userId) === uid
          ? {
              ...p,
              muted: body.muted !== undefined ? body.muted : p.muted,
              cameraEnabled: body.cameraEnabled !== undefined ? body.cameraEnabled : p.cameraEnabled,
              screenSharing: body.screenSharing !== undefined ? body.screenSharing : p.screenSharing,
              lastHeartbeatAt: new Date(),
            }
          : p
      );
      activeCall.lastActivityAt = new Date();
      await activeCall.save();

      await emitToChat(String(chat._id), 'chat:call:update', {
        chatId: String(chat._id),
        callId: String(activeCall._id),
        userId: uid,
        muted: body.muted,
        cameraEnabled: body.cameraEnabled,
        screenSharing: body.screenSharing,
      });
      publishChatRealtimeEvent(String(chat._id), 'call:state', { userId: uid });
      const populated = await ChatCall.findById(activeCall._id)
        .populate('participants.userId', 'username firstName lastName avatar')
        .lean();
      return apiSuccess({
        activeCall: populated ? await serializeCallForUser(populated, uid) : null,
      });
    }

    if (body.action === 'remote_mute') {
      if (chat.type !== ChatType.GROUP || !['owner', 'admin'].includes(mePart.role)) {
        throw new ForbiddenError('Only group admins can mute other participants.');
      }
      if (!body.targetUserId) {
        throw new ValidationError('targetUserId is required.');
      }
      const nextMuted = body.muted !== false;
      activeCall.participants = activeCall.participants.map((p) =>
        String(p.userId) === body.targetUserId
          ? { ...p, muted: nextMuted, remoteMutedByAdmin: nextMuted }
          : p
      );
      activeCall.lastActivityAt = new Date();
      await activeCall.save();

      await emitToUser(body.targetUserId, 'chat:call:remote_mute', {
        chatId: String(chat._id),
        callId: String(activeCall._id),
        muted: nextMuted,
      });
      publishChatRealtimeEvent(String(chat._id), 'call:remote_mute', {
        targetUserId: body.targetUserId,
        muted: nextMuted,
      });
      return apiSuccess({ muted: nextMuted });
    }

    if (body.action === 'reject') {
      activeCall.status = 'rejected';
      activeCall.endedAt = new Date();
      activeCall.lastActivityAt = new Date();
      await activeCall.save();

      for (const participant of activeCall.participants) {
        await emitToUser(String(participant.userId), 'chat:call:ended', {
          chatId: String(chat._id),
          callId: String(activeCall._id),
          reason: 'rejected',
        });
      }
      await emitToChat(String(chat._id), 'chat:call:ended', {
        chatId: String(chat._id),
        callId: String(activeCall._id),
        reason: 'rejected',
      });
      publishChatRealtimeEvent(String(chat._id), 'call:rejected', { callId: String(activeCall._id) });
      return apiSuccess({ rejected: true });
    }

    // action === 'leave' || action === 'end'
    activeCall.participants = activeCall.participants.filter((p) => String(p.userId) !== uid);
    const shouldEndEntireCall =
      body.action === 'end' ||
      chat.type === ChatType.DIRECT ||
      activeCall.participants.length === 0;

    if (shouldEndEntireCall) {
      activeCall.status = 'ended';
      activeCall.endedAt = new Date();
      activeCall.participants = [];
    }
    activeCall.lastActivityAt = new Date();
    await activeCall.save();

    await emitToChat(String(chat._id), shouldEndEntireCall ? 'chat:call:ended' : 'chat:call:update', {
      chatId: String(chat._id),
      callId: String(activeCall._id),
      leftUserId: uid,
      status: activeCall.status,
    });
    if (shouldEndEntireCall) {
      for (const targetUid of activeCall.targetUserIds) {
        await emitToUser(String(targetUid), 'chat:call:ended', {
          chatId: String(chat._id),
          callId: String(activeCall._id),
        });
        publishUserRealtimeEvent(String(targetUid), 'chat:call:ended', {
          chatId: String(chat._id),
          callId: String(activeCall._id),
        });
      }
    }
    publishChatRealtimeEvent(String(chat._id), shouldEndEntireCall ? 'call:ended' : 'call:left', {
      callId: String(activeCall._id),
    });

    return apiSuccess({ left: true, ended: shouldEndEntireCall });
  } catch (err) {
    return apiError(err);
  }
}
