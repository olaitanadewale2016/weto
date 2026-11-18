'use client';

import React from 'react';
import { ArrowLeft, Bookmark } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { FeedList } from '@/components/feed/FeedList';
import { useApp } from '@/components/providers/AppContext';
import { EmptyState } from '@/components/ui/empty-state';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function BookmarksPage() {
  const { user } = useApp();

  return (
    <AppShell hideMobileHeader>
      <div className="sticky top-0 z-20 pt-safe px-safe border-b border-bord-pr bg-bg-pr/95 backdrop-blur-md px-4 py-3.5 flex items-center gap-3">
        <Link href="/" className="md:hidden p-1.5 -ml-1.5 rounded-full text-lab-pr hover:bg-fill-tr">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-title-3 font-bold text-lab-pr">Saved Bookmarks</h1>
          <p className="text-cap-l text-lab-sc">Publications you saved for later reading.</p>
        </div>
      </div>

      {user ? (
        <FeedList mode="bookmarks" />
      ) : (
        <div className="p-6">
          <EmptyState
            icon={Bookmark}
            title="Sign in to view your bookmarks"
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
