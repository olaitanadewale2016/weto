import { Emitter } from '@socket.io/redis-emitter';
import { getRedis } from './redis';
import { logger } from './logger';

let emitter: Emitter | null = null;

export function getRealtimeEmitter(): Emitter | null {
  if (emitter) return emitter;
  const redis = getRedis();
  if (!redis) return null;
  emitter = new Emitter(redis);
  return emitter;
}

export async function emitToUser(userId: string, event: string, payload: unknown): Promise<void> {
  try {
    const em = getRealtimeEmitter();
    if (em) {
      em.to(`user:${userId}`).emit(event, payload);
    }
  } catch (err) {
    logger.warn({ err, userId, event }, 'Failed to emit realtime event to user');
  }
}

export async function emitToChat(chatId: string, event: string, payload: unknown): Promise<void> {
  try {
    const em = getRealtimeEmitter();
    if (em) {
      em.to(`chat:${chatId}`).emit(event, payload);
    }
  } catch (err) {
    logger.warn({ err, chatId, event }, 'Failed to emit realtime event to chat');
  }
}

export async function emitToPost(postId: string, event: string, payload: unknown): Promise<void> {
  try {
    const em = getRealtimeEmitter();
    if (em) {
      em.to(`post:${postId}`).emit(event, payload);
    }
  } catch (err) {
    logger.warn({ err, postId, event }, 'Failed to emit realtime event to post');
  }
}
