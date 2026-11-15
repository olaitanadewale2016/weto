'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Hash, Search, Sparkles } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { apiFetch } from '@/lib/api-client';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';

interface SuggestedUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  caption?: string;
  bio?: string;
  avatar: string;
  verified: boolean;
  followersCount: number;
  isFollowing?: boolean;
}

interface HashtagItem {
  tag: string;
  postsCount: number;
}

interface FeedAd {
  id: string;
  title: string;
  content: string;
  ctaText: string;
  targetUrl: string;
  media?: { url?: string; publicUrl?: string } | null;
}

const rightRailCache: {
  ts: number;
  hashtags: HashtagItem[];
  suggested: SuggestedUser[];
  ad: FeedAd | null;
  greeting: string;
  greetingKey: string;
  hasData: boolean;
} = {
  ts: 0,
  hashtags: [],
  suggested: [],
  ad: null,
  greeting: '',
  greetingKey: '',
  hasData: false,
};

export function RightRail() {
  const router = useRouter();
  const { user, bootstrap, locale } = useApp();
  const { success, error } = useToast();
  const [query, setQuery] = useState('');
  const [hashtags, setHashtags] = useState<HashtagItem[]>(() =>
    rightRailCache.hasData ? rightRailCache.hashtags : []
  );
  const [suggested, setSuggested] = useState<SuggestedUser[]>(() =>
    rightRailCache.hasData ? rightRailCache.suggested : []
  );
  const [ad, setAd] = useState<FeedAd | null>(() =>
    rightRailCache.hasData ? rightRailCache.ad : null
  );
  const [greetingState, setGreetingState] = useState<{ key: string; message: string }>(() => ({
    key: rightRailCache.greetingKey,
    message: rightRailCache.greeting,
  }));
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const expectedGreetingKey = user?.id ? `${user.id}:${locale}` : '';
  const greeting =
    expectedGreetingKey && greetingState.key === expectedGreetingKey
      ? greetingState.message
      : expectedGreetingKey && rightRailCache.greetingKey === expectedGreetingKey
        ? rightRailCache.greeting
        : '';

  useEffect(() => {
    const isFresh = rightRailCache.hasData && Date.now() - rightRailCache.ts < 60_000;
    if (isFresh) return;

    const adsEnabled = bootstrap?.config?.features?.ads !== false;
    Promise.all([
      apiFetch<{ hashtags: HashtagItem[] }>('/hashtags?limit=5').catch(() => null),
      apiFetch<SuggestedUser[] | { users: SuggestedUser[] }>('/users?mode=recommended&limit=4').catch(() => null),
      adsEnabled ? apiFetch<FeedAd | null>('/ads').catch(() => null) : Promise.resolve(null),
    ]).then(([hashRes, userRes, adRes]) => {
      if (hashRes?.hashtags) {
        rightRailCache.hashtags = hashRes.hashtags;
        setHashtags(hashRes.hashtags);
      }
      if (userRes) {
        const usersList = Array.isArray(userRes) ? userRes : userRes.users || [];
        rightRailCache.suggested = usersList;
        setSuggested(usersList);
      }
      const nextAd = adRes && adRes.id ? adRes : null;
      rightRailCache.ad = nextAd;
      setAd(nextAd);
      rightRailCache.hasData = true;
      rightRailCache.ts = Date.now();
    });
  }, [bootstrap?.config?.features?.ads]);

  // Exact PHP AdGridItem.vue 5-minute ad rotation interval
  useEffect(() => {
    const adsEnabled = bootstrap?.config?.features?.ads !== false;
    if (!adsEnabled) return;
    const timer = setInterval(() => {
      const prevId = rightRailCache.ad?.id || '';
      const qs = prevId ? `?prevAdId=${encodeURIComponent(prevId)}` : '';
      apiFetch<FeedAd | null>(`/ads${qs}`)
        .then((res) => {
          if (res && res.id) {
            rightRailCache.ad = res;
            setAd(res);
          }
        })
        .catch(() => undefined);
    }, 5 * 60_000);
    return () => clearInterval(timer);
  }, [bootstrap?.config?.features?.ads]);

  useEffect(() => {
    if (!expectedGreetingKey) return;
    if (rightRailCache.greetingKey === expectedGreetingKey && rightRailCache.greeting) {
      return;
    }
    let cancelled = false;
    apiFetch<{ message?: string }>(`/ai/greeting-message?locale=${encodeURIComponent(locale)}`)
      .then((res) => {
        if (!cancelled && res?.message) {
          rightRailCache.greeting = res.message;
          rightRailCache.greetingKey = expectedGreetingKey;
          setGreetingState({ key: expectedGreetingKey, message: res.message });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [expectedGreetingKey, locale]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/explore?q=${encodeURIComponent(query.trim())}`);
  }

  async function handleFollow(targetId: string) {
    if (!user) {
      router.push('/auth/login');
      return;
    }
    try {
      const res = await apiFetch<{ following: boolean }>('/relations', {
        method: 'POST',
        json: { action: 'follow', targetUserId: targetId },
      });
      setFollowingIds((prev) => {
        const next = new Set(prev);
        if (res.following) next.add(targetId);
        else next.delete(targetId);
        return next;
      });
      success(res.following ? 'Following user' : 'Unfollowed user');
    } catch (err) {
      error('Could not update follow', err instanceof Error ? err.message : undefined);
    }
  }

  async function handleAdClick(adItem: FeedAd) {
    apiFetch('/ads', {
      method: 'PATCH',
      json: { action: 'impression', adId: adItem.id },
    }).catch(() => undefined);
    window.open(adItem.targetUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <aside className="hidden lg:block flex-1 max-w-[360px] shrink-0">
      <div className="sticky top-4 max-h-screen overflow-y-auto hidden-scroll pb-12 space-y-5 pt-4 pr-4">
        {/* Clean PHP SearchBar.vue */}
        <form onSubmit={handleSearch} className="relative rounded-full border border-bord-card/80 bg-bg-pr focus-within:border-bord-pr transition-colors">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-lab-sc" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="w-full h-11 rounded-full bg-transparent pl-10 pr-4 text-par-n text-lab-pr2 placeholder:text-lab-tr outline-hidden"
          />
        </form>

        {/* PHP GreetingMessage.vue parity */}
        {user && greeting && (
          <div className="rounded-2xl border border-bord-pr bg-fill-qt px-4 py-3 flex items-start gap-2.5">
            <Sparkles className="size-4 text-brand-900 shrink-0 mt-0.5" />
            <p className="text-par-s text-lab-pr2 leading-snug">{greeting}</p>
          </div>
        )}

        {/* Guest Auth CTA */}
        {!user && (
          <div className="border border-bord-pr rounded-2xl p-4 space-y-3">
            <h5 className="text-lab-pr2 font-semibold text-par-l">Join {bootstrap?.config?.appName || 'Weto'}</h5>
            <p className="text-par-s text-lab-sc">
              Sign in or create an account to publish updates, message friends, and access Marketplace.
            </p>
            <div className="flex flex-col gap-2">
              <Link
                href="/auth/signup"
                className="w-full py-2.5 px-4 text-center rounded-full bg-lab-pr2 text-bg-pr font-semibold text-par-n hover:opacity-90"
              >
                Create account
              </Link>
              <Link
                href="/auth/login"
                className="w-full py-2.5 px-4 text-center rounded-full border border-bord-pr bg-transparent text-lab-pr2 font-semibold text-par-n hover:bg-fill-qt smoothing"
              >
                Sign in
              </Link>
            </div>
          </div>
        )}

        {/* Borderless FollowRecommendationList matching FollowRecommendationList.vue */}
        {suggested.length > 0 && (
          <div className="mb-4">
            <div className="mb-2">
              <h5 className="text-lab-pr2 font-semibold text-par-l">Follow recommendations</h5>
            </div>
            <div className="block">
              {suggested.map((su) => {
                const isFollowing = followingIds.has(su.id) || su.isFollowing;
                return (
                  <div key={su.id} className="py-3">
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <Link href={`/@${su.username}`} className="flex items-center gap-2 min-w-0">
                        <Avatar src={su.avatar} alt={su.username} verified={su.verified} size="sm" />
                        <div className="min-w-0">
                          <p className="text-par-n font-semibold text-lab-pr2 truncate">
                            {su.firstName} {su.lastName}
                          </p>
                          <p className="text-cap-l text-lab-sc truncate">@{su.username}</p>
                        </div>
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleFollow(su.id)}
                        className={`shrink-0 rounded-full px-3.5 py-1.5 text-cap-l font-semibold cursor-pointer ${
                          isFollowing
                            ? 'bg-fill-qt text-lab-pr2 border border-bord-pr'
                            : 'bg-lab-pr2 text-bg-pr border border-lab-pr2'
                        }`}
                      >
                        {isFollowing ? 'Following' : 'Follow'}
                      </button>
                    </div>
                    {su.bio && (
                      <div className="ml-[38px] pl-2 pr-4">
                        <p className="text-par-n text-lab-pr2 line-clamp-2">{su.bio}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div>
              <Link href="/explore" className="text-par-m hover:underline text-lab-sc cursor-pointer">
                More suggestions
              </Link>
            </div>
          </div>
        )}

        {/* Trending Hashtags (clean borderless section) */}
        {hashtags.length > 0 && (
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <h5 className="text-lab-pr2 font-semibold text-par-l">Trending</h5>
              <Link href="/explore" className="text-cap-l text-brand-900 hover:underline">
                See all
              </Link>
            </div>
            <div className="divide-y divide-bord-tr">
              {hashtags.map((h) => (
                <Link
                  key={h.tag}
                  href={`/explore?tag=${encodeURIComponent(h.tag)}`}
                  className="flex items-center justify-between py-2.5 hover:opacity-80 transition-opacity"
                >
                  <span className="flex items-center gap-1.5 text-par-n font-medium text-lab-pr2">
                    <Hash className="size-3.5 text-lab-sc" />
                    {h.tag}
                  </span>
                  <span className="text-cap-l text-lab-sc">{h.postsCount} posts</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Exact AdGridItem.vue card */}
        {ad && (
          <div className="border border-bord-pr rounded-2xl overflow-hidden">
            <div className="overflow-hidden relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="w-full object-cover max-h-48"
                src={ad.media?.publicUrl || ad.media?.url || '/assets/ads/default-preview.png'}
                alt={ad.title}
              />
              <span className="absolute top-3 bg-black/20 leading-none text-white left-3 backdrop-blur-xs px-2 py-1.5 rounded-full text-cap-s">
                Ad &middot; 16+
              </span>
            </div>
            <div className="p-4">
              <h4 className="font-semibold text-par-l text-lab-pr mb-1">{ad.title}</h4>
              <p className="text-lab-sc text-par-s mb-2">{ad.content}</p>
              <span className="block text-lab-sc text-par-s mb-4 truncate">{ad.targetUrl}</span>
              <button
                type="button"
                onClick={() => handleAdClick(ad)}
                className="w-full py-3 px-6 leading-none rounded-full font-semibold bg-fill-qt text-lab-pr2 hover:bg-fill-tr text-par-n cursor-pointer smoothing"
              >
                {ad.ctaText || 'Learn More'}
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
