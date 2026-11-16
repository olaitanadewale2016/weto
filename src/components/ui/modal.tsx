'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  maxWidthClass?: string;
  bodyClassName?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  maxWidthClass = 'max-w-lg',
  bodyClassName,
}: ModalProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.625rem,env(safe-area-inset-left))] pr-[max(0.625rem,env(safe-area-inset-right))] sm:p-4 bg-black/55 backdrop-blur-xs overflow-x-hidden">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-10 w-full rounded-2xl bg-bg-pr/95 backdrop-blur-md border border-bord-pr shadow-2xl overflow-hidden max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] sm:max-h-[90dvh] flex flex-col min-w-0',
          maxWidthClass
        )}
      >
        {(title || description) && (
          <div className="relative shrink-0 border-b border-bord-pr px-12 py-4 text-center">
            {title && <h2 className="text-par-l font-bold text-lab-pr truncate">{title}</h2>}
            {description && <p className="text-cap-l text-lab-sc mt-0.5">{description}</p>}
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3.5 top-3.5 rounded-full p-1.5 text-lab-sc hover:bg-fill-sc hover:text-lab-pr cursor-pointer transition-colors"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className={cn('overflow-y-auto overflow-x-hidden', bodyClassName ?? 'p-4 sm:p-5')}>
          {children}
        </div>
      </div>
    </div>
  );
}
