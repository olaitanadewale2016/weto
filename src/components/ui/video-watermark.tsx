'use client';

import React from 'react';
import { useApp } from '@/components/providers/AppContext';
import { resolveMediaUrl } from '@/lib/media-url';
import { cn } from '@/lib/utils';

interface VideoWatermarkOverlayProps {
  /**
   * True when the FFmpeg background worker has already burned the watermark
   * directly into the MP4 stream (`metadata.watermarked === true`).
   */
  watermarked?: boolean;
  className?: string;
}

/**
 * Renders the PHP ColibriPlus video watermark (`Source/config/assets.php`:
 * `position: 'absolute', x: 30, y: 30`) when `brand.videos_watermark_enabled`
 * is active and the video file has not already been transcoded with a burned-in
 * FFmpeg overlay (e.g., on serverless or direct upload).
 */
export function VideoWatermarkOverlay({
  watermarked = false,
  className,
}: VideoWatermarkOverlayProps) {
  const { bootstrap } = useApp();
  const videosWatermarkEnabled = bootstrap?.config?.brand?.videosWatermarkEnabled ?? true;

  if (!videosWatermarkEnabled || watermarked) {
    return null;
  }

  const rawUrl =
    bootstrap?.config?.logos?.watermark ||
    bootstrap?.config?.brand?.watermarkUrl ||
    '/assets/watermarks/default.png';
  const watermarkSrc = resolveMediaUrl(rawUrl) || rawUrl;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={watermarkSrc}
      alt=""
      aria-hidden="true"
      style={{ top: 30, left: 30 }}
      className={cn(
        'pointer-events-none select-none absolute z-10 max-w-12 max-h-12 object-contain',
        className
      )}
    />
  );
}
