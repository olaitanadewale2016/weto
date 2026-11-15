import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api-response';
import { getServerEnv, publicEnv } from '@/lib/env';

interface GiphyImageVariant {
  url?: string;
  width?: string;
  height?: string;
}

interface GiphyRawGif {
  id: string;
  title?: string;
  images?: {
    fixed_width_small?: GiphyImageVariant;
    fixed_width?: GiphyImageVariant;
    downsized?: GiphyImageVariant;
    original?: GiphyImageVariant;
  };
}

export async function GET(req: NextRequest) {
  try {
    const env = getServerEnv();
    const apiKey = env.GIPHY_API_KEY?.trim() || publicEnv.giphyApiKey?.trim() || '';
    if (!apiKey) {
      return apiSuccess({ configured: false, items: [] });
    }

    const { searchParams } = new URL(req.url);
    const gifId = (searchParams.get('id') || '').trim();
    const q = (searchParams.get('q') || '').trim();
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 24), 1), 36);
    const offset = Math.max(Number(searchParams.get('offset') || 0), 0);

    if (gifId) {
      const validateUrl = new URL(`https://api.giphy.com/v1/gifs/${encodeURIComponent(gifId)}`);
      validateUrl.searchParams.set('api_key', apiKey);
      const singleRes = await fetch(validateUrl.toString(), {
        signal: AbortSignal.timeout(6000),
        cache: 'no-store',
      });
      if (!singleRes.ok) {
        return apiSuccess({ configured: true, valid: false, items: [] });
      }
      const singleJson = (await singleRes.json()) as { data?: GiphyRawGif };
      const g = singleJson.data;
      if (!g) return apiSuccess({ configured: true, valid: false, items: [] });
      const preview =
        g.images?.fixed_width_small?.url ||
        g.images?.fixed_width?.url ||
        g.images?.downsized?.url ||
        '';
      const full =
        g.images?.downsized?.url ||
        g.images?.fixed_width?.url ||
        g.images?.original?.url ||
        preview;
      return apiSuccess({
        configured: true,
        valid: true,
        items: preview && full ? [{
          id: g.id,
          title: g.title || 'GIF',
          previewUrl: preview,
          gifUrl: full,
          width: Number(g.images?.fixed_width?.width || 200),
          height: Number(g.images?.fixed_width?.height || 200),
        }] : [],
      });
    }

    const endpoint = q ? 'search' : 'trending';
    const url = new URL(`https://api.giphy.com/v1/gifs/${endpoint}`);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('rating', 'pg-13');
    if (q) url.searchParams.set('q', q);

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(6000),
      cache: 'no-store',
    });

    if (!res.ok) {
      return apiSuccess({ configured: true, items: [], error: `GIPHY returned ${res.status}` });
    }

    const json = (await res.json()) as { data?: GiphyRawGif[] };
    const items = (json.data || [])
      .map((item) => {
        const preview =
          item.images?.fixed_width_small?.url ||
          item.images?.fixed_width?.url ||
          item.images?.downsized?.url ||
          '';
        const full =
          item.images?.downsized?.url ||
          item.images?.fixed_width?.url ||
          item.images?.original?.url ||
          preview;
        return {
          id: item.id,
          title: item.title || 'GIF',
          previewUrl: preview,
          gifUrl: full,
          width: Number(item.images?.fixed_width?.width || 200),
          height: Number(item.images?.fixed_width?.height || 200),
        };
      })
      .filter((item) => Boolean(item.previewUrl && item.gifUrl));

    return apiSuccess({ configured: true, items });
  } catch (err) {
    return apiError(err);
  }
}
