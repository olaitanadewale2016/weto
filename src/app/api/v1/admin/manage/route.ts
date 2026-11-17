import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdminAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, ForbiddenError, NotFoundError, ValidationError } from '@/lib/api-response';
import { User } from '@/models/User';
import { Comment, Post } from '@/models/Post';
import { StoryFrame } from '@/models/Story';
import { BusinessAccount, Category, JobApplication, JobListing, Product } from '@/models/Commerce';
import { Chat, Message } from '@/models/Messaging';
import { Ad, AuditLog, Cashout, Payment, Wallet } from '@/models/Finance';
import { Blacklist, Censor, ModerationAction, Report } from '@/models/Moderation';
import { AuthorshipRequest } from '@/models/SocialGraph';
import { ApiKey, Currency, Locale, StaticPage } from '@/models/System';
import { DataStat, Media } from '@/models/Media';
import { Bookmark } from '@/models/Post';
import {
  ensureDefaultCurrenciesAndLocales,
  ensureDefaultStaticPages,
} from '@/services/localization-seed.service';
import { getAiCapabilities } from '@/services/ai.service';
import {
  AdApproval,
  AdStatus,
  ASRStatus,
  BlacklistType,
  CategoryStatus,
  CategoryType,
  CensorLevel,
  ChatType,
  GroupPrivacy,
  GroupStatus,
  GroupVisibility,
  JobApproval,
  JobStatus,
  MessageType,
  PostStatus,
  ProductApproval,
  ProductStatus,
  ReportStatus,
  TransactionType,
  UserRole,
  UserStatus,
  UserType,
} from '@/types/enums';
import { creditWalletIdempotent, reviewCashout } from '@/services/wallet.service';
import { adjustAdBudgetInWallet, deleteAdAndRefundUnspent } from '@/services/ad-billing.service';
import { clearWatermarkCache, deleteMediaRecord, serializeMedia } from '@/services/media.service';
import {
  clearSettingsCache,
  getSettingsGroup,
  updateSettingsGroup,
  AppSettingsMap,
} from '@/services/settings.service';
import { dispatchNotification } from '@/services/notification.service';
import { writeAuditLog } from '@/lib/audit';
import { sendEmail } from '@/services/mail.service';
import { emitToAdmins, emitToChat, emitToUser } from '@/lib/realtime-emitter';
import { publishChatRealtimeEvent } from '@/lib/firebase/realtime';
import {
  generateGroupInviteCode,
  hashGroupPassword,
  sanitizeGroupForClient,
} from '@/services/group-seed.service';

