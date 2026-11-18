'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bookmark } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { FeedList } from '@/components/feed/FeedList';
import { useApp } from '@/components/providers/AppContext';
import { EmptyState } from '@/components/ui/empty-state';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function BookmarksPage() {
  const router = useRouter();
  const { user } = useApp();

  return (
    <AppShell hideMobileHeader>
      {/* Exact Header matching Notifications, Marketplace & App UI */}
      <div className="sticky top-0 z-20 pt-safe px-safe bg-bg-pr/95 backdrop-blur-md border-b border-bord-pr">
        <div className="px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => router.back()}
              className="md:hidden p-1.5 -ml-1.5 rounded-full text-lab-pr hover:bg-fill-tr cursor-pointer shrink-0"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-title-3 font-bold text-lab-pr truncate">Saved &amp; Bookmarks</h1>
              <p className="text-cap-l text-lab-sc truncate">Posts, products, and jobs you saved for later.</p>
            </div>
          </div>
        </div>

        {/* Tab Switcher: Posts vs Products vs Jobs */}
        <div className="flex border-t border-bord-tr/60 px-2">
          <Link
            href="/bookmarks"
            className="flex-1 py-2.5 text-center text-par-s font-semibold text-brand-900 border-b-2 border-brand-900"
          >
            Posts
          </Link>
          <Link
            href="/saved/products"
            className="flex-1 py-2.5 text-center text-par-s font-semibold text-lab-sc hover:text-lab-pr border-b-2 border-transparent transition-colors"
          >
            Products
          </Link>
          <Link
            href="/saved/jobs"
            className="flex-1 py-2.5 text-center text-par-s font-semibold text-lab-sc hover:text-lab-pr border-b-2 border-transparent transition-colors"
          >
            Jobs
          </Link>
        </div>
      </div>

      {user ? (
        <FeedList mode="bookmarks" />
      ) : (
        <div className="p-6">
          <EmptyState
            icon={Bookmark}
            title="Sign in to view your bookmarks"
            description="Sign in to save and access your favorite publications anywhere."
            action={
              <Link href="/auth/login">
                <Button variant="primary">Sign in</Button>
              </Link>
            }
          />
        </div>
      )}
    </AppShell>
  );
}
