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
const feedPostsCache = new Map<string, FeedCacheEntry>();

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
  const cachedEntry = feedPostsCache.get(cacheKey);
  const [posts, setPosts] = useState<SerializedPost[]>(() => cachedEntry?.posts || []);
  const [composerOpen, setComposerOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(() => cachedEntry?.hasMore ?? false);
  const [loading, setLoading] = useState(() => !cachedEntry);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const [quotePost, setQuotePost] = useState<SerializedPost | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const loadPosts = useCallback(
    async (pageNum: number, append: boolean, silent = false) => {
      if (append) setLoadingMore(true);
      else if (!silent) setLoading(true);

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
            mergedRows = rows;
            return rows;
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
        if (!append) {
          feedPostsCache.set(cacheKey, {
            posts: rows,
            hasMore: nextHasMore,
            ts: Date.now(),
            userId: currentUserId,
          });
        }
      } catch {
        if (!append) setPosts([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [mode, username, hashtag, query, cacheKey, currentUserId]
  );

  useEffect(() => {
    const cached = feedPostsCache.get(cacheKey);
    const id = setTimeout(() => {
      if (cached) {
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
        void loadPosts(1, false, Boolean(cached));
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
      feedPostsCache.delete(cacheKey);
      setPage(1);
      void loadPosts(1, false, true);
    };
    window.addEventListener('weto:network-restored', onRestored);
    return () => window.removeEventListener('weto:network-restored', onRestored);
  }, [cacheKey, loadPosts]);

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
              {(mode === 'feed' || mode === 'explore' || mode === 'trending') &&
                (idx === 4 || (idx > 4 && (idx - 4) % 7 === 0)) && (
                  <FeedAdCard slotIndex={idx} />
                )}
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
