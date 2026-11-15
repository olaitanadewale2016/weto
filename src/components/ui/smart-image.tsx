'use client';

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { resolveMediaUrl } from '@/lib/media-url';

export interface SmartImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string;
  lqipBase64?: string | null;
  priority?: boolean;
  wrapperClassName?: string;
}

/**
 * Optimized image renderer with optional LQIP blur-up backdrop, async decoding,
 * and priority hints for fast above-the-fold rendering.
 */
export function SmartImage({
  src,
  lqipBase64,
  priority = false,
  alt = '',
  className,
  wrapperClassName,
  onLoad,
  onError,
  ...rest
}: SmartImageProps) {
  const resolvedSrc = resolveMediaUrl(src) || src;
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [erroredUrl, setErroredUrl] = useState<string | null>(null);

  const isLoaded = loadedUrl === resolvedSrc;
  const isError = erroredUrl === resolvedSrc;

  useEffect(() => {
    const img = imgRef.current;
    if (!img || !resolvedSrc) return;
    if (img.complete) {
      if (img.naturalWidth > 0) {
        queueMicrotask(() => setLoadedUrl(resolvedSrc));
      } else {
        queueMicrotask(() => setErroredUrl(resolvedSrc));
      }
    }
  }, [resolvedSrc]);

  if (!lqipBase64) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        ref={imgRef}
        src={resolvedSrc}
        alt={alt}
        loading={priority ? 'eager' : rest.loading ?? 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : rest.fetchPriority ?? 'auto'}
        className={cn(className, isError && 'opacity-60')}
        onLoad={onLoad}
        onError={(e) => {
          setErroredUrl(resolvedSrc);
          onError?.(e);
        }}
        {...rest}
      />
    );
  }

  return (
    <div className={cn('relative overflow-hidden bg-fill-qt', wrapperClassName)}>
      {!isLoaded && !isError ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={lqipBase64}
          alt=""
          aria-hidden="true"
          className={cn(className, 'absolute inset-0 w-full h-full object-cover scale-105 blur-md')}
        />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={resolvedSrc}
        alt={alt}
        loading={priority ? 'eager' : rest.loading ?? 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : rest.fetchPriority ?? 'auto'}
        className={cn(
          className,
          'relative z-10 transition-opacity duration-200',
          isLoaded || isError ? 'opacity-100' : 'opacity-0'
        )}
        onLoad={(e) => {
          setLoadedUrl(resolvedSrc);
          onLoad?.(e);
        }}
        onError={(e) => {
          setErroredUrl(resolvedSrc);
          onError?.(e);
        }}
        {...rest}
      />
    </div>
  );
}
