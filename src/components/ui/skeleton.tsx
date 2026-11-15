import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl bg-fill-sc', className)} />;
}

export function FeedSkeleton() {
  return (
    <div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-4 border-b border-bord-pr last:border-none">
          <div className="flex justify-between items-center pb-3">
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-9 rounded-full shrink-0" />
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-2.5 w-14" />
              </div>
            </div>
            <Skeleton className="size-6 rounded-full" />
          </div>
          <div className="ml-[44px] space-y-3">
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-8/12" />
              <Skeleton className="h-3 w-4/12" />
            </div>
            <Skeleton className="h-44 w-full" />
            <div className="flex justify-between items-center pt-1">
              <div className="flex gap-2">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-12" />
              </div>
              <Skeleton className="h-4 w-6" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
