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

    const queryFilter: Record<string, unknown> = {
      postId: post._id,
      ...(parentId ? { parentId: new Types.ObjectId(parentId) } : {}),
    };

    const comments = await Comment.find(queryFilter)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('userId', 'username firstName lastName avatar verified')
      .lean();

    const commentIds = comments.map((c) => c._id);
    const parentIds = Array.from(
      new Set(
        comments
          .map((c) => (c.parentId ? String(c.parentId) : null))
          .filter((pid): pid is string => Boolean(pid))
      )
    ).map((pid) => new Types.ObjectId(pid));

    const [parentDocs, myReactions] = await Promise.all([
      parentIds.length > 0
        ? Comment.find({ _id: { $in: parentIds } })
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

    const parentMap = new Map<
      string,
      { id: string; content: string; createdAt?: Date; author: unknown }
    >();
    for (const p of parentDocs) {
      parentMap.set(String(p._id), {
        id: String(p._id),
        content: p.content,
        createdAt: p.createdAt,
        author: p.userId,
      });
    }

    const reactMap = new Map<string, string[]>();
    for (const r of myReactions) {
      const k = String(r.targetId);
      const arr = reactMap.get(k) || [];
      arr.push(r.unifiedId);
      reactMap.set(k, arr);
    }

    const replyMap = new Map<string, unknown[]>();
    for (const c of [...comments].reverse()) {
      if (c.parentId) {
        const pid = String(c.parentId);
        const arr = replyMap.get(pid) || [];
        arr.push({
          ...c,
          id: String(c._id),
          author: c.userId,
          viewerReactions: reactMap.get(String(c._id)) || [],
        });
        replyMap.set(pid, arr);
      }
    }

    const viewerIdStr = authCtx ? String(authCtx.user._id) : null;
    const isAdminViewer =
      authCtx?.user.role === UserRole.ROOT || authCtx?.user.role === UserRole.ADMIN;

    return apiSuccess(
      comments.map((c) => {
        const authorObj = c.userId as { _id?: unknown } | null;
        const commentOwnerId =
          authorObj && typeof authorObj === 'object' && authorObj._id
            ? String(authorObj._id)
            : String(c.userId);
        const hasParent = Boolean(c.parentId);
        const parentData = c.parentId ? parentMap.get(String(c.parentId)) || null : null;
        const canDelete = Boolean(
          viewerIdStr &&
            (commentOwnerId === viewerIdStr ||
              String(post.userId) === viewerIdStr ||
              isAdminViewer)
        );
        return {
          ...c,
          id: String(c._id),
          author: c.userId,
          hasParent,
          parent: parentData,
          replies: replyMap.get(String(c._id)) || [],
          viewerReactions: reactMap.get(String(c._id)) || [],
          canDelete,
        };
      })
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

    const parentObjId =
      body.parentId && Types.ObjectId.isValid(body.parentId)
        ? new Types.ObjectId(body.parentId)
        : null;

    let parentPayload: { id: string; content: string; createdAt?: Date; author: unknown } | null =
      null;
    if (parentObjId) {
      const parentComment = await Comment.findById(parentObjId)
        .populate('userId', 'username firstName lastName avatar verified')
        .lean();
      if (parentComment) {
        parentPayload = {
          id: String(parentComment._id),
          content: parentComment.content,
          createdAt: parentComment.createdAt,
          author: parentComment.userId,
        };
      }
    }

    const comment = await Comment.create({
      postId: post._id,
      userId: user._id,
      parentId: parentObjId,
      content: censor.cleanText,
      textLanguage: user.language || 'en',
    });

    const updatedPost = await Post.findByIdAndUpdate(
      post._id,
      { $inc: { commentsCount: 1 } },
      { new: true }
    )
      .select('commentsCount')
      .lean();
    if (parentObjId) {
      await Comment.updateOne({ _id: parentObjId }, { $inc: { repliesCount: 1 } });
    }

    const serializedComment = {
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
      hasParent: Boolean(parentObjId),
      parent: parentPayload,
      replies: [],
      viewerReactions: [],
      canDelete: true,
      commentsCount: updatedPost?.commentsCount ?? (post.commentsCount || 0) + 1,
    };

    await emitToPost(String(post._id), 'post:comment:new', {
      postId: String(post._id),
      comment: serializedComment,
      commentsCount: serializedComment.commentsCount,
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

    return apiSuccess(serializedComment, undefined, 201);
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

    // Match PHP DeleteCommentAction: delete only this comment so child replies remain
    // and display "Comment was deleted" in their parent preview block.
    await Comment.deleteOne({ _id: comment._id });
    await Reaction.deleteMany({ targetType: 'comment', targetId: comment._id });
    if (comment.parentId) {
      await Comment.updateOne(
        { _id: comment.parentId, repliesCount: { $gt: 0 } },
        { $inc: { repliesCount: -1 } }
      );
    }

    let nextCommentsCount = 0;
    if (post) {
      const remainingCount = await Comment.countDocuments({ postId: post._id });
      nextCommentsCount = Math.max(0, remainingCount);
      await Post.updateOne({ _id: post._id }, { $set: { commentsCount: nextCommentsCount } });
      await Promise.allSettled([
        emitToPost(String(post._id), 'post:comment:deleted', {
          postId: String(post._id),
          commentId: String(comment._id),
          commentsCount: nextCommentsCount,
        }),
        publishPostRealtimeEvent(String(post._id), 'comment_deleted', {
          actorId: String(user._id),
        }),
      ]);
    }

    return apiSuccess({ deleted: true, commentsCount: nextCommentsCount });
  } catch (err) {
    return apiError(err);
  }
}
