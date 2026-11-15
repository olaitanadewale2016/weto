import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { Notification, NotificationCategory } from '@/models/Notification';
import { Mute } from '@/models/SocialGraph';
import { Device } from '@/models/Device';
import { INotificationChannelPrefs, User } from '@/models/User';
import { getFirebaseMessaging, isFirebaseAdminConfigured } from '@/lib/firebase/admin';
import { publishUserRealtimeEvent } from '@/lib/firebase/realtime';
import { emitToUser } from '@/lib/realtime-emitter';
import { sendEmail } from './mail.service';
import { logger } from '@/lib/logger';

export interface DispatchNotificationInput {
  recipientId: string | Types.ObjectId;
  actorId?: string | Types.ObjectId | null;
  type: string;
  category?: NotificationCategory;
  preferenceKey?: keyof INotificationChannelPrefs;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  previewLqip?: string | null;
  data?: Record<string, unknown>;
  forceChannels?: boolean;
}

interface NotificationActorSnapshot {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  username: string;
  avatar: string;
  verified: boolean;
}

function formatChannelMessage(rawMessage: string, actor: NotificationActorSnapshot | null): string {
  const msg = rawMessage.trim();
  if (!actor) return msg;

  const atHandle = `@${actor.username}`;
  if (msg.toLowerCase().startsWith(atHandle.toLowerCase())) {
    const rest = msg.slice(atHandle.length).trimStart();
    return rest ? `${actor.name} ${rest}` : actor.name;
  }

  if (
    msg.toLowerCase().includes(actor.name.toLowerCase()) ||
    msg.toLowerCase().includes(atHandle.toLowerCase())
  ) {
    return msg;
  }

  return `${actor.name} ${msg}`;
}

export async function dispatchNotification(input: DispatchNotificationInput): Promise<void> {
  try {
    await connectDB();
    const recipientObjId = new Types.ObjectId(String(input.recipientId));
    const actorObjId = input.actorId ? new Types.ObjectId(String(input.actorId)) : null;

    if (actorObjId && actorObjId.equals(recipientObjId)) {
      return; // Never notify self
    }

    // Respect MuteService suppression
    if (actorObjId) {
      const muted = await Mute.exists({ muterId: recipientObjId, mutedId: actorObjId });
      if (muted) return;
    }

    const [recipient, actorDoc] = await Promise.all([
      User.findById(recipientObjId).lean(),
      actorObjId
        ? User.findById(actorObjId).select('username firstName lastName avatar verified').lean()
        : Promise.resolve(null),
    ]);
    if (!recipient || recipient.deletedAt) return;

    const actorSnapshot: NotificationActorSnapshot | null = actorDoc
      ? {
          id: String(actorDoc._id),
          name:
            [actorDoc.firstName, actorDoc.lastName].filter(Boolean).join(' ').trim() ||
            actorDoc.username,
          firstName: actorDoc.firstName || '',
          lastName: actorDoc.lastName || '',
          username: actorDoc.username,
          avatar: actorDoc.avatar || '/assets/avatars/default-avatar.png',
          verified: Boolean(actorDoc.verified),
        }
      : null;

    const resolvedTitle =
      actorSnapshot && input.type === 'CHAT_MESSAGE' && input.title.startsWith('@')
        ? actorSnapshot.name
        : input.title;
    const channelMessage =
      input.type === 'CHAT_MESSAGE'
        ? input.message
        : formatChannelMessage(input.message, actorSnapshot);

    const category = input.category || 'all';
    const notif = await Notification.create({
      userId: recipientObjId,
      actorId: actorObjId,
      type: input.type,
      category,
      title: resolvedTitle,
      message: input.message,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      actionUrl: input.actionUrl ?? null,
      previewLqip: input.previewLqip ?? null,
      data: {
        ...(input.data ?? {}),
        ...(actorSnapshot ? { actor: actorSnapshot } : {}),
      },
    });

    const unreadCount = await Notification.countDocuments({ userId: recipientObjId, readAt: null });

    // 1. Real-time Socket.IO & Firebase Firestore user channel delivery
    await emitToUser(String(recipientObjId), 'notification:new', {
      title: resolvedTitle,
      message: channelMessage,
      actor: actorSnapshot,
      notification: {
        ...notif.toObject(),
        id: String(notif._id),
        actor: actorSnapshot,
      },
      unreadCount,
    });
    publishUserRealtimeEvent(String(recipientObjId), input.type === 'CHAT_MESSAGE' ? 'chat:inbox:update' : 'notification:new', {
      unreadNotifications: unreadCount,
      notificationId: String(notif._id),
      type: input.type,
      title: resolvedTitle,
      message: channelMessage,
      actorName: actorSnapshot?.name || '',
      actorUsername: actorSnapshot?.username || '',
      actionUrl: input.actionUrl || '/notifications',
      ...(input.data || {}),
    });

    // 2. Push Notification via Firebase Cloud Messaging (FCM)
    const pushAllowed =
      input.forceChannels ||
      !input.preferenceKey ||
      Boolean(recipient.notificationSettings?.push?.[input.preferenceKey]);

    if (pushAllowed && isFirebaseAdminConfigured()) {
      const devices = await Device.find({
        userId: recipientObjId,
        pushEnabled: true,
        isTerminated: false,
        fcmToken: { $ne: null },
      }).lean();

      const tokens = devices.map((d) => d.fcmToken!).filter(Boolean);
      if (tokens.length > 0) {
        const stringData: Record<string, string> = {};
        if (input.data) {
          for (const [k, v] of Object.entries(input.data)) {
            if (v !== undefined && v !== null) stringData[k] = String(v);
          }
        }
        const res = await getFirebaseMessaging().sendEachForMulticast({
          tokens,
          notification: {
            title: resolvedTitle,
            body: channelMessage,
          },
          data: {
            ...stringData,
            type: input.type,
            actionUrl: input.actionUrl || '/notifications',
            notificationId: String(notif._id),
            unreadCount: String(unreadCount),
            actorName: actorSnapshot?.name || '',
            actorUsername: actorSnapshot?.username || '',
            title: resolvedTitle,
            message: channelMessage,
          },
        });

        // Prune unregistered/invalid FCM tokens
        const staleTokens: string[] = [];
        res.responses.forEach((r, idx) => {
          if (
            !r.success &&
            (r.error?.code === 'messaging/registration-token-not-registered' ||
              r.error?.code === 'messaging/invalid-registration-token')
          ) {
            staleTokens.push(tokens[idx]);
          }
        });
        if (staleTokens.length > 0) {
          await Device.updateMany(
            { fcmToken: { $in: staleTokens } },
            { $set: { fcmToken: null, pushEnabled: false } }
          );
        }
      }
    }

    // 3. Email Notification
    const emailAllowed =
      input.forceChannels ||
      !input.preferenceKey ||
      Boolean(recipient.notificationSettings?.email?.[input.preferenceKey]);

    if (emailAllowed && recipient.email) {
      await sendEmail({
        to: recipient.email,
        subject: resolvedTitle,
        html: `<p>${channelMessage}</p>${input.actionUrl ? `<p><a href="${process.env.NEXT_PUBLIC_APP_URL || ''}${input.actionUrl}">View details</a></p>` : ''}`,
      }).catch((e) => logger.warn({ err: e }, 'Notification email delivery skipped/failed'));
    }
  } catch (err) {
    logger.error({ err, type: input.type }, 'Notification dispatch failed');
  }
}
