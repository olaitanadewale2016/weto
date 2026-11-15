import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { inferMediaType, resolveUploadMimeType } from '@/lib/api-client';
import { normalizeMediaMime } from '@/services/media.service';

const mockRequireAuth = vi.fn();
const mockProductFindOne = vi.fn();
const mockProductCreate = vi.fn();
const mockMediaBulkWrite = vi.fn();
const mockMediaFind = vi.fn();
const mockMediaCountDocuments = vi.fn();
const mockDeleteMediaRecord = vi.fn();

vi.mock('@/lib/db', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
  withMongoTransaction: vi.fn(),
}));

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return {
    ...actual,
    requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
    getOptionalAuth: vi.fn().mockResolvedValue(null),
  };
});

vi.mock('@/services/settings.service', () => ({
  getSettingsGroup: vi.fn().mockResolvedValue({ defaultCurrency: 'NGN' }),
}));

vi.mock('@/models/Commerce', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/models/Commerce')>();
  return {
    ...actual,
    Product: {
      findOne: (...args: unknown[]) => mockProductFindOne(...args),
      create: (...args: unknown[]) => mockProductCreate(...args),
    },
  };
});

vi.mock('@/models/Media', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/models/Media')>();
  return {
    ...actual,
    Media: {
      bulkWrite: (...args: unknown[]) => mockMediaBulkWrite(...args),
      find: (...args: unknown[]) => mockMediaFind(...args),
      countDocuments: (...args: unknown[]) => mockMediaCountDocuments(...args),
    },
  };
});

vi.mock('@/services/media.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/media.service')>();
  return {
    ...actual,
    deleteMediaRecord: (...args: unknown[]) => mockDeleteMediaRecord(...args),
  };
});

describe('Image Upload MIME Normalization', () => {
  it('infers and normalizes empty, octet-stream, and legacy MIME types across client and server', () => {
    expect(resolveUploadMimeType({ type: '', name: 'product-photo.jpg' })).toBe('image/jpeg');
    expect(resolveUploadMimeType({ type: 'application/octet-stream', name: 'banner.jfif' })).toBe(
      'image/jpeg'
    );
    expect(resolveUploadMimeType({ type: 'image/x-png', name: 'logo.png' })).toBe('image/png');
    expect(resolveUploadMimeType({ type: 'image/pjpeg', name: 'cover.jpeg' })).toBe('image/jpeg');
    expect(inferMediaType('application/octet-stream', 'snapshot.bmp')).toBe('image');

    expect(normalizeMediaMime('', 'product.webp')).toBe('image/webp');
    expect(normalizeMediaMime('application/octet-stream', 'phone.heic')).toBe('image/heic');
    expect(normalizeMediaMime('image/x-png', 'avatar.png')).toBe('image/png');
    expect(normalizeMediaMime('image/pjpeg', 'cover.jpg')).toBe('image/jpeg');
  });
});

describe('Marketplace Product Photo Attachment & Removal', () => {
  const sellerId = new Types.ObjectId();
  const productId = new Types.ObjectId();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({
      user: { _id: sellerId, role: 'user' },
    });
  });

  it('attaches ordered product mediaIds on POST /api/v1/marketplace', async () => {
    const m1 = new Types.ObjectId();
    const m2 = new Types.ObjectId();

    mockProductCreate.mockResolvedValue({
      _id: productId,
      hashId: 'prod123',
    });
    mockMediaBulkWrite.mockResolvedValue({ modifiedCount: 2 });

    const { POST } = await import('@/app/api/v1/marketplace/route');
    const req = new NextRequest('https://app.example.com/api/v1/marketplace', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Studio Camera Kit',
        description: 'Full frame body + 50mm lens',
        price: 125000,
        mediaIds: [String(m1), String(m2)],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockMediaBulkWrite).toHaveBeenCalledTimes(1);
    const ops = mockMediaBulkWrite.mock.calls[0][0] as Array<{
      updateOne: { filter: { _id: Types.ObjectId; ownerId: Types.ObjectId }; update: { $set: { order: number; targetType: string } } };
    }>;
    expect(ops).toHaveLength(2);
    expect(String(ops[0].updateOne.filter._id)).toBe(String(m1));
    expect(ops[0].updateOne.update.$set).toEqual({
      targetType: 'product',
      targetId: productId,
      order: 0,
    });
    expect(String(ops[1].updateOne.filter._id)).toBe(String(m2));
    expect(ops[1].updateOne.update.$set).toEqual({
      targetType: 'product',
      targetId: productId,
      order: 1,
    });
  });

  it('removes specified photos and appends ordered new photos on PATCH /api/v1/marketplace/[productId]', async () => {
    const oldMediaId = new Types.ObjectId();
    const newMediaId = new Types.ObjectId();

    mockProductFindOne.mockResolvedValue({
      _id: productId,
      userId: sellerId,
      title: 'Old Title',
      status: 'active',
      save: vi.fn().mockResolvedValue(undefined),
    });
    mockMediaFind.mockReturnValue({
      select: () => ({
        lean: async () => [{ _id: oldMediaId }],
      }),
    });
    mockDeleteMediaRecord.mockResolvedValue(undefined);
    mockMediaCountDocuments.mockResolvedValue(1);
    mockMediaBulkWrite.mockResolvedValue({ modifiedCount: 1 });

    const { PATCH } = await import('@/app/api/v1/marketplace/[productId]/route');
    const req = new NextRequest(`https://app.example.com/api/v1/marketplace/${productId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'update',
        removeMediaIds: [String(oldMediaId)],
        mediaIds: [String(newMediaId)],
      }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ productId: String(productId) }) });
    expect(res.status).toBe(200);
    expect(mockDeleteMediaRecord).toHaveBeenCalledWith(String(oldMediaId));
    expect(mockMediaBulkWrite).toHaveBeenCalledTimes(1);
    const ops = mockMediaBulkWrite.mock.calls[0][0] as Array<{
      updateOne: { update: { $set: { order: number; targetType: string } } };
    }>;
    expect(ops[0].updateOne.update.$set).toEqual({
      targetType: 'product',
      targetId: productId,
      order: 1,
    });
  });
});
