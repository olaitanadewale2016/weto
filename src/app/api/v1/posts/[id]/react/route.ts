import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, NotFoundError, ValidationError } from '@/lib/api-response';
import { Bookmark, Comment, Post, Reaction } from '@/models/Post';
import { User } from '@/models/User';
import { PostStatus, PostType } from '@/types/enums';
import { encodeId, isObjectIdLike } from '@/lib/hashids';
import { dispatchNotification } from '@/services/notification.service';
import { emitToPost } from '@/lib/realtime-emitter';
import { publishFeedRealtimeEvent, publishPostRealtimeEvent } from '@/lib/firebase/realtime';

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
      const existingRepost = await Post.findOne({
        userId: user._id,
        quotePostId: post._id,
        isQuoting: true,
        content: '',
      });

      if (existingRepost) {
        await Post.deleteOne({ _id: existingRepost._id });
        await Post.updateOne(
          { _id: post._id, repostsCount: { $gt: 0 } },
          { $inc: { repostsCount: -1 } }
        );
        await User.updateOne(
          { _id: user._id, publicationsCount: { $gt: 0 } },
          { $inc: { publicationsCount: -1 } }
        );
        const refreshed = await Post.findById(post._id).select('repostsCount').lean();
        const nextCount = Math.max(
          0,
          refreshed?.repostsCount ?? Math.max(0, (post.repostsCount || 1) - 1)
        );
        await emitToPost(String(post._id), 'post:reaction:update', {
          postId: String(post._id),
          repostsCount: nextCount,
        });
        publishPostRealtimeEvent(String(post._id), 'repost', { repostsCount: nextCount });
        return apiSuccess({ reposted: false, repostsCount: nextCount });
      }

      const repostDoc = await Post.create({
        hashId: encodeId(crypto.randomInt(100000, 999999999)),
        userId: user._id,
        type: PostType.TEXT,
        status: PostStatus.ACTIVE,
        content: '',
        quotePostId: post._id,
        isQuoting: true,
        textBgStyle: '',
        poll: null,
        linkSnapshot: null,
      });

      const updated = await Post.findByIdAndUpdate(
        post._id,
        { $inc: { repostsCount: 1 } },
        { new: true }
      ).lean();
      await User.updateOne({ _id: user._id }, { $inc: { publicationsCount: 1 } });

      const nextCount = updated?.repostsCount ?? (post.repostsCount || 0) + 1;
      await emitToPost(String(post._id), 'post:reaction:update', {
        postId: String(post._id),
        repostsCount: nextCount,
      });
      publishFeedRealtimeEvent('post:created', { postId: String(repostDoc._id) });
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
      return apiSuccess({
        reposted: true,
        repostsCount: nextCount,
        repostId: String(repostDoc._id),
        repostHashId: repostDoc.hashId,
      });
    }

    if (body.action === 'poll_vote') {
      if (!post.poll) throw new ValidationError('This publication does not contain a poll.');
      if (post.poll.expiresAt && new Date(post.poll.expiresAt) < new Date()) {
        throw new ValidationError('This poll has expired.');
      }

      const rawChoices = Array.isArray(post.poll.choices) ? post.poll.choices : [];
      const plainChoices = rawChoices.map((c, idx) => ({
        id: String(c.id || `c_${idx}`),
        text: String(c.text || ''),
        votesCount: Math.max(0, Number(c.votesCount || 0)),
      }));

      const targetChoiceId =
        (body.choiceId && plainChoices.some((c) => c.id === body.choiceId)
          ? body.choiceId
          : undefined) ||
        (body.choiceIndex !== undefined && plainChoices[body.choiceIndex]
          ? plainChoices[body.choiceIndex].id
          : body.choiceId);

      if (!targetChoiceId || !plainChoices.some((c) => c.id === targetChoiceId)) {
        throw new ValidationError('choiceId is required.');
      }

      const uidStr = String(user._id);
      const rawVotesByUser: Record<string, string> =
        post.poll.votesByUser instanceof Map
          ? Object.fromEntries(post.poll.votesByUser.entries())
          : post.poll.votesByUser && typeof post.poll.votesByUser === 'object'
            ? { ...(post.poll.votesByUser as Record<string, string>) }
            : {};

      let nextVoterIds = Array.isArray(post.poll.voterIds)
        ? post.poll.voterIds.map((v) => new Types.ObjectId(String(v)))
        : [];

      const isCancellable = post.poll.isCancellable !== false;
      const prevChoice = rawVotesByUser[uidStr];
      let nextChoices = plainChoices;

      if (prevChoice === targetChoiceId && isCancellable) {
        // Unvote
        nextChoices = plainChoices.map((c) =>
          c.id === targetChoiceId ? { ...c, votesCount: Math.max(0, c.votesCount - 1) } : c
        );
        delete rawVotesByUser[uidStr];
        nextVoterIds = nextVoterIds.filter((v) => String(v) !== uidStr);
      } else {
        if (prevChoice && !isCancellable) {
          throw new ValidationError('Poll vote cannot be changed.');
        }
        nextChoices = plainChoices.map((c) => {
          if (c.id === prevChoice) return { ...c, votesCount: Math.max(0, c.votesCount - 1) };
          if (c.id === targetChoiceId) return { ...c, votesCount: c.votesCount + 1 };
          return c;
        });
        rawVotesByUser[uidStr] = targetChoiceId;
        if (!nextVoterIds.some((v) => String(v) === uidStr)) {
          nextVoterIds.push(new Types.ObjectId(uidStr));
        }
      }

      const nextPollDoc = {
        choices: nextChoices,
        voterIds: nextVoterIds,
        votesByUser: rawVotesByUser,
        isAnonymous: Boolean(post.poll.isAnonymous),
        isCancellable,
        expiresAt: post.poll.expiresAt ? new Date(post.poll.expiresAt) : null,
      };

      post.set('poll', nextPollDoc);
      post.markModified('poll');
      await post.save();

      const totalVotes = nextChoices.reduce((acc, c) => acc + (c.votesCount || 0), 0);
      const pollPayload = {
        choices: nextChoices.map((c) => ({
          id: c.id,
          text: c.text,
          votesCount: c.votesCount,
          percentage: totalVotes > 0 ? Math.round((c.votesCount / totalVotes) * 100) : 0,
        })),
        voterIds: nextVoterIds.map((v) => String(v)),
        votesByUser: rawVotesByUser,
        isAnonymous: Boolean(nextPollDoc.isAnonymous),
        isCancellable: Boolean(nextPollDoc.isCancellable),
        expiresAt: nextPollDoc.expiresAt ? nextPollDoc.expiresAt.toISOString() : null,
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
      const reactionPayload = {
        postId: String(post._id),
        postHashId: post.hashId,
        reactionSummary: summary,
        reactionsCount,
      };
      await emitToPost(String(post._id), 'post:reaction:update', reactionPayload);
      if (post.hashId) {
        await emitToPost(String(post.hashId), 'post:reaction:update', reactionPayload);
      }
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

    const userReactionsOnTarget = await Reaction.find({
      targetType: body.targetType,
      targetId: targetObjId,
      userId: user._id,
    })
      .select('unifiedId')
      .lean();
    const viewerReactions = userReactionsOnTarget.map((r) => r.unifiedId);

    return apiSuccess({
      active,
      reacted: active,
      reactionsCount,
      reactionSummary: summary,
      viewerReactions,
    });
  } catch (err) {
    return apiError(err);
  }
}
