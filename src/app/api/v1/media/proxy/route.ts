import { NextRequest, NextResponse } from 'next/server';
import { createPresignedDownloadUrl } from '@/lib/r2';
import { apiError, AppError, ValidationError } from '@/lib/api-response';

/**
 * Fallback media proxy endpoint used when NEXT_PUBLIC_R2_PUBLIC_URL is not configured.
 * Generates a short-lived signed Cloudflare R2 download URL and redirects (302) the client.
 */
export async function GET(req: NextRequest) {
  try {
    const key = req.nextUrl.searchParams.get('key');
    if (!key || key.includes('..') || key.startsWith('/')) {
      throw new ValidationError('Invalid R2 object key');
    }

    const signedUrl = await createPresignedDownloadUrl(key, 604800);
    return NextResponse.redirect(signedUrl, {
      status: 302,
      headers: {
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=86400',
      },
    });
  } catch (err) {
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
