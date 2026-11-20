import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { ChatInvite } from '@/models/Messaging';
import { logger } from '@/lib/logger';
import { purgeExpiredStories } from '@/services/story-expiration.service';

export const dynamic = 'force-dynamic';

/**
 * Vercel Cron endpoint replacing the BullMQ maintenance schedule when running
 * purely serverless without the standalone worker/index.ts process.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = req.headers.get('authorization');

  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { status: 'error', message: 'CRON_SECRET is not configured' },
      { status: 500 }
    );
  }

  try {
    await connectDB();
    const now = new Date();

    const [deletedStories, inviteRes] = await Promise.all([
      purgeExpiredStories({ force: true }),
      ChatInvite.deleteMany({ expiresAt: { $lt: now } }),
    ]);

    logger.info(
      {
        deletedStories,
        deletedInvites: inviteRes.deletedCount ?? 0,
      },
      'Vercel cron maintenance completed'
    );

    return NextResponse.json({
      status: 'ok',
      deletedStories,
      deletedInvites: inviteRes.deletedCount ?? 0,
      ranAt: now.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, 'Vercel cron maintenance failed');
    return NextResponse.json(
      { status: 'error', message: err instanceof Error ? err.message : 'Maintenance failed' },
      { status: 500 }
    );
  }
}
