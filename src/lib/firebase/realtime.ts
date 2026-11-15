import { getFirebaseFirestore, isFirebaseAdminConfigured } from './admin';
import { logger } from '@/lib/logger';

export interface TypingUserEntry {
  userId: string;
  username: string;
  firstName: string;
  avatar: string;
  expiresAt: number;
}

declare global {
  var __wetoChatTyping: Map<string, Map<string, TypingUserEntry>> | undefined;
  var __wetoFirestoreDisabledUntil: number | undefined;
}

const TYPING_TTL_MS = 5000;
const FIRESTORE_COOLDOWN_MS = 5 * 60 * 1000;

function getTypingStore(): Map<string, Map<string, TypingUserEntry>> {
  if (!global.__wetoChatTyping) {
    global.__wetoChatTyping = new Map();
  }
  return global.__wetoChatTyping;
}

function isFirestoreAvailable(): boolean {
  if (!isFirebaseAdminConfigured()) return false;
  const until = global.__wetoFirestoreDisabledUntil ?? 0;
  return Date.now() >= until;
}

function handleFirestoreWriteError(err: unknown) {
  const e = err as { code?: unknown; message?: string };
  const msg = String(e?.message || '');
  const code = e?.code;
  if (
    code === 7 ||
    code === 5 ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('NOT_FOUND') ||
    msg.includes('has not been used')
  ) {
    if (!global.__wetoFirestoreDisabledUntil || Date.now() >= global.__wetoFirestoreDisabledUntil) {
      logger.info('Cloud Firestore disabled or uninitialized; using FCM + in-memory realtime bridge');
    }
    global.__wetoFirestoreDisabledUntil = Date.now() + FIRESTORE_COOLDOWN_MS;
    return;
  }
  logger.warn({ err: msg }, 'Firestore realtime signal warning');
}

async function safeFirestoreMerge(docPath: string, data: Record<string, unknown>): Promise<void> {
  if (!isFirestoreAvailable()) return;
  try {
    const db = getFirebaseFirestore();
    await Promise.race([
      db.doc(docPath).set(data, { merge: true }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Firestore signal timeout')), 2000)
      ),
    ]);
  } catch (err) {
    handleFirestoreWriteError(err);
  }
}

export async function setChatTypingState(params: {
  chatId: string;
  userId: string;
  username: string;
  firstName: string;
  avatar: string;
  typing: boolean;
}): Promise<void> {
  const store = getTypingStore();
  let room = store.get(params.chatId);
  if (!room) {
    room = new Map();
    store.set(params.chatId, room);
  }

  const now = Date.now();
  if (params.typing) {
    room.set(params.userId, {
      userId: params.userId,
      username: params.username,
      firstName: params.firstName,
      avatar: params.avatar,
      expiresAt: now + TYPING_TTL_MS,
    });
  } else {
    room.delete(params.userId);
  }

  // Prune expired entries
  for (const [uid, entry] of room.entries()) {
    if (entry.expiresAt <= now) room.delete(uid);
  }

  if (isFirestoreAvailable()) {
    void safeFirestoreMerge(`chats/${params.chatId}`, {
      typing: {
        [params.userId]: params.typing
          ? {
              userId: params.userId,
              username: params.username,
              firstName: params.firstName,
              avatar: params.avatar,
              expiresAt: now + TYPING_TTL_MS,
            }
          : null,
      },
      updatedAt: now,
    });
  }
}

export function getActiveChatTypingUsers(chatId: string, excludeUserId?: string): TypingUserEntry[] {
  const room = getTypingStore().get(chatId);
  if (!room) return [];
  const now = Date.now();
  const active: TypingUserEntry[] = [];
  for (const [uid, entry] of room.entries()) {
    if (entry.expiresAt <= now) {
      room.delete(uid);
      continue;
    }
    if (!excludeUserId || uid !== excludeUserId) {
      active.push(entry);
    }
  }
  return active;
}

export function publishChatRealtimeEvent(
  chatId: string,
  eventType: string,
  payload: Record<string, unknown> = {}
): void {
  if (!isFirestoreAvailable()) return;
  void safeFirestoreMerge(`chats/${chatId}`, {
    lastEventType: eventType,
    lastEventAt: Date.now(),
    ...payload,
  });
}

export function publishUserRealtimeEvent(
  userId: string,
  eventType: string,
  payload: Record<string, unknown> = {}
): void {
  if (!isFirestoreAvailable()) return;
  void safeFirestoreMerge(`users_realtime/${userId}`, {
    lastEventType: eventType,
    lastEventAt: Date.now(),
    ...payload,
  });
}

export function publishPostRealtimeEvent(
  postId: string,
  eventType: string,
  payload: Record<string, unknown> = {}
): void {
  if (!isFirestoreAvailable()) return;
  void safeFirestoreMerge(`posts_realtime/${postId}`, {
    lastEventType: eventType,
    lastEventAt: Date.now(),
    ...payload,
  });
}

export function publishFeedRealtimeEvent(
  eventType: string,
  payload: Record<string, unknown> = {}
): void {
  if (!isFirestoreAvailable()) return;
  void safeFirestoreMerge('system_realtime/feed', {
    lastEventType: eventType,
    lastEventAt: Date.now(),
    ...payload,
  });
}
