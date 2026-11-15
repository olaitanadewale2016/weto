import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'outline';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const styles: Record<NonNullable<BadgeProps['variant']>, string> = {
    default: 'bg-fill-sc text-lab-pr',
    brand: 'bg-brand-900/12 text-brand-900',
    success: 'bg-green-900/12 text-green-900',
    warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    danger: 'bg-red-900/12 text-red-900',
    outline: 'border border-bord-pr text-lab-sc bg-transparent',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-cap-s font-semibold',
        styles[variant],
        className
      )}
      {...props}
    />
  );
}
