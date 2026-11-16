import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { getListingPromotionPlan, getListingPromotionPlans } from '@/lib/promotions';
import { DEFAULT_SETTINGS } from '@/services/settings.service';

const mockRequireAuth = vi.fn();
const mockGetSettingsGroup = vi.fn();
const mockAdCreate = vi.fn();

vi.mock('@/lib/db', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
  withMongoTransaction: vi.fn(),
}));

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return {
    ...actual,
    requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
    requireAdminAuth: (...args: unknown[]) => mockRequireAuth(...args),
    getOptionalAuth: vi.fn().mockResolvedValue(null),
  };
});

vi.mock('@/services/settings.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/settings.service')>();
  return {
    ...actual,
    getSettingsGroup: (...args: unknown[]) => mockGetSettingsGroup(...args),
    updateSettingsGroup: vi.fn().mockResolvedValue({}),
  };
});

vi.mock('@/models/Finance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/models/Finance')>();
  return {
    ...actual,
    Ad: {
      create: (...args: unknown[]) => mockAdCreate(...args),
    },
  };
});

describe('Standard Naira (NGN) Pricing & DB Limit Synchronization', () => {
  const userId = new Types.ObjectId();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({
      user: { _id: userId, role: 'admin', email: 'admin@weto.ng' },
    });
  });

  it('defines coherent standard NGN defaults across app, wallet, ads, and promotions', () => {
    expect(DEFAULT_SETTINGS.app.defaultCurrency).toBe('NGN');
    expect(DEFAULT_SETTINGS.wallet.depositMinAmount).toBe(2000);
    expect(DEFAULT_SETTINGS.wallet.depositMaxAmount).toBeGreaterThanOrEqual(
      DEFAULT_SETTINGS.wallet.depositMinAmount
    );
    expect(DEFAULT_SETTINGS.wallet.withdrawMinAmount).toBe(10000);
    expect(DEFAULT_SETTINGS.wallet.withdrawMaxAmount).toBe(500000);
    expect(DEFAULT_SETTINGS.wallet.withdrawMaxAmount).toBeGreaterThanOrEqual(
      DEFAULT_SETTINGS.wallet.withdrawMinAmount
    );
    expect(DEFAULT_SETTINGS.ads.pricePerView).toBe(25);
    expect(DEFAULT_SETTINGS.ads.minBudget).toBe(5000);
    expect(DEFAULT_SETTINGS.ads.defaultBudget).toBe(25000);
    expect(DEFAULT_SETTINGS.promotions).toEqual({
      enabled: true,
      price3d: 2500,
      price7d: 5000,
      price14d: 8500,
    });
  });

  it('resolves marketplace ad plans from DB promotion config with standard NGN fallback', () => {
    const defaultPlans = getListingPromotionPlans();
    expect(defaultPlans.map((p) => p.price)).toEqual([2500, 5000, 8500]);

    const customPlan = getListingPromotionPlan('14d', {
      price3d: 3000,
      price7d: 6000,
      price14d: 10000,
    });
    expect(customPlan.price).toBe(10000);
    expect(customPlan.durationDays).toBe(14);
  });

  it('enforces DB minimum ad campaign budget and pricePerView on POST /api/v1/ads', async () => {
    mockGetSettingsGroup.mockImplementation(async (group: string) => {
      if (group === 'ads') return DEFAULT_SETTINGS.ads;
      if (group === 'app') return DEFAULT_SETTINGS.app;
      return {};
    });

    const { POST } = await import('@/app/api/v1/ads/route');

    const tooLowReq = new NextRequest('https://app.example.com/api/v1/ads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Promo Test',
        content: 'Reach Nigerian buyers fast',
        targetUrl: 'https://weto.ng/marketplace',
        totalBudget: 500,
      }),
    });
    const lowRes = await POST(tooLowReq);
    expect(lowRes.status).toBe(422);
    expect(mockAdCreate).not.toHaveBeenCalled();

    mockAdCreate.mockResolvedValue({
      _id: new Types.ObjectId(),
      approval: 'pending',
    });

    const validReq = new NextRequest('https://app.example.com/api/v1/ads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Promo Test',
        content: 'Reach Nigerian buyers fast',
        targetUrl: 'https://weto.ng/marketplace',
        totalBudget: 25000,
      }),
    });
    const validRes = await POST(validReq);
    expect(validRes.status).toBe(201);
    expect(mockAdCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        totalBudget: 25000,
        pricePerView: 25,
      })
    );
  });

  it('rejects inverted wallet min/max withdrawal settings in POST /api/v1/admin/manage', async () => {
    const { POST } = await import('@/app/api/v1/admin/manage/route');
    const req = new NextRequest('https://app.example.com/api/v1/admin/manage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'settings.update',
        payload: {
          group: 'wallet',
          values: {
            withdrawMinAmount: 10000,
            withdrawMaxAmount: 5000,
          },
        },
      }),
    });

    const res = await POST(req);
    const json = (await res.json()) as { status: string; error?: { message: string } };
    expect(res.status).toBe(422);
    expect(json.error?.message).toContain('Minimum withdrawal cannot exceed maximum withdrawal');
  });
});
