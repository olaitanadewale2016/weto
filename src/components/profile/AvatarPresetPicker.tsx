'use client';

import React from 'react';
import { Check, Sparkles } from 'lucide-react';
import { PRESET_AVATARS } from '@/lib/preset-avatars';
import { cn } from '@/lib/utils';

interface AvatarPresetPickerProps {
  selectedUrl?: string | null;
  onSelect: (avatarUrl: string) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}

/**
 * Illustrated preset avatar selector modeled on Grupo Pro (`fns/form/site_users.php` `choose_avatar`),
 * styled cleanly with Weto design tokens.
 */
export function AvatarPresetPicker({
  selectedUrl,
  onSelect,
  disabled = false,
  compact = false,
  className,
}: AvatarPresetPickerProps) {
  return (
    <div className={cn('space-y-2.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-cap-l font-semibold text-lab-pr">
          <Sparkles className="size-3.5 text-brand-900" />
          Choose a preset avatar
        </span>
        <span className="text-cap-s text-lab-sc">{PRESET_AVATARS.length} styles</span>
      </div>

      <div
        className={cn(
          'grid gap-2',
          compact ? 'grid-cols-5 sm:grid-cols-10' : 'grid-cols-5 sm:grid-cols-6'
        )}
      >
        {PRESET_AVATARS.map((item) => {
          const isSelected = selectedUrl?.trim() === item.url;
          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(item.url)}
              title={item.label}
              aria-label={`Select ${item.label}`}
              aria-pressed={isSelected}
              className={cn(
                'relative aspect-square rounded-full p-0.5 border-2 transition-all cursor-pointer disabled:opacity-50 overflow-hidden bg-fill-qt hover:scale-105',
                isSelected
                  ? 'border-brand-900 ring-2 ring-brand-900/25'
                  : 'border-bord-card hover:border-bord-pr'
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={item.label}
                loading="lazy"
                decoding="async"
                className="w-full h-full rounded-full object-cover block"
              />
              {isSelected && (
                <span className="absolute bottom-0 right-0 size-4 rounded-full bg-brand-900 text-white flex items-center justify-center ring-2 ring-bg-pr">
                  <Check className="size-2.5 stroke-[3]" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
