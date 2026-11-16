'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, onSnapshot } from 'firebase/firestore';
import { ArrowLeft } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PostCard, SerializedPost } from '@/components/feed/PostCard';
import {
  PublicationCommentItem,
  PublicationCommentsSection,
} from '@/components/feed/PublicationCommentsSection';
import { FeedAdCard } from '@/components/ads/FeedAdCard';
import { FeedSkeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api-client';
import {
  getFirebaseClientFirestore,
  isFirebaseClientConfigured,
  markFirestoreDisabled,
} from '@/lib/firebase/client';
import { useApp } from '@/components/providers/AppContext';

export default function PublicationDetailPage() {
  const params = useParams<{ hashId: string }>();
  const router = useRouter();
  const { socket } = useApp();

  const [post, setPost] = useState<SerializedPost | null>(null);
  const [comments, setComments] = useState<PublicationCommentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(
    async (silent = false) => {
      if (!silent) {
        setPost((prev) => {
          if (!prev) setLoading(true);
          return prev;
        });
      }
      try {
        const [postRes, commentRes] = await Promise.allSettled([
          apiFetch<SerializedPost>(`/posts/${params.hashId}`),
          apiFetch<PublicationCommentItem[]>(`/posts/${params.hashId}/comments`),
        ]);
        if (postRes.status === 'fulfilled' && postRes.value) {
          const nextPost = postRes.value;
          setPost((prev) => {
            if (!prev) return nextPost;
            return {
              ...nextPost,
              media:
                Array.isArray(nextPost.media) && nextPost.media.length > 0
                  ? nextPost.media
                  : prev.media,
              gifUrl: nextPost.gifUrl || prev.gifUrl,
              quotePostId:
                nextPost.quotePostId && typeof nextPost.quotePostId === 'object'
                  ? {
                    ...nextPost.quotePostId,
                    media:
                      Array.isArray(nextPost.quotePostId.media) &&
                        nextPost.quotePostId.media.length > 0
                        ? nextPost.quotePostId.media
                        : prev.quotePostId?.media,
                  }
                  : prev.quotePostId || nextPost.quotePostId,
            };
          });
        } else if (!silent) {
          setPost((prev) => prev ?? null);
        }

        if (commentRes.status === 'fulfilled' && Array.isArray(commentRes.value)) {
          setComments(commentRes.value);
        }
      } catch {
        if (!silent) setPost((prev) => prev ?? null);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [params.hashId]
  );

  useEffect(() => {
    const id = setTimeout(() => {
      void loadData(false);
    }, 0);
    return () => clearTimeout(id);
  }, [loadData]);

  // Live publication sync: Socket.IO room + Firestore posts_realtime + lightweight active-tab fallback
  const livePostId = post?.id;
  useEffect(() => {
    if (!livePostId) return;

    const refreshQuietly = () => {
      void loadData(true);
    };

    if (socket) {
      socket.emit('join:post', { postId: livePostId });
      socket.on('post:comment:new', refreshQuietly);
      socket.on('post:comment:deleted', refreshQuietly);
      socket.on('post:reaction:update', refreshQuietly);
    }

    let unsubFirestore: (() => void) | undefined;
    if (isFirebaseClientConfigured()) {
      const db = getFirebaseClientFirestore();
      if (db) {
        let firstSnapshot = true;
        unsubFirestore = onSnapshot(
          doc(db, 'posts_realtime', livePostId),
          (snap) => {
            if (firstSnapshot) {
              firstSnapshot = false;
              return;
            }
            if (snap.exists()) {
              refreshQuietly();
            }
          },
          () => {
            markFirestoreDisabled();
          }
        );
      }
    }

    const timer = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        refreshQuietly();
      }
    }, 8000);

    return () => {
      clearInterval(timer);
      unsubFirestore?.();
      if (socket) {
        socket.emit('leave:post', { postId: livePostId });
        socket.off('post:comment:new', refreshQuietly);
        socket.off('post:comment:deleted', refreshQuietly);
        socket.off('post:reaction:update', refreshQuietly);
      }
    };
  }, [livePostId, socket, loadData]);

  return (
    <AppShell>
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] md:top-0 z-20 border-b border-bord-pr bg-bg-pr/95 backdrop-blur-md px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="p-1.5 rounded-full hover:bg-fill-sc cursor-pointer"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-title-3 font-bold text-lab-pr">Publication</h1>
      </div>

      {loading ? (
        <FeedSkeleton />
      ) : !post ? (
        <div className="p-8 text-center text-lab-sc">Publication not found or removed.</div>
      ) : (
        <>
          <PostCard post={post} isDetailView />

          <PublicationCommentsSection
            postId={post.id}
            postHashId={post.hashId}
            postOwnerId={String(post.author?._id || post.author?.id || '')}
            initialComments={comments}
            commentsCount={post.commentsCount || comments.length}
            onCommentsCountChange={(nextCount) => {
              setPost((prev) => (prev ? { ...prev, commentsCount: nextCount } : prev));
            }}
          />

          <FeedAdCard slotIndex={601} />
        </>
      )}
    </AppShell>
  );
}
