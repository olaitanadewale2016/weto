'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, EyeOff, Info, MoreHorizontal } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { resolveMediaUrl } from '@/lib/media-url';
import { useApp } from '@/components/providers/AppContext';
import {
  fetchAuctionAd,
  formatAdDomain,
  hideAdInSession,
  ServedAd,
  trackAdClick,
  trackAdImpression,
} from '@/lib/ads-client';

export function FeedAdCard({ slotIndex = 0 }: { slotIndex?: number }) {
  const { bootstrap } = useApp();
  const [ad, setAd] = useState<ServedAd | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);

  const requestedSlotRef = useRef<number | null>(null);
  const trackedAdIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const adsEnabled = bootstrap?.config?.features?.ads !== false;

  useEffect(() => {
    if (!adsEnabled) return;
    if (requestedSlotRef.current === slotIndex) return;
    requestedSlotRef.current = slotIndex;

    let active = true;
    fetchAuctionAd()
      .then((res) => {
        if (!active) return;
        setAd(res);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [adsEnabled, slotIndex]);

  // MRC Viewable Impression standard (Meta / Instagram / X):
  // Fire once when >= 50% of the ad card remains visible for >= 800ms.
  useEffect(() => {
    if (!adsEnabled || !ad?.id || hidden) return;
    if (trackedAdIdRef.current === ad.id) return;

    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      trackedAdIdRef.current = ad.id;
      trackAdImpression(ad.id);
      return;
    }

    let dwellTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (!dwellTimer && trackedAdIdRef.current !== ad.id) {
            dwellTimer = setTimeout(() => {
              if (trackedAdIdRef.current !== ad.id) {
                trackedAdIdRef.current = ad.id;
                trackAdImpression(ad.id);
              }
            }, 800);
          }
        } else if (dwellTimer) {
          clearTimeout(dwellTimer);
          dwellTimer = null;
        }
      },
      { threshold: [0.5] }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (dwellTimer) clearTimeout(dwellTimer);
    };
  }, [adsEnabled, ad?.id, hidden]);

  if (!adsEnabled || !loaded || !ad || hidden) return null;

  const advertiserName = ad.advertiser
    ? `${ad.advertiser.firstName || ''} ${ad.advertiser.lastName || ''}`.trim() ||
      ad.advertiser.username ||
      'Sponsored Partner'
    : 'Sponsored Partner';
  const mediaSrc =
    resolveMediaUrl(ad.media?.publicUrl || ad.media?.url) || '/assets/ads/default-preview.png';
  const isVideoCreative = ad.media?.type === 'video';
  const domainLabel = formatAdDomain(ad.targetUrl);

  return (
    <div ref={containerRef} className="bg-bg-pr border-b border-bord-tr">
      {/* Advertiser Attribution Header (Meta / X / Instagram native pattern) */}
      <div className="px-4 pt-3.5 pb-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {ad.advertiser?.username ? (
            <Link href={`/@${encodeURIComponent(ad.advertiser.username)}`} className="shrink-0">
              <Avatar
                src={ad.advertiser?.avatar}
                alt={ad.advertiser?.username || advertiserName}
                verified={ad.advertiser?.verified}
                size="md"
              />
            </Link>
          ) : (
            <Avatar
              src={ad.advertiser?.avatar}
              alt={ad.advertiser?.username || advertiserName}
              verified={ad.advertiser?.verified}
              size="md"
            />
          )}
          <div className="min-w-0">
            {ad.advertiser?.username ? (
              <Link
                href={`/@${encodeURIComponent(ad.advertiser.username)}`}
                className="block text-par-m font-bold text-lab-pr hover:underline truncate"
              >
                {advertiserName}
              </Link>
            ) : (
              <p className="text-par-m font-bold text-lab-pr truncate">{advertiserName}</p>
            )}
            <p className="text-cap-l text-lab-sc leading-tight">
              Sponsored &middot; 16+
            </p>
          </div>
        </div>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="p-1.5 rounded-full text-lab-tr hover:bg-fill-sc hover:text-lab-pr cursor-pointer"
            aria-label="Ad options"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-1 w-52 rounded-2xl border border-bord-pr bg-bg-pr shadow-vertical-tr py-1 z-20">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setWhyOpen((v) => !v);
                }}
                className="w-full px-3.5 py-2 text-left text-cap-l text-lab-pr hover:bg-fill-pr flex items-center gap-2 cursor-pointer"
              >
                <Info className="h-4 w-4 text-lab-sc" />
                Why am I seeing this ad?
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  hideAdInSession(ad.id);
                  setHidden(true);
                }}
                className="w-full px-3.5 py-2 text-left text-cap-l text-lab-pr hover:bg-fill-pr flex items-center gap-2 cursor-pointer"
              >
                <EyeOff className="h-4 w-4 text-lab-sc" />
                Hide this ad
              </button>
            </div>
          )}
        </div>
      </div>

      {whyOpen && (
        <div className="mx-4 mb-2.5 rounded-xl border border-bord-pr bg-fill-qt/60 px-3 py-2 text-cap-l text-lab-sc flex items-center justify-between gap-2">
          <span>
            This promoted placement is matched to active feed context and your recent topic activity.
          </span>
          <button
            type="button"
            onClick={() => setWhyOpen(false)}
            className="text-brand-900 font-semibold shrink-0 cursor-pointer"
          >
            Got it
          </button>
        </div>
      )}

      <a
        href={ad.targetUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackAdClick(ad.id)}
        className="w-full block hover:bg-fill-fv/20 transition-colors"
      >
        {(ad.title || ad.content) && (
          <div className="px-4 pb-3 space-y-1">
            {ad.title && (
              <h4 className="font-semibold text-par-l text-lab-pr leading-snug">{ad.title}</h4>
            )}
            {ad.content && (
              <p className="text-lab-pr2 text-par-n line-clamp-3 leading-relaxed">{ad.content}</p>
            )}
          </div>
        )}

        {/* Full-Width Edge-to-Edge Ad Creative (no horizontal margin) */}
        <div className="w-full overflow-hidden relative bg-fill-qt">
          {isVideoCreative ? (
            <video
              src={mediaSrc}
              poster={ad.media?.thumbnailUrl || undefined}
              muted
              autoPlay
              loop
              playsInline
              preload="metadata"
              className="w-full max-h-[520px] object-contain bg-black block"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="w-full max-h-[520px] object-cover block"
              src={mediaSrc}
              alt={ad.title || 'Sponsored ad creative'}
              loading="lazy"
              onLoad={(e) => {
                e.currentTarget.dataset.fallbackApplied = '';
                e.currentTarget.removeAttribute('data-media-retry-src');
              }}
              onError={(e) => {
                if (e.currentTarget.naturalWidth > 0) return;
                if (e.currentTarget.dataset.fallbackApplied === '1') return;
                e.currentTarget.dataset.fallbackApplied = '1';
                e.currentTarget.dataset.mediaRetrySrc = mediaSrc;
                e.currentTarget.src = '/assets/ads/default-preview.png';
              }}
            />
          )}
          <span className="absolute top-3 left-3 bg-black/45 leading-none text-white backdrop-blur-xs px-2.5 py-1.5 rounded-full text-cap-s font-medium">
            Ad &middot; 16+
          </span>
        </div>

        <div className="px-4 py-3 flex items-center justify-between gap-3 bg-fill-fv/30 border-t border-bord-tr/60">
          <div className="min-w-0">
            {domainLabel && (
              <p className="text-cap-s uppercase tracking-wide text-lab-sc truncate">
                {domainLabel}
              </p>
            )}
            <p className="text-par-s font-semibold text-lab-pr truncate">
              {ad.title || ad.targetUrl}
            </p>
          </div>
          <span className="shrink-0 inline-flex items-center gap-1.5 py-2.5 px-5 leading-none rounded-full font-semibold bg-fill-qt text-lab-pr2 hover:bg-fill-tr text-par-s transition-colors">
            <span>{ad.ctaText || 'Learn More'}</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </span>
        </div>
      </a>

      <div className="h-2 bg-fill-fv/50 border-t border-bord-tr/60" />
    </div>
  );
}

