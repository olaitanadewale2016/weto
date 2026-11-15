import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, NotFoundError, ValidationError } from '@/lib/api-response';
import { Bookmark, Comment, Post, Reaction } from '@/models/Post';
import { isObjectIdLike } from '@/lib/hashids';
import { dispatchNotification } from '@/services/notification.service';
import { emitToPost } from '@/lib/realtime-emitter';
import { publishPostRealtimeEvent } from '@/lib/firebase/realtime';

const interactSchema = z.object({
  action: z.enum(['react', 'bookmark', 'poll_vote', 'repost']),
  targetType: z.enum(['post', 'comment']).default('post'),
  commentId: z.string().optional(),
  unifiedId: z.string().default('2764-fe0f'),
  nativeSymbol: z.string().default('❤️'),
  choiceId: z.string().optional(),
  choiceIndex: z.number().int().min(0).optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(req);
    const { id } = await context.params;
    const body = interactSchema.parse(await req.json());

    const post = await Post.findOne(isObjectIdLike(id) ? { _id: id } : { hashId: id });
    if (!post) throw new NotFoundError('Publication not found.');

    if (body.action === 'bookmark') {
      const existing = await Bookmark.findOne({
        userId: user._id,
        targetType: 'post',
        targetId: post._id,
      });
      if (existing) {
        await Bookmark.deleteOne({ _id: existing._id });
        await Post.updateOne({ _id: post._id, bookmarksCount: { $gt: 0 } }, { $inc: { bookmarksCount: -1 } });
        return apiSuccess({ bookmarked: false });
      }
      await Bookmark.create({ userId: user._id, targetType: 'post', targetId: post._id });
      await Post.updateOne({ _id: post._id }, { $inc: { bookmarksCount: 1 } });
      return apiSuccess({ bookmarked: true });
    }

    if (body.action === 'repost') {
      const updated = await Post.findByIdAndUpdate(
        post._id,
        { $inc: { repostsCount: 1 } },
        { new: true }
      ).lean();
      const nextCount = updated?.repostsCount ?? (post.repostsCount || 0) + 1;
      await emitToPost(String(post._id), 'post:reaction:update', {
        postId: String(post._id),
        repostsCount: nextCount,
      });
      publishPostRealtimeEvent(String(post._id), 'repost', { repostsCount: nextCount });
      if (String(post.userId) !== String(user._id)) {
        await dispatchNotification({
          recipientId: post.userId,
          actorId: user._id,
          type: 'POST_REPOSTED',
          preferenceKey: 'reactions',
          title: 'Post Reposted',
          message: `@${user.username} reposted your publication.`,
          actionUrl: `/publication/${post.hashId}`,
        });
      }
      return apiSuccess({ reposted: true, repostsCount: nextCount });
    }

    if (body.action === 'poll_vote') {
      if (!post.poll) throw new ValidationError('This publication does not contain a poll.');
      if (post.poll.expiresAt && new Date(post.poll.expiresAt) < new Date()) {
        throw new ValidationError('This poll has expired.');
      }
      const targetChoiceId =
        body.choiceId ||
        (body.choiceIndex !== undefined ? post.poll.choices?.[body.choiceIndex]?.id || `c_${body.choiceIndex}` : undefined);
      if (!targetChoiceId) throw new ValidationError('choiceId is required.');

      const uidStr = String(user._id);
      const prevChoice = post.poll.votesByUser?.[uidStr];
      if (prevChoice === targetChoiceId && post.poll.isCancellable) {
        // Unvote
        post.poll.choices = post.poll.choices.map((c) =>
          c.id === targetChoiceId ? { ...c, votesCount: Math.max(0, c.votesCount - 1) } : c
        );
        delete post.poll.votesByUser[uidStr];
        post.poll.voterIds = post.poll.voterIds.filter((v) => String(v) !== uidStr);
      } else {
        if (prevChoice && !post.poll.isCancellable) {
          throw new ValidationError('Poll vote cannot be changed.');
        }
        post.poll.choices = post.poll.choices.map((c) => {
          if (c.id === prevChoice) return { ...c, votesCount: Math.max(0, c.votesCount - 1) };
          if (c.id === targetChoiceId) return { ...c, votesCount: c.votesCount + 1 };
          return c;
        });
        post.poll.votesByUser = { ...(post.poll.votesByUser || {}), [uidStr]: targetChoiceId };
        if (!post.poll.voterIds.some((v) => String(v) === uidStr)) {
          post.poll.voterIds.push(user._id);
        }
      }
      post.markModified('poll');
      await post.save();
      const totalVotes = post.poll.choices.reduce((acc, c) => acc + (c.votesCount || 0), 0);
      const pollPayload = {
        ...post.poll,
        totalVotes,
      };
      await emitToPost(String(post._id), 'post:reaction:update', {
        postId: String(post._id),
        poll: pollPayload,
      });
      publishPostRealtimeEvent(String(post._id), 'poll_vote', { totalVotes });
      return apiSuccess({ poll: pollPayload });
    }

    // Reaction toggle on post or comment
    const targetObjId =
      body.targetType === 'comment' && body.commentId
        ? new Types.ObjectId(body.commentId)
        : post._id;

    const existingReaction = await Reaction.findOne({
      targetType: body.targetType,
      targetId: targetObjId,
      userId: user._id,
      unifiedId: body.unifiedId,
    });

    let active = false;
    if (existingReaction) {
      await Reaction.deleteOne({ _id: existingReaction._id });
    } else {
      await Reaction.create({
        targetType: body.targetType,
        targetId: targetObjId,
        userId: user._id,
        unifiedId: body.unifiedId,
        nativeSymbol: body.nativeSymbol,
      });
      active = true;
    }

    // Recompute summary cleanly from Reaction collection
    const agg = await Reaction.aggregate([
      { $match: { targetType: body.targetType, targetId: targetObjId } },
      {
        $group: {
          _id: '$unifiedId',
          nativeSymbol: { $first: '$nativeSymbol' },
          count: { $sum: 1 },
        },
      },
    ]);

    const summary = agg.map((a) => ({
      unifiedId: a._id as string,
      nativeSymbol: (a.nativeSymbol as string) || '👍',
      count: a.count as number,
    }));

    const reactionsCount = summary.reduce((sum, s) => sum + (s.count || 0), 0);

    if (body.targetType === 'post') {
      await Post.updateOne({ _id: post._id }, { $set: { reactionSummary: summary } });
      await emitToPost(String(post._id), 'post:reaction:update', {
        postId: String(post._id),
        reactionSummary: summary,
        reactionsCount,
      });
      publishPostRealtimeEvent(String(post._id), 'reaction', { reactionsCount });
      if (active) {
        await dispatchNotification({
          recipientId: post.userId,
          actorId: user._id,
          type: 'POST_REACTED',
          preferenceKey: 'reactions',
          title: 'Post Reaction',
          message: `@${user.username} reacted ${body.nativeSymbol} to your post.`,
          actionUrl: `/publication/${post.hashId}`,
        });
      }
    } else {
      const comment = await Comment.findByIdAndUpdate(
        targetObjId,
        { $set: { reactionSummary: summary } },
        { new: true }
      );
      publishPostRealtimeEvent(String(post._id), 'comment_reaction', {});
      if (active && comment) {
        await dispatchNotification({
          recipientId: comment.userId,
          actorId: user._id,
          type: 'COMMENT_REACTED',
          preferenceKey: 'reactions',
          title: 'Comment Reaction',
          message: `@${user.username} reacted ${body.nativeSymbol} to your comment.`,
          actionUrl: `/publication/${post.hashId}`,
        });
      }
    }

    return apiSuccess({ active, reacted: active, reactionsCount, reactionSummary: summary });
  } catch (err) {
    return apiError(err);
  }
}
