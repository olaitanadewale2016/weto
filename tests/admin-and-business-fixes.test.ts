import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { MODERATION_ACTION_TYPES } from '@/models/Moderation';
import { apiError } from '@/lib/api-response';

const {
  mockRequireAdminAuth,
  mockRequireAuth,
  mockChatFindById,
  mockMessageCountDocuments,
  mockMessageFind,
  mockMessageFindById,
  mockDeleteMediaRecord,
  mockEmitToAdmins,
  mockEmitToChat,
  mockEmitToUser,
  mockModerationActionCreate,
  mockUserFind,
  mockWriteAuditLog,
  mockBusinessFindOne,
  mockStoreFind,
  mockProductCountDocuments,
  mockJobListingCountDocuments,
  mockJobListingAggregate,
  mockAdCountDocuments,
  mockAdAggregate,
  mockEnsureWallet,
} = vi.hoisted(() => ({
  mockRequireAdminAuth: vi.fn(),
  mockRequireAuth: vi.fn(),
  mockChatFindById: vi.fn(),
  mockMessageCountDocuments: vi.fn(),
  mockMessageFind: vi.fn(),
  mockMessageFindById: vi.fn(),
  mockDeleteMediaRecord: vi.fn(),
  mockEmitToAdmins: vi.fn(),
  mockEmitToChat: vi.fn(),
  mockEmitToUser: vi.fn(),
  mockModerationActionCreate: vi.fn(),
  mockUserFind: vi.fn(),
  mockWriteAuditLog: vi.fn(),
  mockBusinessFindOne: vi.fn(),
  mockStoreFind: vi.fn(),
  mockProductCountDocuments: vi.fn(),
  mockJobListingCountDocuments: vi.fn(),
  mockJobListingAggregate: vi.fn(),
  mockAdCountDocuments: vi.fn(),
  mockAdAggregate: vi.fn(),
  mockEnsureWallet: vi.fn(),
}));

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return {
    ...actual,
    requireAdminAuth: (...args: unknown[]) => mockRequireAdminAuth(...args),
    requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  };
});

vi.mock('@/lib/realtime-emitter', () => ({
  emitToAdmins: (...args: unknown[]) => mockEmitToAdmins(...args),
  emitToChat: (...args: unknown[]) => mockEmitToChat(...args),
  emitToUser: (...args: unknown[]) => mockEmitToUser(...args),
  emitToPost: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

vi.mock('@/services/media.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/media.service')>();
  return {
    ...actual,
    deleteMediaRecord: (...args: unknown[]) => mockDeleteMediaRecord(...args),
    serializeMedia: (m: { _id?: string; type?: string; externalUrl?: string; r2Key?: string }) => ({
      id: String(m?._id || ''),
      type: m?.type || 'image',
      url: m?.externalUrl || (m?.r2Key ? `/api/v1/media/r2/${m.r2Key}` : ''),
      publicUrl: m?.externalUrl || (m?.r2Key ? `/api/v1/media/r2/${m.r2Key}` : ''),
    }),
  };
});

vi.mock('@/models/Messaging', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/models/Messaging')>();
  return {
    ...actual,
    Chat: {
      findById: (...args: unknown[]) => mockChatFindById(...args),
    },
    Message: {
      countDocuments: (...args: unknown[]) => mockMessageCountDocuments(...args),
      find: (...args: unknown[]) => mockMessageFind(...args),
      findById: (...args: unknown[]) => mockMessageFindById(...args),
    },
  };
});

vi.mock('@/models/Moderation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/models/Moderation')>();
  return {
    ...actual,
    ModerationAction: {
      create: (...args: unknown[]) => mockModerationActionCreate(...args),
    },
  };
});

vi.mock('@/models/User', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/models/User')>();
  return {
    ...actual,
    User: {
      find: (...args: unknown[]) => mockUserFind(...args),
    },
  };
});

vi.mock('@/models/Commerce', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/models/Commerce')>();
  return {
    ...actual,
    BusinessAccount: { findOne: (...args: unknown[]) => mockBusinessFindOne(...args) },
    Store: { find: (...args: unknown[]) => mockStoreFind(...args) },
    Product: { countDocuments: (...args: unknown[]) => mockProductCountDocuments(...args) },
    JobListing: {
      countDocuments: (...args: unknown[]) => mockJobListingCountDocuments(...args),
      aggregate: (...args: unknown[]) => mockJobListingAggregate(...args),
    },
  };
});

vi.mock('@/models/Finance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/models/Finance')>();
  return {
    ...actual,
    Ad: {
      countDocuments: (...args: unknown[]) => mockAdCountDocuments(...args),
      aggregate: (...args: unknown[]) => mockAdAggregate(...args),
    },
  };
});

vi.mock('@/services/wallet.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/wallet.service')>();
  return {
    ...actual,
    ensureWallet: (...args: unknown[]) => mockEnsureWallet(...args),
  };
});

const ADMIN_ID = '6af969d6c546a8cabfaba288';
const CHAT_ID = '6afa0508bec2b3b04d6e9bff';
const MSG_ID = '6afb1508bec2b3b04d6e9c01';

