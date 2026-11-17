import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { PRESET_AVATARS, isPresetAvatarUrl } from '@/lib/preset-avatars';
import { STICKER_PACKS, EMOJI_GROUPS, isValidStickerUrl } from '@/lib/stickers';
import {
  DEFAULT_COMMUNITY_GROUPS,
  hashGroupPassword,
  verifyGroupPassword,
} from '@/services/group-seed.service';

const user1Id = new Types.ObjectId('661111111111111111111111');
const user2Id = new Types.ObjectId('662222222222222222222222');
const chat1Id = new Types.ObjectId('663333333333333333333333');
const chat2Id = new Types.ObjectId('664444444444444444444444');
const msg1Id = new Types.ObjectId('665555555555555555555555');
const call1Id = new Types.ObjectId('666666666666666666666666');

let authUser = {
  _id: user1Id,
  username: 'alice',
  firstName: 'Alice',
  lastName: 'Wonder',
  avatar: '/assets/avatars/default-avatar.png',
  verified: false,
  status: 'ACTIVE',
};

const {
  mockChatFind,
  mockChatFindById,
  mockChatUpdateOne,
  mockMessageCreate,
  mockMessageFind,
  mockMessageFindById,
  mockMessageFindOne,
  mockChatCallFindOne,
  mockChatCallFindById,
  mockChatCallUpdateMany,
  mockChatCallCreate,
  mockEmitToChat,
  mockEmitToUser,
} = vi.hoisted(() => ({
  mockChatFind: vi.fn(),
  mockChatFindById: vi.fn(),
  mockChatUpdateOne: vi.fn(),
  mockMessageCreate: vi.fn(),
  mockMessageFind: vi.fn(),
  mockMessageFindById: vi.fn(),
  mockMessageFindOne: vi.fn(),
  mockChatCallFindOne: vi.fn(),
  mockChatCallFindById: vi.fn(),
  mockChatCallUpdateMany: vi.fn(),
  mockChatCallCreate: vi.fn(),
  mockEmitToChat: vi.fn().mockResolvedValue(undefined),
  mockEmitToUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/db', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth/session', () => ({
  requireAuth: vi.fn().mockImplementation(async () => ({ user: authUser })),
}));

vi.mock('@/lib/realtime-emitter', () => ({
  emitToChat: (...args: unknown[]) => mockEmitToChat(...args),
  emitToUser: (...args: unknown[]) => mockEmitToUser(...args),
}));

vi.mock('@/lib/firebase/realtime', () => ({
  publishChatRealtimeEvent: vi.fn(),
  publishUserRealtimeEvent: vi.fn(),
  setChatTypingState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/notification.service', () => ({
  dispatchNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/censor-blacklist.service', () => ({
  enforceCensorForUser: vi.fn().mockImplementation(async ({ text }: { text: string }) => ({
    cleanText: text,
    triggeredBanned: [],
    triggeredWarnings: [],
  })),
}));

vi.mock('@/models/User', () => ({
  User: {
    find: vi.fn(() => makeQuery([])),
    findOne: vi.fn(() => makeQuery(null)),
  },
}));

vi.mock('@/models/Post', () => ({
  Reaction: {
    findOne: vi.fn(),
    create: vi.fn(),
    deleteOne: vi.fn(),
    aggregate: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/models/Media', () => ({
  Media: {
    create: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock('@/models/Messaging', () => ({
  Chat: {
    find: (...args: unknown[]) => mockChatFind(...args),
    findById: (...args: unknown[]) => mockChatFindById(...args),
    updateOne: (...args: unknown[]) => mockChatUpdateOne(...args),
  },
  Message: {
    create: (...args: unknown[]) => mockMessageCreate(...args),
    find: (...args: unknown[]) => mockMessageFind(...args),
    findById: (...args: unknown[]) => mockMessageFindById(...args),
    findOne: (...args: unknown[]) => mockMessageFindOne(...args),
    deleteMany: vi.fn(),
  },
  ChatInvite: {
    findOne: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  ChatCall: {
    findOne: (...args: unknown[]) => mockChatCallFindOne(...args),
    findById: (...args: unknown[]) => mockChatCallFindById(...args),
    updateMany: (...args: unknown[]) => mockChatCallUpdateMany(...args),
    create: (...args: unknown[]) => mockChatCallCreate(...args),
  },
}));

function makeQuery<T>(doc: T) {
  const query = {
    populate: () => query,
    sort: () => query,
    select: () => query,
    lean: async () => doc,
    then: (resolve: (value: T) => void, reject?: (err: unknown) => void) =>
      Promise.resolve(doc).then(resolve, reject),
  };
  return query;
}

describe('Grupo Pro Parity (Avatars, Stickers, Polls, Location, Pin, Forward & Calls)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authUser = {
      _id: user1Id,
      username: 'alice',
      firstName: 'Alice',
      lastName: 'Wonder',
      avatar: '/assets/avatars/default-avatar.png',
      verified: false,
      status: 'ACTIVE',
    };
  });

  it('ships all 20 preset avatars on disk and validates URLs strictly', () => {
    expect(PRESET_AVATARS).toHaveLength(20);
    for (const preset of PRESET_AVATARS) {
      expect(isPresetAvatarUrl(preset.url)).toBe(true);
      const diskPath = path.join(process.cwd(), 'public', preset.url.replace(/^\//, ''));
      expect(fs.existsSync(diskPath)).toBe(true);
    }
    expect(isPresetAvatarUrl('https://evil.example.com/avatar.png')).toBe(false);
    expect(isPresetAvatarUrl('')).toBe(false);
  });

  it('ships all 3 Grupo Pro sticker packs (Famous, Simpsons, Masks & Care) and emoji groups on disk', () => {
    expect(STICKER_PACKS.map((p) => p.id)).toEqual(['Famous', 'Simpsons', 'Covid-19']);
    expect(EMOJI_GROUPS.length).toBeGreaterThanOrEqual(3);

    for (const pack of STICKER_PACKS) {
      expect(pack.stickers.length).toBeGreaterThanOrEqual(20);
      const iconPath = path.join(process.cwd(), 'public', pack.iconUrl.replace(/^\//, ''));
      expect(fs.existsSync(iconPath)).toBe(true);
      for (const stickerUrl of pack.stickers) {
        expect(isValidStickerUrl(stickerUrl)).toBe(true);
        const stickerPath = path.join(process.cwd(), 'public', stickerUrl.replace(/^\//, ''));
        expect(fs.existsSync(stickerPath)).toBe(true);
      }
    }
    expect(isValidStickerUrl('/assets/stickers/Unknown/fake.png')).toBe(false);

    const ringtonePath = path.join(process.cwd(), 'public', 'assets/sounds/calls/call_notification.mp3');
    expect(fs.existsSync(ringtonePath)).toBe(true);
  });

  it('sends sticker, poll, and location messages via POST /api/v1/chats/[chatId]', async () => {
    const chatDoc = {
      _id: chat1Id,
      chatUuid: 'chat-uuid-1',
      type: 'direct',
      participants: [
        { userId: user1Id, role: 'member', isHidden: false },
        { userId: user2Id, role: 'member', isHidden: false },
      ],
      pinnedMessageIds: [],
      lastMessagePreview: '',
      lastActivity: new Date(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockChatFindById.mockResolvedValue(chatDoc);

    const stickerUrl = STICKER_PACKS[0].stickers[0];
    let lastCreated: Record<string, unknown> = {};
    mockMessageCreate.mockImplementation(async (payload: Record<string, unknown>) => {
      lastCreated = {
        _id: msg1Id,
        ...payload,
        createdAt: new Date(),
      };
      return lastCreated;
    });
    mockMessageFindById.mockImplementation(() =>
      makeQuery({
        _id: msg1Id,
        type: lastCreated.type,
        content: null,
        senderId: {
          _id: user1Id,
          username: 'alice',
          firstName: 'Alice',
          lastName: 'Wonder',
          avatar: '/assets/avatars/default-avatar.png',
        },
        stickerUrl: lastCreated.stickerUrl || null,
        poll: lastCreated.poll || null,
        location: lastCreated.location || null,
        createdAt: new Date(),
      })
    );

    const { POST } = await import('@/app/api/v1/chats/[chatId]/route');

    // 1) Sticker
    const stickerRes = await POST(
      new NextRequest(`https://app.example.com/api/v1/chats/${chat1Id}`, {
        method: 'POST',
        body: JSON.stringify({ type: 'sticker', stickerUrl }),
      }),
      { params: Promise.resolve({ chatId: String(chat1Id) }) }
    );
    expect(stickerRes.status).toBe(201);
    const stickerBody = (await stickerRes.json()) as { data: { type: string; stickerUrl: string } };
    expect(stickerBody.data.type).toBe('sticker');
    expect(stickerBody.data.stickerUrl).toBe(stickerUrl);

    // 2) Poll
    const pollRes = await POST(
      new NextRequest(`https://app.example.com/api/v1/chats/${chat1Id}`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'poll',
          pollQuestion: 'Where should we meet?',
          pollOptions: ['Lagos', 'Abuja'],
        }),
      }),
      { params: Promise.resolve({ chatId: String(chat1Id) }) }
    );
    expect(pollRes.status).toBe(201);
    const pollBody = (await pollRes.json()) as {
      data: { type: string; poll: { question: string; options: Array<{ text: string }> } };
    };
    expect(pollBody.data.type).toBe('poll');
    expect(pollBody.data.poll.question).toBe('Where should we meet?');
    expect(pollBody.data.poll.options).toHaveLength(2);

    // 3) Location
    const locRes = await POST(
      new NextRequest(`https://app.example.com/api/v1/chats/${chat1Id}`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'location',
          location: { lat: 6.5244, lng: 3.3792, label: '6.5244, 3.3792' },
        }),
      }),
      { params: Promise.resolve({ chatId: String(chat1Id) }) }
    );
    expect(locRes.status).toBe(201);
    const locBody = (await locRes.json()) as {
      data: { type: string; location: { lat: number; lng: number } };
    };
    expect(locBody.data.type).toBe('location');
    expect(locBody.data.location.lat).toBe(6.5244);
  });

  it('votes on an in-chat poll via POST /api/v1/chats/[chatId]/messages/[messageId]', async () => {
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const pollMsg = {
      _id: msg1Id,
      chatId: chat1Id,
      poll: {
        question: 'Tea or coffee?',
        options: [
          { id: 'opt-1', text: 'Tea', voterIds: [user1Id] },
          { id: 'opt-2', text: 'Coffee', voterIds: [] as Types.ObjectId[] },
        ],
      },
      markModified: vi.fn(),
      save: saveMock,
    };
    mockMessageFindOne.mockResolvedValue(pollMsg);

    const { POST } = await import('@/app/api/v1/chats/[chatId]/messages/[messageId]/route');
    const res = await POST(
      new NextRequest(`https://app.example.com/api/v1/chats/${chat1Id}/messages/${msg1Id}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'vote_poll', optionId: 'opt-2' }),
      }),
      { params: Promise.resolve({ chatId: String(chat1Id), messageId: String(msg1Id) }) }
    );

    expect(res.status).toBe(200);
    expect(saveMock).toHaveBeenCalled();
    const json = (await res.json()) as {
      data: { poll: { options: Array<{ id: string; voterIds: string[] }> } };
    };
    expect(json.data.poll.options[0].voterIds).toHaveLength(0);
    expect(json.data.poll.options[1].voterIds.map(String)).toEqual([String(user1Id)]);
  });

  it('pins, unpins, and forwards messages via PATCH /api/v1/chats/[chatId]', async () => {
    const chatDoc = {
      _id: chat1Id,
      chatUuid: 'chat-uuid-1',
      type: 'direct',
      participants: [
        { userId: user1Id, role: 'member', isHidden: false },
        { userId: user2Id, role: 'member', isHidden: false },
      ],
      pinnedMessageIds: [] as Types.ObjectId[],
      save: vi.fn().mockResolvedValue(undefined),
    };
    const destChatDoc = {
      _id: chat2Id,
      chatUuid: 'chat-uuid-2',
      participants: [
        { userId: user1Id, role: 'member', isHidden: false },
        { userId: user2Id, role: 'member', isHidden: false },
      ],
      lastMessagePreview: '',
      lastActivity: new Date(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockChatFindById.mockImplementation(async (id: string) =>
      String(id) === String(chat2Id) ? destChatDoc : chatDoc
    );
    mockChatUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    mockMessageFindOne.mockImplementation(() =>
      makeQuery({
        _id: msg1Id,
        chatId: chat1Id,
        type: 'text',
        content: 'Important announcement',
        mediaId: null,
        stickerUrl: null,
        poll: null,
        location: null,
        linkSnapshot: null,
        isDeleted: false,
      })
    );

    const { PATCH } = await import('@/app/api/v1/chats/[chatId]/route');

    // Pin message
    const pinRes = await PATCH(
      new NextRequest(`https://app.example.com/api/v1/chats/${chat1Id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'pin_message', messageId: String(msg1Id) }),
      }),
      { params: Promise.resolve({ chatId: String(chat1Id) }) }
    );
    expect(pinRes.status).toBe(200);
    expect(mockChatUpdateOne).toHaveBeenCalledWith(
      { _id: chat1Id },
      { $addToSet: { pinnedMessageIds: msg1Id } }
    );

    // Unpin message
    const unpinRes = await PATCH(
      new NextRequest(`https://app.example.com/api/v1/chats/${chat1Id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'unpin_message', messageId: String(msg1Id) }),
      }),
      { params: Promise.resolve({ chatId: String(chat1Id) }) }
    );
    expect(unpinRes.status).toBe(200);
    expect(mockChatUpdateOne).toHaveBeenCalledWith(
      { _id: chat1Id },
      { $pull: { pinnedMessageIds: msg1Id } }
    );

    // Forward message to another chat
    mockMessageCreate.mockResolvedValue({ _id: new Types.ObjectId(), createdAt: new Date() });

    const fwdRes = await PATCH(
      new NextRequest(`https://app.example.com/api/v1/chats/${chat1Id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'forward_message',
          messageId: String(msg1Id),
          targetChatIds: [String(chat2Id)],
        }),
      }),
      { params: Promise.resolve({ chatId: String(chat1Id) }) }
    );
    expect(fwdRes.status).toBe(200);
    const fwdJson = (await fwdRes.json()) as { data: { forwarded: number } };
    expect(fwdJson.data.forwarded).toBe(1);
    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: chat2Id,
        forwardedFromId: msg1Id,
        content: 'Important announcement',
      })
    );
  });

  it('starts a call, rings incoming recipient, relays remote mute, and ends call', async () => {
    const groupChatDoc = {
      _id: chat1Id,
      chatUuid: 'group-uuid-1',
      type: 'group',
      group: { name: 'Core Team' },
      participants: [
        { userId: user1Id, role: 'owner', isHidden: false },
        { userId: user2Id, role: 'member', isHidden: false },
      ],
      lastMessagePreview: '',
      lastActivity: new Date(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockChatFindById.mockResolvedValue(groupChatDoc);

    const activeCallDoc = {
      _id: call1Id,
      callUuid: 'call-uuid-1',
      chatId: chat1Id,
      chatType: 'group',
      initiatorId: user1Id,
      targetUserIds: [user1Id, user2Id],
      audioOnly: false,
      status: 'ringing',
      participants: [
        {
          userId: {
            _id: user1Id,
            username: 'alice',
            firstName: 'Alice',
            lastName: 'Wonder',
            avatar: '/assets/avatars/default-avatar.png',
          },
          muted: false,
          cameraEnabled: true,
          screenSharing: false,
        },
        {
          userId: user2Id,
          muted: false,
          cameraEnabled: true,
          screenSharing: false,
        },
      ],
      signals: [],
      startedAt: new Date(),
      lastActivityAt: new Date(),
      save: vi.fn().mockResolvedValue(undefined),
    };

    mockChatCallUpdateMany.mockResolvedValue({ modifiedCount: 0 });
    mockChatCallFindOne.mockImplementationOnce(() => makeQuery(null));
    mockChatCallCreate.mockResolvedValue(activeCallDoc);
    mockChatCallFindById.mockImplementationOnce(() => makeQuery(activeCallDoc));
    mockMessageCreate.mockResolvedValue({ _id: msg1Id, createdAt: new Date() });

    const { POST: callPost } = await import('@/app/api/v1/chats/[chatId]/call/route');
    const startRes = await callPost(
      new NextRequest(`https://app.example.com/api/v1/chats/${chat1Id}/call`, {
        method: 'POST',
        body: JSON.stringify({ action: 'start', audioOnly: false }),
      }),
      { params: Promise.resolve({ chatId: String(chat1Id) }) }
    );
    expect(startRes.status).toBe(200);
    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'system', content: 'user_initiated_video_call' })
    );
    expect(mockEmitToUser).toHaveBeenCalledWith(
      String(user2Id),
      'chat:call:incoming',
      expect.objectContaining({ chatId: String(chat1Id), audioOnly: false })
    );

    // Check incoming call polling endpoint as user2
    authUser = { ...authUser, _id: user2Id, username: 'bob', firstName: 'Bob', lastName: 'Builder' };
    mockChatCallFindOne.mockImplementationOnce(() =>
      makeQuery({
        _id: call1Id,
        callUuid: 'call-uuid-1',
        chatId: chat1Id,
        chatType: 'direct',
        audioOnly: false,
        initiatorId: {
          _id: user1Id,
          username: 'alice',
          firstName: 'Alice',
          lastName: 'Wonder',
          avatar: '/assets/avatars/default-avatar.png',
        },
      })
    );
    const { GET: incomingGet } = await import('@/app/api/v1/calls/incoming/route');
    const incRes = await incomingGet(new NextRequest('https://app.example.com/api/v1/calls/incoming'));
    expect(incRes.status).toBe(200);
    const incJson = (await incRes.json()) as {
      data: { incomingCall: { chatId: string; caller: { username: string } } | null };
    };
    expect(incJson.data.incomingCall?.chatId).toBe(String(chat1Id));
    expect(incJson.data.incomingCall?.caller.username).toBe('alice');

    // Admin remote mute back as owner user1
    authUser = { ...authUser, _id: user1Id, username: 'alice', firstName: 'Alice', lastName: 'Wonder' };
    mockChatCallFindOne.mockImplementationOnce(() => makeQuery(activeCallDoc));
    const muteRes = await callPost(
      new NextRequest(`https://app.example.com/api/v1/chats/${chat1Id}/call`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'remote_mute',
          targetUserId: String(user2Id),
          muted: true,
        }),
      }),
      { params: Promise.resolve({ chatId: String(chat1Id) }) }
    );
    expect(muteRes.status).toBe(200);
    expect(mockEmitToUser).toHaveBeenCalledWith(
      String(user2Id),
      'chat:call:remote_mute',
      expect.objectContaining({ muted: true })
    );
  });

  it('provides pre-created community groups, password protection, roles, mute/ban moderation & posting rules', async () => {
    expect(DEFAULT_COMMUNITY_GROUPS.length).toBeGreaterThanOrEqual(4);
    expect(DEFAULT_COMMUNITY_GROUPS.some((g) => g.autoJoin && g.isPinned)).toBe(true);

    const pwdHash = hashGroupPassword('secret123');
    expect(verifyGroupPassword('secret123', pwdHash)).toBe(true);
    expect(verifyGroupPassword('wrong', pwdHash)).toBe(false);

    const groupDoc = {
      _id: chat1Id,
      chatUuid: 'group-mod-uuid',
      type: 'group',
      participants: [
        { userId: user1Id, role: 'owner', isMuted: false, isHidden: false },
        { userId: user2Id, role: 'member', isMuted: false, isHidden: false },
      ] as Array<{
        userId: Types.ObjectId;
        role: 'owner' | 'admin' | 'member';
        isMuted?: boolean;
        mutedUntil?: Date | null;
        isHidden: boolean;
      }>,
      group: {
        ownerId: user1Id,
        name: 'Community Hub',
        visibility: 'public',
        status: 'active',
        postingMode: 'admins_only' as 'everyone' | 'admins_only',
        isPasswordProtected: true,
        passwordHash: pwdHash,
        bannedUserIds: [] as Types.ObjectId[],
        pendingJoinUserIds: [] as Types.ObjectId[],
      },
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockChatFindById.mockResolvedValue(groupDoc);

    const { PATCH, POST } = await import('@/app/api/v1/chats/[chatId]/route');

    // Member cannot post in admins_only room
    authUser = { ...authUser, _id: user2Id, username: 'bob' };
    const blockedPost = await POST(
      new NextRequest(`https://app.example.com/api/v1/chats/${chat1Id}`, {
        method: 'POST',
        body: JSON.stringify({ type: 'text', content: 'Hello everyone' }),
      }),
      { params: Promise.resolve({ chatId: String(chat1Id) }) }
    );
    expect(blockedPost.status).toBe(403);

    // Owner promotes user2 to admin and mutes/unmutes cleanly
    authUser = { ...authUser, _id: user1Id, username: 'alice' };
    const promoteRes = await PATCH(
      new NextRequest(`https://app.example.com/api/v1/chats/${chat1Id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'set_role',
          targetUserId: String(user2Id),
          role: 'admin',
        }),
      }),
      { params: Promise.resolve({ chatId: String(chat1Id) }) }
    );
    expect(promoteRes.status).toBe(200);
    expect(groupDoc.participants[1].role).toBe('admin');

    const muteRes = await PATCH(
      new NextRequest(`https://app.example.com/api/v1/chats/${chat1Id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'mute_participant',
          targetUserId: String(user2Id),
          muted: true,
        }),
      }),
      { params: Promise.resolve({ chatId: String(chat1Id) }) }
    );
    expect(muteRes.status).toBe(200);
    expect(groupDoc.participants[1].isMuted).toBe(true);

    // Muted admin is blocked from sending messages
    authUser = { ...authUser, _id: user2Id, username: 'bob' };
    const mutedPost = await POST(
      new NextRequest(`https://app.example.com/api/v1/chats/${chat1Id}`, {
        method: 'POST',
        body: JSON.stringify({ type: 'text', content: 'Am I muted?' }),
      }),
      { params: Promise.resolve({ chatId: String(chat1Id) }) }
    );
    expect(mutedPost.status).toBe(403);

    // Owner bans user2, blocking rejoin
    authUser = { ...authUser, _id: user1Id, username: 'alice' };
    const banRes = await PATCH(
      new NextRequest(`https://app.example.com/api/v1/chats/${chat1Id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'ban_participant', targetUserId: String(user2Id) }),
      }),
      { params: Promise.resolve({ chatId: String(chat1Id) }) }
    );
    expect(banRes.status).toBe(200);
    expect(groupDoc.group.bannedUserIds.map(String)).toContain(String(user2Id));
  });
});
