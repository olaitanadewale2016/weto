import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';

const mockUserId = new Types.ObjectId('660000000000000000000011');
const mockPostAuthorId = new Types.ObjectId('660000000000000000000022');
const mockPostId = new Types.ObjectId('660000000000000000000033');

const findOnePostMock = vi.fn();
const findByIdPostMock = vi.fn();
const findByIdAndUpdatePostMock = vi.fn();
const updateOnePostMock = vi.fn();
const createPostMock = vi.fn();
const deleteOnePostMock = vi.fn();

const findCommentsMock = vi.fn();
const findByIdCommentMock = vi.fn();
const createCommentMock = vi.fn();
const updateOneCommentMock = vi.fn();
const deleteOneCommentMock = vi.fn();
const deleteManyCommentsMock = vi.fn();
const countDocumentsCommentMock = vi.fn();

const findReactionsMock = vi.fn();
const deleteManyReactionsMock = vi.fn();
const updateOneUserMock = vi.fn();

vi.mock('@/lib/db', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth/session', () => ({
  requireAuth: vi.fn().mockResolvedValue({
    user: {
      _id: mockUserId,
      username: 'tester',
      firstName: 'Test',
      lastName: 'User',
      email: 'tester@example.com',
      avatar: '/assets/avatars/default-avatar.png',
      verified: true,
      role: 'user',
      language: 'en',
    },
  }),
  getOptionalAuth: vi.fn().mockResolvedValue({
    user: {
      _id: mockUserId,
      username: 'tester',
      role: 'user',
    },
  }),
  getClientIp: vi.fn().mockResolvedValue('127.0.0.1'),
}));

vi.mock('@/services/notification.service', () => ({
  dispatchNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/censor-blacklist.service', () => ({
  enforceCensorForUser: vi.fn().mockImplementation(async ({ text }: { text: string }) => ({
    cleanText: text,
    triggeredWarnings: [],
  })),
}));

vi.mock('@/lib/realtime-emitter', () => ({
  emitToPost: vi.fn().mockResolvedValue(undefined),
  emitToFeed: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/firebase/realtime', () => ({
  publishPostRealtimeEvent: vi.fn(),
  publishFeedRealtimeEvent: vi.fn(),
}));