export async function GET(req: NextRequest) {
  try {
    await requireAdminAuth(req);
    const { searchParams } = new URL(req.url);
    const resource = searchParams.get('resource') || 'users';
    const q = (searchParams.get('q') || '').trim();
    const filterParam = (searchParams.get('filter') || searchParams.get('type') || 'all')
      .trim()
      .toLowerCase();
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 40)));

    const re = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;

    if (resource === 'users') {
      const typeFilter = filterParam;
      const filter: Record<string, unknown> = { deletedAt: null };
      if (typeFilter === 'author') filter.type = UserType.AUTHOR;
      else if (typeFilter === 'reader') filter.type = UserType.READER;
      else if (typeFilter === 'blocked') filter.status = UserStatus.BLOCKED;
      else if (typeFilter === 'verified') filter.verified = true;
      if (re) {
        filter.$or = [{ username: re }, { email: re }, { firstName: re }, { lastName: re }, { city: re }];
      }
      const users = await User.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .select(
          'username firstName lastName email avatar bio caption country city role status type verified createdAt lastActive ipAddress publicationsCount followersCount'
        )
        .lean();
      return apiSuccess(users);
    }

    if (resource === 'posts') {
      const filter: Record<string, unknown> = re
        ? { $or: [{ title: re }, { content: re }, { hashtags: re }, { location: re }] }
        : {};
      if (filterParam === 'active') filter.status = PostStatus.ACTIVE;
      else if (filterParam === 'draft') filter.status = PostStatus.DRAFT;
      else if (filterParam === 'pinned') filter.globalPinned = true;
      const posts = await Post.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('userId', 'username firstName lastName avatar')
        .lean();
      const mediaRows = await Media.find({ targetType: 'post', targetId: { $in: posts.map((p) => p._id) } })
        .sort({ order: 1 })
        .lean();
      const mediaMap = new Map<string, ReturnType<typeof serializeMedia>[]>();
      for (const m of mediaRows) {
        const key = String(m.targetId);
        mediaMap.set(key, [...(mediaMap.get(key) || []), serializeMedia(m as never)]);
      }
      let enriched = posts.map((p) => ({ ...p, media: mediaMap.get(String(p._id)) || [] }));
      if (filterParam === 'media') {
        enriched = enriched.filter((p) => p.media.length > 0);
      }
      return apiSuccess(enriched);
    }

    if (resource === 'comments') {
      const filter: Record<string, unknown> = re ? { content: re } : {};
      const comments = await Comment.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('userId', 'username firstName lastName avatar')
        .populate('postId', 'hashId title content')
        .lean();
      return apiSuccess(comments);
    }

    if (resource === 'stories') {
      const filter: Record<string, unknown> = re ? { content: re } : {};
      const now = new Date();
      if (filterParam === 'active') filter.expiresAt = { $gt: now };
      else if (filterParam === 'expired') filter.expiresAt = { $lte: now };
      const stories = await StoryFrame.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('userId', 'username firstName lastName avatar')
        .populate('mediaId')
        .lean();
      return apiSuccess(
        stories.map((s) => ({
          ...s,
          isExpired: s.expiresAt ? new Date(s.expiresAt).getTime() <= now.getTime() : false,
          media: s.mediaId ? serializeMedia(s.mediaId as never) : null,
        }))
      );
    }

    if (resource === 'marketplace') {
      const filter: Record<string, unknown> = re
        ? { $or: [{ title: re }, { description: re }, { address: re }] }
        : {};
      if (['pending', 'approved', 'rejected'].includes(filterParam)) {
        filter.approval = filterParam;
      } else if (['active', 'inactive'].includes(filterParam)) {
        filter.status = filterParam;
      }
      const products = await Product.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('userId', 'username firstName lastName avatar')
        .populate('categoryId', 'localization')
        .lean();
      const prodMedia = await Media.find({ targetType: 'product', targetId: { $in: products.map((p) => p._id) } })
        .sort({ order: 1 })
        .lean();
      const mediaMap = new Map<string, ReturnType<typeof serializeMedia>[]>();
      for (const m of prodMedia) {
        const key = String(m.targetId);
        mediaMap.set(key, [...(mediaMap.get(key) || []), serializeMedia(m as never)]);
      }
      return apiSuccess(products.map((p) => ({ ...p, media: mediaMap.get(String(p._id)) || [] })));
    }

    if (resource === 'jobs') {
      const filter: Record<string, unknown> = re
        ? { $or: [{ title: re }, { overview: re }, { location: re }] }
        : {};
      if (['pending', 'approved', 'rejected'].includes(filterParam)) {
        filter.approval = filterParam;
      } else if (['active', 'closed'].includes(filterParam)) {
        filter.status = filterParam;
      }
      const jobs = await JobListing.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('userId', 'username firstName lastName avatar')
        .populate('categoryId', 'localization')
        .lean();
      return apiSuccess(jobs);
    }

    if (resource === 'businesses') {
      const filter: Record<string, unknown> = re
        ? { $or: [{ name: re }, { city: re }, { country: re }, { businessEmail: re }] }
        : {};
      if (filterParam === 'verified') filter.verified = true;
      else if (filterParam === 'pending' || filterParam === 'unverified') filter.verified = false;
      const businesses = await BusinessAccount.find(filter)
        .sort({ updatedAt: -1 })
        .limit(limit)
        .populate('userId', 'username email avatar')
        .lean();
      return apiSuccess(businesses);
    }

    if (resource === 'chats') {
      const chatFilter: Record<string, unknown> = re
        ? { $or: [{ 'group.name': re }, { 'group.description': re }, { 'group.category': re }, { chatUuid: re }] }
        : {};
      if (filterParam === 'group' || filterParam === 'direct') {
        chatFilter.type = filterParam;
      } else if (filterParam === 'pinned') {
        chatFilter.type = ChatType.GROUP;
        chatFilter['group.isPinned'] = true;
      } else if (filterParam === 'auto_join') {
        chatFilter.type = ChatType.GROUP;
        chatFilter['group.autoJoin'] = true;
      } else if (filterParam === 'suspended') {
        chatFilter.type = ChatType.GROUP;
        chatFilter['group.status'] = GroupStatus.SUSPENDED;
      }
      const chats = await Chat.find(chatFilter)
        .sort({ 'group.isPinned': -1, lastActivity: -1 })
        .limit(limit)
        .populate('participants.userId', 'username firstName lastName avatar verified status role')
        .lean();
      const chatIds = chats.map((c) => c._id);
      const msgCounts =
        chatIds.length > 0
          ? await Message.aggregate([
            { $match: { chatId: { $in: chatIds }, isDeleted: false } },
            { $group: { _id: '$chatId', count: { $sum: 1 } } },
          ])
          : [];
      const countMap = new Map(msgCounts.map((x) => [String(x._id), Number(x.count || 0)]));
      return apiSuccess(
        chats.map((c) => ({
          ...c,
          group: sanitizeGroupForClient(c.group as unknown as Record<string, unknown>),
          participantsCount: Array.isArray(c.participants) ? c.participants.length : 0,
          messagesCount: countMap.get(String(c._id)) || 0,
        }))
      );
    }

    if (resource === 'chat_messages') {
      const chatId = (searchParams.get('chatId') || '').trim();
      if (!chatId || !/^[0-9a-fA-F]{24}$/.test(chatId)) {
        throw new ValidationError('Valid chatId is required.');
      }
      const chat = await Chat.findById(chatId)
        .populate(
          'participants.userId',
          'username firstName lastName email avatar verified status role'
        )
        .lean();
      if (!chat) {
        throw new NotFoundError('Chat conversation not found.');
      }
      const before = searchParams.get('before');
      const msgFilter: Record<string, unknown> = { chatId: chat._id };
      if (before) {
        const beforeDate = new Date(before);
        if (!Number.isNaN(beforeDate.getTime())) {
          msgFilter.createdAt = { $lt: beforeDate };
        }
      }
      const [totalMessages, rawMessages] = await Promise.all([
        Message.countDocuments({ chatId: chat._id, isDeleted: false }),
        Message.find(msgFilter)
          .sort({ createdAt: -1 })
          .limit(limit)
          .populate('senderId', 'username firstName lastName avatar verified role status')
          .populate('mediaId')
          .lean(),
      ]);

      const orderedMessages = rawMessages.reverse().map((m) => ({
        _id: String(m._id),
        type: m.type,
        content: m.content,
        isDeleted: Boolean(m.isDeleted),
        deletedAt: m.isDeleted ? m.updatedAt || null : null,
        createdAt: m.createdAt,
        sender: m.senderId || null,
        media: m.mediaId ? serializeMedia(m.mediaId as never) : null,
      }));

      return apiSuccess({
        chat: {
          ...chat,
          _id: String(chat._id),
          participantsCount: Array.isArray(chat.participants) ? chat.participants.length : 0,
          messagesCount: totalMessages,
        },
        messages: orderedMessages,
        hasMore: rawMessages.length === limit,
      });
    }

    if (resource === 'ads') {
      const filter: Record<string, unknown> = re
        ? { $or: [{ title: re }, { content: re }] }
        : {};
      if (['pending', 'approved', 'rejected'].includes(filterParam)) {
        filter.approval = filterParam;
      } else if (['published', 'paused', 'completed', 'draft'].includes(filterParam)) {
        filter.status = filterParam;
      }
      const [ads, summaryAgg, statusBreakdown, adsCfg] = await Promise.all([
        Ad.find(filter)
          .sort({ createdAt: -1 })
          .limit(limit)
          .populate('userId', 'username firstName lastName avatar')
          .populate('mediaId')
          .lean(),
        Ad.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              totalBudget: { $sum: '$totalBudget' },
              totalAllocated: { $sum: { $ifNull: ['$allocatedBudget', 0] } },
              totalSpent: { $sum: '$spentBudget' },
              totalViews: { $sum: '$viewsCount' },
              totalClicks: { $sum: { $ifNull: ['$clicksCount', 0] } },
            },
          },
        ]),
        Ad.aggregate([
          {
            $group: {
              _id: { status: '$status', approval: '$approval' },
              count: { $sum: 1 },
            },
          },
        ]),
        getSettingsGroup('ads'),
      ]);

      let published = 0;
      let pending = 0;
      let paused = 0;
      let completed = 0;
      for (const s of statusBreakdown as Array<{ _id?: { status?: string; approval?: string }; count: number }>) {
        if (s._id?.approval === AdApproval.PENDING) pending += s.count;
        if (s._id?.status === AdStatus.PUBLISHED && s._id?.approval === AdApproval.APPROVED) published += s.count;
        if (s._id?.status === AdStatus.PAUSED) paused += s.count;
        if (s._id?.status === AdStatus.COMPLETED) completed += s.count;
      }

      const agg = summaryAgg[0] || {};
      const adSummary = {
        total: Number(agg.total || 0),
        published,
        pending,
        paused,
        completed,
        totalBudget: Number(agg.totalBudget || 0),
        totalAllocated: Number(agg.totalAllocated || 0),
        totalSpent: Number(agg.totalSpent || 0),
        totalViews: Number(agg.totalViews || 0),
        totalClicks: Number(agg.totalClicks || 0),
      };

      return apiSuccess(
        ads.map((a) => ({
          ...a,
          media: a.mediaId ? serializeMedia(a.mediaId as never) : null,
        })),
        { adSummary, adBillingConfig: adsCfg }
      );
    }

    if (resource === 'reports') {
      const filter: Record<string, unknown> = re
        ? { $or: [{ reporterComment: re }, { reportableType: re }, { status: re }] }
        : {};
      if (['pending', 'processed', 'ignored'].includes(filterParam)) {
        filter.status = filterParam;
      }
      const reports = await Report.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('reporterId', 'username firstName lastName avatar')
        .populate('reviewerId', 'username')
        .lean();

      const byType = new Map<string, string[]>();
      for (const r of reports) {
        const listIds = byType.get(r.reportableType) || [];
        listIds.push(String(r.reportableId));
        byType.set(r.reportableType, listIds);
      }

      const [rPosts, rComments, rProducts, rJobs, rUsers] = await Promise.all([
        byType.get('post')?.length
          ? Post.find({ _id: { $in: byType.get('post') } }).select('content title hashId').lean()
          : [],
        byType.get('comment')?.length
          ? Comment.find({ _id: { $in: byType.get('comment') } }).select('content').lean()
          : [],
        byType.get('product')?.length
          ? Product.find({ _id: { $in: byType.get('product') } }).select('title hashId').lean()
          : [],
        byType.get('job')?.length
          ? JobListing.find({ _id: { $in: byType.get('job') } }).select('title hashId').lean()
          : [],
        byType.get('user')?.length
          ? User.find({ _id: { $in: byType.get('user') } }).select('username firstName lastName').lean()
          : [],
      ]);

      const previewMap = new Map<string, string>();
      for (const p of rPosts) {
        previewMap.set(`post:${String(p._id)}`, p.title || p.content || `Post #${p.hashId}`);
      }
      for (const c of rComments) {
        previewMap.set(`comment:${String(c._id)}`, c.content || 'Comment');
      }
      for (const pr of rProducts) {
        previewMap.set(`product:${String(pr._id)}`, pr.title || 'Product');
      }
      for (const jb of rJobs) {
        previewMap.set(`job:${String(jb._id)}`, jb.title || 'Job Listing');
      }
      for (const u of rUsers) {
        previewMap.set(
          `user:${String(u._id)}`,
          `@${u.username} (${`${u.firstName || ''} ${u.lastName || ''}`.trim()})`
        );
      }

      return apiSuccess(
        reports.map((r) => ({
          ...r,
          targetPreview: previewMap.get(`${r.reportableType}:${String(r.reportableId)}`) || null,
        }))
      );
    }

    if (resource === 'moderation_history') {
      const filter: Record<string, unknown> = re
        ? { $or: [{ action: re }, { reason: re }, { targetType: re }] }
        : {};
      if (filterParam !== 'all') {
        filter.action = new RegExp(filterParam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      }
      const history = await ModerationAction.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('moderatorId', 'username')
        .populate('targetUserId', 'username')
        .lean();
      return apiSuccess(history);
    }

    if (resource === 'banning') {
      const blFilter: Record<string, unknown> = re
        ? { $or: [{ blacklistable: re }, { reason: re }, { type: re }] }
        : {};
      const cFilter: Record<string, unknown> = re ? { word: re } : {};
      const [blacklists, censors] = await Promise.all([
        Blacklist.find(blFilter).sort({ addedAt: -1 }).limit(limit).populate('adminId', 'username').lean(),
        Censor.find(cFilter).sort({ word: 1 }).lean(),
      ]);
      return apiSuccess({ blacklists, censors });
    }

    if (resource === 'authorship') {
      const filter: Record<string, unknown> = {};
      if (['pending', 'approved', 'rejected'].includes(filterParam)) {
        filter.status = filterParam;
      }
      const list = await AuthorshipRequest.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('userId', 'username firstName lastName email avatar type verified')
        .lean();
      const filtered = re
        ? list.filter((item) => {
          const u = item.userId as { username?: string; email?: string; firstName?: string; lastName?: string } | null;
          const hay = `${u?.username || ''} ${u?.email || ''} ${u?.firstName || ''} ${u?.lastName || ''} ${item.status || ''}`;
          return re.test(hay);
        })
        : list;
      return apiSuccess(filtered);
    }

    if (resource === 'cashouts') {
      const filter: Record<string, unknown> = {};
      if (['pending', 'paid', 'rejected', 'cancelled'].includes(filterParam)) {
        filter.status = filterParam;
      }
      const cashouts = await Cashout.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('userId', 'username firstName lastName email avatar')
        .lean();
      const filtered = re
        ? cashouts.filter((c) => {
          const u = c.userId as { username?: string; email?: string } | null;
          return re.test(`${u?.username || ''} ${u?.email || ''} ${c.paymentMethod || ''} ${c.status || ''}`);
        })
        : cashouts;
      return apiSuccess(filtered);
    }

    if (resource === 'acquiring') {
      const [acquiring, wallet] = await Promise.all([
        getSettingsGroup('acquiring'),
        getSettingsGroup('wallet'),
      ]);
      return apiSuccess({ acquiring, wallet });
    }

    if (resource === 'verification') {
      const userFilter: Record<string, unknown> = { deletedAt: null };
      if (re) {
        userFilter.$or = [{ username: re }, { email: re }, { firstName: re }, { lastName: re }];
      } else if (filterParam === 'verified') {
        userFilter.verified = true;
      } else if (filterParam === 'unverified') {
        userFilter.verified = false;
      }
      const [verification, pendingAuthorshipCount, verifiedUsersCount, users] = await Promise.all([
        getSettingsGroup('verification'),
        AuthorshipRequest.countDocuments({ status: ASRStatus.PENDING }),
        User.countDocuments({ deletedAt: null, verified: true }),
        User.find(userFilter)
          .sort({ verified: -1, createdAt: -1 })
          .limit(30)
          .select('username firstName lastName email avatar verified verifiedAt type status createdAt')
          .lean(),
      ]);
      return apiSuccess({ verification, pendingAuthorshipCount, verifiedUsersCount, users });
    }

    if (resource === 'lab') {
      const aiCaps = getAiCapabilities();
      const [usersCount, postsCount, mediaCount, reportsCount] = await Promise.all([
        User.countDocuments({ deletedAt: null }),
        Post.countDocuments({}),
        Media.countDocuments({}),
        Report.countDocuments({}),
      ]);
      return apiSuccess({
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development',
        integrations: {
          mongodb: Boolean(process.env.MONGODB_URI),
          firebaseAdmin: Boolean(process.env.FIREBASE_PROJECT_ID),
          cloudflareR2: Boolean(process.env.R2_ACCESS_KEY_ID),
          redis: Boolean(process.env.REDIS_URL),
          ipinfo: Boolean(process.env.IPINFO_TOKEN),
          libretranslate: process.env.TRANSLATION_SERVICE !== 'disabled',
          openai: aiCaps.openai,
          gemini: aiCaps.gemini,
          giphy: Boolean(process.env.GIPHY_API_KEY || process.env.NEXT_PUBLIC_GIPHY_API_KEY),
          paystack: Boolean(process.env.PAYSTACK_SECRET_KEY),
          stripe: Boolean(process.env.STRIPE_SECRET_KEY),
        },
        counts: { usersCount, postsCount, mediaCount, reportsCount },
      });
    }

    if (resource === 'payments') {
      const pFilter: Record<string, unknown> = {};
      if (['completed', 'pending', 'failed', 'cancelled'].includes(filterParam)) {
        pFilter.status = filterParam;
      }
      const [payments, cashouts, wallets] = await Promise.all([
        Payment.find(pFilter).sort({ createdAt: -1 }).limit(limit).populate('userId', 'username email').lean(),
        Cashout.find({}).sort({ createdAt: -1 }).limit(limit).populate('userId', 'username email').lean(),
        Wallet.find({}).sort({ balance: -1 }).limit(limit).populate('userId', 'username email').lean(),
      ]);
      if (!re) {
        return apiSuccess({ payments, cashouts, wallets });
      }
      return apiSuccess({
        payments: payments.filter((p) => {
          const u = p.userId as { username?: string; email?: string } | null;
          return re.test(`${u?.username || ''} ${u?.email || ''} ${p.referenceId || ''} ${p.paymentMethod || ''} ${p.status || ''}`);
        }),
        cashouts: cashouts.filter((c) => {
          const u = c.userId as { username?: string; email?: string } | null;
          return re.test(`${u?.username || ''} ${u?.email || ''} ${c.paymentMethod || ''} ${c.status || ''}`);
        }),
        wallets: wallets.filter((w) => {
          const u = w.userId as { username?: string; email?: string } | null;
          return re.test(`${u?.username || ''} ${u?.email || ''} ${w.walletNumber || ''} ${w.currency || ''}`);
        }),
      });
    }

    if (resource === 'categories') {
      const catFilter: Record<string, unknown> = {};
      if (filterParam === 'product' || filterParam === 'job') {
        catFilter.categorizableType = filterParam;
      }
      const [cats, productCounts, jobCounts] = await Promise.all([
        Category.find(catFilter).sort({ categorizableType: 1, createdAt: 1 }).lean(),
        Product.aggregate([{ $match: { categoryId: { $ne: null } } }, { $group: { _id: '$categoryId', count: { $sum: 1 } } }]),
        JobListing.aggregate([{ $match: { categoryId: { $ne: null } } }, { $group: { _id: '$categoryId', count: { $sum: 1 } } }]),
      ]);
      const usageMap = new Map<string, number>();
      for (const row of [...productCounts, ...jobCounts]) {
        const key = String(row._id);
        usageMap.set(key, (usageMap.get(key) || 0) + Number(row.count || 0));
      }
      const enriched = cats.map((c) => ({
        ...c,
        usageCount: usageMap.get(String(c._id)) ?? 0,
      }));
      return apiSuccess(
        re
          ? enriched.filter((c) => re.test(`${Object.values(c.localization || {}).join(' ')} ${c.categorizableType}`))
          : enriched
      );
    }

    if (resource === 'currencies') {
      await ensureDefaultCurrenciesAndLocales();
      const [currencies, walletCounts] = await Promise.all([
        Currency.find({}).sort({ order: 1, alpha3Code: 1 }).lean(),
        Wallet.aggregate([{ $group: { _id: '$currency', count: { $sum: 1 } } }]),
      ]);
      const countMap = new Map<string, number>(
        walletCounts.map((w: { _id?: string; count?: number }) => [String(w._id || '').toUpperCase(), Number(w.count || 0)])
      );
      return apiSuccess(
        currencies.map((c) => ({
          ...c,
          usageCount: countMap.get(String(c.alpha3Code).toUpperCase()) ?? c.usageCount ?? 0,
        }))
      );
    }

    if (resource === 'locales') {
      await ensureDefaultCurrenciesAndLocales();
      const [locales, userCounts] = await Promise.all([
        Locale.find({}).sort({ order: 1, alpha2Code: 1 }).lean(),
        User.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$language', count: { $sum: 1 } } }]),
      ]);
      const countMap = new Map<string, number>(
        userCounts.map((u: { _id?: string; count?: number }) => [String(u._id || '').toLowerCase(), Number(u.count || 0)])
      );
      return apiSuccess(
        locales.map((l) => ({
          ...l,
          usageCount: countMap.get(String(l.alpha2Code).toLowerCase()) ?? l.usageCount ?? 0,
        }))
      );
    }

    if (resource === 'static_pages') {
      await ensureDefaultStaticPages();
      return apiSuccess(await StaticPage.find({}).sort({ slug: 1 }).lean());
    }

    if (resource === 'storage') {
      const mFilter: Record<string, unknown> = {};
      if (['image', 'video', 'document', 'audio'].includes(filterParam)) {
        mFilter.type = filterParam;
      }
      if (re) {
        mFilter.$or = [{ r2Key: re }, { externalUrl: re }, { targetType: re }, { storageProvider: re }];
      }
      const [stats, rawMedia, totalFiles, sizeAgg, providerAgg] = await Promise.all([
        DataStat.find({}).lean(),
        Media.find(mFilter).sort({ createdAt: -1 }).limit(50).populate('ownerId', 'username').lean(),
        Media.countDocuments({}),
        Media.aggregate([{ $group: { _id: null, bytes: { $sum: '$sizeBytes' } } }]),
        Media.aggregate([
          { $group: { _id: '$storageProvider', count: { $sum: 1 }, bytes: { $sum: '$sizeBytes' } } },
        ]),
      ]);
      const recentMedia = rawMedia.map((m) => ({
        ...serializeMedia(m as never),
        _id: String(m._id),
        targetType: m.targetType,
        storageProvider: m.storageProvider,
        owner: m.ownerId,
        createdAt: m.createdAt,
      }));
      return apiSuccess({
        stats,
        recentMedia,
        summary: {
          totalFiles,
          totalBytes: Number(sizeAgg[0]?.bytes || 0),
          providers: providerAgg.map((p: { _id?: string; count?: number; bytes?: number }) => ({
            provider: p._id || 'local',
            count: Number(p.count || 0),
            bytes: Number(p.bytes || 0),
          })),
        },
      });
    }

    if (resource === 'settings') {
      const groups: Array<keyof AppSettingsMap> = [
        'app',
        'features',
        'auth',
        'brand',
        'wallet',
        'ads',
        'promotions',
        'acquiring',
        'mail',
        'code',
        'verification',
      ];
      const entries = await Promise.all(groups.map(async (g) => [g, await getSettingsGroup(g)]));
      return apiSuccess(Object.fromEntries(entries));
    }

    if (resource === 'audit_logs') {
      const logs = await AuditLog.find({})
        .sort({ createdAt: -1 })
        .limit(100)
        .populate('actorId', 'username role')
        .lean();
      return apiSuccess(logs);
    }

    if (resource === 'api_keys') {
      const keys = await ApiKey.find({})
        .sort({ createdAt: -1 })
        .limit(50)
        .populate('userId', 'username email')
        .lean();
      return apiSuccess(keys);
    }

    return apiSuccess([]);
  } catch (err) {
    return apiError(err);
  }
}

