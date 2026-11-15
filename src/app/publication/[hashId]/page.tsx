'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { doc, onSnapshot } from 'firebase/firestore';
import { ArrowLeft, CornerDownRight, Languages, Send, Trash2 } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PostCard, SerializedPost } from '@/components/feed/PostCard';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { FeedSkeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api-client';
import { formatRelativeTime } from '@/lib/i18n';
import {
  getFirebaseClientFirestore,
  isFirebaseClientConfigured,
  markFirestoreDisabled,
} from '@/lib/firebase/client';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';

interface CommentNode {
  id: string;
  content: string;
  createdAt: string;
  author: {
    _id: string;
    username: string;
    firstName: string;
    lastName: string;
    avatar: string;
    verified?: boolean;
  };
  replies?: CommentNode[];
}

export default function PublicationDetailPage() {
  const params = useParams<{ hashId: string }>();
  const { user, locale, socket } = useApp();
  const { error, success } = useToast();

  const [post, setPost] = useState<SerializedPost | null>(null);
  const [comments, setComments] = useState<CommentNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<CommentNode | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [commentTranslations, setCommentTranslations] = useState<Record<string, string | null>>({});
  const [translatingCommentId, setTranslatingCommentId] = useState<string | null>(null);

  async function handleTranslateComment(id: string, text: string) {
    if (commentTranslations[id]) {
      setCommentTranslations((prev) => ({ ...prev, [id]: null }));
      return;
    }
    setTranslatingCommentId(id);
    try {
      const res = await apiFetch<{ translatedText: string }>('/translate', {
        method: 'POST',
        json: { text, targetLang: locale || 'en' },
      });
      setCommentTranslations((prev) => ({ ...prev, [id]: res.translatedText }));
    } catch (err) {
      error('Translation unavailable', err instanceof Error ? err.message : undefined);
    } finally {
      setTranslatingCommentId(null);
    }
  }

  const loadData = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [postData, commentData] = await Promise.all([
          apiFetch<SerializedPost>(`/posts/${params.hashId}`),
          apiFetch<CommentNode[]>(`/posts/${params.hashId}/comments`),
        ]);
        setPost(postData);
        setComments(Array.isArray(commentData) ? commentData : []);
      } catch {
        if (!silent) setPost(null);
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

  async function handleCommentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSubmitting(true);
    try {
      await apiFetch(`/posts/${params.hashId}/comments`, {
        method: 'POST',
        json: {
          content: commentText.trim(),
          ...(replyTo ? { parentId: replyTo.id } : {}),
        },
      });
      setCommentText('');
      setReplyTo(null);
      success('Comment added');
      void loadData(true);
    } catch (err) {
      error('Could not add comment', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    try {
      await apiFetch(`/posts/${params.hashId}/comments?commentId=${commentId}`, {
        method: 'DELETE',
      });
      success('Comment removed');
      void loadData(true);
    } catch (err) {
      error('Delete failed', err instanceof Error ? err.message : undefined);
    }
  }

  return (
    <AppShell>
      <div className="sticky top-14 md:top-0 z-20 border-b border-bord-pr bg-bg-pr/95 backdrop-blur-md px-4 py-3 flex items-center gap-3">
        <Link href="/" className="p-1.5 rounded-full hover:bg-fill-sc">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-title-3 font-bold text-lab-pr">Publication</h1>
      </div>

      {loading ? (
        <FeedSkeleton />
      ) : !post ? (
        <div className="p-8 text-center text-lab-sc">Publication not found or removed.</div>
      ) : (
        <>
          <PostCard post={post} />

          {/* Comment Composer */}
          {user && (
            <form onSubmit={handleCommentSubmit} className="border-b border-bord-pr p-4 space-y-2">
              {replyTo && (
                <div className="flex items-center justify-between rounded-xl bg-fill-pr px-3 py-1.5 text-cap-l text-lab-sc">
                  <span>Replying to @{replyTo.author?.username}</span>
                  <button type="button" onClick={() => setReplyTo(null)} className="text-brand-900 font-semibold">
                    Cancel
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2.5">
                <Avatar src={user.avatar} alt={user.username} size="sm" />
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Write a comment..."
                  className="flex-1 h-10 rounded-full bg-input-pr border border-bord-card px-4 text-par-n text-lab-pr placeholder:text-lab-tr focus:outline-none focus:border-bord-pr"
                />
                <Button type="submit" variant="primary" size="sm" loading={submitting}>
                  <Send className="h-3.5 w-3.5" /> Reply
                </Button>
              </div>
            </form>
          )}

          {/* Comment Tree */}
          <div className="divide-y divide-bord-pr">
            {comments.length === 0 ? (
              <p className="p-6 text-center text-par-n text-lab-sc">
                No comments yet. Start the conversation!
              </p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="p-4 space-y-3">
                  <div className="flex gap-3">
                    <Avatar src={c.author?.avatar} alt={c.author?.username} size="sm" verified={c.author?.verified} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-cap-l">
                          <Link href={`/@${c.author?.username}`} className="font-bold text-lab-pr hover:underline">
                            {c.author?.firstName} {c.author?.lastName}
                          </Link>
                          <span className="text-lab-tr">· {formatRelativeTime(c.createdAt, locale)}</span>
                        </div>
                        {user && String(c.author?._id) === user.id && (
                          <button
                            type="button"
                            onClick={() => handleDeleteComment(c.id)}
                            className="text-lab-tr hover:text-red-900 p-1"
                            aria-label="Delete comment"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <p className="text-par-n text-lab-pr mt-1 whitespace-pre-wrap">
                        {commentTranslations[c.id] || c.content}
                      </p>
                      {commentTranslations[c.id] && (
                        <p className="text-[11px] text-lab-tr mt-0.5">Translated to {(locale || 'en').toUpperCase()}</p>
                      )}
                      {user && (
                        <div className="mt-1.5 flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setReplyTo(c)}
                            className="inline-flex items-center gap-1 text-cap-s text-lab-sc hover:text-brand-900 font-semibold cursor-pointer"
                          >
                            <CornerDownRight className="h-3 w-3" /> Reply
                          </button>
                          <button
                            type="button"
                            disabled={translatingCommentId === c.id}
                            onClick={() => void handleTranslateComment(c.id, c.content)}
                            className="inline-flex items-center gap-1 text-cap-s text-lab-sc hover:text-brand-900 font-semibold cursor-pointer"
                          >
                            <Languages className="h-3 w-3" />
                            {translatingCommentId === c.id
                              ? 'Translating...'
                              : commentTranslations[c.id]
                                ? 'Show original'
                                : 'Translate'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Nested replies */}
                  {c.replies && c.replies.length > 0 && (
                    <div className="ml-9 pl-4 border-l-2 border-bord-pr space-y-3">
                      {c.replies.map((r) => (
                        <div key={r.id} className="flex gap-2.5">
                          <Avatar src={r.author?.avatar} alt={r.author?.username} size="xs" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-cap-l font-bold text-lab-pr">
                                {r.author?.firstName} {r.author?.lastName}
                              </span>
                              {user && String(r.author?._id) === user.id && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteComment(r.id)}
                                  className="text-lab-tr hover:text-red-900"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                            <p className="text-par-n text-lab-pr mt-0.5">
                              {commentTranslations[r.id] || r.content}
                            </p>
                            {user && (
                              <button
                                type="button"
                                disabled={translatingCommentId === r.id}
                                onClick={() => void handleTranslateComment(r.id, r.content)}
                                className="mt-1 inline-flex items-center gap-1 text-[11px] text-lab-sc hover:text-brand-900 font-semibold cursor-pointer"
                              >
                                <Languages className="h-3 w-3" />
                                {translatingCommentId === r.id
                                  ? 'Translating...'
                                  : commentTranslations[r.id]
                                    ? 'Show original'
                                    : 'Translate'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </AppShell>
  );
}
