'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, Users } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { FeedList } from '@/components/feed/FeedList';
import { Tabs } from '@/components/ui/tabs';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/providers/ToastProvider';

interface UserResult {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  avatar: string;
  bio?: string;
  verified?: boolean;
}

function ExploreContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { success, error } = useToast();

  const initialQ = searchParams.get('q') || '';
  const initialTag = searchParams.get('tag') || '';

  const [query, setQuery] = useState(initialQ);
  const [activeTab, setActiveTab] = useState<'posts' | 'trending' | 'people'>('posts');
  const [people, setPeople] = useState<UserResult[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);

  useEffect(() => {
    const nextQ = searchParams.get('q') || '';
    const id = setTimeout(() => setQuery(nextQ), 0);
    return () => clearTimeout(id);
  }, [searchParams]);

  useEffect(() => {
    if (activeTab !== 'people') return;
    let cancelled = false;
    const id = setTimeout(() => {
      setLoadingPeople(true);
      apiFetch<UserResult[] | { users: UserResult[] }>(`/users?q=${encodeURIComponent(query)}&limit=25`)
        .then((res) => {
          if (!cancelled) setPeople(Array.isArray(res) ? res : res?.users || []);
        })
        .catch(() => {
          if (!cancelled) setPeople([]);
        })
        .finally(() => {
          if (!cancelled) setLoadingPeople(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [activeTab, query]);

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qs = new URLSearchParams();
    if (query.trim()) qs.set('q', query.trim());
    router.push(`/explore?${qs.toString()}`);
  }

  async function toggleFollow(targetUserId: string) {
    try {
      const res = await apiFetch<{ following: boolean }>('/relations', {
        method: 'POST',
        json: { action: 'follow', targetUserId },
      });
      success(res.following ? 'Following user' : 'Unfollowed user');
    } catch (err) {
      error('Action failed', err instanceof Error ? err.message : undefined);
    }
  }

  return (
    <div>
      <div className="sticky top-14 md:top-0 z-20 bg-bg-pr/95 backdrop-blur-md border-b border-bord-pr">
        <div className="p-4">
          <form onSubmit={onSearchSubmit} className="relative rounded-full border border-bord-card/80 bg-bg-pr focus-within:border-bord-pr transition-colors">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-lab-sc" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search posts, #hashtags, or people..."
              className="w-full h-11 rounded-full bg-transparent pl-10 pr-4 text-par-n text-lab-pr2 placeholder:text-lab-tr outline-hidden"
            />
          </form>
          {initialTag && (
            <div className="mt-2 flex items-center justify-between rounded-xl bg-fill-qt border border-bord-tr px-3 py-1.5 text-cap-l text-lab-pr2">
              <span>Filtering by #{initialTag}</span>
              <Link href="/explore" className="font-semibold text-brand-900 hover:underline">
                Clear filter
              </Link>
            </div>
          )}
        </div>
        <Tabs
          value={activeTab}
          onChange={(k) => setActiveTab(k as 'posts' | 'trending' | 'people')}
          tabs={[
            { key: 'posts', label: 'Publications' },
            { key: 'trending', label: 'Trending' },
            { key: 'people', label: 'People' },
          ]}
        />
      </div>

      {activeTab === 'people' ? (
        <div className="divide-y divide-bord-pr">
          {loadingPeople && <p className="text-par-n text-lab-sc text-center py-6">Searching people...</p>}
          {!loadingPeople && people.length === 0 && (
            <div className="p-6">
              <EmptyState icon={Users} title="No matching users" description="Try another name or username." />
            </div>
          )}
          {people.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-fill-qt/40 transition-colors"
            >
              <Link href={`/@${p.username}`} className="flex items-center gap-3 min-w-0">
                <Avatar src={p.avatar} alt={p.username} verified={p.verified} size="sm" />
                <div className="min-w-0">
                  <p className="text-par-n font-bold text-lab-pr truncate">
                    {p.firstName} {p.lastName}
                  </p>
                  <p className="text-cap-l text-lab-sc truncate">@{p.username}</p>
                  {p.bio && <p className="text-cap-l text-lab-sc line-clamp-1 mt-0.5">{p.bio}</p>}
                </div>
              </Link>
              <Button size="sm" variant="primary" onClick={() => toggleFollow(p.id)}>
                Follow
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <FeedList
          mode={activeTab === 'trending' ? 'trending' : 'explore'}
          hashtag={initialTag || undefined}
          query={searchParams.get('q') || undefined}
        />
      )}
    </div>
  );
}

export default function ExplorePage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="p-6 text-lab-sc">Loading explore...</div>}>
        <ExploreContent />
      </Suspense>
    </AppShell>
  );
}
