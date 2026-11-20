import { connectDB } from '@/lib/db';
import { StoryFrame, StoryView } from '@/models/Story';
import { deleteMediaRecord } from '@/services/media.service';

export const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const PURGE_THROTTLE_MS = 5 * 60 * 1000;

declare global {
  var __wetoStoryPurgeLastRunAt: number | undefined;
  var __wetoStoryPurgeInFlight: Promise<number> | undefined;
}

export function getStoryExpiresAt(baseTimeMs = Date.now()): Date {
  return new Date(baseTimeMs + STORY_TTL_MS);
}

/**
 * Returns true once a story frame is past its 24-hour expiration window.
 * Checks both `expiresAt` and `createdAt + 24h` so no story can outlive 24 hours.
 */
export function isStoryExpired(
  frame: { expiresAt?: Date | string | null; createdAt?: Date | string | null },
  nowMs = Date.now()
): boolean {
  const expiresMs = frame.expiresAt ? new Date(frame.expiresAt).getTime() : NaN;
  const createdMs = frame.createdAt ? new Date(frame.createdAt).getTime() : NaN;
  const createdCutoffMs = Number.isFinite(createdMs) ? createdMs + STORY_TTL_MS : NaN;

  if (Number.isFinite(expiresMs) && expiresMs <= nowMs) return true;
  if (Number.isFinite(createdCutoffMs) && createdCutoffMs <= nowMs) return true;
  return false;
}

/**
 * Permanently deletes expired StoryFrame records (older than 24 hours),
 * along with their StoryView entries and associated R2 Media records.
 * Throttled in-process unless `force: true` (e.g. from cron maintenance).
 */
export async function purgeExpiredStories(options?: { force?: boolean }): Promise<number> {
  const nowMs = Date.now();
  const force = Boolean(options?.force);

  if (
    !force &&
    global.__wetoStoryPurgeLastRunAt &&
    nowMs - global.__wetoStoryPurgeLastRunAt < PURGE_THROTTLE_MS
  ) {
    return 0;
  }

  if (global.__wetoStoryPurgeInFlight) {
    return global.__wetoStoryPurgeInFlight;
  }

  global.__wetoStoryPurgeLastRunAt = nowMs;

  const task = (async () => {
    await connectDB();
    const now = new Date();
    const cutoff24h = new Date(now.getTime() - STORY_TTL_MS);

    const expiredFrames = await StoryFrame.find({
      $or: [{ expiresAt: { $lte: now } }, { createdAt: { $lte: cutoff24h } }],
    })
      .select('_id mediaId')
      .limit(200)
      .lean();

    if (expiredFrames.length === 0) {
      return 0;
    }

    const frameIds = expiredFrames.map((f) => f._id);

    for (const frame of expiredFrames) {
      if (frame.mediaId) {
        await deleteMediaRecord(String(frame.mediaId)).catch(() => undefined);
      }
    }

    await Promise.all([
      StoryView.deleteMany({ storyFrameId: { $in: frameIds } }),
      StoryFrame.deleteMany({ _id: { $in: frameIds } }),
    ]);

    return frameIds.length;
  })().finally(() => {
    global.__wetoStoryPurgeInFlight = undefined;
  });

  global.__wetoStoryPurgeInFlight = task;
  return task;
}
