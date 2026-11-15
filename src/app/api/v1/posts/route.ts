import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { getClientIp, getOptionalAuth, requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, NotFoundError, ValidationError } from '@/lib/api-response';
import { Bookmark, Post, Reaction } from '@/models/Post';
import { Media } from '@/models/Media';
import { Follow, Mute } from '@/models/SocialGraph';
import { User } from '@/models/User';
import { FollowStatus, MediaType, PostStatus, PostType } from '@/types/enums';
import { extractHashtags, extractMentions, extractUrls } from '@/lib/utils';
import { encodeId } from '@/lib/hashids';
import { enforceCensorForUser } from '@/services/censor-blacklist.service';
import { fetchLinkSnapshot } from '@/services/link-preview.service';
import { getBlockedUserIdsFor } from '@/services/relations.service';
import { serializeMedia } from '@/services/media.service';
import { dispatchNotification } from '@/services/notification.service';
import { publishFeedRealtimeEvent } from '@/lib/firebase/realtime';
import { getViewerSignalProfile, rankPostsFacebookStyle } from '@/services/feed-ranking.service';

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const authCtx = await getOptionalAuth(req);
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode') || 'feed'; // feed | explore | trending | bookmarks | user | user_media
    const username = searchParams.get('username');
    const hashtag = searchParams.get('hashtag');
    const q = (searchParams.get('q') || '').trim();
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const limit = Math.min(30, Math.max(1, Number(searchParams.get('limit') || 15)));
    const onsetRaw = searchParams.get('onset');

    const [blockedIds, mutedIds] = authCtx
      ? await Promise.all([
        getBlockedUserIdsFor(String(authCtx.user._id)),
        Mute.find({ muterId: authCtx.user._id }).distinct('mutedId'),
      ])
      : [[], []];
    const hiddenAuthorIds = [...blockedIds, ...mutedIds];

    const filter: Record<string, unknown> = {
      status: { $in: [PostStatus.ACTIVE, PostStatus.PUBLISHED] },
      ...(hiddenAuthorIds.length > 0 ? { userId: { $nin: hiddenAuthorIds } } : {}),
    };

    if (onsetRaw) {
      const onsetDate = new Date(onsetRaw);
      if (!Number.isNaN(onsetDate.getTime())) {
        filter.createdAt = { $gt: onsetDate };
      }
    }

    if (mode === 'feed' && authCtx) {
      const followingIds = await Follow.find({
        followerId: authCtx.user._id,
        status: FollowStatus.FOLLOWING,
      }).distinct('followingId');

      const allowedAuthors = [authCtx.user._id, ...followingIds];
      const hasFollowedOrAuthoredPosts =
        authCtx.user.role !== 'root' && followingIds.length > 0
          ? await Post.exists({
            userId: { $in: allowedAuthors },
            status: { $in: [PostStatus.ACTIVE, PostStatus.PUBLISHED, PostStatus.PROCESSING_VIDEO] },
          })
          : false;

      if (hasFollowedOrAuthoredPosts) {
        filter.$or = [
          { userId: { $in: allowedAuthors }, status: { $in: [PostStatus.ACTIVE, PostStatus.PUBLISHED] } },
          { userId: authCtx.user._id, status: PostStatus.PROCESSING_VIDEO },
          { globalPinned: true },
        ];
      } else {
        filter.$or = [
          {
            status: { $in: [PostStatus.ACTIVE, PostStatus.PUBLISHED] },
            ...(hiddenAuthorIds.length > 0 ? { userId: { $nin: hiddenAuthorIds } } : {}),
          },
          { userId: authCtx.user._id, status: PostStatus.PROCESSING_VIDEO },
        ];
      }
      delete filter.status;
    } else if ((mode === 'user' || mode === 'user_media') && username) {
      const profileUser = await User.findOne({
        username: username.replace(/^@/, '').toLowerCase(),
        deletedAt: null,
      }).select('_id');
      if (!profileUser) throw new NotFoundError('User not found.');
      filter.userId = profileUser._id;
      if (mode === 'user_media') {
        const mediaPostIds = await Media.distinct('targetId', {
          userId: profileUser._id,
          targetType: 'post',
          type: { $in: [MediaType.IMAGE, MediaType.VIDEO, MediaType.GIF] },
        });
        filter.$or = [
          { _id: { $in: mediaPostIds } },
          { gifUrl: { $exists: true, $nin: [null, ''] } },
        ];
      }
    } else if (mode === 'bookmarks' && authCtx) {
      const bms = await Bookmark.find({ userId: authCtx.user._id, targetType: 'post' })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      filter._id = { $in: bms.map((b) => b.targetId) };
    }

    if (hashtag) {
      filter.hashtags = hashtag.replace(/^#/, '').toLowerCase();
    }

    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$and = [
        ...(Array.isArray(filter.$and) ? (filter.$and as Record<string, unknown>[]) : []),
        {
          $or: [
            { content: { $regex: escaped, $options: 'i' } },
            { title: { $regex: escaped, $options: 'i' } },
            { hashtags: { $regex: escaped, $options: 'i' } },
          ],
        },
      ];
    }

    type PostRow = Record<string, unknown> & {
      _id: unknown;
      userId?: unknown;
      status?: string;
      reactionSummary?: Array<{ count?: number }>;
      poll?: { choices?: Array<{ votesCount?: number }>;[key: string]: unknown } | null;
    };

    const useFacebookFeedRanking =
      !q && !hashtag && (mode === 'feed' || mode === 'explore' || mode === 'trending');

    let slicedPosts: PostRow[] = [];
    let hasMore = false;

    if (useFacebookFeedRanking) {
      const [viewerSignals, networkAndFeaturedPosts] = await Promise.all([
        authCtx ? getViewerSignalProfile(authCtx.user._id) : Promise.resolve(null),
        Post.find(filter)
          .sort({ globalPinned: -1, createdAt: -1 })
          .limit(Math.min(180, Math.max(60, (page + 2) * limit)))
          .populate('userId', 'username firstName lastName avatar verified type')
          .populate({
            path: 'quotePostId',
            populate: { path: 'userId', select: 'username firstName lastName avatar verified' },
          })
          .lean(),
      ]);

      let candidatePool = networkAndFeaturedPosts as unknown as PostRow[];

      // Facebook Discovery Blend ("Suggested for you"):
      // When followed/network pool is thin, blend unblocked/unmuted public high-engagement posts
      if (mode === 'feed' && candidatePool.length < page * limit + 5) {
        const existingIds = new Set(candidatePool.map((p) => String(p._id)));
        const discoveryFilter: Record<string, unknown> = {
          status: { $in: [PostStatus.ACTIVE, PostStatus.PUBLISHED] },
          ...(hiddenAuthorIds.length > 0 ? { userId: { $nin: hiddenAuthorIds } } : {}),
        };
        const extraPublic = await Post.find(discoveryFilter)
          .sort({ createdAt: -1 })
          .limit(60)
          .populate('userId', 'username firstName lastName avatar verified type')
          .populate({
            path: 'quotePostId',
            populate: { path: 'userId', select: 'username firstName lastName avatar verified' },
          })
          .lean();

        const novelPublic = extraPublic.filter((p) => !existingIds.has(String(p._id)));
        candidatePool = [
          ...candidatePool,
          ...(novelPublic as unknown as PostRow[]),
        ];
      }

      const ranked = rankPostsFacebookStyle({
        posts: candidatePool,
        viewerSignals,
        mode,
      });

      const startIdx = (page - 1) * limit;
      slicedPosts = ranked.slice(startIdx, startIdx + limit);
      hasMore = ranked.length > startIdx + limit;
    } else {
      const sortSpec: Record<string, 1 | -1> =
        mode === 'trending'
          ? {
            globalPinned: -1,
            commentsCount: -1,
            bookmarksCount: -1,
            viewsCount: -1,
            quotesCount: -1,
            createdAt: -1,
          }
          : mode === 'user'
            ? { profilePinned: -1, createdAt: -1 }
            : {
              globalPinned: -1,
              createdAt: -1,
              commentsCount: -1,
              bookmarksCount: -1,
              viewsCount: -1,
              quotesCount: -1,
            };

      const rawPosts = await Post.find(filter)
        .sort(sortSpec)
        .skip(mode === 'bookmarks' ? 0 : (page - 1) * limit)
        .limit(limit + 1)
        .populate('userId', 'username firstName lastName avatar verified type')
        .populate({
          path: 'quotePostId',
          populate: { path: 'userId', select: 'username firstName lastName avatar verified' },
        })
        .lean();

      hasMore = mode === 'bookmarks' ? false : rawPosts.length > limit;
      slicedPosts = (hasMore ? rawPosts.slice(0, limit) : rawPosts) as unknown as PostRow[];
    }

    // Keep own active processing uploads merged cleanly at top of page 1
    const posts =
      page === 1 && mode === 'feed'
        ? [
          ...slicedPosts.filter((p) => p.status === PostStatus.PROCESSING_VIDEO),
          ...slicedPosts.filter((p) => p.status !== PostStatus.PROCESSING_VIDEO),
        ]
        : slicedPosts;
    const total = (page - 1) * limit + posts.length + (hasMore ? 1 : 0);

    const postIds = posts.map((p) => p._id);
    const [mediaRows, userReactions, userBookmarks] = await Promise.all([
      Media.find({ targetType: 'post', targetId: { $in: postIds } })
        .sort({ order: 1 })
        .lean(),
      authCtx
        ? Reaction.find({
          targetType: 'post',
          targetId: { $in: postIds },
          userId: authCtx.user._id,
        }).lean()
        : [],
      authCtx
        ? Bookmark.find({
          userId: authCtx.user._id,
          targetType: 'post',
          targetId: { $in: postIds },
        }).lean()
        : [],
    ]);

    const mediaMap = new Map<string, ReturnType<typeof serializeMedia>[]>();
    for (const m of mediaRows) {
      const key = String(m.targetId);
      const arr = mediaMap.get(key) || [];
      arr.push(serializeMedia(m as never));
      mediaMap.set(key, arr);
    }

    const reactMap = new Map<string, string[]>();
    for (const r of userReactions) {
      const k = String(r.targetId);
      const arr = reactMap.get(k) || [];
      arr.push(r.unifiedId);
      reactMap.set(k, arr);
    }

    const bmSet = new Set(userBookmarks.map((b) => String(b.targetId)));

    const items = posts.map((p) => {
      const reactionsCount = Array.isArray(p.reactionSummary)
        ? p.reactionSummary.reduce((sum, r) => sum + ((r as { count?: number }).count || 0), 0)
        : 0;
      const pollTotal = p.poll?.choices
        ? p.poll.choices.reduce((sum, c) => sum + ((c as { votesCount?: number }).votesCount || 0), 0)
        : 0;
      return {
        ...p,
        id: String(p._id),
        author: p.userId,
        media: mediaMap.get(String(p._id)) || [],
        viewerReactions: reactMap.get(String(p._id)) || [],
        isBookmarked: bmSet.has(String(p._id)),
        reactionsCount,
        ...(p.poll ? { poll: { ...p.poll, totalVotes: pollTotal } } : {}),
      };
    });

    return apiSuccess(items, { page, limit, total, hasMore });
  } catch (err) {
    return apiError(err);
  }
}

