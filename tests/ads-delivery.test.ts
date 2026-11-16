import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { scoreAdFacebookAuction } from '@/services/feed-ranking.service';
import { AdApproval, AdStatus } from '@/types/enums';

const {
  mockGetSettingsGroup,
  mockAdFind,
  mockAdFindById,
  mockAdUpdateOne,
} = vi.hoisted(() => ({
  mockGetSettingsGroup: vi.fn(),
  mockAdFind: vi.fn(),
  mockAdFindById: vi.fn(),
  mockAdUpdateOne: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth/session', () => ({
  getOptionalAuth: vi.fn().mockResolvedValue(null),
  requireAuth: vi.fn(),
}));

vi.mock('@/services/settings.service', () => ({
  getSettingsGroup: (...args: unknown[]) => mockGetSettingsGroup(...args),
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
    updateOne: (...args: unknown[]) => mockAdUpdateOne(...args),
  },
}));

describe('Facebook / Instagram / X + PHP Ad Delivery Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettingsGroup.mockImplementation(async (group: string) => {
      if (group === 'features') return { ads: true };
      if (group === 'ads') {
        return {
          refreshIntervalMinutes: 5,
          chargeIntervalMinutes: 10,
          pricePerView: 25,
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

    const saveSpy = vi.fn();
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
      save: saveSpy,
    });

    const { GET } = await import('@/app/api/v1/ads/route');
    const req = new NextRequest(
      `https://app.example.com/api/v1/ads?track=false&hiddenIds=${hiddenId.toHexString()}`
    );
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.id).toBe(visibleId.toHexString());
    // Deferred viewport impression means GET must not charge before IntersectionObserver fires
    expect(saveSpy).not.toHaveBeenCalled();
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
});
