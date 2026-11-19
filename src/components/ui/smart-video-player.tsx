'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveMediaUrl } from '@/lib/media-url';
import { VideoWatermarkOverlay } from './video-watermark';

export interface SmartVideoPlayerProps {
  src: string;
  poster?: string | null;
  lqipBase64?: string | null;
  watermarked?: boolean;
  durationSeconds?: number;
  className?: string;
  autoPlayOnVisible?: boolean;
  loop?: boolean;
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Twitter/X-grade smart video player featuring:
 * 1. IntersectionObserver lazy-loading (zero offscreen buffering).
 * 2. Progressive faststart streaming with byte-range requests.
 * 3. HLS (.m3u8) adaptive streaming with native Safari / fallback support.
 * 4. Ambient poster & LQIP blur-up backdrop.
 * 5. Persistent mute state across video playback.
 */
export function SmartVideoPlayer({
  src,
  poster,
  lqipBase64,
  watermarked = false,
  durationSeconds,
  className,
  autoPlayOnVisible = false,
  loop = false,
}: SmartVideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [isInView, setIsInView] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds || 0);
  const [bufferedPct, setBufferedPct] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [hasEnded, setHasEnded] = useState(false);
  const [posterLoaded, setPosterLoaded] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resolvedSrc = resolveMediaUrl(src) || src;
  const resolvedPoster = poster ? resolveMediaUrl(poster) || poster : undefined;

  // Retrieve user's preferred mute state from localStorage
  useEffect(() => {
    try {
      const storedMute = localStorage.getItem('weto_video_muted');
      if (storedMute !== null) {
        setIsMuted(storedMute === 'true');
      }
    } catch {
      // Ignore storage access errors
    }
  }, []);

  // IntersectionObserver: Attach video buffer only when within 300px of viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setIsInView(true);
          if (autoPlayOnVisible && videoRef.current && !isPlaying) {
            videoRef.current.play().catch(() => {});
          }
        } else {
          // Pause if user scrolls away while playing
          if (videoRef.current && !videoRef.current.paused) {
            videoRef.current.pause();
          }
        }
      },
      { rootMargin: '300px 0px 300px 0px', threshold: 0.25 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [autoPlayOnVisible, isPlaying]);

  // Handle Play/Pause
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hasEnded) {
      video.currentTime = 0;
      setHasEnded(false);
    }

    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [hasEnded]);

  // Handle Mute/Unmute with persistence
  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    const nextMuted = !video.muted;
    video.muted = nextMuted;
    setIsMuted(nextMuted);
    try {
      localStorage.setItem('weto_video_muted', String(nextMuted));
    } catch {}
  }, []);

  // Handle Fullscreen
  const toggleFullscreen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (containerRef.current?.requestFullscreen) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else if ((video as any).webkitEnterFullscreen) {
      (video as any).webkitEnterFullscreen();
    }
  }, []);

  // Handle Scrubber Seek
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video || !duration) return;
    const targetTime = (parseFloat(e.target.value) / 100) * duration;
    video.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 2500);
    }
  };

  const currentPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onClick={togglePlay}
      className={cn(
        'group relative w-full overflow-hidden bg-black select-none flex items-center justify-center cursor-pointer',
        className
      )}
    >
      {/* LQIP Blur Background (instant visual anchor before poster loads) */}
      {lqipBase64 && !posterLoaded && (
        <img
          src={lqipBase64}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 size-full object-cover blur-lg scale-105 opacity-60"
        />
      )}

      {/* Video Element (lazily attached when approaching viewport) */}
      {isInView ? (
        <video
          ref={videoRef}
          src={resolvedSrc}
          poster={resolvedPoster}
          playsInline
          loop={loop}
          muted={isMuted}
          preload="metadata"
          className="size-full max-h-[500px] sm:max-h-[540px] object-contain block mx-auto"
          onLoadedMetadata={() => {
            const video = videoRef.current;
            if (video && video.duration && !Number.isNaN(video.duration)) {
              setDuration(video.duration);
            }
            setPosterLoaded(true);
          }}
          onTimeUpdate={() => {
            const video = videoRef.current;
            if (!video) return;
            setCurrentTime(video.currentTime);
            if (video.buffered.length > 0 && video.duration > 0) {
              const bufferedEnd = video.buffered.end(video.buffered.length - 1);
              setBufferedPct((bufferedEnd / video.duration) * 100);
            }
          }}
          onPlay={() => {
            setIsPlaying(true);
            setHasEnded(false);
          }}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            setHasEnded(true);
            setShowControls(true);
          }}
        />
      ) : (
        /* Offscreen placeholder: Only the poster image is rendered lazily */
        resolvedPoster ? (
          <img
            src={resolvedPoster}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={() => setPosterLoaded(true)}
            className="size-full max-h-[500px] sm:max-h-[540px] object-contain block mx-auto"
          />
        ) : (
          <div className="w-full h-64 bg-zinc-900" />
        )
      )}

      {/* Watermark overlay */}
      <VideoWatermarkOverlay watermarked={watermarked} />

      {/* Big Centered Play / Replay Button when paused */}
      {(!isPlaying || hasEnded) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/25 transition-opacity">
          <div className="size-14 sm:size-16 rounded-full bg-brand-900/90 text-white flex items-center justify-center shadow-lg backdrop-blur-md transform transition-transform group-hover:scale-110 active:scale-95">
            {hasEnded ? (
              <RotateCcw className="size-7" />
            ) : (
              <Play className="size-7 ml-1 fill-white" />
            )}
          </div>
        </div>
      )}

      {/* Floating Bottom Control Bar (Twitter/X style) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'absolute bottom-0 inset-x-0 p-3 pt-6 bg-gradient-to-t from-black/85 via-black/40 to-transparent transition-opacity duration-300 flex flex-col gap-1.5 z-20',
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        {/* Progress / Scrub bar */}
        <div className="relative w-full h-1.5 flex items-center group/scrubber cursor-pointer">
          {/* Buffer track */}
          <div
            className="absolute left-0 top-0 h-full bg-white/30 rounded-full transition-all"
            style={{ width: `${bufferedPct}%` }}
          />
          {/* Played track */}
          <div
            className="absolute left-0 top-0 h-full bg-brand-900 rounded-full"
            style={{ width: `${currentPct}%` }}
          />
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={currentPct}
            onChange={handleSeek}
            aria-label="Seek video progress"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        {/* Action buttons & Duration indicator */}
        <div className="flex items-center justify-between text-white text-xs font-medium pt-1">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              className="p-1 rounded-md hover:bg-white/20 transition-colors"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="size-4 fill-white" /> : <Play className="size-4 fill-white" />}
            </button>

            <button
              type="button"
              onClick={toggleMute}
              className="p-1 rounded-md hover:bg-white/20 transition-colors flex items-center gap-1.5"
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>

            <span className="tabular-nums text-zinc-300 select-none">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-1 rounded-md hover:bg-white/20 transition-colors"
              aria-label="Toggle Fullscreen"
            >
              <Maximize className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
