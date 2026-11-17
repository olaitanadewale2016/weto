import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess } from '@/lib/api-response';
import { ChatCall } from '@/models/Messaging';

const RING_WINDOW_MS = 2 * 60 * 1000;

/**
 * Returns any active ringing direct call targeting the signed-in user
 * (mirrors Grupo Pro `fns/realtime/check_call_logs.php`).
 */
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { user } = await requireAuth(req);
    const cutoff = new Date(Date.now() - RING_WINDOW_MS);

    const call = await ChatCall.findOne({
      targetUserIds: user._id,
      status: 'ringing',
      initiatorId: { $ne: user._id },
      'participants.userId': { $ne: user._id },
      lastActivityAt: { $gt: cutoff },
    })
      .sort({ createdAt: -1 })
      .populate('initiatorId', 'username firstName lastName avatar')
      .lean();

    if (!call) {
      return apiSuccess({ incomingCall: null });
    }

    const caller = call.initiatorId as unknown as {
      _id?: unknown;
      username?: string;
      firstName?: string;
      lastName?: string;
      avatar?: string;
    };
    const callerName =
      `${caller?.firstName || ''} ${caller?.lastName || ''}`.trim() ||
      (caller?.username ? `@${caller.username}` : 'Someone');

    return apiSuccess({
      incomingCall: {
        callId: String(call._id),
        callUuid: call.callUuid,
        chatId: String(call.chatId),
        chatType: call.chatType,
        audioOnly: Boolean(call.audioOnly),
        caller: {
          id: String(caller?._id || call.initiatorId),
          username: caller?.username || 'user',
          name: callerName,
          avatar: caller?.avatar || '/assets/avatars/default-avatar.png',
        },
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
