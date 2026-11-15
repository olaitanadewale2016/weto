import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const generatedId = React.useId();
    const areaId = id || generatedId;
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={areaId} className="block text-cap-l font-semibold text-lab-pr">
            {label}
          </label>
        )}
        <textarea
          id={areaId}
          ref={ref}
          className={cn(
            'w-full min-h-24 max-h-96 rounded-xl bg-input-pr border border-transparent focus:border-bord-pr px-4 py-4 text-par-m text-lab-pr placeholder:text-lab-tr tracking-normal outline-hidden resize-y transition-all duration-300',
            error && 'border-red-900 focus:border-red-900',
            className
          )}
          {...props}
        />
        {error && <p className="text-cap-s text-red-900 font-medium">{error}</p>}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
