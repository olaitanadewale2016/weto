'use client';

import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useApp } from '@/components/providers/AppContext';

interface FeedAd {
  id: string;
  title: string;
  content: string;
  ctaText: string;
  targetUrl: string;
  media?: { publicUrl?: string; url?: string } | null;
}

const sessionShownAdIds: string[] = [];

export function FeedAdCard({ slotIndex = 0 }: { slotIndex?: number }) {
  const { bootstrap } = useApp();
  const [ad, setAd] = useState<FeedAd | null>(null);
  const [loaded, setLoaded] = useState(false);
  const requestedSlotRef = useRef<number | null>(null);

  const adsEnabled = bootstrap?.config?.features?.ads !== false;

  useEffect(() => {
    if (!adsEnabled) return;
    if (requestedSlotRef.current === slotIndex) return;
    requestedSlotRef.current = slotIndex;

    let active = true;
    const recentIds = sessionShownAdIds.slice(-6);
    const params = new URLSearchParams();
    if (recentIds.length > 0) {
      params.set('excludeIds', recentIds.join(','));
      params.set('prevAdId', recentIds[recentIds.length - 1]);
    }
    const qs = params.toString() ? `?${params.toString()}` : '';

    apiFetch<FeedAd | null>(`/ads${qs}`)
      .then((res) => {
        if (!active) return;
        if (res && res.id) {
          if (!sessionShownAdIds.includes(res.id)) {
            sessionShownAdIds.push(res.id);
          }
          setAd(res);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [adsEnabled, slotIndex]);

  if (!adsEnabled || !loaded || !ad) return null;

  return (
    <div className="border-b border-bord-tr">
      <a
        href={ad.targetUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full block hover:bg-fill-fv/30 transition-colors"
      >
        <div className="overflow-hidden relative bg-fill-qt">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="w-full max-h-72 object-cover block"
            src={ad.media?.publicUrl || ad.media?.url || '/assets/ads/default-preview.png'}
            alt={ad.title}
            loading="lazy"
          />
          <span className="absolute top-3 bg-black/35 leading-none text-white left-3 backdrop-blur-xs px-2.5 py-1.5 rounded-full text-cap-s font-medium">
            Sponsored &middot; Ad
          </span>
        </div>
        <div className="p-4">
          <h4 className="font-semibold text-par-l text-lab-pr mb-1">{ad.title}</h4>
          <p className="text-lab-sc text-par-n mb-2 line-clamp-3">{ad.content}</p>
          <span className="block text-lab-sc text-par-s mb-3.5 truncate">{ad.targetUrl}</span>
          <span className="block w-full text-center py-2.5 px-6 leading-none rounded-full font-semibold bg-fill-qt text-lab-pr2 hover:bg-fill-tr text-par-n smoothing">
            {ad.ctaText || 'Learn More'}
          </span>
        </div>
      </a>
      <div className="h-2 bg-fill-fv/40 border-t border-bord-tr/60" />
    </div>
  );
}
