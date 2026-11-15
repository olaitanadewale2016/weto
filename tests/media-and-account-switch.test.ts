import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { resolveMediaUrl } from '@/lib/media-url';

const mockHeadR2Object = vi.fn();
const mockGetR2Object = vi.fn();
const mockCreatePresignedDownloadUrl = vi.fn();

vi.mock('@/lib/r2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/r2')>();
  return {
    ...actual,
    headR2Object: (...args: unknown[]) => mockHeadR2Object(...args),
    getR2Object: (...args: unknown[]) => mockGetR2Object(...args),
    createPresignedDownloadUrl: (...args: unknown[]) =>
      mockCreatePresignedDownloadUrl(...args),
  };
});

describe('Media URL Resolution', () => {
  it('routes bare and leading-slash R2 namespace keys through the media proxy', () => {
    expect(resolveMediaUrl('avatars/u1/2026-11/pic.jpeg')).toBe(
      '/api/v1/media/proxy?key=avatars%2Fu1%2F2026-11%2Fpic.jpeg'
    );
    expect(resolveMediaUrl('/covers/u1/banner.png')).toBe(
      '/api/v1/media/proxy?key=covers%2Fu1%2Fbanner.png'
    );
    expect(resolveMediaUrl('marketplace/u1/item.webp')).toBe(
      '/api/v1/media/proxy?key=marketplace%2Fu1%2Fitem.webp'
    );
  });

  it('preserves local public assets and absolute/blob URLs', () => {
    expect(resolveMediaUrl('/assets/avatars/default-avatar.png')).toBe(
      '/assets/avatars/default-avatar.png'
    );
    expect(resolveMediaUrl('assets/seed/photo.jpg')).toBe('/assets/seed/photo.jpg');
    expect(resolveMediaUrl('https://cdn.example.com/img.png')).toBe(
      'https://cdn.example.com/img.png'
    );
    expect(resolveMediaUrl('/api/v1/media/proxy?key=avatars%2Ftest.png')).toBe(
      '/api/v1/media/proxy?key=avatars%2Ftest.png'
    );
  });
});

describe('Media Proxy Route (/api/v1/media/proxy)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('supports HEAD with inferred Content-Type and CORS headers', async () => {
    mockHeadR2Object.mockResolvedValue({
      ContentLength: 2048,
      ContentType: 'application/octet-stream',
      ETag: '"abc123"',
    });

    const { HEAD } = await import('@/app/api/v1/media/proxy/route');
    const req = new NextRequest(
      'https://app.example.com/api/v1/media/proxy?key=/avatars/u1/avatar.png',
      { method: 'HEAD' }
    );
    const res = await HEAD(req);

    expect(res.status).toBe(200);
    expect(mockHeadR2Object).toHaveBeenCalledWith('avatars/u1/avatar.png');
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('content-length')).toBe('2048');
    expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
  });

  it('streams inline R2 image bytes via GET when size <= 3.5 MB', async () => {
    const payload = new Uint8Array([137, 80, 78, 71]);
    mockHeadR2Object.mockResolvedValue({
      ContentLength: payload.byteLength,
      ContentType: 'image/png',
    });
    mockGetR2Object.mockResolvedValue({
      ContentLength: payload.byteLength,
      ContentType: 'image/png',
      Body: {
        transformToByteArray: async () => payload,
      },
    });

    const { GET } = await import('@/app/api/v1/media/proxy/route');
    const req = new NextRequest(
      'https://app.example.com/api/v1/media/proxy?key=posts/u1/photo.png',
      { method: 'GET' }
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes)).toEqual([137, 80, 78, 71]);
  });

  it('returns 206 Partial Content for HTTP Range requests', async () => {
    const chunk = new Uint8Array([1, 2, 3, 4]);
    mockGetR2Object.mockResolvedValue({
      ContentLength: 4,
      ContentRange: 'bytes 0-3/100',
      ContentType: 'video/mp4',
      Body: {
        transformToByteArray: async () => chunk,
      },
    });

    const { GET } = await import('@/app/api/v1/media/proxy/route');
    const req = new NextRequest(
      'https://app.example.com/api/v1/media/proxy?key=chats/u1/clip.mp4',
      {
        method: 'GET',
        headers: { range: 'bytes=0-3' },
      }
    );
    const res = await GET(req);

    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 0-3/100');
    expect(mockGetR2Object).toHaveBeenCalledWith('chats/u1/clip.mp4', 'bytes=0-3');
  });

  it('redirects large (>3.5 MB) un-ranged files to a presigned download URL and returns 404 for missing keys', async () => {
    mockHeadR2Object.mockResolvedValueOnce({
      ContentLength: 5_000_000,
      ContentType: 'video/mp4',
    });
    mockCreatePresignedDownloadUrl.mockResolvedValueOnce('https://r2.signed.example/video.mp4');

    const { GET } = await import('@/app/api/v1/media/proxy/route');
    const largeRes = await GET(
      new NextRequest('https://app.example.com/api/v1/media/proxy?key=posts/u1/big.mp4')
    );
    expect(largeRes.status).toBe(302);
    expect(largeRes.headers.get('location')).toBe('https://r2.signed.example/video.mp4');

    mockHeadR2Object.mockRejectedValueOnce({ name: 'NoSuchKey' });
    const missingRes = await GET(
      new NextRequest('https://app.example.com/api/v1/media/proxy?key=posts/u1/missing.png')
    );
    expect(missingRes.status).toBe(404);

    const invalidRes = await GET(
      new NextRequest('https://app.example.com/api/v1/media/proxy?key=../secret.png')
    );
    expect(invalidRes.status).toBe(422);
  });
});
