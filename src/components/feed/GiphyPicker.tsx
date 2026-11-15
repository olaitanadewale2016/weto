'use client';

import React, { useEffect, useState } from 'react';
import { Film, Loader2, Search, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

export interface GiphyItem {
  id: string;
  title: string;
  previewUrl: string;
  gifUrl: string;
  width: number;
  height: number;
}

export function GiphyAttribution({ className = '' }: { className?: string }) {
  return (
    <a
      href="https://giphy.com/"
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-0.5 text-[11px] leading-tight text-white/90 hover:bg-black/80 transition-colors backdrop-blur-xs ${className}`}
    >
      <span className="font-bold tracking-wide text-white">GIF</span>
      <span className="opacity-60">/</span>
      <span className="opacity-90">Powered by GIPHY</span>
    </a>
  );
}

interface GiphyResponse {
  configured: boolean;
  items: GiphyItem[];
  error?: string;
}

export function GiphyPicker({
  onSelect,
  onSelectGif,
  onClose,
}: {
  onSelect: (gifUrl: string) => void;
  onSelectGif?: (item: GiphyItem) => void;
  onClose?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<GiphyItem[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [manualUrl, setManualUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        setLoading(true);
        try {
          const qs = query.trim() ? `?q=${encodeURIComponent(query.trim())}&limit=24` : '?limit=24';
          const res = await apiFetch<GiphyResponse>(`/giphy${qs}`);
          if (cancelled) return;
          setConfigured(res.configured);
          setItems(res.items || []);
        } catch {
          if (!cancelled) setItems([]);
        } finally {
          if (!cancelled) setLoading(false);
        }
      },
      query.trim() ? 300 : 0
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="rounded-2xl border border-bord-pr bg-bg-pr p-3 space-y-2.5 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 rounded-xl bg-input-pr border border-bord-card px-3 h-9">
          <Search className="h-3.5 w-3.5 text-lab-sc shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search GIPHY GIFs..."
            className="flex-1 bg-transparent text-cap-l text-lab-pr placeholder:text-lab-tr focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-lab-tr hover:text-lab-pr cursor-pointer"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-lab-tr hover:text-lab-pr hover:bg-fill-sc cursor-pointer"
            aria-label="Close GIF picker"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="h-44 flex items-center justify-center text-lab-sc">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : configured && items.length > 0 ? (
        <div className="grid grid-cols-3 gap-1.5 max-h-56 overflow-y-auto pr-1">
          {items.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                onSelect(g.gifUrl);
                onSelectGif?.(g);
              }}
              className="relative aspect-square rounded-xl overflow-hidden bg-fill-pr border border-bord-card hover:opacity-90 transition-opacity cursor-pointer"
              title={g.title}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={g.previewUrl}
                alt={g.title}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-2 py-2">
          <p className="text-cap-s text-lab-sc text-center">
            {configured
              ? 'No GIFs found for your search.'
              : 'GIPHY API key is not configured yet. Paste a direct GIF URL below:'}
          </p>
          <div className="flex items-center gap-2 rounded-xl bg-input-pr border border-bord-card px-3 py-1.5">
            <Film className="h-4 w-4 text-lab-sc shrink-0" />
            <input
              type="url"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder="https://media.giphy.com/..."
              className="flex-1 bg-transparent text-cap-l text-lab-pr focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                if (manualUrl.trim()) onSelect(manualUrl.trim());
              }}
              className="text-cap-s font-semibold text-brand-900 hover:underline cursor-pointer"
            >
              Use
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-lab-tr pt-1 border-t border-bord-pr">
        <span>Powered by GIPHY</span>
        {configured && (
          <button
            type="button"
            onClick={() => {
              const url = window.prompt('Paste direct GIF URL (https://...):');
              if (url?.trim()) onSelect(url.trim());
            }}
            className="hover:text-lab-pr cursor-pointer"
          >
            Paste URL
          </button>
        )}
      </div>
    </div>
  );
}
