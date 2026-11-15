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
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  maxWidthClass = 'max-w-lg',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/55 backdrop-blur-xs overflow-x-hidden">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-10 w-full rounded-3xl bg-bg-pr border border-bord-pr shadow-vertical-tr overflow-hidden max-h-[90dvh] flex flex-col min-w-0',
          maxWidthClass
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-bord-pr shrink-0">
            <div className="min-w-0">
              {title && <h2 className="text-par-l font-bold text-lab-pr truncate">{title}</h2>}
              {description && <p className="text-cap-l text-lab-sc mt-0.5">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-lab-sc hover:bg-fill-sc hover:text-lab-pr shrink-0"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="overflow-y-auto overflow-x-hidden p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}
