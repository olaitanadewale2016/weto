import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import { Post } from '@/models';
import { PostStatus } from '@/types/enums';
import { apiError, apiSuccess } from '@/lib/api-response';

/**
 * Aggregates trending hashtags across active public posts.
 */
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const limitParam = Number(req.nextUrl.searchParams.get('limit') ?? '10');
    const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 10, 1), 30);

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const tags = await Post.aggregate<{ _id: string; count: number; engagement: number }>([
      {
        $match: {
          status: { $in: [PostStatus.ACTIVE, PostStatus.PUBLISHED] },
          hashtags: { $exists: true, $ne: [] },
          createdAt: { $gte: since },
        },
      },
      { $unwind: '$hashtags' },
      {
        $group: {
          _id: { $toLower: '$hashtags' },
          count: { $sum: 1 },
          engagement: {
            $sum: {
              $add: [
                { $ifNull: ['$viewsCount', 0] },
                { $ifNull: ['$commentsCount', 0] },
                { $ifNull: ['$sharesCount', 0] },
              ],
            },
          },
        },
      },
      { $sort: { count: -1, engagement: -1 } },
      { $limit: limit },
    ]);

    return apiSuccess({
      hashtags: tags.map((t) => ({
        tag: t._id,
        postsCount: t.count,
        engagement: t.engagement,
      })),
    });
  } catch (err) {
    return apiError(err);
  }
}
