'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { doc, onSnapshot } from 'firebase/firestore';
import { MessageSquareDashed, PencilLine, RefreshCw } from 'lucide-react';
import { apiFetchWithMeta } from '@/lib/api-client';
import {
  getFirebaseClientFirestore,
  isFirebaseClientConfigured,
  markFirestoreDisabled,
} from '@/lib/firebase/client';
import { useApp } from '@/components/providers/AppContext';
import { PostCard, SerializedPost } from './PostCard';
import { PostComposer } from './PostComposer';
import { FeedAdCard } from '@/components/ads/FeedAdCard';
import { computeFeedAdSlotIndices } from '@/lib/ads-client';
import { FeedSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

interface FeedCacheEntry {
  posts: SerializedPost[];
  hasMore: boolean;
  ts: number;
  userId?: string;
}

const FEED_CACHE_TTL_MS = 25_000;
const FEED_STORAGE_PREFIX = 'weto_feed_cache_v1:';
const feedPostsCache = new Map<string, FeedCacheEntry>();

function readFeedCache(key: string): FeedCacheEntry | undefined {
  const inMemory = feedPostsCache.get(key);
  if (inMemory) return inMemory;
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.sessionStorage.getItem(`${FEED_STORAGE_PREFIX}${key}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as FeedCacheEntry;
    if (parsed && Array.isArray(parsed.posts) && parsed.posts.length > 0) {
      feedPostsCache.set(key, parsed);
      return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return undefined;
}

function writeFeedCache(key: string, entry: FeedCacheEntry): void {
  feedPostsCache.set(key, entry);
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(`${FEED_STORAGE_PREFIX}${key}`, JSON.stringify(entry));
  } catch {
    // ignore storage quota errors
  }
}

/**
 * Merges incoming feed posts with existing in-memory posts so that:
 * 1. Already-decoded media arrays and quotePostId media are preserved if a transient response omits them.
 * 2. On silent refreshes, posts the user already scrolled past (pages 2+) are retained instead of unmounted.
 */
function mergeFeedPostsPreservingMedia(
  prev: SerializedPost[],
  incoming: SerializedPost[],
  keepTrailingPrev: boolean
): SerializedPost[] {
  if (prev.length === 0) return incoming;
  const prevById = new Map(prev.map((p) => [p.id, p]));
  const mergedTop = incoming.map((nextPost) => {
    const existing = prevById.get(nextPost.id);
    if (!existing) return nextPost;
    return {
      ...nextPost,
      media:
        Array.isArray(nextPost.media) && nextPost.media.length > 0
          ? nextPost.media
          : existing.media,
      gifUrl: nextPost.gifUrl || existing.gifUrl,
      quotePostId:
        nextPost.quotePostId && typeof nextPost.quotePostId === 'object'
          ? {
            ...nextPost.quotePostId,
            media:
              Array.isArray(nextPost.quotePostId.media) && nextPost.quotePostId.media.length > 0
                ? nextPost.quotePostId.media
                : existing.quotePostId?.media,
          }
          : existing.quotePostId || nextPost.quotePostId,
    };
  });

  if (!keepTrailingPrev) return mergedTop;
  const seenIds = new Set(mergedTop.map((p) => p.id));
  const trailing = prev.filter((p) => !seenIds.has(p.id));
  return [...mergedTop, ...trailing];
}

export function FeedList({
  mode = 'feed',
  username,
  hashtag,
  query,
  composerEnabled = false,
}: {
  mode?: 'feed' | 'explore' | 'trending' | 'bookmarks' | 'user' | 'user_media';
  username?: string;
  hashtag?: string;
  query?: string;
  composerEnabled?: boolean;
}) {
  const { user, loading: authLoading } = useApp();
  const currentUserId = user?.id;
  const cacheKey = `${mode}:${username || ''}:${hashtag || ''}:${query || ''}`;
  const cachedEntry = readFeedCache(cacheKey);
  const [posts, setPosts] = useState<SerializedPost[]>(() => cachedEntry?.posts || []);
  const [composerOpen, setComposerOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(() => cachedEntry?.hasMore ?? false);
  const [loading, setLoading] = useState(() => !cachedEntry || cachedEntry.posts.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const [quotePost, setQuotePost] = useState<SerializedPost | null>(null);
  const [feedAdSeed] = useState(() => Math.floor(Math.random() * 1000) + 1);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const adSlotSet =
    mode === 'feed' || mode === 'explore' || mode === 'trending' || mode === 'bookmarks'
      ? computeFeedAdSlotIndices(posts.length, mode, feedAdSeed)
      : null;

  const loadPosts = useCallback(
    async (pageNum: number, append: boolean, silent = false) => {
      if (append) {
        setLoadingMore(true);
      } else if (!silent) {
        setPosts((prev) => {
          if (prev.length === 0) setLoading(true);
          return prev;
        });
      }

      try {
        const qs = new URLSearchParams({ mode, page: String(pageNum), limit: '15' });
        if (username) qs.set('username', username);
        if (hashtag) qs.set('hashtag', hashtag);
        if (query) qs.set('q', query);

        const res = await apiFetchWithMeta<SerializedPost[]>(`/posts?${qs.toString()}`);
        const rows = Array.isArray(res.data) ? res.data : [];
        const metaObj = (res.meta || {}) as { total?: number; hasMore?: boolean };
        let mergedRows = rows;
        setPosts((prev) => {
          if (!append) {
            if (rows.length === 0 && prev.length > 0 && silent) {
              mergedRows = prev;
              return prev;
            }
            mergedRows = mergeFeedPostsPreservingMedia(prev, rows, silent);
            return mergedRows;
          }
          const seen = new Set(prev.map((p) => p.id));
          mergedRows = [...prev, ...rows.filter((p) => !seen.has(p.id))];
          return mergedRows;
        });
        const nextHasMore =
          typeof metaObj.hasMore === 'boolean'
            ? metaObj.hasMore
            : mergedRows.length < Number(metaObj.total || rows.length);
        setHasMore(nextHasMore);
        if (!append && mergedRows.length > 0) {
          writeFeedCache(cacheKey, {
            posts: mergedRows,
            hasMore: nextHasMore,
            ts: Date.now(),
            userId: currentUserId,
          });
        }
      } catch {
        // Facebook / Instagram resilience: never clear already-loaded posts & media on network glitch
        if (!append) {
          setPosts((prev) => (prev.length > 0 ? prev : []));
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [mode, username, hashtag, query, cacheKey, currentUserId]
  );

  useEffect(() => {
    const cached = readFeedCache(cacheKey);
    const id = setTimeout(() => {
      if (cached && cached.posts.length > 0) {
        setPosts(cached.posts);
        setHasMore(cached.hasMore);
        setLoading(false);
      }
      const isFresh =
        cached &&
        Date.now() - cached.ts < FEED_CACHE_TTL_MS &&
        (authLoading || cached.userId === currentUserId);
      if (!isFresh) {
        setPage(1);
        void loadPosts(1, false, Boolean(cached && cached.posts.length > 0));
      }
    }, 0);
    return () => clearTimeout(id);
  }, [loadPosts, cacheKey, authLoading, currentUserId]);

  // Infinite scroll parity with PHP HomeIndex useInfiniteScroll
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || loading || loadingMore || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore && hasMore) {
          const next = page + 1;
          setPage(next);
          void loadPosts(next, true);
        }
      },
      { rootMargin: '250px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, loadingMore, hasMore, page, loadPosts]);

  function handleCreated() {
    setHasNewPosts(false);
    setPage(1);
    void loadPosts(1, false, true);
  }

  useEffect(() => {
    const onRestored = () => {
      void loadPosts(1, false, true);
    };
    window.addEventListener('weto:network-restored', onRestored);
    return () => window.removeEventListener('weto:network-restored', onRestored);
  }, [loadPosts]);

  // Live feed updates from Firestore system_realtime/feed
  useEffect(() => {
    if (mode !== 'feed' && mode !== 'explore') return;
    if (!isFirebaseClientConfigured()) return;
    const db = getFirebaseClientFirestore();
    if (!db) return;

    let firstSnapshot = true;
    const unsub = onSnapshot(
      doc(db, 'system_realtime', 'feed'),
      (snap) => {
        if (firstSnapshot) {
          firstSnapshot = false;
          return;
        }
        if (!snap.exists()) return;
        const data = snap.data() as Record<string, unknown>;
        if (data.actorId && user?.id && String(data.actorId) === user.id) {
          return;
        }
        if (data.eventType === 'post_created') {
          setHasNewPosts(true);
        } else if (data.eventType === 'post_deleted' && data.postId) {
          setPosts((prev) => prev.filter((p) => p.id !== String(data.postId)));
        }
      },
      () => {
        markFirestoreDisabled();
      }
    );
    return () => unsub();
  }, [mode, user?.id]);

  return (
    <div>
      {hasNewPosts && (
        <div className="flex justify-center py-2.5 border-b border-bord-tr bg-fill-fv/70">
          <button
            type="button"
            onClick={() => {
              setHasNewPosts(false);
              setPage(1);
              void loadPosts(1, false, false);
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-900 text-white px-4 py-1.5 text-cap-l font-semibold shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
          >
            <RefreshCw className="size-3.5" />
            New publications available · Refresh
          </button>
        </div>
      )}
      {composerEnabled && (
        <>
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="hidden md:flex w-full cursor-pointer text-lab-pr2 items-center py-3.5 justify-center gap-2 hover:bg-fill-fv/60 transition-colors"
          >
            <span className="text-par-l">What&apos;s new?</span>
            <PencilLine className="size-4" />
          </button>
          <Link
            href="/new/post"
            className="flex md:hidden w-full cursor-pointer text-lab-pr2 items-center py-3.5 justify-center gap-2 hover:bg-fill-fv/60 transition-colors"
          >
            <span className="text-par-l">What&apos;s new?</span>
            <PencilLine className="size-4" />
          </Link>
          <div className="h-2 bg-fill-fv/40 border-y border-bord-tr/60" />
          <Modal
            open={composerOpen}
            onClose={() => setComposerOpen(false)}
            title="New publication"
            maxWidthClass="max-w-xl"
          >
            <PostComposer
              onCreated={() => {
                setComposerOpen(false);
                handleCreated();
              }}
            />
          </Modal>
        </>
      )}

      {loading ? (
        <FeedSkeleton />
      ) : posts.length === 0 ? (
        <div className={mode === 'user' || mode === 'user_media' ? 'py-24 px-6' : 'p-6'}>
          <EmptyState
            icon={MessageSquareDashed}
            title={
              mode === 'user_media'
                ? 'No media yet.'
                : mode === 'user'
                  ? 'No posts yet.'
                  : 'No publications yet'
            }
            description={
              mode === 'user_media'
                ? 'Photos, videos, GIFs, audio, documents, and polls shared here will appear in this tab.'
                : 'When people share posts matching this feed, they will show up here.'
            }
          />
        </div>
      ) : (
        <>
          {posts.map((post, idx) => (
            <React.Fragment key={post.id}>
              <PostCard
                post={post}
                onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
                onQuote={(target) => setQuotePost(target)}
              />
              {adSlotSet?.has(idx) && <FeedAdCard slotIndex={idx} />}
            </React.Fragment>
          ))}

          {hasMore && (
            <div ref={loadMoreRef}>
              {loadingMore ? (
                <FeedSkeleton count={1} />
              ) : (
                <div className="p-4 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const next = page + 1;
                      setPage(next);
                      loadPosts(next, true);
                    }}
                  >
                    Load more publications
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <Modal
        open={Boolean(quotePost)}
        onClose={() => setQuotePost(null)}
        title="Quote Publication"
      >
        {quotePost && (
          <div className="space-y-3">
            <PostComposer
              quotePostId={quotePost.id}
              placeholder="Add your thoughts..."
              onCreated={() => {
                setQuotePost(null);
                handleCreated();
              }}
            />
            <div className="rounded-2xl border border-bord-pr bg-fill-pr/40 p-3">
              <p className="text-cap-l font-semibold text-lab-sc">
                @{quotePost.author?.username}
              </p>
              <p className="text-par-n text-lab-pr mt-1 line-clamp-4">{quotePost.content}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
