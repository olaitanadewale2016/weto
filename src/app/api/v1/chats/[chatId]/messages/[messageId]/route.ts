import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, ForbiddenError, NotFoundError, ValidationError } from '@/lib/api-response';
import { Message, Chat } from '@/models/Messaging';
import { Reaction } from '@/models/Post';
import { emitToChat } from '@/lib/realtime-emitter';
import { publishChatRealtimeEvent } from '@/lib/firebase/realtime';

const messagePostSchema = z.union([
  z.object({
    action: z.literal('vote_poll'),
    optionId: z.string().min(1),
  }),
  z.object({
    action: z.literal('react').optional(),
    unifiedId: z.string().min(1),
    nativeSymbol: z.string().min(1),
  }),
]);

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ chatId: string; messageId: string }> }
) {
  try {
    const { user } = await requireAuth(req);
    const { chatId, messageId } = await context.params;
    const body = messagePostSchema.parse(await req.json());
    const msg = await Message.findOne({ _id: messageId, chatId });
    if (!msg) throw new NotFoundError('Message not found.');

    if ('action' in body && body.action === 'vote_poll') {
      if (!msg.poll || !Array.isArray(msg.poll.options)) {
        throw new ValidationError('This message does not contain an active poll.');
      }
      const hasOption = msg.poll.options.some((o) => o.id === body.optionId);
      if (!hasOption) throw new ValidationError('Poll option not found.');

      const uid = String(user._id);
      const nextOptions = msg.poll.options.map((opt) => {
        const filtered = (opt.voterIds || []).filter((v) => String(v) !== uid);
        if (opt.id === body.optionId) {
          filtered.push(user._id);
        }
        return {
          id: opt.id,
          text: opt.text,
          voterIds: filtered,
        };
      });

      msg.poll = {
        question: msg.poll.question,
        options: nextOptions,
      };
      msg.markModified('poll');
      await msg.save();

      await emitToChat(chatId, 'chat:message:poll', {
        chatId,
        messageId,
        poll: msg.poll,
      });
      publishChatRealtimeEvent(chatId, 'poll', { messageId });

      return apiSuccess({ poll: msg.poll });
    }

    const reactBody = body as { unifiedId: string; nativeSymbol: string };
    const existing = await Reaction.findOne({
      targetType: 'message',
      targetId: msg._id,
      userId: user._id,
      unifiedId: reactBody.unifiedId,
    });

    if (existing) await Reaction.deleteOne({ _id: existing._id });
    else {
      await Reaction.create({
        targetType: 'message',
        targetId: msg._id,
        userId: user._id,
        unifiedId: reactBody.unifiedId,
        nativeSymbol: reactBody.nativeSymbol,
      });
    }

    const agg = await Reaction.aggregate([
      { $match: { targetType: 'message', targetId: msg._id } },
      { $group: { _id: '$unifiedId', nativeSymbol: { $first: '$nativeSymbol' }, count: { $sum: 1 } } },
    ]);

    const summary = agg.map((a) => ({
      unifiedId: a._id as string,
      nativeSymbol: (a.nativeSymbol as string) || '👍',
      count: a.count as number,
    }));

    msg.reactionSummary = summary;
    await msg.save();

    await emitToChat(chatId, 'chat:message:reaction', {
      chatId,
      messageId,
      reactionSummary: summary,
    });
    publishChatRealtimeEvent(chatId, 'reaction', { messageId });

    return apiSuccess({ reactionSummary: summary });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ chatId: string; messageId: string }> }
) {
  try {
    const { user } = await requireAuth(req);
    const { chatId, messageId } = await context.params;
    const url = new URL(req.url);
    const scopeParam = url.searchParams.get('scope');
    const forAll = url.searchParams.get('forAll') === 'true';
    const scope = scopeParam || (forAll ? 'global' : 'local');

    const msg = await Message.findOne({ _id: messageId, chatId });
    if (!msg) throw new NotFoundError('Message not found.');

    if (scope === 'global') {
      if (String(msg.senderId) !== String(user._id)) {
        throw new ForbiddenError('Only the sender can delete a message for everyone.');
      }
      msg.isDeleted = true;
      msg.content = null;
      await msg.save();
      await Chat.updateOne(
        { _id: chatId, lastMessageId: msg._id },
        { $set: { lastMessagePreview: 'Message deleted' } }
      );
      await emitToChat(chatId, 'chat:message:deleted', { chatId, messageId });
      publishChatRealtimeEvent(chatId, 'deleted', { messageId });
    } else {
      await Message.updateOne(
        { _id: msg._id },
        { $addToSet: { hiddenForUserIds: user._id } }
      );
    }

    return apiSuccess({ deleted: true, scope });
  } catch (err) {
    return apiError(err);
  }
}