/**
 * Native Marketplace Grid Ad Tile (`MarketplaceAdCard`) matching `ProductCard.tsx`
 * exact width, height, aspect-square media frame, and typography so sponsored ads
 * blend seamlessly into the 2-column / 3-column marketplace grid.
 */
export function MarketplaceAdCard({ slotIndex = 401 }: { slotIndex?: number }) {
  const { bootstrap } = useApp();
  const [ad, setAd] = useState<ServedAd | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const requestedSlotRef = useRef<number | null>(null);
  const trackedAdIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const adsEnabled = bootstrap?.config?.features?.ads !== false;

  useEffect(() => {
    if (!adsEnabled) return;
    if (requestedSlotRef.current === slotIndex) return;
    requestedSlotRef.current = slotIndex;

    let active = true;
    fetchAuctionAd()
      .then((res) => {
        if (!active) return;
        setAd(res);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [adsEnabled, slotIndex]);

  useEffect(() => {
    if (!adsEnabled || !ad?.id || hidden) return;
    if (trackedAdIdRef.current === ad.id) return;

    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      trackedAdIdRef.current = ad.id;
      trackAdImpression(ad.id);
      return;
    }

    let dwellTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (!dwellTimer && trackedAdIdRef.current !== ad.id) {
            dwellTimer = setTimeout(() => {
              if (trackedAdIdRef.current !== ad.id) {
                trackedAdIdRef.current = ad.id;
                trackAdImpression(ad.id);
              }
            }, 800);
          }
        } else if (dwellTimer) {
          clearTimeout(dwellTimer);
          dwellTimer = null;
        }
      },
      { threshold: [0.5] }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (dwellTimer) clearTimeout(dwellTimer);
    };
  }, [adsEnabled, ad?.id, hidden]);

  if (!adsEnabled || !loaded || !ad || hidden) return null;

  const advertiserName = ad.advertiser
    ? `${ad.advertiser.firstName || ''} ${ad.advertiser.lastName || ''}`.trim() ||
      ad.advertiser.username ||
      'Sponsored Partner'
    : 'Sponsored Partner';
  const mediaSrc =
    resolveMediaUrl(ad.media?.publicUrl || ad.media?.url) || '/assets/ads/default-preview.png';
  const isVideoCreative = ad.media?.type === 'video';
  const domainLabel = formatAdDomain(ad.targetUrl);

  return (
    <div ref={containerRef} className="group flex flex-col">
      <div className="relative aspect-square rounded-lg overflow-hidden mb-2 bg-fill-tr">
        <a
          href={ad.targetUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackAdClick(ad.id)}
          className="block h-full w-full"
        >
          {isVideoCreative ? (
            <video
              src={mediaSrc}
              poster={ad.media?.thumbnailUrl || undefined}
              muted
              autoPlay
              loop
              playsInline
              preload="metadata"
              className="h-full w-full object-cover block"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaSrc}
              alt={ad.title || 'Sponsored listing'}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              onLoad={(e) => {
                e.currentTarget.dataset.fallbackApplied = '';
                e.currentTarget.removeAttribute('data-media-retry-src');
              }}
              onError={(e) => {
                if (e.currentTarget.naturalWidth > 0) return;
                if (e.currentTarget.dataset.fallbackApplied !== '1') {
                  e.currentTarget.dataset.fallbackApplied = '1';
                  e.currentTarget.dataset.mediaRetrySrc = mediaSrc;
                  e.currentTarget.src = '/assets/ads/default-preview.png';
                }
              }}
            />
          )}
        </a>

        <Badge variant="brand" className="absolute top-2 left-2 shadow-sm pointer-events-none">
          Sponsored
        </Badge>

        <div className="absolute top-2 right-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="size-6 rounded-full bg-black/45 text-white backdrop-blur-xs flex items-center justify-center hover:bg-black/65 transition-colors cursor-pointer"
            aria-label="Ad options"
          >
            <MoreHorizontal className="size-3.5" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-1 w-44 rounded-xl border border-bord-pr bg-bg-pr shadow-xl py-1 z-20">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen(false);
                  hideAdInSession(ad.id);
                  setHidden(true);
                }}
                className="w-full px-3 py-1.5 text-left text-cap-l text-lab-pr hover:bg-fill-pr flex items-center gap-2 cursor-pointer"
              >
                <EyeOff className="size-3.5 text-lab-sc" />
                <span>Hide this ad</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="flex items-start justify-between gap-1.5 mb-1">
          <a
            href={ad.targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackAdClick(ad.id)}
            className="min-w-0 flex-1 max-w-11/12"
          >
            <h3 className="text-par-s font-normal line-clamp-2 text-lab-pr hover:underline leading-snug">
              {ad.title || ad.content || 'Sponsored Offer'}
            </h3>
          </a>
          <a
            href={ad.targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackAdClick(ad.id)}
            className="shrink-0 p-0.5 text-lab-tr hover:text-brand-900 transition-colors"
            aria-label="Open sponsored link"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        <div className="flex items-baseline gap-1.5 flex-wrap">
          <a
            href={ad.targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackAdClick(ad.id)}
            className="text-lab-pr2 text-par-n font-semibold hover:text-brand-900 transition-colors"
          >
            {ad.ctaText || 'Learn More'}
          </a>
        </div>

        <div className="text-par-s text-lab-sc overflow-hidden truncate">
          {advertiserName}
          {domainLabel ? ` · ${domainLabel}` : ' · Sponsored'}
        </div>
      </div>
    </div>
  );
}
