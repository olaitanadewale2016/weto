import { NextRequest } from 'next/server';
import { getOptionalAuth, PREVIOUS_ACCOUNT_COOKIE_NAME } from '@/lib/auth/session';
import { apiError, apiSuccess } from '@/lib/api-response';
import { getPublicBootstrapConfig } from '@/services/settings.service';
import { Notification } from '@/models/Notification';
import { Chat, Message } from '@/models/Messaging';
import { Currency, Locale } from '@/models/System';
import { User } from '@/models/User';
import { ChatType, GroupStatus, GroupVisibility, UserStatus } from '@/types/enums';
import { connectDB } from '@/lib/db';
import { ensureDefaultCurrenciesAndLocales } from '@/services/localization-seed.service';
import { ensureDefaultCommunityGroups, syncAutoJoinGroupsForUser } from '@/services/group-seed.service';
import { resolveMediaUrl } from '@/lib/media-url';

let seedsCompleted = false;

interface PublicGroupDoc {
  _id: unknown;
  chatUuid?: string;
  group?: {
    name?: string;
    description?: string;
    avatar?: string;
    category?: string;
    verified?: boolean;
    isPinned?: boolean;
    isPasswordProtected?: boolean;
    isPaid?: boolean;
    entryPrice?: number;
  };
  participants?: Array<{ userId?: unknown }>;
  lastMessagePreview?: unknown;
  lastActivity?: Date;
}

interface CurrencyDoc {
  alpha3Code: string;
  symbolNative?: string;
  symbol?: string;
  [key: string]: unknown;
}

interface LocaleDoc {
  alpha2Code: string;
  direction?: string;
  [key: string]: unknown;
}

interface CachedPublicData {
  currencies: CurrencyDoc[];
  locales: LocaleDoc[];
  publicGroupsRaw: PublicGroupDoc[];
  expiresAt: number;
}
let cachedPublicData: CachedPublicData | null = null;
const PUBLIC_CACHE_TTL_MS = 300_000;

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    if (!seedsCompleted) {
      await Promise.all([ensureDefaultCurrenciesAndLocales(), ensureDefaultCommunityGroups()]);
      seedsCompleted = true;
    }

    const now = Date.now();
    let currencies: CurrencyDoc[];
    let locales: LocaleDoc[];
    let publicGroupsRaw: PublicGroupDoc[];

    if (cachedPublicData && cachedPublicData.expiresAt > now) {
      currencies = cachedPublicData.currencies;
      locales = cachedPublicData.locales;
      publicGroupsRaw = cachedPublicData.publicGroupsRaw;
    } else {
      const [cur, loc, grp] = await Promise.all([
        Currency.find({ status: true }).sort({ order: 1 }).lean(),
        Locale.find({ status: true }).sort({ order: 1 }).lean(),
        Chat.find({
          type: ChatType.GROUP,
          'group.status': GroupStatus.ACTIVE,
          'group.visibility': GroupVisibility.PUBLIC,
        })
          .sort({ 'group.isPinned': -1, lastActivity: -1 })
          .limit(6)
          .select('_id chatUuid group participants lastMessagePreview lastActivity')
          .lean(),
      ]);
      currencies = cur as unknown as CurrencyDoc[];
      locales = loc as unknown as LocaleDoc[];
      publicGroupsRaw = grp as unknown as PublicGroupDoc[];
      cachedPublicData = {
        currencies,
        locales,
        publicGroupsRaw,
        expiresAt: now + PUBLIC_CACHE_TTL_MS,
      };
    }

    const [config, authCtx] = await Promise.all([
      getPublicBootstrapConfig(),
      getOptionalAuth(req),
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
      void syncAutoJoinGroupsForUser(u._id).catch(() => { });
      const masterId = u.ownerAccountId || u._id;
      const prevCookieId = req.cookies.get(PREVIOUS_ACCOUNT_COOKIE_NAME)?.value;
      const isValidPrevId = Boolean(prevCookieId && /^[0-9a-fA-F]{24}$/.test(prevCookieId));
      const shouldResolvePrev =
        (isValidPrevId && prevCookieId !== String(u._id)) || Boolean(u.ownerAccountId);

      const [notifCount, chats, prevCandidate] = await Promise.all([
        Notification.countDocuments({
          userId: u._id,
          readAt: null,
          type: { $nin: ['CHAT_MESSAGE', 'CHAT_CALL'] },
        }),
        Chat.find({ 'participants.userId': u._id }).select('_id participants').lean(),
        shouldResolvePrev
          ? User.findOne({
            _id: isValidPrevId && prevCookieId !== String(u._id) ? prevCookieId : masterId,
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
          const mePart = (chat.participants || []).find((p) => String(p?.userId) === String(u._id));
          if (!mePart || mePart.isHidden || mePart.isMuted) return null;
          // Disregard historical messages created before user joined the room or cleared history
          const joinedFloor = mePart.joinedAt || u.createdAt;
          const clearedFloor = mePart.clearedAt;
          const effectiveFloor =
            clearedFloor && joinedFloor
              ? (new Date(clearedFloor) > new Date(joinedFloor) ? clearedFloor : joinedFloor)
              : (clearedFloor || joinedFloor);

          return {
            chatId: chat._id,
            ...(effectiveFloor ? { createdAt: { $gt: effectiveFloor } } : {}),
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
        gender: u.gender,
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

    const viewerId = authCtx?.user?._id ? String(authCtx.user._id) : null;
    const communityGroups = publicGroupsRaw.map((g) => ({
      id: String(g._id),
      name: g.group?.name || 'Community Group',
      description: g.group?.description || '',
      avatar: resolveMediaUrl(g.group?.avatar) || '/assets/avatars/default-avatar.png',
      category: g.group?.category || 'General',
      verified: Boolean(g.group?.verified),
      isPinned: Boolean(g.group?.isPinned),
      isPasswordProtected: Boolean(g.group?.isPasswordProtected),
      isPaid: Boolean(g.group?.isPaid && Number(g.group?.entryPrice || 0) > 0),
      entryPrice: Number(g.group?.entryPrice || 0),
      membersCount: Array.isArray(g.participants) ? g.participants.length : 0,
      isJoined: viewerId
        ? (g.participants || []).some((p) => String(p?.userId) === viewerId)
        : false,
    }));

    return apiSuccess({
      config,
      currencies: normalizedCurrencies,
      locales: normalizedLocales,
      communityGroups,
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