vi.mock('@/models/User', () => ({
  User: {
    updateOne: (...args: unknown[]) => updateOneUserMock(...args),
    find: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}));

vi.mock('@/models/Post', () => ({
  PostType: {
    TEXT: 'text',
    IMAGE: 'image',
    VIDEO: 'video',
    POLL: 'poll',
  },
  PostStatus: {
    ACTIVE: 'active',
    DRAFT: 'draft',
  },
  Post: {
    findOne: (...args: unknown[]) => findOnePostMock(...args),
    findById: (...args: unknown[]) => findByIdPostMock(...args),
    findByIdAndUpdate: (...args: unknown[]) => findByIdAndUpdatePostMock(...args),
    updateOne: (...args: unknown[]) => updateOnePostMock(...args),
    create: (...args: unknown[]) => createPostMock(...args),
    deleteOne: (...args: unknown[]) => deleteOnePostMock(...args),
  },
  Comment: {
    find: (...args: unknown[]) => findCommentsMock(...args),
    findById: (...args: unknown[]) => findByIdCommentMock(...args),
    create: (...args: unknown[]) => createCommentMock(...args),
    updateOne: (...args: unknown[]) => updateOneCommentMock(...args),
    deleteOne: (...args: unknown[]) => deleteOneCommentMock(...args),
    deleteMany: (...args: unknown[]) => deleteManyCommentsMock(...args),
    countDocuments: (...args: unknown[]) => countDocumentsCommentMock(...args),
  },
  Bookmark: {
    findOne: vi.fn(),
    create: vi.fn(),
    deleteOne: vi.fn(),
  },
  Reaction: {
    find: (...args: unknown[]) => findReactionsMock(...args),
    findOne: vi.fn(),
    create: vi.fn(),
    deleteOne: vi.fn(),
    deleteMany: (...args: unknown[]) => deleteManyReactionsMock(...args),
    aggregate: vi.fn().mockResolvedValue([]),
  },
}));

describe('Poll Voting, Repost Toggle & PHP Comment Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serializes poll choices as plain objects with votesCount, percentage, and totalVotes after voting', async () => {
    // Simulate Mongoose subdocument instances where spreading `{ ...choice }` would fail
    const choiceSubdoc0 = Object.create(
      { $__: { activePaths: {} } },
      {
        id: { value: 'c_0', enumerable: false },
        text: { value: 'Next.js 16', enumerable: false },
        votesCount: { value: 2, enumerable: false },
      }
    );
    const choiceSubdoc1 = Object.create(
      { $__: { activePaths: {} } },
      {
        id: { value: 'c_1', enumerable: false },
        text: { value: 'Vue 3 SPA', enumerable: false },
        votesCount: { value: 1, enumerable: false },
      }
    );

    let savedPoll: unknown = null;
    const mockPostDoc = {
      _id: mockPostId,
      hashId: 'pollhash1',
      userId: mockPostAuthorId,
      poll: {
        choices: [choiceSubdoc0, choiceSubdoc1],
        voterIds: [],
        votesByUser: {},
        isAnonymous: false,
        isCancellable: true,
        expiresAt: null,
      },
      set: vi.fn((key: string, val: unknown) => {
        if (key === 'poll') savedPoll = val;
      }),
      markModified: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };

    findOnePostMock.mockResolvedValueOnce(mockPostDoc);

    const { POST } = await import('@/app/api/v1/posts/[id]/react/route');
    const req = new NextRequest(`http://localhost:3000/api/v1/posts/${String(mockPostId)}/react`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'poll_vote',
        choiceId: 'c_0',
        choiceIndex: 0,
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: String(mockPostId) }) });
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.data.poll).toBeDefined();
    expect(Array.isArray(json.data.poll.choices)).toBe(true);
    expect(json.data.poll.choices).toHaveLength(2);
    expect(json.data.poll.choices[0]).toEqual({
      id: 'c_0',
      text: 'Next.js 16',
      votesCount: 3,
      percentage: 75,
    });
    expect(json.data.poll.choices[1]).toEqual({
      id: 'c_1',
      text: 'Vue 3 SPA',
      votesCount: 1,
      percentage: 25,
    });
    expect(json.data.poll.totalVotes).toBe(4);
    expect(json.data.poll.votesByUser[String(mockUserId)]).toBe('c_0');
    expect(savedPoll).toBeTruthy();
  }, 15000);

  it('creates a repost Post on first repost action and removes it on second repost action', async () => {
    const targetPost = {
      _id: mockPostId,
      hashId: 'origpost1',
      userId: mockPostAuthorId,
      repostsCount: 0,
    };

    // 1st call: no existing repost -> creates repost
    findOnePostMock
      .mockResolvedValueOnce(targetPost) // Post.findOne by id
      .mockResolvedValueOnce(null); // Post.findOne existingRepost
    createPostMock.mockResolvedValueOnce({
      _id: new Types.ObjectId('660000000000000000000099'),
      hashId: 'reposthash1',
      type: 'text',
    });
    findByIdAndUpdatePostMock.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({ repostsCount: 1 }),
    });
    updateOneUserMock.mockResolvedValueOnce({});

    const { POST } = await import('@/app/api/v1/posts/[id]/react/route');
    const req1 = new NextRequest(`http://localhost:3000/api/v1/posts/${String(mockPostId)}/react`, {
      method: 'POST',
      body: JSON.stringify({ action: 'repost' }),
    });
    const res1 = await POST(req1, { params: Promise.resolve({ id: String(mockPostId) }) });
    const json1 = await res1.json();

    expect(res1.status).toBe(200);
    expect(json1.data.reposted).toBe(true);
    expect(json1.data.repostsCount).toBe(1);
    expect(createPostMock).toHaveBeenCalledTimes(1);

    // 2nd call: existing repost found -> deletes repost & decrements count
    const existingRepostId = new Types.ObjectId('660000000000000000000099');
    findOnePostMock
      .mockResolvedValueOnce({ ...targetPost, repostsCount: 1 })
      .mockResolvedValueOnce({ _id: existingRepostId });
    deleteOnePostMock.mockResolvedValueOnce({ deletedCount: 1 });
    updateOnePostMock.mockResolvedValueOnce({});
    updateOneUserMock.mockResolvedValueOnce({});
    findByIdPostMock.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ repostsCount: 0 }),
      }),
    });

    const req2 = new NextRequest(`http://localhost:3000/api/v1/posts/${String(mockPostId)}/react`, {
      method: 'POST',
      body: JSON.stringify({ action: 'repost' }),
    });
    const res2 = await POST(req2, { params: Promise.resolve({ id: String(mockPostId) }) });
    const json2 = await res2.json();

    expect(res2.status).toBe(200);
    expect(json2.data.reposted).toBe(false);
    expect(json2.data.repostsCount).toBe(0);
    expect(deleteOnePostMock).toHaveBeenCalledWith({ _id: existingRepostId });
  });

  it('preserves child replies when a parent comment is deleted so parent preview shows deleted state (PHP parity)', async () => {
    const parentCommentId = new Types.ObjectId('660000000000000000000044');
    const childCommentId = new Types.ObjectId('660000000000000000000055');

    findByIdCommentMock.mockResolvedValueOnce({
      _id: parentCommentId,
      postId: mockPostId,
      userId: mockUserId,
      parentId: null,
    });
    findByIdPostMock.mockResolvedValueOnce({
      _id: mockPostId,
      userId: mockPostAuthorId,
    });
    deleteOneCommentMock.mockResolvedValueOnce({ deletedCount: 1 });
    deleteManyReactionsMock.mockResolvedValueOnce({ deletedCount: 0 });
    countDocumentsCommentMock.mockResolvedValueOnce(1);
    updateOnePostMock.mockResolvedValueOnce({});

    const { DELETE, GET } = await import('@/app/api/v1/posts/[id]/comments/route');
    const delReq = new NextRequest(
      `http://localhost:3000/api/v1/posts/${String(mockPostId)}/comments?commentId=${String(parentCommentId)}`,
      { method: 'DELETE' }
    );
    const delRes = await DELETE(delReq);
    const delJson = await delRes.json();

    expect(delRes.status).toBe(200);
    expect(delJson.data.deleted).toBe(true);
    expect(delJson.data.commentsCount).toBe(1);
    expect(deleteManyCommentsMock).not.toHaveBeenCalled();

    // Now GET comments: child reply still exists with parentId = parentCommentId, which is no longer in DB
    findOnePostMock.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({ _id: mockPostId, userId: mockPostAuthorId }),
    });
    findCommentsMock
      .mockReturnValueOnce({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            populate: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([
                {
                  _id: childCommentId,
                  postId: mockPostId,
                  parentId: parentCommentId,
                  content: 'Replying to deleted parent',
                  createdAt: new Date(),
                  userId: {
                    _id: mockUserId,
                    username: 'tester',
                    firstName: 'Test',
                    lastName: 'User',
                  },
                },
              ]),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        populate: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]), // parent was deleted
        }),
      });
    findReactionsMock.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue([]),
    });

    const getReq = new NextRequest(
      `http://localhost:3000/api/v1/posts/${String(mockPostId)}/comments`
    );
    const getRes = await GET(getReq, { params: Promise.resolve({ id: String(mockPostId) }) });
    const getJson = await getRes.json();

    expect(getRes.status).toBe(200);
    expect(getJson.data).toHaveLength(1);
    expect(getJson.data[0].hasParent).toBe(true);
    expect(getJson.data[0].parent).toBeNull();
  });
});
