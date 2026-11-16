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

export function markAdShownInSession(adId: string) {
  if (!adId) return;
  const idx = sessionShownAdIds.indexOf(adId);
  if (idx !== -1) sessionShownAdIds.splice(idx, 1);
  sessionShownAdIds.push(adId);
  if (sessionShownAdIds.length > 12) {
    sessionShownAdIds.shift();
  }
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
  const recentIds = sessionShownAdIds.slice(-6);
  if (recentIds.length > 0) {
    params.set('excludeIds', recentIds.join(','));
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
    markAdShownInSession(res.id);
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
