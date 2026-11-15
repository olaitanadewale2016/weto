import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'brand';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
      primary: 'bg-lab-pr2 text-bg-pr border border-lab-pr2 hover:opacity-90',
      brand: 'bg-fill-qt text-brand-900 font-semibold hover:bg-fill-tr border border-transparent',
      secondary: 'bg-fill-qt text-lab-pr border border-fill-fv hover:bg-fill-tr',
      outline: 'border border-bord-card bg-transparent text-lab-pr2 hover:bg-fill-fv',
      ghost: 'border border-transparent bg-transparent text-lab-sc hover:bg-fill-qt hover:text-lab-pr',
      danger: 'bg-fill-qt text-red-900 border border-transparent hover:bg-fill-tr',
    };

    const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
      sm: 'py-2.5 px-4 text-par-s rounded-full',
      md: 'py-3 px-6 text-par-n rounded-full',
      lg: 'py-4 px-8 text-par-m rounded-full',
      icon: 'size-9 rounded-full p-0',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-semibold smoothing cursor-pointer select-none disabled:opacity-60 disabled:pointer-events-none active:scale-[0.98]',
          variants[variant],
          sizes[size],
          'leading-none',
          className
        )}
        {...props}
      >
        {loading ? (
          size === 'icon' ? (
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          ) : (
            <span className="inline-flex items-center px-4 h-4">
              <span className="colibri-primary-animation inline-block" aria-hidden="true" />
            </span>
          )
        ) : (
          children
        )}
      </button>
    );
  }
);
Button.displayName = 'Button';