const createPostSchema = z.object({
  title: z.string().max(160).optional(),
  content: z.string().max(10000).default(''),
  location: z.string().max(120).optional(),
  isDraft: z.boolean().optional(),
  isSensitive: z.boolean().optional(),
  isAiGenerated: z.boolean().optional(),
  quotePostId: z.string().optional(),
  mediaIds: z.array(z.string()).max(10).optional(),
  gifUrl: z.string().url().optional(),
  poll: z
    .object({
      choices: z.array(z.string().min(1).max(100)).min(2).max(6),
      isAnonymous: z.boolean().default(false),
      isCancellable: z.boolean().default(true),
      expiresHours: z.number().int().min(1).max(168).optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const body = createPostSchema.parse(await req.json());
    const ip = await getClientIp(req);

    const hasMedia = Boolean(body.mediaIds?.length || body.gifUrl || body.poll);
    if (!body.content.trim() && !hasMedia) {
      throw new ValidationError('Post must contain text, media, GIF, or a poll.');
    }

    const censor = await enforceCensorForUser({
      text: `${body.title || ''} ${body.content}`,
      userId: String(user._id),
      email: user.email,
      ipAddress: ip,
    });

    const cleanContent = censor.cleanText.slice(body.title ? body.title.length + 1 : 0).trim() || body.content;
    const hashtags = extractHashtags(cleanContent);
    const mentions = extractMentions(cleanContent);
    const urls = extractUrls(cleanContent);

    let linkSnapshot = null;
    if (urls.length > 0 && !body.mediaIds?.length && !body.gifUrl) {
      linkSnapshot = await fetchLinkSnapshot(urls[0]);
    }

    let postType = PostType.TEXT;
    if (body.poll) postType = PostType.POLL;
    else if (body.gifUrl) postType = PostType.GIF;
    else if (body.mediaIds && body.mediaIds.length > 0) {
      const firstMedia = await Media.findById(body.mediaIds[0]).lean();
      if (firstMedia?.type === MediaType.VIDEO) postType = PostType.VIDEO;
      else if (firstMedia?.type === MediaType.AUDIO) postType = PostType.AUDIO;
      else if (firstMedia?.type === MediaType.DOCUMENT) postType = PostType.DOCUMENT;
      else postType = PostType.IMAGE;
    }

    const hashId = encodeId(crypto.randomInt(100000, 999999999));

    const post = await Post.create({
      hashId,
      userId: user._id,
      quotePostId: body.quotePostId ? new Types.ObjectId(body.quotePostId) : null,
      isQuoting: Boolean(body.quotePostId),
      title: body.title || '',
      content: cleanContent,
      hashtags,
      mentions,
      location: body.location || null,
      status: body.isDraft ? PostStatus.DRAFT : PostStatus.ACTIVE,
      type: postType,
      textLanguage: user.language || 'en',
      isSensitive: Boolean(body.isSensitive),
      isAiGenerated: Boolean(body.isAiGenerated),
      linkSnapshot,
      poll: body.poll
        ? {
          choices: body.poll.choices.map((text, idx) => ({
            id: `c_${idx}`,
            text,
            votesCount: 0,
          })),
          voterIds: [],
          votesByUser: {},
          isAnonymous: body.poll.isAnonymous,
          isCancellable: body.poll.isCancellable,
          expiresAt: body.poll.expiresHours
            ? new Date(Date.now() + body.poll.expiresHours * 3600_000)
            : null,
        }
        : null,
    });

    if (body.mediaIds && body.mediaIds.length > 0) {
      const validIds = body.mediaIds.filter((mid) => Types.ObjectId.isValid(mid));
      if (validIds.length > 0) {
        await Media.bulkWrite(
          validIds.map((mid, idx) => ({
            updateOne: {
              filter: { _id: new Types.ObjectId(mid), ownerId: user._id },
              update: { $set: { targetType: 'post', targetId: post._id, order: idx } },
            },
          }))
        );
      }
    }

    if (body.gifUrl) {
      await Media.create({
        ownerId: user._id,
        targetType: 'post',
        targetId: post._id,
        externalUrl: body.gifUrl,
        type: MediaType.GIF,
        status: 'processed',
        storageProvider: 'external',
        mime: 'image/gif',
        extension: 'gif',
      });
    }

    if (!body.isDraft) {
      await User.updateOne({ _id: user._id }, { $inc: { publicationsCount: 1 } });

      if (body.quotePostId) {
        await Post.updateOne({ _id: body.quotePostId }, { $inc: { quotesCount: 1, repostsCount: 1 } });
      }
      publishFeedRealtimeEvent('post:created', { postId: String(post._id) });

      if (mentions.length > 0) {
        const mentionedUsers = await User.find({ username: { $in: mentions } })
          .select('_id')
          .lean();
        for (const mu of mentionedUsers) {
          await dispatchNotification({
            recipientId: mu._id,
            actorId: user._id,
            type: 'POST_MENTIONED',
            category: 'mentions',
            preferenceKey: 'mentions',
            title: 'Mentioned in a post',
            message: `@${user.username} mentioned you in a publication.`,
            entityType: 'post',
            entityId: String(post._id),
            actionUrl: `/publication/${post.hashId}`,
          });
        }
      }
    }

    return apiSuccess(
      {
        id: String(post._id),
        hashId: post.hashId,
        status: post.status,
      },
      { warnings: censor.triggeredWarnings },
      201
    );
  } catch (err) {
    return apiError(err);
  }
}
