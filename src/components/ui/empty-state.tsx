import * as React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-14 px-6 rounded-2xl border border-dashed border-bord-pr bg-fill-pr/40',
        className
      )}
    >
      {Icon && (
        <div className="h-12 w-12 rounded-full bg-fill-sc flex items-center justify-center text-lab-sc mb-3">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <h3 className="text-par-l font-bold text-lab-pr">{title}</h3>
      {description && <p className="text-par-n text-lab-sc mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
