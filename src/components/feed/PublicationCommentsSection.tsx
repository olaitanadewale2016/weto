'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  BadgeCheck,
  Check,
  ChevronDown,
  CornerDownRight,
  CornerUpLeft,
  Copy,
  Languages,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Send,
  Smile,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';
import { Avatar } from '@/components/ui/avatar';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export interface CommentAuthor {
  _id?: string;
  id?: string;
  username: string;
  firstName?: string;
  lastName?: string;
  avatar?: string | null;
  verified?: boolean;
}

export interface CommentParentPreview {
  id: string;
  content: string;
  createdAt?: string;
  author?: CommentAuthor | null;
}

export interface CommentReactionItem {
  unifiedId: string;
  nativeSymbol: string;
  count: number;
}

export interface PublicationCommentItem {
  id: string;
  _id?: string;
  content: string;
  createdAt: string;
  parentId?: string | null;
  hasParent?: boolean;
  parent?: CommentParentPreview | null;
  author: CommentAuthor;
  reactionSummary?: CommentReactionItem[];
  viewerReactions?: string[];
  canDelete?: boolean;
  replies?: PublicationCommentItem[];
}

const QUICK_COMMENT_REACTIONS = [
  { unifiedId: '2764-fe0f', nativeSymbol: '❤️', label: 'Love' },
  { unifiedId: '1f525', nativeSymbol: '🔥', label: 'Fire' },
  { unifiedId: '1f44f', nativeSymbol: '👏', label: 'Clap' },
  { unifiedId: '1f602', nativeSymbol: '😂', label: 'Laugh' },
  { unifiedId: '1f62e', nativeSymbol: '😮', label: 'Wow' },
  { unifiedId: '1f622', nativeSymbol: '😢', label: 'Sad' },
];

const COMMENT_EMOJIS = [
  '😀',
  '😂',
  '🥹',
  '😍',
  '🔥',
  '👏',
  '🙌',
  '💯',
  '❤️',
  '✨',
  '🎉',
  '🤔',
  '😎',
  '🙏',
  '👍',
  '🚀',
];

function getAuthorDisplayName(author?: CommentAuthor | null): string {
  if (!author) return 'User';
  const full = `${author.firstName || ''} ${author.lastName || ''}`.trim();
  return full || author.username || 'User';
}

