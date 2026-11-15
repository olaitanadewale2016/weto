import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { getOptionalAuth, requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, ForbiddenError, NotFoundError } from '@/lib/api-response';
import { Bookmark, Comment, Post, Reaction } from '@/models/Post';
import { Media } from '@/models/Media';
import { User } from '@/models/User';
import { UserRole } from '@/types/enums';
import { isObjectIdLike } from '@/lib/hashids';
import { deleteMediaRecord, serializeMedia } from '@/services/media.service';
import { extractHashtags, extractMentions } from '@/lib/utils';
import { publishFeedRealtimeEvent, publishPostRealtimeEvent } from '@/lib/firebase/realtime';

async function findPostByIdOrHash(idOrHash: string) {
  return Post.findOne(isObjectIdLike(idOrHash) ? { _id: idOrHash } : { hashId: idOrHash });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await context.params;
    const authCtx = await getOptionalAuth(req);

    const post = await findPostByIdOrHash(id);
    if (!post) throw new NotFoundError('Publication not found.');

    await Post.updateOne({ _id: post._id }, { $inc: { viewsCount: 1 } });

    const [author, mediaRows, userReactions, bookmarked] = await Promise.all([
      User.findById(post.userId).select('username firstName lastName avatar verified type').lean(),
      Media.find({ targetType: 'post', targetId: post._id }).sort({ order: 1 }).lean(),
      authCtx
        ? Reaction.find({ targetType: 'post', targetId: post._id, userId: authCtx.user._id }).lean()
        : [],
      authCtx
        ? Bookmark.exists({ userId: authCtx.user._id, targetType: 'post', targetId: post._id })
        : false,
    ]);

    const postObj = post.toObject();
    const reactionsCount = Array.isArray(postObj.reactionSummary)
      ? postObj.reactionSummary.reduce((sum, r) => sum + ((r as { count?: number }).count || 0), 0)
      : 0;
    const pollTotal = postObj.poll?.choices
      ? postObj.poll.choices.reduce((sum, c) => sum + ((c as { votesCount?: number }).votesCount || 0), 0)
      : 0;

    return apiSuccess({
      ...postObj,
      id: String(post._id),
      author,
      media: mediaRows.map((m) => serializeMedia(m as never)),
      viewerReactions: userReactions.map((r) => r.unifiedId),
      isBookmarked: Boolean(bookmarked),
      reactionsCount,
      ...(postObj.poll ? { poll: { ...postObj.poll, totalVotes: pollTotal } } : {}),
    });
  } catch (err) {
    return apiError(err);
  }
}

const patchPostSchema = z.object({
  content: z.string().max(10000).optional(),
  title: z.string().max(160).optional(),
  isSensitive: z.boolean().optional(),
  profilePinned: z.boolean().optional(),
  globalPinned: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(req);
    const { id } = await context.params;
    const body = patchPostSchema.parse(await req.json());
    const post = await findPostByIdOrHash(id);
    if (!post) throw new NotFoundError('Publication not found.');

    const isOwner = String(post.userId) === String(user._id);
    const isAdmin = user.role === UserRole.ROOT || user.role === UserRole.ADMIN;
    if (!isOwner && !isAdmin) throw new ForbiddenError('Cannot modify this publication.');

    if (body.globalPinned !== undefined && !isAdmin) {
      throw new ForbiddenError('Only administrators can globally pin publications.');
    }

    if (body.content !== undefined) {
      post.content = body.content;
      post.hashtags = extractHashtags(body.content);
      post.mentions = extractMentions(body.content);
      post.edited = true;
    }
    if (body.title !== undefined) post.title = body.title;
    if (body.isSensitive !== undefined) post.isSensitive = body.isSensitive;
    if (body.profilePinned !== undefined) post.profilePinned = body.profilePinned;
    if (body.globalPinned !== undefined) post.globalPinned = body.globalPinned;

    await post.save();
    publishPostRealtimeEvent(String(post._id), 'post:updated', {});
    return apiSuccess({ id: String(post._id), updated: true });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(req);
    const { id } = await context.params;
    const post = await findPostByIdOrHash(id);
    if (!post) throw new NotFoundError('Publication not found.');

    const isOwner = String(post.userId) === String(user._id);
    const isAdmin =
      user.role === UserRole.ROOT ||
      user.role === UserRole.ADMIN ||
      user.role === UserRole.MODERATOR;
    if (!isOwner && !isAdmin) throw new ForbiddenError('Cannot delete this publication.');

    const mediaRows = await Media.find({ targetType: 'post', targetId: post._id }).select('_id');
    await Promise.all(mediaRows.map((m) => deleteMediaRecord(String(m._id))));

    await Promise.all([
      Comment.deleteMany({ postId: post._id }),
      Reaction.deleteMany({ targetType: 'post', targetId: post._id }),
      Bookmark.deleteMany({ targetType: 'post', targetId: post._id }),
      Post.deleteOne({ _id: post._id }),
      User.updateOne(
        { _id: post.userId, publicationsCount: { $gt: 0 } },
        { $inc: { publicationsCount: -1 } }
      ),
    ]);

    publishFeedRealtimeEvent('post:deleted', { postId: String(post._id) });
    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
