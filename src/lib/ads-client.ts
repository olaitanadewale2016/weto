'use client';

import { apiFetch } from '@/lib/api-client';

export interface ServedAd {
  id: string;
  title: string;
  content: string;
  ctaText: string;
  targetUrl: string;
  viewsCount?: number;
  clicksCount?: number;
  advertiser?: {
    _id?: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    verified?: boolean;
  } | null;
  media?: {
    publicUrl?: string;
    url?: string;
    type?: string;
    thumbnailUrl?: string | null;
  } | null;
}

const HIDDEN_ADS_STORAGE_KEY = 'weto_hidden_ads_v1';
const sessionShownAdIds: string[] = [];
const sessionShownAdvertiserIds: string[] = [];
const sessionHiddenAdIds = new Set<string>();
let storageHydrated = false;

function hydrateHiddenAds() {
  if (storageHydrated || typeof window === 'undefined') return;
  storageHydrated = true;
  try {
    const raw = window.sessionStorage.getItem(HIDDEN_ADS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const id of parsed) {
        if (typeof id === 'string' && id) sessionHiddenAdIds.add(id);
      }
    }
  } catch {
    // Ignore storage read errors in restricted contexts
  }
}

export function hideAdInSession(adId: string) {
  if (!adId) return;
  hydrateHiddenAds();
  sessionHiddenAdIds.add(adId);
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(
        HIDDEN_ADS_STORAGE_KEY,
        JSON.stringify(Array.from(sessionHiddenAdIds).slice(-30))
      );
    } catch {
      // Ignore storage write errors
    }
  }
}

export function markAdShownInSession(adId: string, advertiserId?: string) {
  if (adId) {
    const idx = sessionShownAdIds.indexOf(adId);
    if (idx !== -1) sessionShownAdIds.splice(idx, 1);
    sessionShownAdIds.push(adId);
    if (sessionShownAdIds.length > 24) {
      sessionShownAdIds.shift();
    }
  }
  if (advertiserId) {
    const idx = sessionShownAdvertiserIds.indexOf(advertiserId);
    if (idx !== -1) sessionShownAdvertiserIds.splice(idx, 1);
    sessionShownAdvertiserIds.push(advertiserId);
    if (sessionShownAdvertiserIds.length > 10) {
      sessionShownAdvertiserIds.shift();
    }
  }
}

/**
 * Facebook/Instagram-style dynamic ad slot insertion:
 * Computes varied, natural post positions across a feed (including short feeds >= 2 posts)
 * so ads can appear at any natural position without clustering back-to-back or jittering on scroll.
 */
export function computeFeedAdSlotIndices(
  postCount: number,
  mode: string,
  feedSeed: number
): Set<number> {
  const slots = new Set<number>();
  if (postCount < 2) return slots;

  const normalizedSeed = Math.abs(Math.floor(feedSeed)) || 1;
  // Short feed (< 5 posts): place 1 ad after post 1 or the end so active ads still deliver
  if (postCount < 5) {
    slots.add(Math.min(postCount - 1, 1 + (normalizedSeed % 2)));
    return slots;
  }

  // Initial position can fall anywhere in top 1..5 posts (mode-aware)
  const initialMin = mode === 'explore' || mode === 'trending' ? 0 : 1;
  let pos = initialMin + (normalizedSeed % 4);
  let step = 0;

  while (pos < postCount) {
    slots.add(pos);
    step += 1;
    // Dynamic spacing between 4 and 7 organic posts (like Meta/X variable ad load pacing)
    const gap = 4 + ((normalizedSeed + step * 3) % 4);
    pos += gap;
  }

  return slots;
}

export function formatAdDomain(targetUrl?: string | null): string {
  if (!targetUrl) return '';
  try {
    return new URL(targetUrl).hostname.replace(/^www\./, '');
  } catch {
    return targetUrl;
  }
}

/**
 * Fetches an auction-selected ad without charging an impression prematurely.
 * Coordinates session frequency capping and hidden ads across RightRail and feed slots.
 */
export async function fetchAuctionAd(prevAdId?: string): Promise<ServedAd | null> {
  hydrateHiddenAds();
  const params = new URLSearchParams({ track: 'false' });
  const recentIds = sessionShownAdIds.slice(-12);
  if (recentIds.length > 0) {
    params.set('excludeIds', recentIds.join(','));
  }
  const recentAdvs = sessionShownAdvertiserIds.slice(-6);
  if (recentAdvs.length > 0) {
    params.set('excludeAdvertisers', recentAdvs.join(','));
  }
  const effectivePrev = prevAdId || recentIds[recentIds.length - 1];
  if (effectivePrev) {
    params.set('prevAdId', effectivePrev);
  }
  if (sessionHiddenAdIds.size > 0) {
    params.set('hiddenIds', Array.from(sessionHiddenAdIds).join(','));
  }

  const res = await apiFetch<ServedAd | null>(`/ads?${params.toString()}`);
  if (res && res.id) {
    const advId = res.advertiser?._id ? String(res.advertiser._id) : undefined;
    markAdShownInSession(res.id, advId);
    return res;
  }
  return null;
}

export function trackAdImpression(adId: string) {
  if (!adId) return;
  apiFetch('/ads', {
    method: 'PATCH',
    json: { action: 'impression', adId },
  }).catch(() => undefined);
}

export function trackAdClick(adId: string) {
  if (!adId) return;
  apiFetch('/ads', {
    method: 'PATCH',
    json: { action: 'click', adId },
    keepalive: true,
  }).catch(() => undefined);
}