function renderCommentRichText(text: string): React.ReactNode {
  if (!text) return null;
  const parts = text.split(/(https?:\/\/[^\s]+|@[a-zA-Z0-9_]+|#[a-zA-Z0-9_]+)/g);
  return parts.map((part, idx) => {
    if (/^https?:\/\/[^\s]+$/.test(part)) {
      return (
        <a
          key={idx}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-900 hover:underline break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    if (/^@[a-zA-Z0-9_]+$/.test(part)) {
      return (
        <Link
          key={idx}
          href={`/${part}`}
          className="text-brand-900 hover:underline font-semibold"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </Link>
      );
    }
    if (/^#[a-zA-Z0-9_]+$/.test(part)) {
      const tag = part.slice(1);
      return (
        <Link
          key={idx}
          href={`/explore?q=${encodeURIComponent(`#${tag}`)}`}
          className="text-brand-900 hover:underline font-semibold"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </Link>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export interface PublicationCommentsSectionProps {
  postId: string;
  postHashId?: string;
  postOwnerId?: string;
  initialComments?: PublicationCommentItem[];
  commentsCount: number;
  onCommentsCountChange?: (nextCount: number) => void;
  /** When true, renders in mobile ActionSheet layout (scrollable list + bottom editor) */
  sheetMode?: boolean;
  /** When true, renders compact inline layout inside feed PostCard */
  inlineMode?: boolean;
  autoFocusEditor?: boolean;
}

export function PublicationCommentsSection({
  postId,
  postOwnerId,
  initialComments,
  commentsCount,
  onCommentsCountChange,
  sheetMode = false,
  inlineMode = false,
  autoFocusEditor = false,
}: PublicationCommentsSectionProps) {
  const { user, locale } = useApp();
  const { success, error, info } = useToast();

  const [comments, setComments] = useState<PublicationCommentItem[]>(initialComments || []);
  const [loading, setLoading] = useState(!initialComments);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<PublicationCommentItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [emojiPopoverOpen, setEmojiPopoverOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openReactionBarId, setOpenReactionBarId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translatingId, setTranslatingId] = useState<string | null>(null);

  // Facebook Comments Sorting: 'relevant' (default), 'newest', 'oldest'
  const [sortMode, setSortMode] = useState<'relevant' | 'newest' | 'oldest'>('relevant');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  // Facebook Threading: Track which top-level comments have their replies expanded
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync with parent when initialComments changes
  useEffect(() => {
    if (!initialComments) return;
    const id = setTimeout(() => {
      setComments(initialComments);
      setLoading(false);
    }, 0);
    return () => clearTimeout(id);
  }, [initialComments]);

  const fetchComments = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    try {
      const data = await apiFetch<PublicationCommentItem[]>(`/posts/${postId}/comments`);
      const list = Array.isArray(data) ? data : [];
      setComments(list);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (initialComments) return;
    const id = setTimeout(() => {
      void fetchComments();
    }, 0);
    return () => clearTimeout(id);
  }, [initialComments, fetchComments]);

  useEffect(() => {
    if (autoFocusEditor && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocusEditor]);

  // Close menus on outside click
  useEffect(() => {
    if (!openMenuId && !openReactionBarId && !emojiPopoverOpen && !sortMenuOpen) return;
    const handleClickOutside = () => {
      setOpenMenuId(null);
      setOpenReactionBarId(null);
      setEmojiPopoverOpen(false);
      setSortMenuOpen(false);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [openMenuId, openReactionBarId, emojiPopoverOpen, sortMenuOpen]);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(140, Math.max(24, el.scrollHeight))}px`;
  }, []);

  const handleSelectReply = (comment: PublicationCommentItem) => {
    const parentId = comment.parentId ? String(comment.parentId) : comment.id;
    setReplyTo(comment);
    // Auto-expand the thread so user sees what they're replying into
    setExpandedReplies((prev) => new Set([...prev, parentId]));
    setOpenMenuId(null);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 40);
  };

  const handleCancelReply = () => {
    setReplyTo(null);
  };

  const toggleReplies = (commentId: string) => {
    setExpandedReplies((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  };

  const handleSubmitComment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user) {
      error('Please sign in to comment.');
      return;
    }
    const trimmed = commentText.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      const targetParentId = replyTo?.parentId ? String(replyTo.parentId) : replyTo?.id;
      const created = await apiFetch<PublicationCommentItem & { commentsCount?: number }>(
        `/posts/${postId}/comments`,
        {
          method: 'POST',
          json: {
            content: trimmed,
            parentId: targetParentId,
          },
        }
      );
      setComments((prev) => [created, ...prev]);
      if (targetParentId) {
        setExpandedReplies((prev) => new Set([...prev, targetParentId]));
      }
      const nextTotal =
        typeof created.commentsCount === 'number'
          ? created.commentsCount
          : commentsCount + 1;
      onCommentsCountChange?.(nextTotal);
      setCommentText('');
      setReplyTo(null);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      success(replyTo ? 'Reply posted!' : 'Comment posted!');
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to post comment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleCommentReaction = async (
    comment: PublicationCommentItem,
    unifiedId = '2764-fe0f',
    nativeSymbol = '❤️'
  ) => {
    if (!user) {
      error('Please sign in to react.');
      return;
    }
    setOpenReactionBarId(null);
    setOpenMenuId(null);

    try {
      const res = await apiFetch<{
        active: boolean;
        reactionSummary: CommentReactionItem[];
        viewerReactions?: string[];
      }>(`/posts/${postId}/react`, {
        method: 'POST',
        json: {
          action: 'react',
          targetType: 'comment',
          commentId: comment.id,
          unifiedId,
          nativeSymbol,
        },
      });

      setComments((prev) =>
        prev.map((c) => {
          if (c.id !== comment.id) return c;
          const nextViewerReactions =
            res.viewerReactions ||
            (res.active
              ? Array.from(new Set([...(c.viewerReactions || []), unifiedId]))
              : (c.viewerReactions || []).filter((id) => id !== unifiedId));
          return {
            ...c,
            reactionSummary: res.reactionSummary || [],
            viewerReactions: nextViewerReactions,
          };
        })
      );
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to react to comment.');
    }
  };

  const handleCopyText = async (comment: PublicationCommentItem) => {
    setOpenMenuId(null);
    try {
      await navigator.clipboard.writeText(comment.content);
      success('Comment copied to clipboard.');
    } catch {
      error('Failed to copy text.');
    }
  };

  const handleTranslateComment = async (comment: PublicationCommentItem) => {
    setOpenMenuId(null);
    if (translations[comment.id]) {
      setTranslations((prev) => {
        const next = { ...prev };
        delete next[comment.id];
        return next;
      });
      return;
    }
    setTranslatingId(comment.id);
    try {
      const res = await apiFetch<{ translatedText?: string; text?: string }>('/translate', {
        method: 'POST',
        json: {
          text: comment.content,
          targetLang: locale || 'en',
        },
      });
      const out = res?.translatedText || res?.text;
      if (out) {
        setTranslations((prev) => ({ ...prev, [comment.id]: out }));
      } else {
        info('Translation unavailable.');
      }
    } catch {
      info('Translation service is currently unavailable.');
    } finally {
      setTranslatingId(null);
    }
  };

  const confirmDeleteComment = async () => {
    if (!deleteTargetId || deleting) return;
    setDeleting(true);
    const targetId = deleteTargetId;
    try {
      const res = await apiFetch<{ deleted: boolean; commentsCount?: number }>(
        `/posts/${postId}/comments?commentId=${encodeURIComponent(targetId)}`,
        { method: 'DELETE' }
      );
      setComments((prev) =>
        prev
          .filter((c) => c.id !== targetId)
          .map((c) => {
            if (c.parent?.id === targetId || String(c.parentId) === targetId) {
              return {
                ...c,
                hasParent: true,
                parent: null,
              };
            }
            return c;
          })
      );
      if (replyTo?.id === targetId) {
        setReplyTo(null);
      }
      const nextCount =
        typeof res?.commentsCount === 'number'
          ? res.commentsCount
          : Math.max(0, commentsCount - 1);
      onCommentsCountChange?.(nextCount);
      setDeleteTargetId(null);
      info('Comment deleted.');
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to delete comment.');
    } finally {
      setDeleting(false);
    }
  };

  const canViewerDelete = (comment: PublicationCommentItem): boolean => {
    if (typeof comment.canDelete === 'boolean') return comment.canDelete;
    if (!user) return false;
    const authorId = String(comment.author?._id || comment.author?.id || '');
    return (
      authorId === String(user.id) ||
      (Boolean(postOwnerId) && String(postOwnerId) === String(user.id)) ||
      user.role === 'admin' ||
      user.role === 'root'
    );
  };

  // Sort comments according to Facebook sorting rules
  const sortedComments = useMemo(() => {
    const list = [...comments];
    if (sortMode === 'newest') {
      return list.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }
    if (sortMode === 'oldest') {
      return list.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    }
    // 'relevant': prioritize author comments, then total reactions + replies, then newest
    return list.sort((a, b) => {
      const aIsAuthor = Boolean(
        postOwnerId && String(a.author?._id || a.author?.id) === String(postOwnerId)
      );
      const bIsAuthor = Boolean(
        postOwnerId && String(b.author?._id || b.author?.id) === String(postOwnerId)
      );
      if (aIsAuthor && !bIsAuthor) return -1;
      if (!aIsAuthor && bIsAuthor) return 1;

      const aReactions =
        (a.reactionSummary || []).reduce((acc, r) => acc + (r.count || 0), 0) +
        (a.replies?.length || 0);
      const bReactions =
        (b.reactionSummary || []).reduce((acc, r) => acc + (r.count || 0), 0) +
        (b.replies?.length || 0);
      if (bReactions !== aReactions) return bReactions - aReactions;

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [comments, sortMode, postOwnerId]);

  // Group into Top-level comments and child replies
  const { topLevelComments, repliesByParent } = useMemo(() => {
    const repliesMap = new Map<string, PublicationCommentItem[]>();
    const topLevel: PublicationCommentItem[] = [];
    const allIds = new Set(sortedComments.map((c) => c.id));

    // Register embedded replies from the backend if present
    for (const c of sortedComments) {
      if (Array.isArray(c.replies) && c.replies.length > 0) {
        repliesMap.set(c.id, [...c.replies]);
      }
    }

    // Organize comments into top-level and children
    for (const c of sortedComments) {
      const parentIdStr = c.parentId ? String(c.parentId) : null;
      if (parentIdStr && allIds.has(parentIdStr)) {
        const list = repliesMap.get(parentIdStr) || [];
        if (!list.some((existing) => existing.id === c.id)) {
          list.push(c);
        }
        repliesMap.set(parentIdStr, list);
      } else {
        topLevel.push(c);
      }
    }

    return { topLevelComments: topLevel, repliesByParent: repliesMap };
  }, [sortedComments]);

  // Facebook Capsule Comment Composer
  const renderEditor = () => (
    <div
      className={cn(
        'bg-bg-pr z-10',
        sheetMode ? 'border-t border-bord-pr shrink-0' : 'sticky top-0'
      )}
    >
      {/* Facebook Active Reply Banner */}
      {replyTo && (
        <div className="px-4 pt-2 pb-1 bg-bg-pr border-t border-bord-card">
          <div className="flex items-center justify-between overflow-hidden bg-fill-qt/80 rounded-xl px-3 py-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <CornerUpLeft className="size-3.5 text-brand-900 shrink-0" />
              <p className="text-[13px] text-lab-sc truncate">
                Replying to <span className="font-semibold text-lab-pr">@{getAuthorDisplayName(replyTo.author)}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={handleCancelReply}
              className="shrink-0 size-6 inline-flex items-center justify-center rounded-full text-lab-sc hover:text-lab-pr hover:bg-fill-tr cursor-pointer"
              aria-label="Cancel reply"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmitComment}
        className={cn(
          'block px-4 py-2.5',
          !sheetMode && !inlineMode && 'border-b border-bord-pr'
        )}
      >
        <div className="flex items-end gap-2.5 rounded-[20px] bg-fill-qt/70 dark:bg-fill-sc/40 border border-bord-pr/70 focus-within:border-brand-900/60 px-3.5 py-2 transition-colors">
          {user && (
            <div className="shrink-0 pb-0.5">
              <Avatar src={user.avatar} alt={user.username} size="sm" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              value={commentText}
              onChange={(e) => {
                setCommentText(e.target.value);
                resizeTextarea();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSubmitComment();
                }
              }}
              rows={1}
              placeholder={
                replyTo
                  ? `Reply to @${getAuthorDisplayName(replyTo.author)}...`
                  : user?.firstName
                    ? `Write a comment as ${user.firstName}...`
                    : 'Write a comment...'
              }
              className="w-full resize-none bg-transparent text-[15px] sm:text-[16px] text-lab-pr placeholder:text-lab-sc focus:outline-none max-h-36 leading-5 py-0.5"
            />
          </div>

          <div className="flex items-center gap-1 shrink-0 pb-0.5 relative">
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setEmojiPopoverOpen((v) => !v)}
                className="size-7 rounded-full inline-flex items-center justify-center text-lab-sc hover:text-lab-pr hover:bg-fill-qt transition-colors cursor-pointer"
                title="Insert emoji"
              >
                <Smile className="size-4" />
              </button>

              {emojiPopoverOpen && (
                <div className="absolute right-0 bottom-9 z-30 w-52 p-2 rounded-2xl bg-bg-pr border border-bord-pr shadow-xl grid grid-cols-4 gap-1">
                  {COMMENT_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        setCommentText((prev) => `${prev}${emoji}`);
                        setEmojiPopoverOpen(false);
                        textareaRef.current?.focus();
                      }}
                      className="h-8 rounded-lg hover:bg-fill-qt flex items-center justify-center text-base cursor-pointer"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!commentText.trim() || submitting}
              className="size-7 rounded-full inline-flex items-center justify-center text-brand-900 disabled:text-lab-tr disabled:opacity-40 hover:bg-brand-900/10 transition-colors cursor-pointer"
              aria-label="Send comment"
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );

  // Render a single Facebook Comment Item (or Reply)
  const renderCommentItem = (c: PublicationCommentItem, isReply = false) => {
    const authorName = getAuthorDisplayName(c.author);
    const isAuthorOfPost = Boolean(
      postOwnerId && String(c.author?._id || c.author?.id) === String(postOwnerId)
    );
    const viewerReactedAny = (c.viewerReactions?.length || 0) > 0;
    const isMenuOpen = openMenuId === c.id;
    const isReactionBarOpen = openReactionBarId === c.id;
    const translated = translations[c.id];
    const isTranslating = translatingId === c.id;
    const totalReactions = (c.reactionSummary || []).reduce((acc, r) => acc + (r.count || 0), 0);
    const replies = repliesByParent.get(c.id) || [];
    const isExpanded = expandedReplies.has(c.id);

    return (
      <div
        key={c.id}
        id={`comment-${c.id}`}
        className={cn(
          'relative transition-colors group/item',
          isReply ? 'pt-1.5' : 'px-4 py-2.5 hover:bg-fill-qt/15'
        )}
      >
        <div className="flex items-start gap-2.5">
          <Link href={`/@${c.author?.username}`} className="shrink-0 mt-0.5">
            <Avatar
              src={c.author?.avatar}
              alt={c.author?.username || 'user'}
              size={isReply ? 'xs' : 'sm'}
            />
          </Link>

          <div className="flex-1 min-w-0">
            {/* Facebook Speech Bubble Card */}
            <div className="flex items-start gap-1.5 group/bubble">
              <div className="relative inline-block max-w-[calc(100%-2rem)] rounded-[18px] bg-fill-qt/80 dark:bg-fill-sc/45 hover:bg-fill-qt transition-colors px-3.5 py-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Link
                    href={`/@${c.author?.username}`}
                    className="text-[15px] font-semibold text-lab-pr leading-snug truncate hover:underline inline-flex items-center gap-1"
                  >
                    <span className="truncate">{authorName}</span>
                    {c.author?.verified && (
                      <BadgeCheck className="size-3.5 text-brand-900 shrink-0" />
                    )}
                  </Link>
                  {isAuthorOfPost && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-900/10 text-brand-900 border border-brand-900/20 leading-none">
                      Author
                    </span>
                  )}
                </div>

                {/* Comment Content */}
                <p className="text-[15px] sm:text-[16px] font-normal text-lab-pr break-words whitespace-pre-wrap leading-snug mt-0.5">
                  {renderCommentRichText(c.content)}
                </p>

                {translated && (
                  <div className="my-1.5 border-l-2 border-brand-900/60 pl-2 py-0.5">
                    <p className="text-[14px] font-normal text-lab-pr break-words whitespace-pre-wrap leading-snug">
                      {translated}
                    </p>
                    <span className="text-[11px] text-lab-sc">Translated by AI</span>
                  </div>
                )}

                {/* Floating Reaction Pill anchored to bottom-right of bubble */}
                {totalReactions > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenReactionBarId(isReactionBarOpen ? null : c.id);
                    }}
                    className="absolute -bottom-2 right-2 z-10 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-bg-pr border border-bord-pr/80 shadow-xs text-[11px] font-semibold text-lab-sc hover:scale-105 transition-transform cursor-pointer"
                    title={`${totalReactions} reactions`}
                  >
                    <span className="flex -space-x-1">
                      {(c.reactionSummary || [])
                        .filter((r) => r.count > 0)
                        .slice(0, 3)
                        .map((r, i) => (
                          <span key={r.unifiedId || i} className="text-[12px] leading-none">
                            {r.nativeSymbol}
                          </span>
                        ))}
                    </span>
                    <span className="tabular-nums font-bold text-lab-pr">{totalReactions}</span>
                  </button>
                )}
              </div>

              {/* Options Menu (•••) */}
              <div
                className="relative shrink-0 self-center opacity-60 hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    setOpenReactionBarId(null);
                    setOpenMenuId(isMenuOpen ? null : c.id);
                  }}
                  className="size-6 rounded-full inline-flex items-center justify-center text-lab-tr hover:text-lab-pr hover:bg-fill-qt transition-colors cursor-pointer"
                  aria-label="Comment options"
                >
                  <MoreHorizontal className="size-4" />
                </button>

                {isMenuOpen && (
                  <div className="absolute right-0 top-7 z-30 w-52 rounded-2xl bg-bg-pr border border-bord-pr shadow-xl overflow-hidden py-1">
                    {/* Quick Reaction Strip */}
                    <div className="px-2.5 py-1.5 flex items-center justify-between border-b border-bord-pr">
                      {QUICK_COMMENT_REACTIONS.map((rx) => {
                        const active = c.viewerReactions?.includes(rx.unifiedId);
                        return (
                          <button
                            key={rx.unifiedId}
                            type="button"
                            onClick={() =>
                              void handleToggleCommentReaction(c, rx.unifiedId, rx.nativeSymbol)
                            }
                            className={cn(
                              'size-7 rounded-full flex items-center justify-center text-base hover:bg-fill-qt transition-transform hover:scale-110 cursor-pointer',
                              active && 'bg-brand-900/15 ring-1 ring-brand-900/40'
                            )}
                            title={rx.label}
                          >
                            {rx.nativeSymbol}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSelectReply(c)}
                      className="w-full px-3.5 py-2 text-left text-par-s text-lab-pr hover:bg-fill-qt flex items-center gap-2.5 cursor-pointer"
                    >
                      <CornerUpLeft className="size-4 text-lab-sc shrink-0" />
                      <span className="truncate">Reply to {authorName}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleTranslateComment(c)}
                      className="w-full px-3.5 py-2 text-left text-par-s text-lab-pr hover:bg-fill-qt flex items-center gap-2.5 cursor-pointer"
                    >
                      <Languages className="size-4 text-lab-sc shrink-0" />
                      <span>{translated ? 'Hide translation' : 'Translate'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleCopyText(c)}
                      className="w-full px-3.5 py-2 text-left text-par-s text-lab-pr hover:bg-fill-qt flex items-center gap-2.5 cursor-pointer"
                    >
                      <Copy className="size-4 text-lab-sc shrink-0" />
                      <span>Copy text</span>
                    </button>

                    {canViewerDelete(c) && (
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          setDeleteTargetId(c.id);
                        }}
                        className="w-full px-3.5 py-2 text-left text-par-s text-red-900 hover:bg-fill-qt flex items-center gap-2.5 border-t border-bord-pr cursor-pointer"
                      >
                        <Trash2 className="size-4 shrink-0" />
                        <span>Delete comment</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Action Bar: Timestamp · Like · Reply · Translate */}
            <div className="flex items-center leading-none mt-1.5 px-2.5 gap-3.5 relative text-[13px] text-lab-sc font-medium">
              <span className="font-normal text-lab-sc">{formatRelativeTime(c.createdAt, locale)}</span>

              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => {
                    if (viewerReactedAny) {
                      const firstReactionId = c.viewerReactions?.[0] || '2764-fe0f';
                      const match = QUICK_COMMENT_REACTIONS.find(
                        (rx) => rx.unifiedId === firstReactionId
                      );
                      void handleToggleCommentReaction(
                        c,
                        firstReactionId,
                        match?.nativeSymbol || '❤️'
                      );
                    } else {
                      setOpenReactionBarId(isReactionBarOpen ? null : c.id);
                    }
                  }}
                  className={cn(
                    'cursor-pointer transition-colors font-semibold hover:underline',
                    viewerReactedAny ? 'text-brand-900 font-bold' : 'text-lab-sc hover:text-lab-pr'
                  )}
                >
                  Like
                </button>

                {isReactionBarOpen && (
                  <div className="absolute left-0 bottom-5 z-30 flex items-center gap-1 px-2 py-1 rounded-full bg-bg-pr border border-bord-pr shadow-xl">
                    {QUICK_COMMENT_REACTIONS.map((rx) => (
                      <button
                        key={rx.unifiedId}
                        type="button"
                        onClick={() =>
                          void handleToggleCommentReaction(c, rx.unifiedId, rx.nativeSymbol)
                        }
                        className="size-7 rounded-full flex items-center justify-center text-base hover:bg-fill-qt transition-transform hover:scale-125 cursor-pointer"
                        title={rx.label}
                      >
                        {rx.nativeSymbol}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleSelectReply(c)}
                className="cursor-pointer font-semibold hover:underline text-lab-sc hover:text-lab-pr"
              >
                Reply
              </button>

              {c.content.trim().length > 3 && (
                <button
                  type="button"
                  onClick={() => void handleTranslateComment(c)}
                  disabled={isTranslating}
                  className="text-lab-sc font-normal hover:text-brand-900 cursor-pointer transition-colors"
                >
                  {isTranslating ? 'Translating...' : translated ? 'Show original' : 'Show translation'}
                </button>
              )}
            </div>

            {/* Facebook Nested Replies (Top-level only) */}
            {!isReply && replies.length > 0 && (
              <div className="mt-1">
                <button
                  type="button"
                  onClick={() => toggleReplies(c.id)}
                  className="ml-2.5 flex items-center gap-1.5 py-1 text-[13px] font-semibold text-lab-sc hover:text-lab-pr cursor-pointer transition-colors"
                >
                  <CornerDownRight className="size-3.5 text-lab-tr" />
                  <span>
                    {isExpanded
                      ? 'Hide replies'
                      : `View ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
                  </span>
                </button>

                {isExpanded && (
                  <div className="ml-4 sm:ml-6 mt-1.5 space-y-2.5 relative border-l-2 border-bord-pr/70 pl-3 sm:pl-3.5">
                    {replies.map((replyItem) => (
                      <React.Fragment key={replyItem.id}>
                        {renderCommentItem(replyItem, true)}
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Header Bar with Facebook-style Sort Selector
  const renderHeader = () => (
    <div className="flex items-center justify-between px-4 py-2 border-b border-bord-pr bg-fill-fv/30 text-par-s">
      <span className="font-semibold text-lab-pr">
        {commentsCount > 0
          ? `${commentsCount} ${commentsCount === 1 ? 'Comment' : 'Comments'}`
          : 'Comments'}
      </span>

      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setSortMenuOpen((v) => !v)}
          className="inline-flex items-center gap-1 font-semibold text-lab-sc hover:text-lab-pr cursor-pointer transition-colors text-[13px]"
        >
          <span>
            {sortMode === 'relevant'
              ? 'Most relevant'
              : sortMode === 'newest'
                ? 'All comments'
                : 'Oldest first'}
          </span>
          <ChevronDown className="size-3.5" />
        </button>

        {sortMenuOpen && (
          <div className="absolute right-0 top-7 z-30 w-52 rounded-2xl bg-bg-pr border border-bord-pr shadow-xl py-1 overflow-hidden">
            <button
              type="button"
              onClick={() => {
                setSortMode('relevant');
                setSortMenuOpen(false);
              }}
              className={cn(
                'w-full px-3.5 py-2 text-left text-[14px] flex items-center justify-between cursor-pointer hover:bg-fill-qt transition-colors',
                sortMode === 'relevant'
                  ? 'text-brand-900 font-semibold bg-brand-900/10'
                  : 'text-lab-pr'
              )}
            >
              <div>
                <p className="font-semibold">Most relevant</p>
                <p className="text-[12px] text-lab-sc">Comments from author & top interactions</p>
              </div>
              {sortMode === 'relevant' && <Check className="size-4 shrink-0" />}
            </button>

            <button
              type="button"
              onClick={() => {
                setSortMode('newest');
                setSortMenuOpen(false);
              }}
              className={cn(
                'w-full px-3.5 py-2 text-left text-[14px] flex items-center justify-between cursor-pointer hover:bg-fill-qt transition-colors',
                sortMode === 'newest'
                  ? 'text-brand-900 font-semibold bg-brand-900/10'
                  : 'text-lab-pr'
              )}
            >
              <div>
                <p className="font-semibold">All comments</p>
                <p className="text-[12px] text-lab-sc">Show all comments, newest first</p>
              </div>
              {sortMode === 'newest' && <Check className="size-4 shrink-0" />}
            </button>

            <button
              type="button"
              onClick={() => {
                setSortMode('oldest');
                setSortMenuOpen(false);
              }}
              className={cn(
                'w-full px-3.5 py-2 text-left text-[14px] flex items-center justify-between cursor-pointer hover:bg-fill-qt transition-colors',
                sortMode === 'oldest'
                  ? 'text-brand-900 font-semibold bg-brand-900/10'
                  : 'text-lab-pr'
              )}
            >
              <div>
                <p className="font-semibold">Oldest first</p>
                <p className="text-[12px] text-lab-sc">Show all comments in original order</p>
              </div>
              {sortMode === 'oldest' && <Check className="size-4 shrink-0" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderCommentsList = () => {
    if (loading) {
      return (
        <div className="py-8 flex items-center justify-center">
          <Loader2 className="size-6 animate-spin text-brand-900" />
        </div>
      );
    }

    if (topLevelComments.length === 0) {
      return (
        <div className="py-8 px-4 text-center">
          <div className="size-10 rounded-full bg-fill-qt mx-auto mb-2 flex items-center justify-center text-lab-sc">
            <MessageCircle className="size-5 opacity-60" />
          </div>
          <p className="text-par-s text-lab-sc">
            No comments yet. Be the first to comment!
          </p>
        </div>
      );
    }

    return (
      <div className="divide-y divide-bord-pr/60">
        {topLevelComments.map((c) => renderCommentItem(c, false))}
      </div>
    );
  };

  return (
    <>
      {sheetMode ? (
        <div className="flex flex-col max-h-[75vh]">
          {renderHeader()}
          <div className="flex-1 overflow-y-auto min-h-[220px]">{renderCommentsList()}</div>
          {renderEditor()}
        </div>
      ) : (
        <div className="block">
          {renderHeader()}
          {renderEditor()}
          {renderCommentsList()}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        open={Boolean(deleteTargetId)}
        onClose={() => {
          if (!deleting) setDeleteTargetId(null);
        }}
        title="Delete comment?"
        maxWidthClass="max-w-sm"
      >
        <div className="p-4 space-y-4">
          <p className="text-par-n text-lab-sc">
            Are you sure you want to permanently delete this comment? This action cannot be undone.
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteTargetId(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={deleting}
              onClick={() => void confirmDeleteComment()}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
