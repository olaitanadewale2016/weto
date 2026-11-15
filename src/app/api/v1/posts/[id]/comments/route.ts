import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { getClientIp, getOptionalAuth, requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, ForbiddenError, NotFoundError } from '@/lib/api-response';
import { Comment, Post, Reaction } from '@/models/Post';
import { User } from '@/models/User';
import { UserRole } from '@/types/enums';
import { isObjectIdLike } from '@/lib/hashids';
import { extractMentions } from '@/lib/utils';
import { enforceCensorForUser } from '@/services/censor-blacklist.service';
import { dispatchNotification } from '@/services/notification.service';
import { emitToPost } from '@/lib/realtime-emitter';
import { publishPostRealtimeEvent } from '@/lib/firebase/realtime';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await context.params;
    const post = await Post.findOne(isObjectIdLike(id) ? { _id: id } : { hashId: id }).lean();
    if (!post) throw new NotFoundError('Publication not found.');

    const authCtx = await getOptionalAuth(req);
    const parentId = new URL(req.url).searchParams.get('parentId');

    const comments = await Comment.find({
      postId: post._id,
      parentId: parentId ? new Types.ObjectId(parentId) : null,
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('userId', 'username firstName lastName avatar verified')
      .lean();

    const commentIds = comments.map((c) => c._id);
    const [replies, myReactions] = await Promise.all([
      !parentId && commentIds.length > 0
        ? Comment.find({ parentId: { $in: commentIds } })
            .sort({ createdAt: 1 })
            .populate('userId', 'username firstName lastName avatar verified')
            .lean()
        : [],
      authCtx && commentIds.length > 0
        ? Reaction.find({
            targetType: 'comment',
            targetId: { $in: commentIds },
            userId: authCtx.user._id,
          }).lean()
        : [],
    ]);

    const replyMap = new Map<string, unknown[]>();
    for (const r of replies) {
      const pid = String(r.parentId);
      const arr = replyMap.get(pid) || [];
      arr.push({ ...r, id: String(r._id), author: r.userId });
      replyMap.set(pid, arr);
    }

    const reactMap = new Map<string, string[]>();
    for (const r of myReactions) {
      const k = String(r.targetId);
      const arr = reactMap.get(k) || [];
      arr.push(r.unifiedId);
      reactMap.set(k, arr);
    }

    return apiSuccess(
      comments.map((c) => ({
        ...c,
        id: String(c._id),
        author: c.userId,
        replies: replyMap.get(String(c._id)) || [],
        viewerReactions: reactMap.get(String(c._id)) || [],
      }))
    );
  } catch (err) {
    return apiError(err);
  }
}

const createCommentSchema = z.object({
  content: z.string().min(1).max(2000),
  parentId: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(req);
    const { id } = await context.params;
    const body = createCommentSchema.parse(await req.json());
    const ip = await getClientIp(req);

    const post = await Post.findOne(isObjectIdLike(id) ? { _id: id } : { hashId: id });
    if (!post) throw new NotFoundError('Publication not found.');

    const censor = await enforceCensorForUser({
      text: body.content,
      userId: String(user._id),
      email: user.email,
      ipAddress: ip,
    });

    const comment = await Comment.create({
      postId: post._id,
      userId: user._id,
      parentId: body.parentId ? new Types.ObjectId(body.parentId) : null,
      content: censor.cleanText,
      textLanguage: user.language || 'en',
    });

    await Post.updateOne({ _id: post._id }, { $inc: { commentsCount: 1 } });
    if (body.parentId) {
      await Comment.updateOne({ _id: body.parentId }, { $inc: { repliesCount: 1 } });
    }

    await emitToPost(String(post._id), 'post:comment:new', {
      postId: String(post._id),
      comment: {
        ...comment.toObject(),
        id: String(comment._id),
        author: {
          _id: user._id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
          verified: user.verified,
        },
      },
    });
    publishPostRealtimeEvent(String(post._id), 'comment:new', {
      commentId: String(comment._id),
    });

    await dispatchNotification({
      recipientId: post.userId,
      actorId: user._id,
      type: 'POST_COMMENTED',
      preferenceKey: 'comments',
      title: 'New Comment',
      message: `@${user.username} commented on your publication.`,
      entityType: 'post',
      entityId: String(post._id),
      actionUrl: `/publication/${post.hashId}`,
    });

    const mentions = extractMentions(censor.cleanText);
    if (mentions.length > 0) {
      const mentioned = await User.find({ username: { $in: mentions } }).select('_id').lean();
      for (const m of mentioned) {
        await dispatchNotification({
          recipientId: m._id,
          actorId: user._id,
          type: 'COMMENT_MENTIONED',
          category: 'mentions',
          preferenceKey: 'mentions',
          title: 'Mentioned in a comment',
          message: `@${user.username} mentioned you in a comment.`,
          actionUrl: `/publication/${post.hashId}`,
        });
      }
    }

    return apiSuccess(
      {
        ...comment.toObject(),
        id: String(comment._id),
        author: {
          _id: user._id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
          verified: user.verified,
        },
      },
      undefined,
      201
    );
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const commentId = new URL(req.url).searchParams.get('commentId');
    if (!commentId) throw new NotFoundError('commentId is required.');

    const comment = await Comment.findById(commentId);
    if (!comment) throw new NotFoundError('Comment not found.');

    const post = await Post.findById(comment.postId);
    const isAllowed =
      String(comment.userId) === String(user._id) ||
      (post && String(post.userId) === String(user._id)) ||
      user.role === UserRole.ROOT ||
      user.role === UserRole.ADMIN;

    if (!isAllowed) throw new ForbiddenError('Cannot delete this comment.');

    const repliesDeleted = await Comment.deleteMany({ parentId: comment._id });
    await Comment.deleteOne({ _id: comment._id });
    await Reaction.deleteMany({ targetType: 'comment', targetId: comment._id });

    if (post) {
      await Post.updateOne(
        { _id: post._id, commentsCount: { $gt: 0 } },
        { $inc: { commentsCount: -(1 + (repliesDeleted.deletedCount || 0)) } }
      );
      await Promise.allSettled([
        emitToPost(String(post._id), 'post:comment:deleted', {
          postId: String(post._id),
          commentId: String(comment._id),
        }),
        publishPostRealtimeEvent(String(post._id), 'comment_deleted', {
          actorId: String(user._id),
        }),
      ]);
    }

    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
