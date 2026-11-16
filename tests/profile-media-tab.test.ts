import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { MediaType, PostType } from '@/types/enums';

const {
  mockConnectDB,
  mockGetOptionalAuth,
  mockUserFindOne,
  mockMediaDistinct,
  mockMediaFind,
  mockPostFind,
} = vi.hoisted(() => ({
  mockConnectDB: vi.fn(),
  mockGetOptionalAuth: vi.fn(),
  mockUserFindOne: vi.fn(),
  mockMediaDistinct: vi.fn(),
  mockMediaFind: vi.fn(),
  mockPostFind: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  connectDB: () => mockConnectDB(),
}));

vi.mock('@/lib/auth/session', () => ({
  getOptionalAuth: (...args: unknown[]) => mockGetOptionalAuth(...args),
  requireAuth: vi.fn(),
}));

vi.mock('@/models/User', () => ({
  User: {
    findOne: (...args: unknown[]) => mockUserFindOne(...args),
  },
}));

vi.mock('@/models/Media', () => ({
  Media: {
    distinct: (...args: unknown[]) => mockMediaDistinct(...args),
    find: (...args: unknown[]) => mockMediaFind(...args),
  },
}));

vi.mock('@/models/Post', () => ({
  Post: {
    find: (...args: unknown[]) => mockPostFind(...args),
  },
  Bookmark: { find: vi.fn() },
  Reaction: { find: vi.fn() },
}));

vi.mock('@/models/SocialGraph', () => ({
  Follow: { find: vi.fn() },
  Mute: { find: vi.fn() },
}));

describe('GET /api/v1/posts?mode=user_media (PHP profile media tab parity)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectDB.mockResolvedValue(undefined);
    mockGetOptionalAuth.mockResolvedValue(null);
  });

  it('queries Media by ownerId and filters non-text posts sorted newest-first', async () => {
    const profileUserId = '507f1f77bcf86cd799439011';
    const mediaPostId = '507f1f77bcf86cd799439022';
    mockUserFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({ _id: profileUserId }),
    });
    mockMediaDistinct.mockResolvedValue([mediaPostId]);
    mockMediaFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    });

    const sortSpy = vi.fn().mockReturnValue({
      skip: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          populate: vi.fn().mockReturnValue({
            populate: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([
                {
                  _id: mediaPostId,
                  type: PostType.IMAGE,
                  content: 'Photo post',
                  userId: { _id: profileUserId, username: 'jane' },
                  reactionSummary: [],
                },
              ]),
            }),
          }),
        }),
      }),
    });
    mockPostFind.mockReturnValue({ sort: sortSpy });

    const { GET } = await import('@/app/api/v1/posts/route');
    const req = new NextRequest('https://app.example.com/api/v1/posts?mode=user_media&username=jane');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockMediaDistinct).toHaveBeenCalledWith('targetId', {
      ownerId: profileUserId,
      targetType: 'post',
      type: { $ne: MediaType.TEXT },
    });

    const postFilter = mockPostFind.mock.calls[0]?.[0] as { $or?: unknown[] };
    expect(postFilter.$or).toEqual(
      expect.arrayContaining([
        { type: { $ne: PostType.TEXT } },
        { _id: { $in: [mediaPostId] } },
      ])
    );
    expect(sortSpy).toHaveBeenCalledWith({ createdAt: -1 });
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe(mediaPostId);
  }, 15000);
});
