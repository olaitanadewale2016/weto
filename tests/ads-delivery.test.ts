import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { computeFeedAdSlotIndices } from '@/lib/ads-client';
import { scoreAdFacebookAuction } from '@/services/feed-ranking.service';
import { AdApproval, AdStatus, TransactionDirection, TransactionType } from '@/types/enums';

const {
  mockGetSettingsGroup,
  mockRequireAuth,
  mockAdFind,
  mockAdFindById,
  mockAdFindOneAndUpdate,
  mockAdUpdateOne,
  mockAdDeleteOne,
  mockAdCreate,
  mockWalletFindOne,
  mockWalletFindOneAndUpdate,
  mockWalletTxCreate,
} = vi.hoisted(() => ({
  mockGetSettingsGroup: vi.fn(),
  mockRequireAuth: vi.fn(),
  mockAdFind: vi.fn(),
  mockAdFindById: vi.fn(),
  mockAdFindOneAndUpdate: vi.fn(),
  mockAdUpdateOne: vi.fn(),
  mockAdDeleteOne: vi.fn(),
  mockAdCreate: vi.fn(),
  mockWalletFindOne: vi.fn(),
  mockWalletFindOneAndUpdate: vi.fn(),
  mockWalletTxCreate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
  withMongoTransaction: vi.fn(async (fn: (s: unknown) => Promise<unknown>) => fn(null)),
}));

