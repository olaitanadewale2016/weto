import { NextRequest } from 'next/server';
import { getOptionalAuth, PREVIOUS_ACCOUNT_COOKIE_NAME } from '@/lib/auth/session';
import { apiError, apiSuccess } from '@/lib/api-response';
import { getPublicBootstrapConfig } from '@/services/settings.service';
import { Notification } from '@/models/Notification';
import { Chat, Message } from '@/models/Messaging';
import { Currency, Locale } from '@/models/System';
import { User } from '@/models/User';
import { UserStatus } from '@/types/enums';
import { connectDB } from '@/lib/db';
import { ensureDefaultCurrenciesAndLocales } from '@/services/localization-seed.service';
import { resolveMediaUrl } from '@/lib/media-url';

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    await ensureDefaultCurrenciesAndLocales();
    const [config, authCtx, currencies, locales] = await Promise.all([
      getPublicBootstrapConfig(),
      getOptionalAuth(req),
      Currency.find({ status: true }).sort({ order: 1 }).lean(),
      Locale.find({ status: true }).sort({ order: 1 }).lean(),
    ]);

    let unreadNotifications = 0;
    let unreadMessages = 0;
    let userPayload = null;
    let previousAccountPayload: {
      id: string;
      username: string;
      fullName: string;
      avatar: string;
      isMaster: boolean;
    } | null = null;

    if (authCtx?.user) {
      const u = authCtx.user;
      const masterId = u.ownerAccountId || u._id;
      const prevCookieId = req.cookies.get(PREVIOUS_ACCOUNT_COOKIE_NAME)?.value;
      const shouldResolvePrev =
        (Boolean(prevCookieId) && prevCookieId !== String(u._id)) || Boolean(u.ownerAccountId);

      const [notifCount, chats, prevCandidate] = await Promise.all([
        Notification.countDocuments({ userId: u._id, readAt: null }),
        Chat.find({ 'participants.userId': u._id }).select('_id participants').lean(),
        shouldResolvePrev
          ? User.findOne({
              _id: prevCookieId && prevCookieId !== String(u._id) ? prevCookieId : masterId,
              deletedAt: null,
              status: { $nin: [UserStatus.BLOCKED, UserStatus.SUSPENDED] },
              $or: [{ _id: masterId }, { ownerAccountId: masterId }],
            })
              .select('username firstName lastName avatar ownerAccountId')
              .lean()
          : Promise.resolve(null),
      ]);

      let resolvedPrev = prevCandidate;
      if (!resolvedPrev && u.ownerAccountId) {
        resolvedPrev = await User.findOne({
          _id: masterId,
          deletedAt: null,
          status: { $nin: [UserStatus.BLOCKED, UserStatus.SUSPENDED] },
        })
          .select('username firstName lastName avatar ownerAccountId')
          .lean();
      }
      if (resolvedPrev && String(resolvedPrev._id) !== String(u._id)) {
        previousAccountPayload = {
          id: String(resolvedPrev._id),
          username: resolvedPrev.username,
          fullName:
            `${resolvedPrev.firstName || ''} ${resolvedPrev.lastName || ''}`.trim() ||
            resolvedPrev.username,
          avatar: resolveMediaUrl(resolvedPrev.avatar) || '/assets/avatars/default-avatar.png',
          isMaster: !resolvedPrev.ownerAccountId,
        };
      }

      unreadNotifications = notifCount;

      const chatConditions = chats
        .map((chat) => {
          const mePart = chat.participants.find((p) => String(p.userId) === String(u._id));
          if (!mePart) return null;
          return {
            chatId: chat._id,
            ...(mePart.clearedAt ? { createdAt: { $gt: mePart.clearedAt } } : {}),
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);

      if (chatConditions.length > 0) {
        unreadMessages = await Message.countDocuments({
          senderId: { $ne: u._id },
          isDeleted: false,
          readBy: { $ne: u._id },
          $or: chatConditions,
        });
      }

      userPayload = {
        id: String(u._id),
        username: u.username,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        avatar: resolveMediaUrl(u.avatar) || '/assets/avatars/default-avatar.png',
        cover: resolveMediaUrl(u.cover) || '/assets/covers/default-cover.png',
        bio: u.bio,
        verified: u.verified,
        role: u.role,
        status: u.status,
        type: u.type,
        theme: u.theme,
        language: u.language,
        country: u.country,
        city: u.city,
        onboardingStep: u.onboardingStep,
        publicationsCount: u.publicationsCount,
        followersCount: u.followersCount,
        followingCount: u.followingCount,
        isMasterAccount: !u.ownerAccountId,
        tips: u.tips,
      };
    }

    const normalizedCurrencies = currencies.map((c) => ({
      ...c,
      code: c.alpha3Code,
      symbol: c.symbolNative || c.symbol,
    }));

    const normalizedLocales = locales.map((l) => ({
      ...l,
      code: l.alpha2Code,
      isRtl: l.direction === 'rtl',
    }));

    return apiSuccess({
      config,
      currencies: normalizedCurrencies,
      locales: normalizedLocales,
      user: userPayload,
      previousAccount: previousAccountPayload,
      counters: {
        unreadNotifications,
        unreadMessages,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
