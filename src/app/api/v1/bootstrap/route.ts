import { NextRequest } from 'next/server';
import { getOptionalAuth } from '@/lib/auth/session';
import { apiError, apiSuccess } from '@/lib/api-response';
import { getPublicBootstrapConfig } from '@/services/settings.service';
import { Notification } from '@/models/Notification';
import { Chat, Message } from '@/models/Messaging';
import { Currency, Locale } from '@/models/System';
import { connectDB } from '@/lib/db';
import { ensureDefaultCurrenciesAndLocales } from '@/services/localization-seed.service';

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

    if (authCtx?.user) {
      const u = authCtx.user;
      const [notifCount, chats] = await Promise.all([
        Notification.countDocuments({ userId: u._id, readAt: null }),
        Chat.find({ 'participants.userId': u._id }).select('_id participants').lean(),
      ]);
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
        avatar: u.avatar,
        cover: u.cover,
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
      counters: {
        unreadNotifications,
        unreadMessages,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
