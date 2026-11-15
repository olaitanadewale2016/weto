import { NextRequest, NextResponse } from 'next/server';
import {
  createPresignedDownloadUrl,
  getR2Object,
  headR2Object,
} from '@/lib/r2';
import { apiError, AppError, NotFoundError, ValidationError } from '@/lib/api-response';

const MAX_INLINE_PROXY_BYTES = 3_500_000;

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  heic: 'image/heic',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  pdf: 'application/pdf',
};

function normalizeAndValidateKey(rawKey: string | null): string {
  if (!rawKey) {
    throw new ValidationError('Invalid R2 object key');
  }
  const normalized = rawKey.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('..') || normalized.includes('\0')) {
    throw new ValidationError('Invalid R2 object key');
  }
  return normalized;
}

function inferContentType(key: string, s3ContentType?: string): string {
  if (s3ContentType && s3ContentType !== 'application/octet-stream') {
    return s3ContentType;
  }
  const ext = key.split('.').pop()?.toLowerCase() || '';
  return MIME_BY_EXTENSION[ext] || s3ContentType || 'application/octet-stream';
}

function isS3NotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const candidate = err as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    candidate.name === 'NoSuchKey' ||
    candidate.name === 'NotFound' ||
    candidate.Code === 'NoSuchKey' ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

function buildMediaHeaders(params: {
  key: string;
  contentType?: string;
  contentLength?: number;
  contentRange?: string;
  etag?: string;
  cacheControl?: string;
}): Headers {
  const headers = new Headers();
  headers.set('Content-Type', inferContentType(params.key, params.contentType));
  if (typeof params.contentLength === 'number' && Number.isFinite(params.contentLength)) {
    headers.set('Content-Length', String(params.contentLength));
  }
  if (params.contentRange) {
    headers.set('Content-Range', params.contentRange);
  }
  if (params.etag) {
    headers.set('ETag', params.etag);
  }
  headers.set('Accept-Ranges', 'bytes');
  headers.set(
    'Cache-Control',
    params.cacheControl || 'public, max-age=86400, stale-while-revalidate=604800'
  );
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  headers.set('Access-Control-Allow-Origin', '*');
  return headers;
}

/**
 * Supports HEAD checks against proxied R2 assets cleanly (presigned GET URLs return 403 on HEAD).
 */
export async function HEAD(req: NextRequest) {
  try {
    const key = normalizeAndValidateKey(req.nextUrl.searchParams.get('key'));
    if (key.startsWith('assets/') || key.startsWith('pwa/')) {
      return NextResponse.redirect(new URL(`/${key}`, req.url), { status: 302 });
    }

    const head = await headR2Object(key);
    const headers = buildMediaHeaders({
      key,
      contentType: head.ContentType,
      contentLength: head.ContentLength,
      etag: head.ETag,
      cacheControl: head.CacheControl,
    });
    return new NextResponse(null, { status: 200, headers });
  } catch (err) {
    if (isS3NotFoundError(err)) {
      return apiError(new NotFoundError('Media asset not found'));
    }
    if (err instanceof AppError) return apiError(err);
    return apiError(
      new AppError(
        502,
        'R2_PROXY_ERROR',
        err instanceof Error ? err.message : 'Unable to resolve media object'
      )
    );
  }
}

/**
 * Streams Cloudflare R2 objects same-origin (with HTTP Range / 206 support) so images,
 * audio, and video load reliably without cross-origin S3 CORS issues.
 * Falls back to a presigned 302 redirect only for un-ranged transfers larger than 3.5 MB.
 */
export async function GET(req: NextRequest) {
  try {
    const key = normalizeAndValidateKey(req.nextUrl.searchParams.get('key'));
    if (key.startsWith('assets/') || key.startsWith('pwa/')) {
      return NextResponse.redirect(new URL(`/${key}`, req.url), { status: 302 });
    }

    const rangeHeader = req.headers.get('range') || undefined;

    if (!rangeHeader) {
      const head = await headR2Object(key);
      if ((head.ContentLength ?? 0) > MAX_INLINE_PROXY_BYTES) {
        const signedUrl = await createPresignedDownloadUrl(key, 604800);
        return NextResponse.redirect(signedUrl, {
          status: 302,
          headers: {
            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
            'Cross-Origin-Resource-Policy': 'cross-origin',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    }

    const object = await getR2Object(key, rangeHeader);
    if (!object.Body) {
      throw new NotFoundError('Media asset not found');
    }

    const headers = buildMediaHeaders({
      key,
      contentType: object.ContentType,
      contentLength: object.ContentLength,
      contentRange: object.ContentRange,
      etag: object.ETag,
      cacheControl: object.CacheControl,
    });

    const body =
      typeof object.Body.transformToWebStream === 'function'
        ? object.Body.transformToWebStream()
        : await object.Body.transformToByteArray();

    return new NextResponse(body as BodyInit, {
      status: rangeHeader && object.ContentRange ? 206 : 200,
      headers,
    });
  } catch (err) {
    if (isS3NotFoundError(err)) {
      return apiError(new NotFoundError('Media asset not found'));
    }
    if (err instanceof AppError) return apiError(err);
    return apiError(
      new AppError(
        502,
        'R2_PROXY_ERROR',
        err instanceof Error ? err.message : 'Unable to resolve media object'
      )
    );
  }
}