describe('Admin Moderation Enum, Error Handling, Chat Inspection & Business Overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminAuth.mockResolvedValue({
      user: { _id: ADMIN_ID, username: 'root_admin', email: 'admin@weto.test', role: 'root' },
    });
    mockUserFind.mockReturnValue({
      select: () => ({
        lean: async () => [{ _id: ADMIN_ID }],
      }),
    });
  });

  it('includes all admin moderation actions in MODERATION_ACTION_TYPES', () => {
    const required = [
      'approve_product',
      'reject_product',
      'approve_job',
      'reject_job',
      'verify_business',
      'reject_business',
      'approve_ad',
      'reject_ad',
      'pause_ad',
      'publish_ad',
      'approve_authorship',
      'reject_authorship',
      'approve_cashout',
      'reject_cashout',
      'resolve_report',
      'dismiss_report',
      'blacklist_add',
      'verify_user',
      'unverify_user',
      'grant_author',
      'revoke_author',
      'delete_user',
      'set_wallet_balance',
      'delete_chat',
      'delete_chat_message',
    ] as const;

    for (const action of required) {
      expect(MODERATION_ACTION_TYPES).toContain(action);
    }
  });

  it('maps Mongoose ValidationError and CastError cleanly in apiError', async () => {
    const valErr = Object.assign(new Error('Validation failed'), {
      name: 'ValidationError',
      errors: { action: { message: 'Invalid moderation action' } },
    });
    const res1 = apiError(valErr);
    expect(res1.status).toBe(422);
    const body1 = await res1.json();
    expect(body1.error.message).toBe('Invalid moderation action');

    const castErr = Object.assign(new Error('Cast failed'), { name: 'CastError' });
    const res2 = apiError(castErr);
    expect(res2.status).toBe(400);
    const body2 = await res2.json();
    expect(body2.error.code).toBe('INVALID_ID');
  });

  it('inspects chat messages & metadata via GET /api/v1/admin/manage?resource=chat_messages', async () => {
    mockChatFindById.mockReturnValue({
      populate: () => ({
        lean: async () => ({
          _id: CHAT_ID,
          chatUuid: 'uuid-1234',
          type: 'direct',
          participants: [{ userId: { _id: ADMIN_ID, username: 'alice' } }],
          createdAt: new Date('2026-01-01T00:00:00Z'),
          lastActivity: new Date('2026-01-02T00:00:00Z'),
        }),
      }),
    });
    mockMessageCountDocuments.mockResolvedValue(1);
    mockMessageFind.mockReturnValue({
      sort: () => ({
        limit: () => ({
          populate: () => ({
            populate: () => ({
              lean: async () => [
                {
                  _id: MSG_ID,
                  type: 'text',
                  content: 'Hello support!',
                  isDeleted: false,
                  createdAt: new Date('2026-01-02T00:00:00Z'),
                  senderId: { _id: ADMIN_ID, username: 'alice' },
                  mediaId: { _id: 'media-1', type: 'image', r2Key: 'chat/photo.jpg' },
                },
              ],
            }),
          }),
        }),
      }),
    });

    const { GET } = await import('@/app/api/v1/admin/manage/route');
    const req = new NextRequest(`http://localhost:3000/api/v1/admin/manage?resource=chat_messages&chatId=${CHAT_ID}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.chat._id).toBe(CHAT_ID);
    expect(json.data.chat.messagesCount).toBe(1);
    expect(json.data.messages).toHaveLength(1);
    expect(json.data.messages[0].content).toBe('Hello support!');
    expect(json.data.messages[0].media.url).toBe('/api/v1/media/r2/chat/photo.jpg');
  });

  it('deletes a single chat message, logs ModerationAction, and emits realtime updates', async () => {
    const mockSave = vi.fn().mockResolvedValue(undefined);
    mockMessageFindById.mockResolvedValue({
      _id: MSG_ID,
      chatId: CHAT_ID,
      senderId: ADMIN_ID,
      mediaId: 'media-99',
      isDeleted: false,
      content: 'Bad message',
      save: mockSave,
    });

    const { POST } = await import('@/app/api/v1/admin/manage/route');
    const req = new NextRequest('http://localhost:3000/api/v1/admin/manage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'chat.delete_message', targetId: MSG_ID }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockDeleteMediaRecord).toHaveBeenCalledWith('media-99');
    expect(mockSave).toHaveBeenCalled();
    expect(mockModerationActionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'delete_chat_message',
        targetId: MSG_ID,
      })
    );
    expect(mockEmitToChat).toHaveBeenCalledWith(CHAT_ID, 'message:deleted', {
      chatId: CHAT_ID,
      messageId: MSG_ID,
    });
    expect(mockEmitToAdmins).toHaveBeenCalledWith(
      [ADMIN_ID],
      'admin:updated',
      expect.objectContaining({ action: 'chat.delete_message', targetId: MSG_ID })
    );
  });

  it('aggregates all ad views/spend and job stats accurately in GET /api/v1/business', async () => {
    mockRequireAuth.mockResolvedValue({
      user: { _id: ADMIN_ID, username: 'biz_owner' },
    });
    mockBusinessFindOne.mockReturnValue({ lean: async () => ({ name: 'Acme Studio', verified: true }) });
    mockStoreFind.mockReturnValue({ sort: () => ({ lean: async () => [{ _id: 'store-1', name: 'Main Store' }] }) });
    mockProductCountDocuments.mockResolvedValue(8);
    mockJobListingCountDocuments.mockResolvedValue(3);
    mockAdCountDocuments.mockResolvedValue(7);
    mockEnsureWallet.mockResolvedValue({ balance: 12500, currency: 'NGN' });
    mockAdAggregate.mockResolvedValue([{ _id: null, totalViews: 9400, totalSpend: 420.5 }]);
    mockJobListingAggregate.mockResolvedValue([{ _id: null, totalApplications: 19 }]);

    const { GET } = await import('@/app/api/v1/business/route');
    const req = new NextRequest('http://localhost:3000/api/v1/business');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.metrics.totalAdViews).toBe(9400);
    expect(json.data.metrics.totalAdSpend).toBe(420.5);
    expect(json.data.metrics.totalJobApplications).toBe(19);
    expect(json.data.metrics.walletBalance).toBe(12500);
  });
});
