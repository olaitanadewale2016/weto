'use client';

import React, { useEffect } from 'react';
import { cn } from '@/lib/utils';

interface ActionSheetProps {
  open: boolean;
  onClose: () => void;
  muted?: boolean;
  children: React.ReactNode;
}

/**
 * Replicates PHP mobile bottom sheet (`mobile/components/general/sheets/ActionSheet.vue`).
 */
export function ActionSheet({ open, onClose, muted = true, children }: ActionSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-100 flex flex-col bg-black/70 pt-14"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'relative max-h-[85vh] flex flex-col mt-auto rounded-t-3xl',
          muted ? 'bg-bg-sc' : 'bg-bg-pr'
        )}
      >
        <button
          type="button"
          onClick={onClose}
          className="flex justify-center cursor-pointer h-12 shrink-0 items-center w-full"
          aria-label="Close sheet"
        >
          <span className="w-10 h-[3px] bg-lab-sc rounded-full" />
        </button>

        <div className="flex-1 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pb-safe-standalone">{children}</div>
      </div>
    </div>
  );
}

export function ActionSheetGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-bg-pr overflow-hidden divide-y divide-bord-sc">{children}</div>
  );
}

export function ActionSheetItem({
  label,
  icon: Icon,
  danger = false,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center justify-between px-5 py-3.5 leading-none cursor-pointer hover:bg-fill-qt transition-colors text-left',
        danger ? 'text-red-900' : 'text-lab-pr2'
      )}
    >
      <span className="text-par-m font-semibold flex-1 truncate mr-3">{label}</span>
      <Icon className="size-5 shrink-0" />
    </button>
  );
}
