'use client';

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, Film, Search, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { ActionSheet } from '@/components/mobile/ActionSheet';

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
      className={`shadow-md rounded-xs inline-flex items-center z-10 px-1.5 md:px-2 h-4 md:h-6 leading-none bg-black/60 hover:bg-black/80 transition-colors backdrop-blur-xs ${className}`}
    >
      <span className="text-gray-200 text-[9px] md:text-cap-s whitespace-nowrap">
        GIF / Powered by GIPHY
      </span>
      <span className="size-2.5 md:size-3 ml-1 shrink-0 inline-flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 35" className="h-full w-auto">
          <g fillRule="evenodd" clipRule="evenodd">
            <path fill="#00ff99" d="M0 3h4v29H0z" />
            <path fill="#9933ff" d="M24 11h4v21h-4z" />
            <path fill="#00ccff" d="M0 31h28v4H0z" />
            <path fill="#fff35c" d="M0 0h16v4H0z" />
            <path fill="#ff6666" d="M24 8V4h-4V0h-4v12h12V8" />
            <path fill="#222" d="M24 16v-4h4M16 0v4h-4" />
          </g>
        </svg>
      </span>
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState('');
  const [loadedIds, setLoadedIds] = useState<Record<string, boolean>>({});
  const [previewGif, setPreviewGif] = useState<GiphyItem | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsMobileViewport(mq.matches);
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
          const qs = query.trim() ? `?q=${encodeURIComponent(query.trim())}&limit=24` : '?limit=24';
          const res = await apiFetch<GiphyResponse>(`/giphy${qs}`);
          if (cancelled) return;
          setConfigured(res.configured);
          setItems(res.items || []);
          setErrorMsg(res.error || null);
        } catch (err) {
          if (!cancelled) {
            setItems([]);
            setErrorMsg(err instanceof Error ? err.message : 'Unable to reach GIPHY');
          }
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

  const confirmSelection = (item: GiphyItem) => {
    onSelect(item.gifUrl);
    onSelectGif?.(item);
    setPreviewGif(null);
  };

  const pickerInner = (
    <div className="space-y-2.5 flex flex-col min-h-0">
      <div className="flex items-center gap-2 shrink-0">
        {previewGif ? (
          <button
            type="button"
            onClick={() => setPreviewGif(null)}
            className="inline-flex items-center gap-1.5 rounded-full bg-fill-qt border border-bord-pr px-3 h-10 text-par-s font-semibold text-lab-pr hover:bg-fill-tr cursor-pointer shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to GIFs</span>
          </button>
        ) : (
          <div className="flex-1 flex items-center gap-2 rounded-full bg-fill-qt border border-bord-pr px-3.5 h-10">
            <Search className="h-4 w-4 text-lab-sc shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search GIPHY GIFs..."
              className="flex-1 min-w-0 bg-transparent text-[16px] md:text-par-s text-lab-pr placeholder:text-lab-tr focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-lab-tr hover:text-lab-pr cursor-pointer shrink-0"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        {previewGif && (
          <p className="flex-1 min-w-0 truncate text-par-s font-medium text-lab-sc">
            {previewGif.title || 'GIF Preview'}
          </p>
        )}
        {onClose && !isMobileViewport && (
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-lab-tr hover:text-lab-pr hover:bg-fill-sc cursor-pointer shrink-0"
            aria-label="Close GIF picker"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {previewGif ? (
        <div className="space-y-3">
          <div className="w-full rounded-xl border border-bord-pr bg-fill-tr overflow-hidden flex items-center justify-center p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewGif.gifUrl || previewGif.previewUrl}
              alt={previewGif.title || 'GIF preview'}
              referrerPolicy="no-referrer"
              className="w-full max-h-60 object-contain rounded-lg block"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setPreviewGif(null)}
              className="rounded-full border border-bord-pr px-4 py-2 text-par-s font-semibold text-lab-pr2 hover:bg-fill-qt cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => confirmSelection(previewGif)}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-900 text-white px-5 py-2 text-par-s font-semibold hover:opacity-90 cursor-pointer"
            >
              <Check className="h-4 w-4" />
              <span>Use GIF</span>
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="max-h-72 overflow-hidden rounded-xl">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="aspect-square w-full rounded-lg bg-fill-qt fb-shimmer" />
            ))}
          </div>
        </div>
      ) : configured && items.length > 0 ? (
        <div className="max-h-[52dvh] md:max-h-72 overflow-y-auto overflow-x-hidden rounded-xl pr-0.5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {items.map((g) => {
              const loaded = Boolean(loadedIds[g.id]);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setPreviewGif(g)}
                  className="relative block w-full aspect-square rounded-lg border border-bord-tr overflow-hidden bg-fill-tr group cursor-pointer"
                  title={g.title || 'Preview GIF'}
                >
                  {!loaded && (
                    <span className="absolute inset-0 bg-fill-qt fb-shimmer" aria-hidden="true" />
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={g.previewUrl || g.gifUrl}
                    alt={g.title || 'GIF'}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onLoad={() => setLoadedIds((prev) => ({ ...prev, [g.id]: true }))}
                    className="h-full w-full object-cover block transition-transform duration-150 group-hover:scale-105"
                  />
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-2.5 py-4">
          <p className="text-cap-l text-lab-sc text-center">
            {errorMsg
              ? errorMsg
              : configured
                ? 'No GIFs found for your search.'
                : 'GIPHY API key is not configured yet. Paste a direct GIF URL below:'}
          </p>
          <div className="flex items-center gap-2 rounded-full bg-input-pr border border-bord-card px-3.5 py-2">
            <Film className="h-4 w-4 text-lab-sc shrink-0" />
            <input
              type="url"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder="https://media.giphy.com/..."
              className="flex-1 min-w-0 bg-transparent text-[16px] md:text-cap-l text-lab-pr focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                if (manualUrl.trim()) onSelect(manualUrl.trim());
              }}
              className="text-cap-l font-semibold text-brand-900 hover:underline cursor-pointer shrink-0"
            >
              Use
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-1.5 border-t border-bord-tr shrink-0">
        <GiphyAttribution />
        {configured && (
          <button
            type="button"
            onClick={() => {
              const url = window.prompt('Paste direct GIF URL (https://...):');
              if (url?.trim()) onSelect(url.trim());
            }}
            className="text-cap-s text-lab-sc hover:text-lab-pr cursor-pointer"
          >
            Paste URL
          </button>
        )}
      </div>
    </div>
  );

  if (isMobileViewport && onClose) {
    return (
      <ActionSheet open onClose={onClose} muted={false}>
        <div className="pb-2">{pickerInner}</div>
      </ActionSheet>
    );
  }

  return (
    <div className="rounded-2xl border border-bord-pr bg-bg-pr p-3 shadow-vertical-tr">
      {pickerInner}
    </div>
  );
}
