import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, children, ...props }, ref) => {
    const generatedId = React.useId();
    const selectId = id || generatedId;
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={selectId} className="block text-cap-l font-semibold text-lab-pr">
            {label}
          </label>
        )}
        <select
          id={selectId}
          ref={ref}
          className={cn(
            'w-full h-12 rounded-xl bg-input-pr border border-transparent focus:border-bord-pr px-4 text-par-m text-lab-pr tracking-normal outline-hidden transition-all duration-300',
            error && 'border-red-900',
            className
          )}
          {...props}
        >
          {children}
        </select>
        {error && <p className="text-cap-s text-red-900 font-medium">{error}</p>}
      </div>
    );
  }
);
Select.displayName = 'Select';