const adminActionSchema = z.object({
  action: z.string().min(1),
  targetId: z.string().optional(),
  payload: z.record(z.unknown()).default({}),
});

export async function POST(req: NextRequest) {
  try {
    const { user: admin } = await requireAdminAuth(req);
    const { action, targetId, payload } = adminActionSchema.parse(await req.json());

    if (action === 'user.create') {
      const username = String(payload.username || '')
        .replace(/^@/, '')
        .toLowerCase()
        .trim();
      const email = String(payload.email || '').toLowerCase().trim();
      if (!username || !email) {
        throw new ForbiddenError('Username and email are required.');
      }
      const requestedRole = (payload.role as UserRole) || UserRole.USER;
      if (requestedRole !== UserRole.USER && admin.role !== UserRole.ROOT) {
        throw new ForbiddenError('Only ROOT administrators can create privileged accounts.');
      }
      const existing = await User.findOne({ $or: [{ username }, { email }] }).select('_id').lean();
      if (existing) {
        throw new ForbiddenError('A user with this username or email already exists.');
      }
      const newUser = await User.create({
        username,
        email,
        firstName: String(payload.firstName || username).trim(),
        lastName: String(payload.lastName || '').trim(),
        caption: String(payload.caption || '').trim(),
        bio: String(payload.bio || '').trim(),
        country: payload.country ? String(payload.country) : 'Nigeria',
        city: payload.city ? String(payload.city) : 'Lagos',
        avatar: '/assets/avatars/default-avatar.png',
        cover: '/assets/covers/default-cover.png',
        role: requestedRole,
        type: (payload.type as UserType) || UserType.AUTHOR,
        status: UserStatus.ACTIVE,
        verified: Boolean(payload.verified ?? false),
        verifiedAt: payload.verified ? new Date() : null,
        tips: { onboarding_completed: true },
      });
      const appCfg = await getSettingsGroup('app');
      await Wallet.create({
        userId: newUser._id,
        walletNumber: `CP${Date.now().toString().slice(-8)}`,
        balance: Number(payload.initialBalance || 0),
        currency: String(payload.currency || appCfg.defaultCurrency || 'NGN'),
      });
    } else if (action === 'user.update' && targetId) {
      const updateFields: Record<string, unknown> = {};
      for (const field of ['firstName', 'lastName', 'caption', 'bio', 'country', 'city']) {
        if (payload[field] !== undefined) updateFields[field] = String(payload[field]);
      }
      if (payload.type !== undefined) updateFields.type = payload.type as UserType;
      if (payload.status !== undefined) updateFields.status = payload.status as UserStatus;
      if (payload.verified !== undefined) {
        updateFields.verified = Boolean(payload.verified);
        updateFields.verifiedAt = payload.verified ? new Date() : null;
      }
      if (payload.role !== undefined) {
        if (admin.role !== UserRole.ROOT) {
          throw new ForbiddenError('Only ROOT administrators can change user roles.');
        }
        updateFields.role = payload.role as UserRole;
      }
      await User.updateOne({ _id: targetId }, { $set: updateFields });
    } else if (action === 'user.delete' && targetId) {
      if (String(admin._id) === targetId) {
        throw new ForbiddenError('Administrators cannot delete their own account.');
      }
      await User.updateOne(
        { _id: targetId },
        { $set: { deletedAt: new Date(), status: UserStatus.BLOCKED } }
      );
      await ModerationAction.create({
        moderatorId: admin._id,
        targetUserId: targetId,
        targetType: 'user',
        targetId,
        action: 'delete_user',
        reason: String(payload.reason || 'Admin user deletion'),
      });
    } else if (action === 'user.set_status' && targetId) {
      const status = payload.status as UserStatus;
      await User.updateOne({ _id: targetId }, { $set: { status } });
      await ModerationAction.create({
        moderatorId: admin._id,
        targetUserId: targetId,
        targetType: 'user',
        targetId,
        action: status === UserStatus.BLOCKED ? 'ban' : status === UserStatus.SUSPENDED ? 'suspend' : 'unban',
        reason: String(payload.reason || 'Admin action'),
      });
    } else if (action === 'user.set_role' && targetId) {
      if (admin.role !== UserRole.ROOT) {
        throw new ForbiddenError('Only ROOT administrators can assign roles.');
      }
      await User.updateOne({ _id: targetId }, { $set: { role: payload.role as UserRole } });
    } else if (action === 'user.toggle_verify' && targetId) {
      const u = await User.findById(targetId);
      if (!u) throw new NotFoundError('User not found');
      u.verified = !u.verified;
      u.verifiedAt = u.verified ? new Date() : null;
      await u.save();
      await ModerationAction.create({
        moderatorId: admin._id,
        targetUserId: u._id,
        targetType: 'user',
        targetId: String(u._id),
        action: u.verified ? 'verify_user' : 'unverify_user',
        reason: String(payload.reason || (u.verified ? 'Identity verified by admin' : 'Verification removed by admin')),
      });
      await dispatchNotification({
        recipientId: u._id,
        actorId: admin._id,
        type: 'VERIFICATION_UPDATED',
        category: 'important',
        title: u.verified ? 'Account Verified' : 'Verification Updated',
        message: u.verified
          ? 'Your account now carries an official verified badge.'
          : 'Your account verification badge has been removed by an administrator.',
        actionUrl: '/settings',
        forceChannels: true,
      });
    } else if (action === 'user.toggle_author' && targetId) {
      const u = await User.findById(targetId);
      if (!u) throw new NotFoundError('User not found');
      u.type = u.type === UserType.AUTHOR ? UserType.READER : UserType.AUTHOR;
      await u.save();
      await ModerationAction.create({
        moderatorId: admin._id,
        targetUserId: u._id,
        targetType: 'user',
        targetId: String(u._id),
        action: u.type === UserType.AUTHOR ? 'grant_author' : 'revoke_author',
        reason: String(payload.reason || 'Admin account type update'),
      });
    } else if (action === 'user.adjust_wallet' && targetId) {
      const amount = Number(payload.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new ValidationError('Enter a positive amount to credit the user wallet.');
      }
      const appCfg = await getSettingsGroup('app');
      await creditWalletIdempotent({
        userId: targetId,
        amount,
        currency: String(payload.currency || appCfg.defaultCurrency || 'NGN'),
        transactionType: TransactionType.DEPOSIT,
        idempotencyKey: `admin_adj_${Date.now()}_${targetId}`,
        metadata: { adminId: String(admin._id), note: payload.note || 'Admin adjustment' },
      });
    } else if (action === 'user.set_wallet_balance' && targetId) {
      const balance = Number(payload.balance);
      if (!Number.isFinite(balance) || balance < 0) {
        throw new ValidationError('Wallet balance must be a valid non-negative number.');
      }
      const appCfg = await getSettingsGroup('app');
      const existingWallet = await Wallet.findOne({ userId: targetId });
      if (existingWallet) {
        existingWallet.balance = balance;
        await existingWallet.save();
      } else {
        await Wallet.create({
          userId: targetId,
          walletNumber: `CP${Date.now().toString().slice(-8)}`,
          balance,
          currency: String(payload.currency || appCfg.defaultCurrency || 'NGN'),
        });
      }
      await ModerationAction.create({
        moderatorId: admin._id,
        targetUserId: targetId,
        targetType: 'wallet',
        targetId,
        action: 'set_wallet_balance',
        reason: `Set wallet balance to ${balance}${payload.note ? ` · ${String(payload.note)}` : ''}`,
      });
    } else if (action === 'post.toggle_global_pin' && targetId) {
      const p = await Post.findById(targetId);
      if (p) {
        p.globalPinned = !p.globalPinned;
        await p.save();
      }
    } else if (action === 'post.update' && targetId) {
      const upd: Record<string, unknown> = {};
      if (payload.title !== undefined) upd.title = String(payload.title);
      if (payload.content !== undefined) upd.content = String(payload.content);
      if (payload.status !== undefined) upd.status = payload.status as PostStatus;
      if (payload.globalPinned !== undefined) upd.globalPinned = Boolean(payload.globalPinned);
      await Post.updateOne({ _id: targetId }, { $set: upd });
    } else if (action === 'post.delete' && targetId) {
      const postDoc = await Post.findById(targetId).select('userId').lean();
      await Post.deleteOne({ _id: targetId });
      await Comment.deleteMany({ postId: targetId });
      await Bookmark.deleteMany({ targetType: 'post', targetId });
      if (postDoc?.userId) {
        await User.updateOne(
          { _id: postDoc.userId, publicationsCount: { $gt: 0 } },
          { $inc: { publicationsCount: -1 } }
        );
      }
      const medias = await Media.find({ targetType: 'post', targetId }).select('_id').lean();
      await Promise.all(medias.map((m) => deleteMediaRecord(String(m._id))));
    } else if (action === 'comment.delete' && targetId) {
      const commentDoc = await Comment.findById(targetId).select('postId').lean();
      await Comment.deleteOne({ _id: targetId });
      if (commentDoc?.postId) {
        await Post.updateOne(
          { _id: commentDoc.postId, commentsCount: { $gt: 0 } },
          { $inc: { commentsCount: -1 } }
        );
      }
    } else if (action === 'story.delete' && targetId) {
      const sf = await StoryFrame.findById(targetId).lean();
      await StoryFrame.deleteOne({ _id: targetId });
      if (sf?.mediaId) await deleteMediaRecord(String(sf.mediaId));
    } else if (action === 'product.set_approval' && targetId) {
      const approval = payload.approval as ProductApproval;
      const doc = await Product.findByIdAndUpdate(targetId, { $set: { approval } }, { new: true });
      if (doc) {
        await ModerationAction.create({
          moderatorId: admin._id,
          targetUserId: doc.userId,
          targetType: 'product',
          targetId: String(doc._id),
          action: approval === ProductApproval.APPROVED ? 'approve_product' : 'reject_product',
          reason: String(payload.notes || ''),
        });
        await dispatchNotification({
          recipientId: doc.userId,
          actorId: admin._id,
          type: 'PRODUCT_REVIEWED',
          category: 'important',
          title:
            approval === ProductApproval.APPROVED
              ? 'Product Approved'
              : approval === ProductApproval.REJECTED
                ? 'Product Rejected'
                : 'Product Pending Review',
          message:
            approval === ProductApproval.APPROVED
              ? `Your product "${doc.title}" has been approved and is visible in the marketplace.`
              : `Your product "${doc.title}" was rejected by moderation.${payload.notes ? ` Note: ${String(payload.notes)}` : ''}`,
          actionUrl: '/business/market',
          forceChannels: true,
        });
      }
    } else if (action === 'product.update' && targetId) {
      const upd: Record<string, unknown> = {};
      if (payload.title !== undefined) upd.title = String(payload.title);
      if (payload.price !== undefined) upd.price = Number(payload.price);
      if (payload.discount !== undefined) upd.discount = Number(payload.discount);
      if (payload.currency !== undefined) upd.currency = String(payload.currency).toUpperCase();
      if (payload.status !== undefined) upd.status = payload.status as ProductStatus;
      if (payload.approval !== undefined) upd.approval = payload.approval as ProductApproval;
      if (payload.isPromoted !== undefined) upd.isPromoted = Boolean(payload.isPromoted);
      await Product.updateOne({ _id: targetId }, { $set: upd });
    } else if (action === 'product.delete' && targetId) {
      await Product.deleteOne({ _id: targetId });
      await Bookmark.deleteMany({ targetType: 'product', targetId });
      const medias = await Media.find({ targetType: 'product', targetId }).select('_id').lean();
      await Promise.all(medias.map((m) => deleteMediaRecord(String(m._id))));
    } else if (action === 'job.set_approval' && targetId) {
      const approval = payload.approval as JobApproval;
      const doc = await JobListing.findByIdAndUpdate(targetId, { $set: { approval } }, { new: true });
      if (doc) {
        await ModerationAction.create({
          moderatorId: admin._id,
          targetUserId: doc.userId,
          targetType: 'job',
          targetId: String(doc._id),
          action: approval === JobApproval.APPROVED ? 'approve_job' : 'reject_job',
          reason: String(payload.notes || ''),
        });
        await dispatchNotification({
          recipientId: doc.userId,
          actorId: admin._id,
          type: 'JOB_REVIEWED',
          category: 'important',
          title:
            approval === JobApproval.APPROVED
              ? 'Job Listing Approved'
              : approval === JobApproval.REJECTED
                ? 'Job Listing Rejected'
                : 'Job Pending Review',
          message:
            approval === JobApproval.APPROVED
              ? `Your job listing "${doc.title}" has been approved.`
              : `Your job listing "${doc.title}" was rejected by moderation.${payload.notes ? ` Note: ${String(payload.notes)}` : ''}`,
          actionUrl: '/business/jobs',
          forceChannels: true,
        });
      }
    } else if (action === 'job.update' && targetId) {
      const upd: Record<string, unknown> = {};
      if (payload.title !== undefined) upd.title = String(payload.title);
      if (payload.income !== undefined) upd.income = payload.income === null ? null : Number(payload.income);
      if (payload.currency !== undefined) upd.currency = String(payload.currency).toUpperCase();
      if (payload.location !== undefined) upd.location = String(payload.location);
      if (payload.status !== undefined) upd.status = payload.status as JobStatus;
      if (payload.approval !== undefined) upd.approval = payload.approval as JobApproval;
      if (payload.isUrgent !== undefined) upd.isUrgent = Boolean(payload.isUrgent);
      if (payload.isRemote !== undefined) upd.isRemote = Boolean(payload.isRemote);
      if (payload.isPromoted !== undefined) upd.isPromoted = Boolean(payload.isPromoted);
      await JobListing.updateOne({ _id: targetId }, { $set: upd });
    } else if (action === 'job.delete' && targetId) {
      await JobListing.deleteOne({ _id: targetId });
      await JobApplication.deleteMany({ jobId: targetId });
      await Bookmark.deleteMany({ targetType: 'job', targetId });
    } else if ((action === 'business.toggle_verify' || action === 'business.review') && targetId) {
      const b = await BusinessAccount.findById(targetId);
      if (b) {
        if (action === 'business.review' && payload.decision !== undefined) {
          b.verified = payload.decision === 'approved' || payload.decision === 'verified';
        } else {
          b.verified = !b.verified;
        }
        b.isReviewed = true;
        await b.save();
        await ModerationAction.create({
          moderatorId: admin._id,
          targetUserId: b.userId,
          targetType: 'business',
          targetId: String(b._id),
          action: b.verified ? 'verify_business' : 'reject_business',
          reason: String(payload.notes || ''),
        });
        await dispatchNotification({
          recipientId: b.userId,
          actorId: admin._id,
          type: 'BUSINESS_REVIEWED',
          category: 'important',
          title: b.verified ? 'Business Verified' : 'Business Verification Declined',
          message: b.verified
            ? `Your business account "${b.name}" has been verified.`
            : `Your business account "${b.name}" verification was declined or revoked.${payload.notes ? ` Note: ${String(payload.notes)}` : ''}`,
          actionUrl: '/business/settings',
          forceChannels: true,
        });
      }
    } else if (action === 'business.delete' && targetId) {
      await BusinessAccount.deleteOne({ _id: targetId });
    } else if (action === 'chat.delete' && targetId) {
      const chatDoc = await Chat.findById(targetId).lean();
      if (!chatDoc) throw new NotFoundError('Conversation not found.');
      const msgs = await Message.find({ chatId: targetId, mediaId: { $ne: null } })
        .select('mediaId')
        .lean();
      await Promise.all(
        msgs.map((m) => (m.mediaId ? deleteMediaRecord(String(m.mediaId)) : Promise.resolve()))
      );
      await Promise.all([
        Message.deleteMany({ chatId: targetId }),
        Chat.deleteOne({ _id: targetId }),
      ]);
      await ModerationAction.create({
        moderatorId: admin._id,
        targetType: 'chat',
        targetId,
        action: 'delete_chat',
        reason: String(payload.reason || 'Admin deleted conversation'),
      });
      await emitToChat(targetId, 'chat:deleted', { chatId: targetId });
      for (const participant of chatDoc.participants || []) {
        if (participant.userId) {
          await emitToUser(String(participant.userId), 'chat:deleted', { chatId: targetId });
        }
      }
    } else if (action === 'chat.delete_message' && targetId) {
      const msgDoc = await Message.findById(targetId);
      if (!msgDoc) throw new NotFoundError('Message not found.');
      const chatIdStr = String(msgDoc.chatId);
      if (msgDoc.mediaId) {
        await deleteMediaRecord(String(msgDoc.mediaId));
        msgDoc.mediaId = null;
      }
      msgDoc.isDeleted = true;
      msgDoc.content = '[Message removed by administrator]';
      await msgDoc.save();
      await ModerationAction.create({
        moderatorId: admin._id,
        targetUserId: msgDoc.senderId,
        targetType: 'message',
        targetId: String(msgDoc._id),
        action: 'delete_chat_message',
        reason: String(payload.reason || 'Admin moderated chat message'),
      });
      await emitToChat(chatIdStr, 'message:deleted', {
        chatId: chatIdStr,
        messageId: String(msgDoc._id),
      });
    } else if (action === 'chat.create_group') {
      const groupName = String(payload.name || '').trim();
      if (groupName.length < 2) {
        throw new ValidationError('Group name must be at least 2 characters.');
      }
      const rawPwd = String(payload.password || '').trim();
      const slugBase = groupName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
      const createdGroup = await Chat.create({
        chatUuid: crypto.randomUUID(),
        type: ChatType.GROUP,
        participants: [{ userId: admin._id, role: 'owner', joinedAt: new Date() }],
        group: {
          ownerId: admin._id,
          name: groupName.slice(0, 80),
          description: String(payload.description || '').trim().slice(0, 500),
          avatar: String(payload.avatar || '/assets/avatars/presets/avatar-h2mjRO.png').trim(),
          category: String(payload.category || 'General').trim() || 'General',
          slug: `${slugBase || 'room'}-${crypto.randomBytes(2).toString('hex')}`,
          inviteCode: generateGroupInviteCode(groupName),
          visibility:
            payload.visibility === GroupVisibility.PRIVATE
              ? GroupVisibility.PRIVATE
              : GroupVisibility.PUBLIC,
          privacy: payload.requiresApproval ? GroupPrivacy.CLOSED : GroupPrivacy.OPEN,
          status: GroupStatus.ACTIVE,
          verified: payload.verified !== false,
          verifiedAt: payload.verified !== false ? new Date() : null,
          isPinned: Boolean(payload.isPinned),
          autoJoin: Boolean(payload.autoJoin),
          unleavable: Boolean(payload.unleavable),
          postingMode: payload.postingMode === 'admins_only' ? 'admins_only' : 'everyone',
          requiresApproval: Boolean(payload.requiresApproval),
          isPasswordProtected: rawPwd.length > 0,
          passwordHash: rawPwd.length > 0 ? hashGroupPassword(rawPwd) : null,
          isPaid: Boolean(payload.isPaid && Number(payload.entryPrice || 0) > 0),
          entryPrice: payload.isPaid ? Math.max(0, Number(payload.entryPrice || 0)) : 0,
          monetizationNote: String(payload.monetizationNote || '').trim().slice(0, 240),
        },
        lastMessagePreview: String(payload.welcomeMessage || 'Community group created').slice(0, 120),
        lastActivity: new Date(),
      });
      if (String(payload.welcomeMessage || '').trim()) {
        const welcome = await Message.create({
          chatId: createdGroup._id,
          chatUuid: createdGroup.chatUuid,
          senderId: admin._id,
          type: MessageType.TEXT,
          content: String(payload.welcomeMessage).trim(),
          deliveredTo: [admin._id],
          readBy: [admin._id],
        });
        createdGroup.lastMessageId = welcome._id;
        await createdGroup.save();
      }
      await ModerationAction.create({
        moderatorId: admin._id,
        targetType: 'chat',
        targetId: String(createdGroup._id),
        action: 'create_group',
        reason: `Created community group "${groupName}"`,
      });
    } else if (action === 'chat.update_group' && targetId) {
      const chatDoc = await Chat.findById(targetId);
      if (!chatDoc || chatDoc.type !== ChatType.GROUP || !chatDoc.group) {
        throw new NotFoundError('Group not found.');
      }
      if (typeof payload.name === 'string' && payload.name.trim()) {
        chatDoc.group.name = payload.name.trim().slice(0, 80);
      }
      if (typeof payload.description === 'string') {
        chatDoc.group.description = payload.description.trim().slice(0, 500);
      }
      if (typeof payload.category === 'string' && payload.category.trim()) {
        chatDoc.group.category = payload.category.trim().slice(0, 40);
      }
      if (typeof payload.avatar === 'string' && payload.avatar.trim()) {
        chatDoc.group.avatar = payload.avatar.trim();
      }
      if (typeof payload.isPinned === 'boolean') chatDoc.group.isPinned = payload.isPinned;
      if (typeof payload.autoJoin === 'boolean') chatDoc.group.autoJoin = payload.autoJoin;
      if (typeof payload.unleavable === 'boolean') chatDoc.group.unleavable = payload.unleavable;
      if (typeof payload.requiresApproval === 'boolean') {
        chatDoc.group.requiresApproval = payload.requiresApproval;
      }
      if (payload.postingMode === 'admins_only' || payload.postingMode === 'everyone') {
        chatDoc.group.postingMode = payload.postingMode;
      }
      if (payload.visibility === GroupVisibility.PUBLIC || payload.visibility === GroupVisibility.PRIVATE) {
        chatDoc.group.visibility = payload.visibility;
      }
      if (typeof payload.verified === 'boolean') {
        chatDoc.group.verified = payload.verified;
        chatDoc.group.verifiedAt = payload.verified ? new Date() : null;
      }
      if (payload.status === GroupStatus.ACTIVE || payload.status === GroupStatus.SUSPENDED) {
        chatDoc.group.status = payload.status;
      }
      if (payload.clearPassword) {
        chatDoc.group.isPasswordProtected = false;
        chatDoc.group.passwordHash = null;
      } else if (typeof payload.password === 'string' && payload.password.trim()) {
        chatDoc.group.isPasswordProtected = true;
        chatDoc.group.passwordHash = hashGroupPassword(payload.password.trim());
      }
      if (typeof payload.isPaid === 'boolean' || payload.entryPrice !== undefined) {
        const nextPrice = Math.max(0, Number(payload.entryPrice ?? chatDoc.group.entryPrice ?? 0));
        const nextPaid = payload.isPaid !== undefined ? Boolean(payload.isPaid && nextPrice > 0) : Boolean(chatDoc.group.isPaid && nextPrice > 0);
        chatDoc.group.isPaid = nextPaid;
        chatDoc.group.entryPrice = nextPaid ? Number(nextPrice.toFixed(2)) : 0;
      }
      if (typeof payload.monetizationNote === 'string') {
        chatDoc.group.monetizationNote = payload.monetizationNote.trim().slice(0, 240);
      }
      await chatDoc.save();
      await ModerationAction.create({
        moderatorId: admin._id,
        targetType: 'chat',
        targetId,
        action: 'update_group',
        reason: `Admin updated group "${chatDoc.group.name}"`,
      });
    } else if (action === 'chat.broadcast_groups') {
      const content = String(payload.message || '').trim();
      if (!content) {
        throw new ValidationError('Broadcast message content is required.');
      }
      const targetGroups = await Chat.find({
        type: ChatType.GROUP,
        'group.status': GroupStatus.ACTIVE,
      }).limit(50);
      for (const grp of targetGroups) {
        const bMsg = await Message.create({
          chatId: grp._id,
          chatUuid: grp.chatUuid,
          senderId: admin._id,
          type: MessageType.TEXT,
          content,
          deliveredTo: [admin._id],
          readBy: [admin._id],
        });
        grp.lastMessageId = bMsg._id;
        grp.lastMessagePreview = content.slice(0, 120);
        grp.lastActivity = new Date();
        await grp.save();
        await emitToChat(String(grp._id), 'chat:message:received', { chatId: String(grp._id) });
        publishChatRealtimeEvent(String(grp._id), 'message', { lastMessageId: String(bMsg._id) });
      }
      await ModerationAction.create({
        moderatorId: admin._id,
        targetType: 'chat',
        targetId: 'broadcast',
        action: 'broadcast_group_message',
        reason: `Broadcasted announcement to ${targetGroups.length} group(s)`,
      });
    } else if (action === 'ad.set_approval' && targetId) {
      const approval = payload.approval as AdApproval;
      const adDoc = await Ad.findByIdAndUpdate(targetId, { $set: { approval } }, { new: true });
      if (adDoc) {
        await ModerationAction.create({
          moderatorId: admin._id,
          targetUserId: adDoc.userId,
          targetType: 'ad',
          targetId: String(adDoc._id),
          action: approval === AdApproval.APPROVED ? 'approve_ad' : 'reject_ad',
          reason: String(payload.notes || ''),
        });
        await dispatchNotification({
          recipientId: adDoc.userId,
          actorId: admin._id,
          type: 'AD_REVIEWED',
          category: 'important',
          title:
            approval === AdApproval.APPROVED
              ? 'Ad Campaign Approved'
              : approval === AdApproval.REJECTED
                ? 'Ad Campaign Rejected'
                : 'Ad Pending Review',
          message:
            approval === AdApproval.APPROVED
              ? `Your ad "${adDoc.title}" has been approved.`
              : `Your ad "${adDoc.title}" was rejected.${payload.notes ? ` Note: ${String(payload.notes)}` : ''}`,
          actionUrl: '/business/ads',
          forceChannels: true,
        });
      }
    } else if (action === 'ad.set_status' && targetId) {
      const status = payload.status as AdStatus;
      const adDoc = await Ad.findByIdAndUpdate(targetId, { $set: { status } }, { new: true });
      if (adDoc) {
        await ModerationAction.create({
          moderatorId: admin._id,
          targetUserId: adDoc.userId,
          targetType: 'ad',
          targetId: String(adDoc._id),
          action: status === AdStatus.PAUSED ? 'pause_ad' : 'publish_ad',
          reason: String(payload.notes || ''),
        });
      }
    } else if (action === 'ad.adjust_billing' && targetId) {
      const adDoc = await Ad.findById(targetId);
      if (!adDoc) throw new NotFoundError('Ad campaign not found.');
      const appCfg = await getSettingsGroup('app');
      const currency = appCfg.defaultCurrency || 'NGN';

      if (payload.pricePerView !== undefined) {
        const rate = Number(payload.pricePerView);
        if (!Number.isFinite(rate) || rate < 0.01) {
          throw new ValidationError('Price per view must be greater than 0.');
        }
        adDoc.pricePerView = Number(rate.toFixed(2));
      }
      if (payload.totalBudget !== undefined) {
        const nextBudget = Number(payload.totalBudget);
        if (!Number.isFinite(nextBudget) || nextBudget < adDoc.spentBudget) {
          throw new ValidationError('Total budget cannot be less than spent budget.');
        }
        const { nextAllocated } = await adjustAdBudgetInWallet({
          ad: adDoc,
          nextBudget,
          currency,
        });
        adDoc.totalBudget = Number(nextBudget.toFixed(2));
        adDoc.allocatedBudget = nextAllocated;
        if (adDoc.status === AdStatus.COMPLETED && adDoc.totalBudget > adDoc.spentBudget) {
          adDoc.status = AdStatus.PUBLISHED;
        }
      }
      if (payload.resetDailyCap) {
        adDoc.dailySpent = 0;
        adDoc.dailySpentDate = null;
        adDoc.lastChargeAt = null;
      }
      await adDoc.save();
      await ModerationAction.create({
        moderatorId: admin._id,
        targetUserId: adDoc.userId,
        targetType: 'ad',
        targetId: String(adDoc._id),
        action: 'adjust_ad_billing',
        reason: String(payload.notes || 'Adjusted ad credit billing parameters'),
      });
    } else if (action === 'ad.delete' && targetId) {
      const adDoc = await Ad.findById(targetId);
      if (adDoc) {
        const appCfg = await getSettingsGroup('app');
        await deleteAdAndRefundUnspent({
          ad: adDoc,
          currency: appCfg.defaultCurrency || 'NGN',
        });
        await ModerationAction.create({
          moderatorId: admin._id,
          targetUserId: adDoc.userId,
          targetType: 'ad',
          targetId: String(adDoc._id),
          action: 'delete_ad',
          reason: String(payload.notes || 'Deleted ad campaign via admin panel'),
        });
      }
    } else if (action === 'media.delete' && targetId) {
      await deleteMediaRecord(targetId);
    } else if (action === 'report.delete' && targetId) {
      await Report.deleteOne({ _id: targetId });
    } else if (action === 'cashout.delete' && targetId) {
      await Cashout.deleteOne({ _id: targetId });
    } else if (action === 'report.resolve' && targetId) {
      const rawStatus = String(payload.status || '').toLowerCase();
      const status =
        rawStatus === 'resolved' || rawStatus === 'processed'
          ? ReportStatus.PROCESSED
          : rawStatus === 'dismissed' || rawStatus === 'ignored'
            ? ReportStatus.IGNORED
            : ReportStatus.PROCESSED;
      const report = await Report.findByIdAndUpdate(
        targetId,
        { $set: { status, reviewerId: admin._id, reviewerNotes: String(payload.notes || '') } },
        { new: true }
      );
      if (report && payload.removeContent) {
        const rid = report.reportableId;
        const rtype = String(report.reportableType || '');
        if (rtype === 'post') await Post.deleteOne({ _id: rid });
        else if (rtype === 'comment') await Comment.deleteOne({ _id: rid });
        else if (rtype === 'product') await Product.deleteOne({ _id: rid });
        else if (rtype === 'story') await StoryFrame.deleteOne({ _id: rid });
        else if (rtype === 'job') await JobListing.deleteOne({ _id: rid });
        else if (rtype === 'message') await Message.deleteOne({ _id: rid });
        else if (rtype === 'group' || rtype === 'chat') {
          await Chat.deleteOne({ _id: rid });
        } else if (rtype === 'user') {
          await User.updateOne({ _id: rid }, { $set: { status: UserStatus.BLOCKED } });
        }
      }
      await ModerationAction.create({
        moderatorId: admin._id,
        targetType: report?.reportableType || 'report',
        targetId: String(report?.reportableId || targetId),
        action: payload.removeContent
          ? 'remove_content'
          : status === ReportStatus.IGNORED
            ? 'dismiss_report'
            : 'resolve_report',
        reason: String(payload.notes || ''),
      });
    } else if (action === 'blacklist.add') {
      const value = String(payload.value || '').trim();
      if (!value) {
        throw new ValidationError('Blacklist value is required.');
      }
      const rawType = String(payload.type || BlacklistType.IP).toLowerCase();
      const normalizedType = (rawType === 'ip' ? BlacklistType.IP : rawType) as BlacklistType;
      const allowedTypes = Object.values(BlacklistType);
      if (!allowedTypes.includes(normalizedType)) {
        throw new ValidationError(`Invalid blacklist type: ${rawType}`);
      }
      const expiresInDays = Number(payload.expiresInDays || 0);
      const expiresAt =
        Number.isFinite(expiresInDays) && expiresInDays > 0
          ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
          : null;
      await Blacklist.updateOne(
        { blacklistable: value },
        {
          $set: {
            adminId: admin._id,
            type: normalizedType,
            blacklistable: value,
            reason: String(payload.reason || ''),
            expiresAt,
            addedAt: new Date(),
          },
        },
        { upsert: true }
      );
      await ModerationAction.create({
        moderatorId: admin._id,
        targetType: `blacklist:${normalizedType}`,
        targetId: value,
        action: 'blacklist_add',
        reason: String(payload.reason || value),
        expiresAt,
      });
    } else if (action === 'blacklist.delete' && targetId) {
      await Blacklist.deleteOne({ _id: targetId });
    } else if (action === 'censor.add' || action === 'censor.update') {
      const word = String(payload.word || '').toLowerCase().trim();
      if (!word) {
        throw new ValidationError('Censored word is required.');
      }
      const rawLevel = String(payload.level || CensorLevel.REPLACED).toLowerCase();
      const normalizedLevel = (
        rawLevel === 'mask'
          ? CensorLevel.REPLACED
          : rawLevel === 'block'
            ? CensorLevel.WARNING
            : rawLevel === 'ban'
              ? CensorLevel.BANNED
              : rawLevel
      ) as CensorLevel;
      const allowedLevels = Object.values(CensorLevel);
      if (!allowedLevels.includes(normalizedLevel)) {
        throw new ValidationError(`Invalid censor level: ${rawLevel}`);
      }
      if (action === 'censor.update' && targetId) {
        await Censor.updateOne({ _id: targetId }, { $set: { word, level: normalizedLevel } });
      } else {
        await Censor.updateOne(
          { word },
          { $set: { word, level: normalizedLevel } },
          { upsert: true }
        );
      }
    } else if (action === 'censor.delete' && targetId) {
      await Censor.deleteOne({ _id: targetId });
    } else if (action === 'authorship.review' && targetId) {
      const reqDoc = await AuthorshipRequest.findById(targetId);
      if (reqDoc) {
        const approve = payload.decision === 'approved';
        reqDoc.status = approve ? ASRStatus.APPROVED : ASRStatus.REJECTED;
        if (payload.notes !== undefined) {
          reqDoc.reviewerNotes = String(payload.notes || '');
        }
        await reqDoc.save();
        if (approve) {
          await User.updateOne({ _id: reqDoc.userId }, { $set: { type: UserType.AUTHOR } });
        }
        await ModerationAction.create({
          moderatorId: admin._id,
          targetUserId: reqDoc.userId,
          targetType: 'authorship',
          targetId: String(reqDoc._id),
          action: approve ? 'approve_authorship' : 'reject_authorship',
          reason: String(payload.notes || ''),
        });
        await dispatchNotification({
          recipientId: reqDoc.userId,
          actorId: admin._id,
          type: 'AUTHORSHIP_REVIEWED',
          category: 'important',
          title: approve ? 'Author Status Approved' : 'Author Request Declined',
          message: approve
            ? 'Your account has been upgraded to Author status.'
            : `Your authorship request was declined.${payload.notes ? ` Note: ${String(payload.notes)}` : ''}`,
          actionUrl: '/settings',
          forceChannels: true,
        });
      }
    } else if (action === 'cashout.review' && targetId) {
      const decision =
        payload.decision === 'paid' || payload.decision === 'approved' ? 'paid' : 'rejected';
      await reviewCashout({
        adminId: String(admin._id),
        cashoutId: targetId,
        decision,
        reviewerNotes: payload.notes ? String(payload.notes) : undefined,
      });
      await ModerationAction.create({
        moderatorId: admin._id,
        targetType: 'cashout',
        targetId,
        action: decision === 'paid' ? 'approve_cashout' : 'reject_cashout',
        reason: String(payload.notes || ''),
      });
    } else if (action === 'category.upsert') {
      const locPayload =
        payload.localization && typeof payload.localization === 'object'
          ? (payload.localization as Record<string, string>)
          : { en: String(payload.name || 'Category').trim() };
      const cleanedLocalization = Object.fromEntries(
        Object.entries(locPayload)
          .map(([k, v]) => [k.trim().toLowerCase(), String(v || '').trim()])
          .filter(([k, v]) => Boolean(k) && Boolean(v))
      );
      if (!cleanedLocalization.en) {
        cleanedLocalization.en = String(payload.name || Object.values(cleanedLocalization)[0] || 'Category').trim();
      }
      const nextType = (payload.type as CategoryType) || CategoryType.PRODUCT;
      const nextStatus = (payload.status as CategoryStatus) || CategoryStatus.ACTIVE;
      if (targetId) {
        await Category.updateOne(
          { _id: targetId },
          {
            $set: {
              localization: cleanedLocalization,
              categorizableType: nextType,
              status: nextStatus,
            },
          }
        );
      } else {
        await Category.create({
          localization: cleanedLocalization,
          categorizableType: nextType,
          status: nextStatus,
        });
      }
    } else if (action === 'category.delete' && targetId) {
      await Promise.all([
        Category.deleteOne({ _id: targetId }),
        Product.updateMany({ categoryId: targetId }, { $set: { categoryId: null } }),
        JobListing.updateMany({ categoryId: targetId }, { $set: { categoryId: null } }),
      ]);
    } else if (action === 'currency.upsert') {
      const code = String(payload.alpha3Code || '').trim().toUpperCase();
      if (code.length !== 3) {
        throw new ValidationError('Currency code must be a 3-letter ISO code (e.g. NGN, USD).');
      }
      const existing = await Currency.findOne({ alpha3Code: code });
      const nextStatus = payload.status === undefined ? true : Boolean(payload.status);
      if (existing?.isDefault && !nextStatus) {
        throw new ValidationError('Default currency cannot be disabled.');
      }
      await Currency.updateOne(
        { alpha3Code: code },
        {
          $set: {
            alpha3Code: code,
            name: String(payload.name || code).trim(),
            symbol: String(payload.symbol || code).trim(),
            symbolNative: String(payload.symbolNative || payload.symbol || code).trim(),
            order: Number(payload.order ?? existing?.order ?? 1),
            status: existing?.isDefault ? true : nextStatus,
          },
        },
        { upsert: true }
      );
    } else if (action === 'currency.set_default' && targetId) {
      const targetCur = await Currency.findById(targetId);
      if (targetCur) {
        await Currency.updateMany({}, { $set: { isDefault: false } });
        targetCur.isDefault = true;
        targetCur.status = true;
        await targetCur.save();
        await Promise.all([
          updateSettingsGroup('app', { defaultCurrency: targetCur.alpha3Code }),
          Wallet.updateMany({}, { $set: { currency: targetCur.alpha3Code } }),
        ]);
        revalidatePath('/', 'layout');
      }
    } else if (action === 'currency.delete' && targetId) {
      const targetCur = await Currency.findById(targetId);
      if (targetCur?.isDefault) {
        throw new ValidationError('Cannot delete the default currency.');
      }
      await Currency.deleteOne({ _id: targetId });
    } else if (action === 'locale.upsert') {
      const code = String(payload.alpha2Code || '').trim().toLowerCase();
      if (code.length !== 2) {
        throw new ValidationError('Locale code must be a 2-letter ISO code (e.g. en, fr, ar).');
      }
      const existing = await Locale.findOne({ alpha2Code: code });
      const nextStatus = payload.status === undefined ? true : Boolean(payload.status);
      if (existing?.isDefault && !nextStatus) {
        throw new ValidationError('Default language cannot be disabled.');
      }
      await Locale.updateOne(
        { alpha2Code: code },
        {
          $set: {
            alpha2Code: code,
            name: String(payload.name || code.toUpperCase()).trim(),
            nativeName: String(payload.nativeName || payload.name || code).trim(),
            direction: payload.direction === 'rtl' ? 'rtl' : 'ltr',
            order: Number(payload.order ?? existing?.order ?? 1),
            status: existing?.isDefault ? true : nextStatus,
          },
        },
        { upsert: true }
      );
      if (!nextStatus && existing) {
        const defLoc = await Locale.findOne({ isDefault: true }).lean();
        await User.updateMany(
          { language: existing.alpha2Code },
          { $set: { language: defLoc?.alpha2Code || 'en' } }
        );
      }
    } else if (action === 'locale.set_default' && targetId) {
      const targetLoc = await Locale.findById(targetId);
      if (targetLoc) {
        await Locale.updateMany({}, { $set: { isDefault: false } });
        targetLoc.isDefault = true;
        targetLoc.status = true;
        await targetLoc.save();
        await updateSettingsGroup('app', { locale: targetLoc.alpha2Code });
      }
    } else if (action === 'locale.delete' && targetId) {
      const targetLoc = await Locale.findById(targetId);
      if (targetLoc?.isDefault) {
        throw new ValidationError('Cannot delete the default language.');
      }
      if (targetLoc?.alpha2Code === 'en') {
        throw new ValidationError('Permanent locale "en" cannot be deleted.');
      }
      await Locale.deleteOne({ _id: targetId });
    } else if (action === 'static_page.upsert') {
      const normalizedSlug = String(payload.slug || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const title = String(payload.title || '').trim();
      if (!normalizedSlug || !title) {
        throw new ValidationError('Static page slug and title are required.');
      }
      const existingPage = await StaticPage.findOne({ slug: normalizedSlug }).lean();
      const targetLocale = String(payload.locale || 'en').trim().toLowerCase() || 'en';
      const nextContentByLocale: Record<string, string> = {
        ...(existingPage?.contentByLocale || {}),
        ...(payload.contentByLocale && typeof payload.contentByLocale === 'object'
          ? (payload.contentByLocale as Record<string, string>)
          : { [targetLocale]: String(payload.content ?? '') }),
      };
      await StaticPage.updateOne(
        { slug: normalizedSlug },
        {
          $set: {
            slug: normalizedSlug,
            title,
            contentByLocale: nextContentByLocale,
          },
        },
        { upsert: true }
      );
      revalidatePath('/document/[slug]', 'page');
      revalidatePath(`/document/${normalizedSlug}`);
    } else if (action === 'static_page.delete' && targetId) {
      await StaticPage.deleteOne({ _id: targetId });
      revalidatePath('/document/[slug]', 'page');
    } else if (action === 'settings.update') {
      const group = payload.group as keyof AppSettingsMap;
      const values = (payload.values as Record<string, unknown>) || {};
      if (group === 'wallet') {
        const dMin = Number(values.depositMinAmount);
        const dMax = Number(values.depositMaxAmount);
        const tMin = Number(values.transferMinAmount);
        const tMax = Number(values.transferMaxAmount);
        const wMin = Number(values.withdrawMinAmount);
        const wMax = Number(values.withdrawMaxAmount);
        if (Number.isFinite(dMin) && Number.isFinite(dMax) && dMin > dMax) {
          throw new ValidationError('Minimum deposit cannot exceed maximum deposit.');
        }
        if (Number.isFinite(tMin) && Number.isFinite(tMax) && tMin > tMax) {
          throw new ValidationError('Minimum transfer cannot exceed maximum transfer.');
        }
        if (Number.isFinite(wMin) && Number.isFinite(wMax) && wMin > wMax) {
          throw new ValidationError('Minimum withdrawal cannot exceed maximum withdrawal.');
        }
      }
      await updateSettingsGroup(group, values);
      if (group === 'brand') {
        clearWatermarkCache();
      }
      if (group === 'app') {
        if (typeof values.defaultCurrency === 'string' && values.defaultCurrency.trim()) {
          const code = values.defaultCurrency.trim().toUpperCase();
          await Currency.updateMany({}, { $set: { isDefault: false } });
          await Currency.updateOne({ alpha3Code: code }, { $set: { isDefault: true, status: true } });
          await Wallet.updateMany({}, { $set: { currency: code } });
        }
        if (typeof values.locale === 'string' && values.locale.trim()) {
          const code = values.locale.trim().toLowerCase();
          await Locale.updateMany({}, { $set: { isDefault: false } });
          await Locale.updateOne({ alpha2Code: code }, { $set: { isDefault: true, status: true } });
        }
      }
      revalidatePath('/', 'layout');
    } else if (action === 'cache.reset') {
      clearSettingsCache();
      clearWatermarkCache();
      revalidatePath('/', 'layout');
      revalidatePath('/admin', 'page');
    } else if (action === 'mail.test') {
      const res = await sendEmail({
        to: String(payload.to || admin.email),
        subject: 'Weto SMTP Test',
        html: '<p>Your Weto SMTP configuration is working properly.</p>',
      });
      return apiSuccess(res);
    } else if (action === 'announcement.broadcast') {
      const users = await User.find({ deletedAt: null, status: UserStatus.ACTIVE })
        .select('_id')
        .limit(500)
        .lean();
      const title = String(payload.title || 'Platform Announcement');
      const message = String(payload.message || '');
      await Promise.all(
        users.map((u) =>
          dispatchNotification({
            recipientId: u._id,
            actorId: admin._id,
            type: 'ADMIN_ANNOUNCEMENT',
            category: 'important',
            title,
            message,
            actionUrl: '/notifications',
            forceChannels: true,
          })
        )
      );
    } else if (action === 'api_key.revoke' && targetId) {
      await ApiKey.updateOne({ _id: targetId }, { $set: { isActive: false } });
    }

    await writeAuditLog({
      actorId: admin._id,
      action: `admin.${action}`,
      targetType: action.split('.')[0],
      targetId,
      metadata: payload,
    });

    const activeAdmins = await User.find({
      role: { $in: [UserRole.ROOT, UserRole.ADMIN, UserRole.MODERATOR] },
      deletedAt: null,
    })
      .select('_id')
      .lean();
    await emitToAdmins(
      activeAdmins.map((a) => String(a._id)),
      'admin:updated',
      { action, targetId: targetId || null, actorId: String(admin._id), at: Date.now() }
    );

    return apiSuccess({ ok: true, action, targetId: targetId || null });
  } catch (err) {
    return apiError(err);
  }
}
