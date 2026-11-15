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
const mockUploadMediaBufferDirectly = vi.fn();

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
    uploadMediaBufferDirectly: (...args: unknown[]) => mockUploadMediaBufferDirectly(...args),
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

    expect(resolveUploadMimeType({ type: '', name: 'resume.docx' })).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    expect(resolveUploadMimeType({ type: 'application/vnd.rar', name: 'bundle.rar' })).toBe(
      'application/x-rar-compressed'
    );
    expect(resolveUploadMimeType({ type: 'audio/x-m4a', name: 'note.m4a' })).toBe('audio/mp4');
    expect(inferMediaType('', 'contract.pdf')).toBe('document');
    expect(inferMediaType('audio/x-m4a', 'voice.m4a')).toBe('audio');

    expect(normalizeMediaMime('', 'report.xlsx')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(normalizeMediaMime('application/vnd.rar', 'archive.rar')).toBe(
      'application/x-rar-compressed'
    );
    expect(normalizeMediaMime('audio/m4a', 'clip.m4a')).toBe('audio/mp4');
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

describe('Server Upload Route, R2 Presign Headers & Client Upload Routing', () => {
  const userId = new Types.ObjectId();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({
      user: { _id: userId, role: 'user' },
    });
  });

  it('accepts multipart FormData on POST /api/v1/media/upload even when file.type is empty', async () => {
    const fakeMediaId = new Types.ObjectId();
    mockUploadMediaBufferDirectly.mockResolvedValue({
      id: String(fakeMediaId),
      type: 'image',
      status: 'processed',
      url: '/api/v1/media/proxy?key=marketplace%2Fu%2Fphoto.jpg',
      publicUrl: '/api/v1/media/proxy?key=marketplace%2Fu%2Fphoto.jpg',
      lqipBase64: 'data:image/webp;base64,test',
    });

    const { POST } = await import('@/app/api/v1/media/upload/route');
    const form = new FormData();
    const file = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'photo.jpg', {
      type: '',
    });
    form.append('file', file);
    form.append('namespace', 'marketplace');
    form.append('targetType', 'product');
    form.append('mediaType', 'image');

    const req = new NextRequest('https://app.example.com/api/v1/media/upload', {
      method: 'POST',
      body: form,
    });

    const res = await POST(req);
    const json = (await res.json()) as {
      status: string;
      data: { id: string; publicUrl: string };
    };

    expect(res.status).toBe(201);
    expect(json.status).toBe('success');
    expect(json.data.id).toBe(String(fakeMediaId));
    expect(json.data.publicUrl).toContain('/api/v1/media/proxy?key=');
    expect(mockUploadMediaBufferDirectly).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: String(userId),
        namespace: 'marketplace',
        targetType: 'product',
        mediaType: 'image',
        filename: 'photo.jpg',
      })
    );
  });

  it('creates presigned R2 PUT URLs without x-amz-checksum-crc32 or content-length signed headers', async () => {
    const prevEnv = { ...process.env };
    process.env.R2_BUCKET_NAME = 'test-bucket';
    process.env.R2_ACCESS_KEY_ID = 'test-access-key';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.R2_ACCOUNT_ID = 'test-account-id';
    delete process.env.R2_ENDPOINT;

    vi.resetModules();
    try {
      const { createPresignedUploadUrl } = await import('@/lib/r2');
      const result = await createPresignedUploadUrl({
        key: 'posts/test/2026-11/sample.jpg',
        contentType: 'image/jpeg',
        contentLength: 12345,
      });

      const url = new URL(result.uploadUrl);
      const signedHeaders = (url.searchParams.get('X-Amz-SignedHeaders') || '').toLowerCase();
      expect(signedHeaders).not.toContain('content-length');
      expect(url.searchParams.has('x-amz-checksum-crc32')).toBe(false);
      expect(url.searchParams.has('x-amz-sdk-checksum-algorithm')).toBe(false);
    } finally {
      process.env = prevEnv;
      vi.resetModules();
    }
  });

  it('routes <= 3.5 MB images through same-origin /api/v1/media/upload without hitting R2 presign', async () => {
    const prevXhr = globalThis.XMLHttpRequest;
    const prevFetch = globalThis.fetch;
    const requests: Array<{ method: string; url: string; body: unknown }> = [];
    const fetchSpy = vi.fn();

    class MockXMLHttpRequest {
      status = 201;
      responseText = JSON.stringify({
        status: 'success',
        data: {
          id: 'media-same-origin-1',
          publicUrl: '/api/v1/media/proxy?key=marketplace%2Fu%2Fsmall.jpg',
          lqipBase64: 'data:image/webp;base64,tiny',
        },
      });
      withCredentials = false;
      upload: { onprogress: ((ev: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
        onprogress: null,
      };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private method = '';
      private url = '';

      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }

      send(body: unknown) {
        requests.push({ method: this.method, url: this.url, body });
        this.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
        this.onload?.();
      }
    }

    globalThis.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    try {
      const { uploadFileToR2 } = await import('@/lib/api-client');
      const smallFile = new File([new Uint8Array([1, 2, 3, 4])], 'small.jpg', { type: 'image/jpeg' });
      const progressCalls: number[] = [];

      const uploaded = await uploadFileToR2(smallFile, 'marketplace', 'product', (pct) => {
        progressCalls.push(pct);
      });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(requests).toHaveLength(1);
      expect(requests[0].method).toBe('POST');
      expect(requests[0].url).toBe('/api/v1/media/upload');
      expect(uploaded.mediaId).toBe('media-same-origin-1');
      expect(uploaded.publicUrl).toBe('/api/v1/media/proxy?key=marketplace%2Fu%2Fsmall.jpg');
      expect(progressCalls.at(-1)).toBe(100);
    } finally {
      globalThis.XMLHttpRequest = prevXhr;
      globalThis.fetch = prevFetch;
    }
  });

  it('routes <= 3.5 MB document and audio files cleanly through /api/v1/media/upload', async () => {
    const prevXhr = globalThis.XMLHttpRequest;
    const prevFetch = globalThis.fetch;
    const sentForms: Array<{ url: string; mediaType: string | null; namespace: string | null }> = [];
    const fetchSpy = vi.fn();

    class MockXMLHttpRequest {
      status = 201;
      responseText = JSON.stringify({
        status: 'success',
        data: {
          id: 'doc-upload-1',
          publicUrl: '/api/v1/media/proxy?key=jobs%2Fu%2Fresume.docx',
        },
      });
      withCredentials = false;
      timeout = 0;
      upload: { onprogress: ((ev: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
        onprogress: null,
      };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      private url = '';

      open(_method: string, url: string) {
        this.url = url;
      }

      send(body: FormData) {
        sentForms.push({
          url: this.url,
          mediaType: body.get('mediaType') as string | null,
          namespace: body.get('namespace') as string | null,
        });
        this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 50 });
        this.onload?.();
      }
    }

    globalThis.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    try {
      const { uploadFileToR2 } = await import('@/lib/api-client');
      const resumeFile = new File([new Uint8Array([80, 75, 3, 4])], 'cv.docx', { type: '' });
      const resDoc = await uploadFileToR2(resumeFile, 'jobs', 'job_attachment');

      expect(resDoc.mediaType).toBe('document');
      expect(resDoc.mimeType).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      expect(sentForms[0]).toEqual({
        url: '/api/v1/media/upload',
        mediaType: 'document',
        namespace: 'jobs',
      });

      const audioFile = new File([new Uint8Array([0, 0, 0, 24])], 'voice.m4a', { type: 'audio/x-m4a' });
      const resAudio = await uploadFileToR2(audioFile, 'chats', 'message');
      expect(resAudio.mediaType).toBe('audio');
      expect(resAudio.mimeType).toBe('audio/mp4');
      expect(sentForms[1]).toEqual({
        url: '/api/v1/media/upload',
        mediaType: 'audio',
        namespace: 'chats',
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.XMLHttpRequest = prevXhr;
      globalThis.fetch = prevFetch;
    }
  });
});
