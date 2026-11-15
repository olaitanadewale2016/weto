import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, ForbiddenError, NotFoundError } from '@/lib/api-response';
import { Chat } from '@/models/Messaging';
import { emitToChat } from '@/lib/realtime-emitter';
import { setChatTypingState } from '@/lib/firebase/realtime';

const typingSchema = z.object({
  typing: z.boolean(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ chatId: string }> }
) {
  try {
    await connectDB();
    const { user } = await requireAuth(req);
    const { chatId } = await context.params;
    const body = typingSchema.parse(await req.json());

    const chat = await Chat.findById(chatId).select('participants.userId').lean();
    if (!chat) throw new NotFoundError('Conversation not found.');
    const isMember = chat.participants.some((p) => String(p.userId) === String(user._id));
    if (!isMember) throw new ForbiddenError('Not a participant.');

    await setChatTypingState({
      chatId: String(chat._id),
      userId: String(user._id),
      username: user.username,
      firstName: user.firstName || user.username,
      avatar: user.avatar || '/assets/avatars/default-avatar.png',
      typing: body.typing,
    });

    await emitToChat(String(chat._id), 'chat:typing', {
      chatId: String(chat._id),
      userId: String(user._id),
      username: user.username,
      typing: body.typing,
    });

    return apiSuccess({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