vi.mock('@/lib/auth/session', () => ({
  getOptionalAuth: vi.fn().mockResolvedValue(null),
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

vi.mock('@/services/settings.service', () => ({
  getSettingsGroup: (...args: unknown[]) => mockGetSettingsGroup(...args),
}));

vi.mock('@/services/wallet.service', () => ({
  ensureWallet: vi.fn().mockResolvedValue({
    _id: new Types.ObjectId('507f1f77bcf86cd799439099'),
    balance: 50000,
    currency: 'NGN',
  }),
}));

vi.mock('@/services/relations.service', () => ({
  getBlockedUserIdsFor: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/services/media.service', () => ({
  serializeMedia: (m: unknown) => m,
}));

vi.mock('@/models/Media', () => ({
  Media: { updateOne: vi.fn(), deleteOne: vi.fn() },
}));

vi.mock('@/models/Finance', () => ({
  Ad: {
    find: (...args: unknown[]) => mockAdFind(...args),
    findById: (...args: unknown[]) => mockAdFindById(...args),
    findOneAndUpdate: (...args: unknown[]) => mockAdFindOneAndUpdate(...args),
    updateOne: (...args: unknown[]) => mockAdUpdateOne(...args),
    deleteOne: (...args: unknown[]) => mockAdDeleteOne(...args),
    create: (...args: unknown[]) => mockAdCreate(...args),
  },
  Wallet: {
    findOne: (...args: unknown[]) => mockWalletFindOne(...args),
    findOneAndUpdate: (...args: unknown[]) => mockWalletFindOneAndUpdate(...args),
  },
  WalletTransaction: {
    create: (...args: unknown[]) => mockWalletTxCreate(...args),
  },
}));

describe('Facebook / Instagram / X + PHP Ad Delivery & Credit Billing Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettingsGroup.mockImplementation(async (group: string) => {
      if (group === 'features') return { ads: true };
      if (group === 'app') return { defaultCurrency: 'NGN' };
      if (group === 'ads') {
        return {
          refreshIntervalMinutes: 5,
          chargeIntervalMinutes: 10,
          pricePerView: 25,
          minBudget: 5000,
          defaultBudget: 25000,
          defaultApproval: false,
        };
      }
      return {};
    });
  });

  it('defers impression charging when track=false and respects hiddenIds', async () => {
    const hiddenId = new Types.ObjectId('507f1f77bcf86cd799439011');
    const visibleId = new Types.ObjectId('507f1f77bcf86cd799439022');
    const adDocs = [
      {
        _id: hiddenId,
        title: 'Hidden Ad',
        content: 'Hidden content',
        ctaText: 'Go',
        targetUrl: 'https://hidden.example.com',
        status: AdStatus.PUBLISHED,
        approval: AdApproval.APPROVED,
        pricePerView: 50,
        totalBudget: 10000,
        spentBudget: 0,
        viewsCount: 2,
        clicksCount: 0,
        lastShowAt: null,
      },
      {
        _id: visibleId,
        title: 'Visible Ad',
        content: 'Visible content',
        ctaText: 'Shop Now',
        targetUrl: 'https://visible.example.com',
        status: AdStatus.PUBLISHED,
        approval: AdApproval.APPROVED,
        pricePerView: 25,
        totalBudget: 10000,
        spentBudget: 0,
        viewsCount: 2,
        clicksCount: 0,
        lastShowAt: null,
      },
    ];

    mockAdFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(adDocs),
        }),
      }),
    });

    mockAdFindById.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({
            ...adDocs[1],
            mediaId: null,
            userId: { _id: 'u1', username: 'brand', firstName: 'Brand', lastName: 'Co' },
          }),
        }),
      }),
    });

    const { GET } = await import('@/app/api/v1/ads/route');
    const req = new NextRequest(
      `https://app.example.com/api/v1/ads?track=false&hiddenIds=${hiddenId.toHexString()}`
    );
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.id).toBe(visibleId.toHexString());
    expect(mockAdFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects campaign creation when wallet ad credit balance is insufficient', async () => {
    const userId = new Types.ObjectId();
    mockRequireAuth.mockResolvedValue({ user: { _id: userId, role: 'user' } });
    mockWalletFindOneAndUpdate.mockResolvedValue(null);
    mockWalletFindOne.mockReturnValue({
      session: vi.fn().mockResolvedValue({ balance: 1200, currency: 'NGN' }),
    });

    const { POST } = await import('@/app/api/v1/ads/route');
    const req = new NextRequest('https://app.example.com/api/v1/ads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Launch Campaign',
        content: 'Reach buyers across Nigeria',
        targetUrl: 'https://weto.ng/shop',
        totalBudget: 25000,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.error?.message).toContain('Insufficient wallet balance');
    expect(mockAdCreate).not.toHaveBeenCalled();
  });

  it('atomically deducts wallet credits on creation and refunds unspent credits on deletion', async () => {
    const userId = new Types.ObjectId('507f1f77bcf86cd799439044');
    const walletId = new Types.ObjectId('507f1f77bcf86cd799439099');
    const adId = new Types.ObjectId('507f1f77bcf86cd799439055');
    mockRequireAuth.mockResolvedValue({ user: { _id: userId, role: 'user' } });

    mockWalletFindOneAndUpdate.mockResolvedValueOnce({
      _id: walletId,
      balance: 25000,
      currency: 'NGN',
    });
    mockAdCreate.mockResolvedValueOnce([
      {
        _id: adId,
        userId,
        title: 'Launch Campaign',
        totalBudget: 25000,
        allocatedBudget: 25000,
        approval: AdApproval.PENDING,
        mediaId: null,
      },
    ]);
    mockWalletTxCreate.mockResolvedValue([{ _id: new Types.ObjectId() }]);

    const { POST, PATCH } = await import('@/app/api/v1/ads/route');
    const createReq = new NextRequest('https://app.example.com/api/v1/ads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Launch Campaign',
        content: 'Reach buyers across Nigeria',
        targetUrl: 'https://weto.ng/shop',
        totalBudget: 25000,
      }),
    });
    const createRes = await POST(createReq);
    expect(createRes.status).toBe(201);
    expect(mockWalletTxCreate).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          amount: 25000,
          transactionType: TransactionType.ADVERTISING,
          direction: TransactionDirection.OUTGOING,
        }),
      ],
      expect.anything()
    );

    // Delete after 2,500 spent -> should refund 22,500 unspent credit
    mockAdFindById.mockResolvedValueOnce({
      _id: adId,
      userId,
      title: 'Launch Campaign',
      totalBudget: 25000,
      allocatedBudget: 25000,
      spentBudget: 2500,
      mediaId: null,
    });
    mockWalletFindOneAndUpdate.mockResolvedValueOnce({
      _id: walletId,
      balance: 47500,
      currency: 'NGN',
    });
    mockAdDeleteOne.mockResolvedValueOnce({ deletedCount: 1 });

    const delReq = new NextRequest('https://app.example.com/api/v1/ads', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'delete', adId: adId.toHexString() }),
    });
    const delRes = await PATCH(delReq);
    const delJson = await delRes.json();

    expect(delRes.status).toBe(200);
    expect(delJson.data.refundedAmount).toBe(22500);
    expect(mockWalletFindOneAndUpdate).toHaveBeenLastCalledWith(
      { userId },
      { $inc: { balance: 22500 } },
      expect.objectContaining({ new: true })
    );
  });

  it('records ad clicks cleanly via PATCH action=click', async () => {
    const adId = new Types.ObjectId('507f1f77bcf86cd799439033');
    mockAdFindById.mockResolvedValue({ _id: adId });
    mockAdUpdateOne.mockResolvedValue({ acknowledged: true });

    const { PATCH } = await import('@/app/api/v1/ads/route');
    const req = new NextRequest('https://app.example.com/api/v1/ads', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'click', adId: adId.toHexString() }),
    });
    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.recorded).toBe(true);
    expect(mockAdUpdateOne).toHaveBeenCalledWith(
      { _id: adId },
      { $inc: { clicksCount: 1 } }
    );
  });

  it('rewards higher eCTR campaigns and penalizes session-excluded ads in auction scoring', () => {
    const nowMs = Date.now();
    const baseAd = {
      _id: 'ad-1',
      title: 'Creators Hub',
      content: 'Grow your audience',
      pricePerView: 25,
      totalBudget: 10000,
      spentBudget: 1000,
      viewsCount: 100,
      lastShowAt: null,
    };

    const lowCtrScore = scoreAdFacebookAuction({
      ad: { ...baseAd, clicksCount: 0 },
      nowMs,
      refreshIntervalMs: 300_000,
      viewerSignals: null,
      isExcluded: false,
    });

    const highCtrScore = scoreAdFacebookAuction({
      ad: { ...baseAd, clicksCount: 12 },
      nowMs,
      refreshIntervalMs: 300_000,
      viewerSignals: null,
      isExcluded: false,
    });

    const excludedScore = scoreAdFacebookAuction({
      ad: { ...baseAd, clicksCount: 12 },
      nowMs,
      refreshIntervalMs: 300_000,
      viewerSignals: null,
      isExcluded: true,
    });

    expect(highCtrScore).toBeGreaterThan(lowCtrScore);
    expect(excludedScore).toBeLessThan(highCtrScore * 0.1);
  });

  it('computes dynamic Facebook-style ad slot positions for both short and long feeds', () => {
    // Short feeds (>= 2 posts) still receive 1 organic ad slot
    const shortSlots = computeFeedAdSlotIndices(3, 'feed', 7);
    expect(shortSlots.size).toBe(1);

    // Long feeds vary start positions across seeds and maintain 4..7 post spacing
    const s1 = Array.from(computeFeedAdSlotIndices(24, 'feed', 1));
    const s2 = Array.from(computeFeedAdSlotIndices(24, 'feed', 2));
    expect(s1).not.toEqual(s2);
    for (let i = 1; i < s1.length; i++) {
      const gap = s1[i] - s1[i - 1];
      expect(gap).toBeGreaterThanOrEqual(4);
      expect(gap).toBeLessThanOrEqual(7);
    }
  });

  it('deducts pricePerClick cleanly in CPC billingModel while counting views without spending budget', async () => {
    const adId = new Types.ObjectId('507f1f77bcf86cd799439066');
    mockGetSettingsGroup.mockResolvedValue({
      billingModel: 'cpc',
      pricePerView: 25,
      pricePerClick: 120,
      chargeIntervalMinutes: 10,
      maxDailySpendPerAd: 0,
    });

    mockAdFindById
      .mockResolvedValueOnce({ _id: adId }) // PATCH lookup
      .mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue({
          _id: adId,
          status: AdStatus.PUBLISHED,
          approval: AdApproval.APPROVED,
          totalBudget: 5000,
          spentBudget: 100,
          dailySpent: 0,
          dailySpentDate: null,
        }),
      });
    mockAdUpdateOne.mockResolvedValue({ acknowledged: true });
    mockAdFindOneAndUpdate.mockResolvedValue({ _id: adId });

    const { PATCH } = await import('@/app/api/v1/ads/route');
    const req = new NextRequest('https://app.example.com/api/v1/ads', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'click', adId: adId.toHexString() }),
    });
    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(mockAdFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: adId }),
      expect.objectContaining({
        $inc: { spentBudget: 120 },
      })
    );
  });
});
