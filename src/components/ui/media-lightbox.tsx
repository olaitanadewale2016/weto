'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LightboxImageItem {
  url: string;
  lqipBase64?: string | null;
  alt?: string;
}

export interface MediaLightboxProps {
  open: boolean;
  images: LightboxImageItem[];
  initialIndex?: number;
  albumName?: string;
  date?: string;
  onClose: () => void;
}

/**
 * Full-screen PHP-parity media lightbox player (`LightboxPlayer.vue` + `ImagePlayer.vue`).
 * Supports keyboard navigation (`Escape`, `ArrowLeft`, `ArrowRight`), mobile touch swipes,
 * auto-fit orientation, load-error fallback, counter (`Images 1/N`), and bottom gradient bar.
 */
export function MediaLightbox({
  open,
  images,
  initialIndex = 0,
  albumName,
  date,
  onClose,
}: MediaLightboxProps) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open || images.length === 0) return null;

  const safeInitial = Math.max(0, Math.min(initialIndex, images.length - 1));
  const sessionKey = `${safeInitial}-${images.map((i) => i.url).join('|')}`;

  return (
    <MediaLightboxInner
      key={sessionKey}
      images={images}
      initialIndex={safeInitial}
      albumName={albumName}
      date={date}
      onClose={onClose}
    />
  );
}

interface MediaLightboxInnerProps {
  images: LightboxImageItem[];
  initialIndex: number;
  albumName?: string;
  date?: string;
  onClose: () => void;
}

function MediaLightboxInner({
  images,
  initialIndex,
  albumName,
  date,
  onClose,
}: MediaLightboxInnerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [loadedMap, setLoadedMap] = useState<Record<number, boolean>>({});
  const [errorMap, setErrorMap] = useState<Record<number, boolean>>({});
  const [portraitMap, setPortraitMap] = useState<Record<number, boolean>>({});

  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);

  const count = images.length;
  const active = images[currentIndex] ?? images[0];
  const isLoaded = Boolean(loadedMap[currentIndex]);
  const hasError = Boolean(errorMap[currentIndex]);
  const isPortrait = Boolean(portraitMap[currentIndex]);

  const goPrev = useCallback(() => {
    if (count <= 1) return;
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : count - 1));
  }, [count]);

  const goNext = useCallback(() => {
    if (count <= 1) return;
    setCurrentIndex((prev) => (prev < count - 1 ? prev + 1 : 0));
  }, [count]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, goPrev, goNext]);

  // Preload adjacent slides for instant next/prev switching
  useEffect(() => {
    if (count <= 1) return;
    const indices = [
      currentIndex > 0 ? currentIndex - 1 : count - 1,
      currentIndex < count - 1 ? currentIndex + 1 : 0,
    ];
    for (const idx of indices) {
      const target = images[idx]?.url;
      if (target) {
        const img = new window.Image();
        img.src = target;
      }
    }
  }, [currentIndex, count, images]);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? 0;
    touchEndX.current = touchStartX.current;
  }

  function handleTouchMove(e: React.TouchEvent) {
    touchEndX.current = e.touches[0]?.clientX ?? touchEndX.current;
  }

  function handleTouchEnd() {
    if (count <= 1) return;
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 45) {
      if (diff > 0) goNext();
      else goPrev();
    }
  }

  const lightboxContent = (
    <div
      className="fixed inset-0 z-[120] bg-black flex flex-col select-none animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Media preview"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top gradient bar: counter on left, close on right — clears iOS/Android notch & status bar */}
      <div
        className="relative z-20 pt-[max(0.75rem,env(safe-area-inset-top))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-6 pb-2 bg-gradient-to-b from-black/80 via-black/45 to-transparent text-white shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-12 flex items-center justify-between gap-3">
          <div className="text-par-s font-medium tracking-tight text-white/90 min-w-0 truncate">
            {count > 1 ? `Images ${currentIndex + 1}/${count}` : albumName || 'Media preview'}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close media preview"
            className="size-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      {/* Main viewport stage */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-16 py-2">
        {count > 1 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            aria-label="Previous image"
            className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 z-20 size-11 rounded-full bg-white/15 hover:bg-white/25 text-white items-center justify-center transition-colors cursor-pointer"
          >
            <ChevronLeft className="size-6" />
          </button>
        ) : null}

        <div
          className="relative max-w-full max-h-full flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {!isLoaded && !hasError ? (
            <div className="relative flex items-center justify-center min-w-[220px] min-h-[220px] sm:min-w-[340px] sm:min-h-[340px]">
              {active.lqipBase64 ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={active.lqipBase64}
                  alt=""
                  className="max-h-[calc(100dvh-10rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-w-[92vw] rounded-lg object-contain blur-md opacity-70"
                />
              ) : null}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="size-9 rounded-full border-2 border-white/25 border-t-white animate-spin" />
              </div>
            </div>
          ) : null}

          {hasError ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-white/10 px-6 py-8 text-white/80 text-center">
              <AlertCircle className="size-8 text-white/70" />
              <p className="text-par-s font-medium">Unable to load this media</p>
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={active.url}
              src={active.url}
              alt={active.alt || albumName || 'Media preview'}
              decoding="async"
              fetchPriority="high"
              onLoad={(e) => {
                const img = e.currentTarget;
                const portrait = img.naturalHeight > img.naturalWidth;
                setPortraitMap((prev) => ({ ...prev, [currentIndex]: portrait }));
                setLoadedMap((prev) => ({ ...prev, [currentIndex]: true }));
              }}
              onError={() => {
                setErrorMap((prev) => ({ ...prev, [currentIndex]: true }));
              }}
              className={cn(
                'rounded-md object-contain shadow-2xl transition-opacity duration-200 max-h-[calc(100dvh-10rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))]',
                isPortrait ? 'w-auto max-w-[94vw]' : 'max-w-[94vw] sm:max-w-[84vw]',
                isLoaded ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'
              )}
            />
          )}
        </div>

        {count > 1 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            aria-label="Next image"
            className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 z-20 size-11 rounded-full bg-white/15 hover:bg-white/25 text-white items-center justify-center transition-colors cursor-pointer"
          >
            <ChevronRight className="size-6" />
          </button>
        ) : null}
      </div>

      {/* Bottom caption/date & dot pagination */}
      <div
        className="relative z-20 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-6 bg-gradient-to-t from-black/80 via-black/45 to-transparent text-white shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-w-0">
            {albumName && count > 1 ? (
              <p className="text-par-s font-medium text-white truncate">{albumName}</p>
            ) : null}
            {date ? <p className="text-cap-s text-white/65">{date}</p> : null}
          </div>

          {count > 1 ? (
            <div className="flex items-center justify-center gap-1.5 flex-wrap">
              {images.slice(0, 12).map((item, idx) => (
                <button
                  key={`${item.url}-${idx}`}
                  type="button"
                  aria-label={`View image ${idx + 1}`}
                  onClick={() => setCurrentIndex(idx)}
                  className={cn(
                    'h-1.5 rounded-full transition-all cursor-pointer',
                    idx === currentIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70'
                  )}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(lightboxContent, document.body) : null;
}
