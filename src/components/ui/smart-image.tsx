'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';

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
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [erroredUrl, setErroredUrl] = useState<string | null>(null);

  const isLoaded = loadedUrl === src;
  const isError = erroredUrl === src;

  if (!lqipBase64) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={src}
        alt={alt}
        loading={priority ? 'eager' : rest.loading ?? 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : rest.fetchPriority ?? 'auto'}
        className={cn(className, isError && 'opacity-60')}
        onLoad={onLoad}
        onError={(e) => {
          setErroredUrl(src);
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
        src={src}
        alt={alt}
        loading={priority ? 'eager' : rest.loading ?? 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : rest.fetchPriority ?? 'auto'}
        className={cn(
          className,
          'relative z-10 transition-opacity duration-200',
          isLoaded ? 'opacity-100' : 'opacity-0'
        )}
        onLoad={(e) => {
          setLoadedUrl(src);
          onLoad?.(e);
        }}
        onError={(e) => {
          setErroredUrl(src);
          onError?.(e);
        }}
        {...rest}
      />
    </div>
  );
}
