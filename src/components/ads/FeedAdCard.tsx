'use client';

import React, { useEffect, useState } from 'react';
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

let lastFeedAdId = '';

export function FeedAdCard() {
  const { bootstrap } = useApp();
  const [ad, setAd] = useState<FeedAd | null>(null);
  const [loaded, setLoaded] = useState(false);

  const adsEnabled = bootstrap?.config?.features?.ads !== false;

  useEffect(() => {
    if (!adsEnabled) return;
    let active = true;
    const qs = lastFeedAdId ? `?prevAdId=${encodeURIComponent(lastFeedAdId)}` : '';
    apiFetch<FeedAd | null>(`/ads${qs}`)
      .then((res) => {
        if (!active) return;
        if (res && res.id) {
          lastFeedAdId = res.id;
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
  }, [adsEnabled]);

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
          <span className="absolute top-3 bg-black/25 leading-none text-white left-3 backdrop-blur-xs px-2.5 py-1.5 rounded-full text-cap-s font-medium">
            Ad &middot; 16+
          </span>
        </div>
        <div className="p-4">
          <h4 className="font-semibold text-par-l text-lab-pr mb-1">{ad.title}</h4>
          <p className="text-lab-sc text-par-s mb-2 line-clamp-3">{ad.content}</p>
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
