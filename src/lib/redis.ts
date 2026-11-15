import Redis from 'ioredis';
import { logger } from './logger';

declare global {
  var __redisClient: Redis | undefined;
}

export function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) {
    return null;
  }

  if (!global.__redisClient) {
    const client = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });

    client.on('error', (err) => {
      logger.warn({ err: err.message }, 'Redis client warning');
    });

    global.__redisClient = client;
  }

  return global.__redisClient;
}

// In-memory fallback limiter for dev/test when Redis is unavailable
const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Sliding/fixed window rate limiter backed by Redis (with in-memory fallback).
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const redis = getRedis();

  if (redis) {
    try {
      const redisKey = `rl:${key}`;
      const tx = redis.multi();
      tx.incr(redisKey);
      tx.ttl(redisKey);
      const res = await tx.exec();
      const count = Number(res?.[0]?.[1] ?? 1);
      let ttl = Number(res?.[1]?.[1] ?? -1);

      if (ttl < 0) {
        await redis.expire(redisKey, windowSeconds);
        ttl = windowSeconds;
      }

      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        resetAt: now + ttl * 1000,
      };
    } catch {
      // Fall back to memory bucket if Redis is offline
    }
  }

  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowSeconds * 1000;
    memoryBuckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  bucket.count += 1;
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}
