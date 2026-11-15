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
  JobApproval,
  JobStatus,
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
import { deleteMediaRecord, serializeMedia } from '@/services/media.service';
import {
  clearSettingsCache,
  getSettingsGroup,
  updateSettingsGroup,
  AppSettingsMap,
} from '@/services/settings.service';
import { dispatchNotification } from '@/services/notification.service';
import { writeAuditLog } from '@/lib/audit';
import { sendEmail } from '@/services/mail.service';

export async function GET(req: NextRequest) {
  try {
    await requireAdminAuth(req);
    const { searchParams } = new URL(req.url);
    const resource = searchParams.get('resource') || 'users';
    const q = (searchParams.get('q') || '').trim();
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 40)));

    const re = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;

    if (resource === 'users') {
      const typeFilter = (searchParams.get('type') || 'all').trim();
      const filter: Record<string, unknown> = { deletedAt: null };
      if (typeFilter === 'author') filter.type = UserType.AUTHOR;
      else if (typeFilter === 'reader') filter.type = UserType.READER;
      else if (typeFilter === 'blocked') filter.status = UserStatus.BLOCKED;
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
      const filter: Record<string, unknown> = re ? { $or: [{ title: re }, { content: re }, { hashtags: re }, { location: re }] } : {};
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
      return apiSuccess(posts.map((p) => ({ ...p, media: mediaMap.get(String(p._id)) || [] })));
    }

    if (resource === 'comments') {
      const filter: Record<string, unknown> = re ? { content: re } : {};
      const comments = await Comment.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('userId', 'username avatar')
        .populate('postId', 'hashId')
        .lean();
      return apiSuccess(comments);
    }

    if (resource === 'stories') {
      const stories = await StoryFrame.find(re ? { content: re } : {})
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('userId', 'username firstName lastName avatar')
        .populate('mediaId')
        .lean();
      return apiSuccess(
        stories.map((s) => ({
          ...s,
          media: s.mediaId ? serializeMedia(s.mediaId as never) : null,
        }))
      );
    }

    if (resource === 'marketplace') {
      const filter: Record<string, unknown> = re ? { $or: [{ title: re }, { description: re }, { address: re }] } : {};
      const products = await Product.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('userId', 'username avatar')
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
      const filter: Record<string, unknown> = re ? { $or: [{ title: re }, { overview: re }, { location: re }] } : {};
      const jobs = await JobListing.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('userId', 'username avatar')
        .lean();
      return apiSuccess(jobs);
    }

    if (resource === 'businesses') {
      const filter: Record<string, unknown> = re ? { $or: [{ name: re }, { city: re }, { country: re }, { businessEmail: re }] } : {};
      const businesses = await BusinessAccount.find(filter)
        .sort({ updatedAt: -1 })
        .limit(limit)
        .populate('userId', 'username email')
        .lean();
      return apiSuccess(businesses);
    }

    if (resource === 'chats') {
      const chatFilter: Record<string, unknown> = re
        ? { $or: [{ 'group.name': re }, { 'group.description': re }, { chatUuid: re }] }
        : {};
      const chats = await Chat.find(chatFilter)
        .sort({ lastActivity: -1 })
        .limit(limit)
        .populate('participants.userId', 'username firstName lastName avatar')
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
          messagesCount: countMap.get(String(c._id)) || 0,
        }))
      );
    }

    if (resource === 'ads') {
      const ads = await Ad.find(re ? { $or: [{ title: re }, { content: re }] } : {})
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('userId', 'username')
        .populate('mediaId')
        .lean();
      return apiSuccess(
        ads.map((a) => ({
          ...a,
          media: a.mediaId ? serializeMedia(a.mediaId as never) : null,
        }))
      );
    }

    if (resource === 'reports') {
      const reports = await Report.find(
        re ? { $or: [{ reporterComment: re }, { reportableType: re }, { status: re }] } : {}
      )
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('reporterId', 'username firstName lastName avatar')
        .populate('reviewerId', 'username')
        .lean();
      return apiSuccess(reports);
    }

    if (resource === 'moderation_history') {
      const history = await ModerationAction.find({})
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('moderatorId', 'username')
        .populate('targetUserId', 'username')
        .lean();
      return apiSuccess(history);
    }

    if (resource === 'banning') {
      const [blacklists, censors] = await Promise.all([
        Blacklist.find({}).sort({ addedAt: -1 }).limit(limit).populate('adminId', 'username').lean(),
        Censor.find({}).sort({ word: 1 }).lean(),
      ]);
      return apiSuccess({ blacklists, censors });
    }

    if (resource === 'authorship') {
      const list = await AuthorshipRequest.find({})
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('userId', 'username firstName lastName email avatar type')
        .lean();
      return apiSuccess(list);
    }

    if (resource === 'cashouts') {
      const cashouts = await Cashout.find({})
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('userId', 'username email avatar')
        .lean();
      return apiSuccess(cashouts);
    }

    if (resource === 'acquiring') {
      const [acquiring, wallet] = await Promise.all([
        getSettingsGroup('acquiring'),
        getSettingsGroup('wallet'),
      ]);
      return apiSuccess({ acquiring, wallet });
    }

    if (resource === 'verification') {
      const [verification, pendingAuthorshipCount, verifiedUsersCount] = await Promise.all([
        getSettingsGroup('verification'),
        AuthorshipRequest.countDocuments({ status: ASRStatus.PENDING }),
        User.countDocuments({ deletedAt: null, verified: true }),
      ]);
      return apiSuccess({ verification, pendingAuthorshipCount, verifiedUsersCount });
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
      const [payments, cashouts, wallets] = await Promise.all([
        Payment.find({}).sort({ createdAt: -1 }).limit(limit).populate('userId', 'username email').lean(),
        Cashout.find({}).sort({ createdAt: -1 }).limit(limit).populate('userId', 'username email').lean(),
        Wallet.find({}).sort({ balance: -1 }).limit(limit).populate('userId', 'username email').lean(),
      ]);
      return apiSuccess({ payments, cashouts, wallets });
    }

    if (resource === 'categories') {
      return apiSuccess(await Category.find({}).lean());
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
      const [stats, rawMedia] = await Promise.all([
        DataStat.find({}).lean(),
        Media.find({}).sort({ createdAt: -1 }).limit(50).populate('ownerId', 'username').lean(),
      ]);
      const recentMedia = rawMedia.map((m) => ({
        ...serializeMedia(m as never),
        _id: String(m._id),
        targetType: m.targetType,
        storageProvider: m.storageProvider,
        owner: m.ownerId,
        createdAt: m.createdAt,
      }));
      return apiSuccess({ stats, recentMedia });
    }

    if (resource === 'settings') {
      const groups: Array<keyof AppSettingsMap> = [
        'app',
        'features',
        'auth',
        'brand',
        'wallet',
        'ads',
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
    } else if (action === 'user.toggle_author' && targetId) {
      const u = await User.findById(targetId);
      if (!u) throw new NotFoundError('User not found');
      u.type = u.type === UserType.AUTHOR ? UserType.READER : UserType.AUTHOR;
      await u.save();
    } else if (action === 'user.adjust_wallet' && targetId) {
      const amount = Number(payload.amount || 0);
      if (amount > 0) {
        const appCfg = await getSettingsGroup('app');
        await creditWalletIdempotent({
          userId: targetId,
          amount,
          currency: String(payload.currency || appCfg.defaultCurrency || 'NGN'),
          transactionType: TransactionType.DEPOSIT,
          idempotencyKey: `admin_adj_${Date.now()}_${targetId}`,
          metadata: { adminId: String(admin._id), note: payload.note || 'Admin adjustment' },
        });
      }
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
      await Post.deleteOne({ _id: targetId });
      await Comment.deleteMany({ postId: targetId });
      await Bookmark.deleteMany({ targetType: 'post', targetId });
      const medias = await Media.find({ targetType: 'post', targetId }).select('_id').lean();
      await Promise.all(medias.map((m) => deleteMediaRecord(String(m._id))));
    } else if (action === 'comment.delete' && targetId) {
      await Comment.deleteOne({ _id: targetId });
    } else if (action === 'story.delete' && targetId) {
      const sf = await StoryFrame.findById(targetId).lean();
      await StoryFrame.deleteOne({ _id: targetId });
      if (sf?.mediaId) await deleteMediaRecord(String(sf.mediaId));
    } else if (action === 'product.set_approval' && targetId) {
      await Product.updateOne({ _id: targetId }, { $set: { approval: payload.approval as ProductApproval } });
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
      await JobListing.updateOne({ _id: targetId }, { $set: { approval: payload.approval as JobApproval } });
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
    } else if (action === 'business.toggle_verify' && targetId) {
      const b = await BusinessAccount.findById(targetId);
      if (b) {
        b.verified = !b.verified;
        b.isReviewed = true;
        await b.save();
      }
    } else if (action === 'business.delete' && targetId) {
      await BusinessAccount.deleteOne({ _id: targetId });
    } else if (action === 'chat.delete' && targetId) {
      await Message.deleteMany({ chatId: targetId });
      await Chat.deleteOne({ _id: targetId });
    } else if (action === 'ad.set_approval' && targetId) {
      await Ad.updateOne({ _id: targetId }, { $set: { approval: payload.approval as AdApproval } });
    } else if (action === 'ad.set_status' && targetId) {
      await Ad.updateOne({ _id: targetId }, { $set: { status: payload.status as AdStatus } });
    } else if (action === 'ad.delete' && targetId) {
      await Ad.deleteOne({ _id: targetId });
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
      await Blacklist.updateOne(
        { blacklistable: value },
        {
          $set: {
            adminId: admin._id,
            type: normalizedType,
            blacklistable: value,
            reason: String(payload.reason || ''),
            addedAt: new Date(),
          },
        },
        { upsert: true }
      );
    } else if (action === 'blacklist.delete' && targetId) {
      await Blacklist.deleteOne({ _id: targetId });
    } else if (action === 'censor.add') {
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
      await Censor.updateOne(
        { word },
        { $set: { word, level: normalizedLevel } },
        { upsert: true }
      );
    } else if (action === 'censor.delete' && targetId) {
      await Censor.deleteOne({ _id: targetId });
    } else if (action === 'authorship.review' && targetId) {
      const reqDoc = await AuthorshipRequest.findById(targetId);
      if (reqDoc) {
        const approve = payload.decision === 'approved';
        reqDoc.status = approve ? ASRStatus.APPROVED : ASRStatus.REJECTED;
        await reqDoc.save();
        if (approve) {
          await User.updateOne({ _id: reqDoc.userId }, { $set: { type: UserType.AUTHOR } });
        }
        await dispatchNotification({
          recipientId: reqDoc.userId,
          type: 'AUTHORSHIP_REVIEWED',
          category: 'important',
          title: approve ? 'Author Status Approved' : 'Author Request Declined',
          message: approve
            ? 'Your account has been upgraded to Author status.'
            : 'Your authorship request was declined.',
          actionUrl: '/settings',
          forceChannels: true,
        });
      }
    } else if (action === 'cashout.review' && targetId) {
      await reviewCashout({
        adminId: String(admin._id),
        cashoutId: targetId,
        decision: payload.decision === 'paid' || payload.decision === 'approved' ? 'paid' : 'rejected',
        reviewerNotes: payload.notes ? String(payload.notes) : undefined,
      });
    } else if (action === 'category.upsert') {
      if (targetId) {
        await Category.updateOne(
          { _id: targetId },
          {
            $set: {
              localization: { en: String(payload.name || 'Category') },
              categorizableType: payload.type as CategoryType,
              status: (payload.status as CategoryStatus) || CategoryStatus.ACTIVE,
            },
          }
        );
      } else {
        await Category.create({
          localization: { en: String(payload.name || 'Category') },
          categorizableType: (payload.type as CategoryType) || CategoryType.PRODUCT,
          status: CategoryStatus.ACTIVE,
        });
      }
    } else if (action === 'category.delete' && targetId) {
      await Category.deleteOne({ _id: targetId });
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
      await updateSettingsGroup(group, values);
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

    return apiSuccess({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
