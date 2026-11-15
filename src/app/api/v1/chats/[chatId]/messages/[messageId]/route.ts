import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, ForbiddenError, NotFoundError } from '@/lib/api-response';
import { Message, Chat } from '@/models/Messaging';
import { Reaction } from '@/models/Post';
import { emitToChat } from '@/lib/realtime-emitter';
import { publishChatRealtimeEvent } from '@/lib/firebase/realtime';

const reactSchema = z.object({
  unifiedId: z.string().min(1),
  nativeSymbol: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ chatId: string; messageId: string }> }
) {
  try {
    const { user } = await requireAuth(req);
    const { chatId, messageId } = await context.params;
    const body = reactSchema.parse(await req.json());
    const msg = await Message.findOne({ _id: messageId, chatId });
    if (!msg) throw new NotFoundError('Message not found.');

    const existing = await Reaction.findOne({
      targetType: 'message',
      targetId: msg._id,
      userId: user._id,
      unifiedId: body.unifiedId,
    });

    if (existing) await Reaction.deleteOne({ _id: existing._id });
    else {
      await Reaction.create({
        targetType: 'message',
        targetId: msg._id,
        userId: user._id,
        unifiedId: body.unifiedId,
        nativeSymbol: body.nativeSymbol,
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
