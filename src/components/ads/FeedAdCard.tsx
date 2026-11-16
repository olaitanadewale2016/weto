'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, EyeOff, Info, MoreHorizontal } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
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
          <Avatar
            src={ad.advertiser?.avatar}
            alt={ad.advertiser?.username || advertiserName}
            verified={ad.advertiser?.verified}
            size="md"
          />
          <div className="min-w-0">
            <p className="text-par-m font-bold text-lab-pr truncate">{advertiserName}</p>
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
              onError={(e) => {
                if (e.currentTarget.dataset.fallbackApplied === '1') return;
                e.currentTarget.dataset.fallbackApplied = '1';
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
