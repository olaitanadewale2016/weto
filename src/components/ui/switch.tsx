'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn('flex items-center justify-between gap-4 cursor-pointer', disabled && 'opacity-50')}>
      {(label || description) && (
        <div className="min-w-0 flex-1">
          {label && <p className="text-par-n font-medium text-lab-pr">{label}</p>}
          {description && <p className="text-cap-l text-lab-sc">{description}</p>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer',
          checked ? 'bg-brand-900' : 'bg-fill-tr'
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5',
            checked ? 'translate-x-5.5 ml-0.5' : 'translate-x-0.5'
          )}
        />
      </button>
    </label>
  );
}
