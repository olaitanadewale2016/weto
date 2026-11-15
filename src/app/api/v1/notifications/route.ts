import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess } from '@/lib/api-response';
import { Notification } from '@/models/Notification';

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const tab = searchParams.get('tab') || 'all';
    const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 30)));

    const filter: Record<string, unknown> = { userId: user._id };
    if (tab === 'mentions') filter.category = 'mentions';
    else if (tab === 'important') filter.category = 'important';

    const [items, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('actorId', 'username firstName lastName avatar verified')
        .lean(),
      Notification.countDocuments({ userId: user._id, readAt: null }),
    ]);

    return apiSuccess(
      items.map((n) => {
        const populated = n.actorId as unknown as
          | {
              _id?: unknown;
              username?: string;
              firstName?: string;
              lastName?: string;
              avatar?: string;
              verified?: boolean;
            }
          | null;
        const storedActor = (n.data as Record<string, unknown> | undefined)?.actor as
          | {
              id?: string;
              name?: string;
              username?: string;
              firstName?: string;
              lastName?: string;
              avatar?: string;
              verified?: boolean;
            }
          | undefined;

        const actorSrc = populated && populated.username ? populated : storedActor;
        const actorName = actorSrc
          ? [actorSrc.firstName, actorSrc.lastName].filter(Boolean).join(' ').trim() ||
            storedActor?.name ||
            actorSrc.username ||
            ''
          : '';

        return {
          ...n,
          id: String(n._id),
          actor: actorSrc
            ? {
                id: String((populated && populated._id) || storedActor?.id || ''),
                name: actorName,
                username: actorSrc.username || '',
                firstName: actorSrc.firstName || '',
                lastName: actorSrc.lastName || '',
                avatar: actorSrc.avatar || '/assets/avatars/default-avatar.png',
                verified: Boolean(actorSrc.verified),
              }
            : null,
        };
      }),
      { unreadCount }
    );
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const body = (await req.json().catch(() => ({}))) as { notificationId?: string };

    if (body.notificationId) {
      await Notification.updateOne(
        { _id: body.notificationId, userId: user._id },
        { $set: { readAt: new Date() } }
      );
    } else {
      await Notification.updateMany(
        { userId: user._id, readAt: null },
        { $set: { readAt: new Date() } }
      );
    }

    const unreadCount = await Notification.countDocuments({ userId: user._id, readAt: null });
    return apiSuccess({ unreadCount });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const id = new URL(req.url).searchParams.get('id');
    if (id) {
      await Notification.deleteOne({ _id: id, userId: user._id });
    } else {
      await Notification.deleteMany({ userId: user._id });
    }
    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
