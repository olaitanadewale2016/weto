import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockRequireAuth, mockGetSettingsGroup, mockUserFind, mockUserFindOne } = vi.hoisted(
  () => ({
    mockRequireAuth: vi.fn(),
    mockGetSettingsGroup: vi.fn(),
    mockUserFind: vi.fn(),
    mockUserFindOne: vi.fn(),
  })
);

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return {
    ...actual,
    requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  };
});

vi.mock('@/services/settings.service', () => ({
  getSettingsGroup: (...args: unknown[]) => mockGetSettingsGroup(...args),
}));

vi.mock('@/models/User', () => ({
  User: {
    find: (...args: unknown[]) => mockUserFind(...args),
    findOne: (...args: unknown[]) => mockUserFindOne(...args),
    exists: vi.fn(),
    countDocuments: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('@/models/SocialGraph', () => ({ DeletionFeedback: { create: vi.fn() } }));
vi.mock('@/models/Post', () => ({ Post: { deleteMany: vi.fn() } }));
vi.mock('@/services/wallet.service', () => ({ ensureWallet: vi.fn() }));
vi.mock('@/services/notification.service', () => ({ dispatchNotification: vi.fn() }));

const MASTER_ID = '6af969d6c546a8cabfaba288';
const LINKED_ID = '6afa0508bec2b3b04d6e9bff';

describe('Account Switch & Switch Back (/api/v1/auth/accounts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets cp_active_account and cp_prev_account when switching accounts', async () => {
    mockRequireAuth.mockResolvedValue({
      user: {
        _id: MASTER_ID,
        username: 'master_user',
        ownerAccountId: null,
        status: 'ACTIVE',
      },
    });
    mockGetSettingsGroup.mockResolvedValue({
      switchAccounts: true,
      switchAccountEnabled: true,
      linkAccounts: true,
      linkAccountsEnabled: true,
    });
    mockUserFindOne.mockResolvedValue({
      _id: LINKED_ID,
      username: 'sub_user',
      ownerAccountId: MASTER_ID,
      status: 'ACTIVE',
    });

    const { POST } = await import('@/app/api/v1/auth/accounts/route');
    const req = new NextRequest('https://app.example.com/api/v1/auth/accounts', {
      method: 'POST',
      body: JSON.stringify({ action: 'switch', targetAccountId: LINKED_ID }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.cookies.get('cp_active_account')?.value).toBe(LINKED_ID);
    expect(res.cookies.get('cp_prev_account')?.value).toBe(MASTER_ID);
  });

  it('allows switching back from linked profile via switch_back even when global switchAccounts is disabled', async () => {
    mockRequireAuth.mockResolvedValue({
      user: {
        _id: LINKED_ID,
        username: 'sub_user',
        ownerAccountId: MASTER_ID,
        status: 'ACTIVE',
      },
    });
    mockGetSettingsGroup.mockResolvedValue({
      switchAccounts: false,
      switchAccountEnabled: false,
      linkAccounts: true,
      linkAccountsEnabled: true,
    });
    mockUserFindOne.mockResolvedValue({
      _id: MASTER_ID,
      username: 'master_user',
      ownerAccountId: null,
      status: 'ACTIVE',
    });

    const { POST } = await import('@/app/api/v1/auth/accounts/route');
    const req = new NextRequest('https://app.example.com/api/v1/auth/accounts', {
      method: 'POST',
      headers: {
        cookie: `cp_active_account=${LINKED_ID}; cp_prev_account=${MASTER_ID}`,
      },
      body: JSON.stringify({ action: 'switch_back' }),
    });

    const res = await POST(req);
    const body = (await res.json()) as {
      status: string;
      data: { activeAccountId: string; previousAccountId: string; username: string };
    };
    expect(res.status).toBe(200);
    expect(body.data.activeAccountId).toBe(MASTER_ID);
    expect(body.data.previousAccountId).toBe(LINKED_ID);
    expect(res.cookies.get('cp_active_account')?.value).toBe(MASTER_ID);
    expect(res.cookies.get('cp_prev_account')?.value).toBe(LINKED_ID);
  });

  it('returns previousAccount and canSwitch=true for return option in GET overview', async () => {
    mockRequireAuth.mockResolvedValue({
      user: {
        _id: LINKED_ID,
        username: 'sub_user',
        ownerAccountId: MASTER_ID,
        status: 'ACTIVE',
      },
    });
    mockGetSettingsGroup.mockResolvedValue({
      switchAccounts: false,
      switchAccountEnabled: false,
      linkAccounts: true,
      linkAccountsEnabled: true,
    });
    mockUserFind.mockReturnValue({
      select: () => ({
        sort: () => ({
          lean: async () => [
            {
              _id: MASTER_ID,
              username: 'master_user',
              firstName: 'Master',
              lastName: 'User',
              avatar: '/assets/avatars/default-avatar.png',
              verified: true,
              status: 'ACTIVE',
              type: 'READER',
              ownerAccountId: null,
            },
            {
              _id: LINKED_ID,
              username: 'sub_user',
              firstName: 'Sub',
              lastName: 'User',
              avatar: '/assets/avatars/default-avatar.png',
              verified: false,
              status: 'ACTIVE',
              type: 'READER',
              ownerAccountId: MASTER_ID,
            },
          ],
        }),
      }),
    });

    const { GET } = await import('@/app/api/v1/auth/accounts/route');
    const req = new NextRequest('https://app.example.com/api/v1/auth/accounts', {
      method: 'GET',
      headers: {
        cookie: `cp_active_account=${LINKED_ID}; cp_prev_account=${MASTER_ID}`,
      },
    });

    const res = await GET(req);
    const body = (await res.json()) as {
      data: {
        previousAccount: { id: string; username: string } | null;
        accounts: Array<{ id: string; canSwitch: boolean; isPrevious: boolean }>;
      };
    };
    expect(res.status).toBe(200);
    expect(body.data.previousAccount?.id).toBe(MASTER_ID);
    expect(body.data.previousAccount?.username).toBe('master_user');
    const masterRow = body.data.accounts.find((a) => a.id === MASTER_ID);
    expect(masterRow?.canSwitch).toBe(true);
    expect(masterRow?.isPrevious).toBe(true);
  });
});
