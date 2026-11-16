'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastVariant = 'default' | 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (opts: { title: string; description?: string; variant?: ToastVariant; durationMs?: number }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({
      title,
      description,
      variant = 'default',
      durationMs = 4200,
    }: {
      title: string;
      description?: string;
      variant?: ToastVariant;
      durationMs?: number;
    }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-4), { id, title, description, variant }]);
      setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss]
  );

  const success = useCallback(
    (title: string, description?: string) => toast({ title, description, variant: 'success' }),
    [toast]
  );
  const error = useCallback(
    (title: string, description?: string) => toast({ title, description, variant: 'error', durationMs: 5500 }),
    [toast]
  );
  const info = useCallback(
    (title: string, description?: string) => toast({ title, description, variant: 'info' }),
    [toast]
  );

  return (
    <ToastContext.Provider value={{ toast, success, error, info }}>
      {children}
      {/* Desktop ToastNotification.vue: bottom-right pill with border-green-900 / border-red-900 */}
      <div
        aria-live="polite"
        className="fixed bottom-6 left-6 right-6 z-[120] hidden md:flex flex-col items-end gap-2 pointer-events-none"
      >
        {toasts.map((item) => {
          const message = item.description ? `${item.title}: ${item.description}` : item.title;
          return (
            <div
              key={item.id}
              className={cn(
                'pointer-events-auto flex items-center leading-4 max-w-[460px] rounded-xl border pl-5 pr-3 shadow-2xl backdrop-blur-md bg-bg-pr/95 transition-all',
                item.variant === 'success'
                  ? 'border-green-900'
                  : item.variant === 'error'
                    ? 'border-red-900'
                    : 'border-bord-pr'
              )}
            >
              <div className="text-par-m pr-4 text-lab-pr flex-1 py-4 leading-snug break-words">
                {message}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="text-lab-pr hover:bg-fill-qt p-1.5 rounded-full shrink-0 cursor-pointer transition-colors"
                aria-label="Close notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Mobile ToastNotification.vue: full-width top edge bar matching PHP Mobile ToastItem.vue */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed top-0 left-0 right-0 pt-safe z-[120] md:hidden bg-bg-pr/95 backdrop-blur-md shadow-sm pointer-events-auto"
        >
          {toasts.map((item) => {
            const message = item.description ? `${item.title}: ${item.description}` : item.title;
            const isSuccess = item.variant === 'success';
            const isError = item.variant === 'error';
            return (
              <div key={item.id} className="px-4 border-b border-bord-pr">
                <div className="flex items-center leading-4">
                  <div
                    className={cn(
                      'size-4 shrink-0 flex items-center justify-center',
                      isSuccess ? 'text-green-900' : isError ? 'text-red-900' : 'text-brand-900'
                    )}
                  >
                    {isSuccess ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : isError ? (
                      <AlertCircle className="h-4 w-4" />
                    ) : (
                      <Info className="h-4 w-4" />
                    )}
                  </div>
                  <div
                    className={cn(
                      'text-par-s px-2.5 flex-1 py-3.5 leading-snug break-words',
                      isError ? 'text-red-900' : 'text-lab-pr'
                    )}
                  >
                    {message}
                  </div>
                  <div className="text-lab-sc shrink-0 pl-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => dismiss(item.id)}
                      className="size-6 inline-flex items-center justify-center outline-hidden cursor-pointer opacity-80 hover:opacity-100 rounded-full"
                      aria-label="Close notification"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
