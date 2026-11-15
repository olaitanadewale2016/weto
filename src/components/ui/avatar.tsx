'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AvatarProps {
  src?: string | null;
  alt?: string;
  fallback?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  verified?: boolean;
  online?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-[38px] w-[38px] text-cap-s',
  md: 'h-[52px] w-[52px] text-par-s',
  lg: 'h-14 w-14 text-par-l',
  xl: 'h-24 w-24 text-title-2',
};

export function normalizeAvatarSrc(src?: string | null): string | undefined {
  if (!src) return undefined;
  let trimmed = src.trim();
  if (!trimmed) return undefined;
  if (
    !trimmed.startsWith('http://') &&
    !trimmed.startsWith('https://') &&
    !trimmed.startsWith('/') &&
    !trimmed.startsWith('blob:') &&
    !trimmed.startsWith('data:')
  ) {
    trimmed = `/${trimmed}`;
  }
  if (trimmed === '/assets/avatars/default.png' || trimmed === '/assets/avatars/default') {
    return '/assets/avatars/default-avatar.png';
  }
  return trimmed;
}

export function normalizeCoverSrc(src?: string | null): string {
  if (!src) return '/assets/covers/default-cover.png';
  let trimmed = src.trim();
  if (!trimmed || trimmed === '/assets/covers/default.png') {
    return '/assets/covers/default-cover.png';
  }
  if (
    !trimmed.startsWith('http://') &&
    !trimmed.startsWith('https://') &&
    !trimmed.startsWith('/') &&
    !trimmed.startsWith('blob:') &&
    !trimmed.startsWith('data:')
  ) {
    trimmed = `/${trimmed}`;
  }
  return trimmed;
}

export function Avatar({
  src,
  alt = 'Avatar',
  fallback,
  size = 'md',
  verified,
  online,
  className,
}: AvatarProps) {
  const normalizedSrc = React.useMemo(() => normalizeAvatarSrc(src), [src]);
  const [failedForSrc, setFailedForSrc] = React.useState<string | null>(null);
  const [exhaustedForSrc, setExhaustedForSrc] = React.useState<string | null>(null);

  const fallbackApplied = normalizedSrc != null && failedForSrc === normalizedSrc;
  const imgError = normalizedSrc != null && exhaustedForSrc === normalizedSrc;
  const effectiveSrc = fallbackApplied ? '/assets/avatars/default-avatar.png' : normalizedSrc;
  const initials = (fallback || alt || 'U').slice(0, 2).toUpperCase();

  return (
    <div className={cn('relative inline-flex shrink-0 rounded-full', SIZE_CLASSES[size], className)}>
      {effectiveSrc && !imgError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={effectiveSrc}
          alt={alt}
          decoding="async"
          onError={() => {
            if (normalizedSrc && !fallbackApplied && normalizedSrc !== '/assets/avatars/default-avatar.png') {
              setFailedForSrc(normalizedSrc);
            } else if (normalizedSrc) {
              setExhaustedForSrc(normalizedSrc);
            }
          }}
          className="h-full w-full rounded-full object-cover bg-fill-sc border border-bord-card"
        />
      ) : (
        <div className="h-full w-full rounded-full bg-fill-tr text-lab-pr font-semibold flex items-center justify-center border border-bord-card">
          {initials}
        </div>
      )}
      {online && (
        <span
          aria-label="Online"
          className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-900 ring-2 ring-bg-pr"
        />
      )}
      {verified && (
        <span
          title="Verified"
          className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-brand-900 text-white flex items-center justify-center ring-2 ring-bg-pr"
        >
          <Check className="h-2.5 w-2.5 stroke-[3]" />
        </span>
      )}
    </div>
  );
}

export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <span
      title="Verified"
      className={cn(
        'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-900 text-white align-middle',
        className
      )}
    >
      <Check className="h-2.5 w-2.5 stroke-[3]" />
    </span>
  );
}
