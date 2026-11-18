'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

export function Tabs({
  tabs,
  value,
  onChange,
  variant = 'default',
  className,
}: {
  tabs: TabItem[];
  value: string;
  onChange: (key: string) => void;
  variant?: 'default' | 'grid';
  className?: string;
}) {
  if (variant === 'grid') {
    const colsClass =
      tabs.length === 2
        ? 'grid-cols-2'
        : tabs.length === 4
          ? 'grid-cols-4'
          : 'grid-cols-3';

    return (
      <div className={cn('grid border-b border-bord-pr', colsClass, className)}>
        {tabs.map((tab) => {
          const active = tab.key === value;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={cn(
                'relative w-full text-center overflow-hidden truncate leading-4 px-3 py-3 sm:py-3.5 text-[15px] sm:text-par-m font-semibold transition-colors cursor-pointer',
                active ? 'text-lab-pr2' : 'text-lab-sc hover:text-lab-pr'
              )}
            >
              {tab.label}
              {active && (
                <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-lab-pr" />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1 overflow-x-auto border-b border-bord-pr px-2 scrollbar-none',
        className
      )}
    >
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              'relative shrink-0 px-4 py-3 text-par-n font-medium transition-colors cursor-pointer',
              active ? 'text-lab-pr font-semibold' : 'text-lab-sc hover:text-lab-pr'
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              {tab.label}
              {tab.count !== undefined && (
                <span className="rounded-full bg-fill-sc px-1.5 py-0.5 text-cap-s text-lab-sc">
                  {tab.count}
                </span>
              )}
            </span>
            {active && (
              <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-lab-pr" />
            )}
          </button>
        );
      })}
    </div>
  );
}
