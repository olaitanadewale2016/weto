import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('fb-shimmer rounded-2xl bg-fill-sc', className)} />;
}

/**
 * Facebook-inspired Post Loading Shimmer UI for both Desktop & Mobile feeds.
 */
export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, idx) => {
        const showMedia = idx % 2 === 0;
        return (
          <div key={idx} className="bg-bg-pr border-b border-bord-tr">
            <div className="p-4 space-y-3.5">
              {/* Author Header Row */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Skeleton className="size-10 rounded-full shrink-0" />
                  <div className="space-y-2">
                    <Skeleton className="h-3.5 w-36 rounded-full" />
                    <Skeleton className="h-2.5 w-24 rounded-full" />
                  </div>
                </div>
                <Skeleton className="size-8 rounded-full shrink-0" />
              </div>

              {/* Full-Width Post Text Lines */}
              <div className="space-y-2 pt-0.5">
                <Skeleton className="h-3.5 w-full rounded-full" />
                <Skeleton className="h-3.5 w-11/12 rounded-full" />
                {!showMedia && <Skeleton className="h-3.5 w-7/12 rounded-full" />}
              </div>

              {/* Alternating Facebook-style Media Placeholder */}
              {showMedia && (
                <Skeleton className="h-56 sm:h-64 w-full rounded-2xl" />
              )}

              {/* Bottom Facebook Action Bar Shimmer */}
              <div className="pt-2.5 border-t border-bord-tr grid grid-cols-3 gap-3">
                <div className="flex justify-center">
                  <Skeleton className="h-4 w-16 rounded-full" />
                </div>
                <div className="flex justify-center">
                  <Skeleton className="h-4 w-16 rounded-full" />
                </div>
                <div className="flex justify-center">
                  <Skeleton className="h-4 w-16 rounded-full" />
                </div>
              </div>
            </div>
            <div className="h-2 bg-fill-fv/50 border-t border-bord-tr/60" />
          </div>
        );
      })}
    </div>
  );
}
