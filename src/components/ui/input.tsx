import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-cap-l font-semibold text-lab-pr">
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={cn(
            'w-full h-12 rounded-xl bg-input-pr border border-transparent focus:border-bord-pr px-4 text-par-m text-lab-pr placeholder:text-lab-tr tracking-normal outline-hidden transition-all duration-300',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error && 'border-red-900 focus:border-red-900',
            className
          )}
          {...props}
        />
        {error && <p className="text-cap-s text-red-900 font-medium">{error}</p>}
        {!error && hint && <p className="text-cap-s text-lab-tr">{hint}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';
