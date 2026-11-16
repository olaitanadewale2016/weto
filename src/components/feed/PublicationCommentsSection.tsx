'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
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
import { Badge } from '@/components/ui/badge';
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
          className="text-brand-900 hover:underline font-medium"
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
          className="text-brand-900 hover:underline font-medium"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </Link>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

interface PublicationCommentsSectionProps {
  postId: string;
  postHashId?: string;
  postOwnerId?: string;
  initialComments?: PublicationCommentItem[];
  commentsCount: number;
  onCommentsCountChange?: (nextCount: number) => void;
  /** When true, renders in mobile ActionSheet layout (scrollable list + bottom editor) */
  sheetMode?: boolean;
  autoFocusEditor?: boolean;
}

export function PublicationCommentsSection({
  postId,
  postOwnerId,
  initialComments,
  commentsCount,
  onCommentsCountChange,
  sheetMode = false,
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
    if (!openMenuId && !openReactionBarId && !emojiPopoverOpen) return;
    const handleClickOutside = () => {
      setOpenMenuId(null);
      setOpenReactionBarId(null);
      setEmojiPopoverOpen(false);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [openMenuId, openReactionBarId, emojiPopoverOpen]);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(140, Math.max(24, el.scrollHeight))}px`;
  }, []);

  const handleSelectReply = (comment: PublicationCommentItem) => {
    setReplyTo(comment);
    setOpenMenuId(null);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 30);
  };

  const handleCancelReply = () => {
    setReplyTo(null);
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
      const created = await apiFetch<PublicationCommentItem & { commentsCount?: number }>(
        `/posts/${postId}/comments`,
        {
          method: 'POST',
          json: {
            content: trimmed,
            parentId: replyTo?.id,
          },
        }
      );
      setComments((prev) => [created, ...prev]);
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

  const scrollToComment = (commentId: string) => {
    const el = document.getElementById(`comment-${commentId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('bg-brand-900/10');
      setTimeout(() => {
        el.classList.remove('bg-brand-900/10');
      }, 1400);
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

  const renderEditor = () => (
    <div
      className={cn(
        'bg-bg-pr z-10',
        sheetMode ? 'border-t border-bord-pr shrink-0' : 'sticky top-0'
      )}
    >
      {/* Reply Preview Banner matching PublicationCommentEditor.vue / mobile CommentEditor.vue */}
      {replyTo && (
        <div className="px-4 pt-2.5 pb-1 bg-bg-pr border-t border-bord-card">
          <div className="flex items-center overflow-hidden bg-fill-qt/70 rounded-xl px-3 py-2">
            <div className="size-7 rounded-full bg-brand-900 text-white inline-flex items-center justify-center shrink-0">
              <CornerUpLeft className="size-3.5" />
            </div>
            <div className="flex-1 overflow-hidden mx-2.5 leading-tight">
              <div className="text-par-s font-semibold text-lab-pr2 truncate">
                {getAuthorDisplayName(replyTo.author)}{' '}
                <span className="font-normal text-lab-sc ml-1">
                  {formatRelativeTime(replyTo.createdAt)}
                </span>
              </div>
              <p className="text-par-s text-lab-pr3 truncate">{replyTo.content}</p>
            </div>
            <button
              type="button"
              onClick={handleCancelReply}
              className="shrink-0 size-6 inline-flex items-center justify-center rounded-full text-lab-sc hover:text-lab-pr hover:bg-fill-tr cursor-pointer"
              aria-label="Cancel reply"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmitComment}
        className={cn(
          'block px-4 py-3',
          !sheetMode && 'border-b border-bord-pr'
        )}
      >
        <div className="flex items-end gap-2.5 rounded-2xl bg-fill-qt/50 border border-bord-pr px-3 py-2 focus-within:border-brand-900/60 transition-colors">
          {user && (
            <div className="shrink-0 pb-0.5">
              <Avatar src={user.avatar} alt={user.username} size="xs" />
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
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void handleSubmitComment();
                }
              }}
              rows={1}
              placeholder={
                replyTo
                  ? `Reply to ${getAuthorDisplayName(replyTo.author)}...`
                  : 'Enter your comment...'
              }
              className="w-full resize-none bg-transparent text-par-n text-lab-pr placeholder:text-lab-sc focus:outline-none max-h-36 leading-5 py-0.5"
            />
          </div>

          <div className="flex items-center gap-1 shrink-0 pb-0.5 relative">
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setEmojiPopoverOpen((v) => !v)}
                className="size-7 rounded-full inline-flex items-center justify-center text-lab-sc hover:text-lab-pr2 hover:bg-fill-qt transition-colors cursor-pointer"
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

      {!sheetMode && (
        <div className="px-4 bg-fill-fv py-2 text-par-s text-lab-sc text-center block font-semibold border-b border-bord-pr">
          Comments ({commentsCount})
        </div>
      )}
    </div>
  );

  const renderCommentsList = () => {
    if (loading) {
      return (
        <div className="py-12 flex items-center justify-center">
          <Loader2 className="size-6 animate-spin text-brand-900" />
        </div>
      );
    }

    if (comments.length === 0) {
      return (
        <div className="py-12 px-4 text-center">
          <div className="size-10 rounded-full bg-fill-qt mx-auto mb-2.5 flex items-center justify-center text-lab-sc">
            <MessageCircle className="size-5 opacity-60" />
          </div>
          <p className="text-par-s text-lab-sc">
            No comments yet. Be the first to join the conversation!
          </p>
        </div>
      );
    }

    return (
      <div className="divide-y divide-bord-pr">
        {comments.map((c) => {
          const authorName = getAuthorDisplayName(c.author);
          const hasParent = Boolean(c.hasParent || c.parentId);
          const parentComment = c.parent;
          const viewerReactedAny = (c.viewerReactions?.length || 0) > 0;
          const isMenuOpen = openMenuId === c.id;
          const isReactionBarOpen = openReactionBarId === c.id;
          const translated = translations[c.id];
          const isTranslating = translatingId === c.id;

          return (
            <div
              key={c.id}
              id={`comment-${c.id}`}
              className="px-4 py-3.5 hover:bg-fill-qt/20 relative transition-colors"
            >
              <div className="flex items-start gap-2.5">
                <Link href={`/@${c.author?.username}`} className="shrink-0 mt-0.5">
                  <Avatar
                    src={c.author?.avatar}
                    alt={c.author?.username || 'user'}
                    size="sm"
                    verified={c.author?.verified}
                  />
                </Link>

                <div className="flex-1 min-w-0">
                  {/* Header: Name + time + menu */}
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Link
                        href={`/@${c.author?.username}`}
                        className="text-par-n font-semibold text-lab-pr2 leading-tight truncate hover:underline inline-flex items-center gap-1"
                      >
                        <span className="truncate">{authorName}</span>
                        {c.author?.verified && <Badge variant="brand">✓</Badge>}
                      </Link>
                      <span className="text-par-s text-lab-sc leading-tight shrink-0">
                        {formatRelativeTime(c.createdAt)}
                      </span>
                    </div>

                    {/* Top-right ··· menu matching PublicationComment.vue */}
                    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenReactionBarId(null);
                          setOpenMenuId(isMenuOpen ? null : c.id);
                        }}
                        className="size-6 rounded-full inline-flex items-center justify-center text-lab-tr hover:text-lab-pr2 hover:bg-fill-qt transition-colors cursor-pointer"
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
                                    void handleToggleCommentReaction(
                                      c,
                                      rx.unifiedId,
                                      rx.nativeSymbol
                                    )
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
                            className="w-full px-3.5 py-2 text-left text-par-s text-lab-pr2 hover:bg-fill-qt flex items-center gap-2.5 cursor-pointer"
                          >
                            <CornerUpLeft className="size-4 text-lab-sc shrink-0" />
                            <span className="truncate">Reply to {authorName}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleTranslateComment(c)}
                            className="w-full px-3.5 py-2 text-left text-par-s text-lab-pr2 hover:bg-fill-qt flex items-center gap-2.5 cursor-pointer"
                          >
                            <Languages className="size-4 text-lab-sc shrink-0" />
                            <span>{translated ? 'Hide translation' : 'Translate'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleCopyText(c)}
                            className="w-full px-3.5 py-2 text-left text-par-s text-lab-pr2 hover:bg-fill-qt flex items-center gap-2.5 cursor-pointer"
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

                  {/* Inline Parent Quote Row matching PHP PublicationComment.vue & mobile Comment.vue */}
                  {hasParent && (
                    <div className="mb-1.5 flex items-center leading-none overflow-hidden">
                      {parentComment ? (
                        <button
                          type="button"
                          onClick={() => scrollToComment(parentComment.id)}
                          className="inline-flex items-center gap-1.5 text-left max-w-full hover:opacity-80 cursor-pointer overflow-hidden"
                        >
                          <span className="text-brand-900 font-semibold text-par-s inline-flex items-center gap-1 shrink-0">
                            <CornerUpLeft className="size-3.5" />
                            <span>{getAuthorDisplayName(parentComment.author)}</span>
                          </span>
                          <span className="text-par-n text-lab-pr3 line-clamp-1 break-all">
                            {parentComment.content}
                          </span>
                        </button>
                      ) : (
                        <span className="text-par-n text-lab-sc italic">
                          Comment was deleted
                        </span>
                      )}
                    </div>
                  )}

                  {/* Comment Content */}
                  <div className="mb-1.5 pr-2">
                    <p className="text-par-n text-lab-pr2 break-words whitespace-pre-wrap leading-snug">
                      {renderCommentRichText(c.content)}
                    </p>

                    {translated && (
                      <div className="my-2 border-l-2 border-brand-900/60 pl-2.5 py-0.5">
                        <p className="text-par-n text-lab-pr2 break-words whitespace-pre-wrap leading-snug mb-0.5">
                          {translated}
                        </p>
                        <span className="text-cap-s text-lab-sc">Translated by AI</span>
                      </div>
                    )}
                  </div>

                  {/* Comment Reactions Viewer matching ReactionsViewer.vue */}
                  {Array.isArray(c.reactionSummary) && c.reactionSummary.length > 0 && (
                    <div className="my-1.5 flex flex-wrap gap-1.5">
                      {c.reactionSummary
                        .filter((r) => r.count > 0)
                        .map((r) => {
                          const isMine = c.viewerReactions?.includes(r.unifiedId);
                          return (
                            <button
                              key={r.unifiedId}
                              type="button"
                              onClick={() =>
                                void handleToggleCommentReaction(c, r.unifiedId, r.nativeSymbol)
                              }
                              className={cn(
                                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-cap-l border transition-colors cursor-pointer',
                                isMine
                                  ? 'bg-brand-900/15 border-brand-900/40 text-brand-900 font-semibold'
                                  : 'bg-fill-qt/70 border-bord-pr text-lab-pr2 hover:bg-fill-qt'
                              )}
                            >
                              <span>{r.nativeSymbol}</span>
                              <span>{r.count}</span>
                            </button>
                          );
                        })}
                    </div>
                  )}

                  {/* Bottom Action Bar: Like · Reply · Show translation */}
                  <div className="flex items-center leading-none mt-2 gap-3.5 relative">
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
                          'text-cap-l cursor-pointer transition-colors',
                          viewerReactedAny
                            ? 'text-brand-900 font-semibold'
                            : 'text-lab-sc font-normal hover:text-brand-900'
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
                                void handleToggleCommentReaction(
                                  c,
                                  rx.unifiedId,
                                  rx.nativeSymbol
                                )
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
                      className="text-cap-l text-lab-sc font-normal hover:text-brand-900 cursor-pointer transition-colors"
                    >
                      Reply
                    </button>

                    {c.content.trim().length > 3 && (
                      <button
                        type="button"
                        onClick={() => void handleTranslateComment(c)}
                        disabled={isTranslating}
                        className="text-cap-l text-lab-sc font-normal hover:text-brand-900 cursor-pointer transition-colors"
                      >
                        {isTranslating
                          ? 'Translating...'
                          : translated
                            ? 'Show untranslated'
                            : 'Show translation'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      {sheetMode ? (
        <div className="flex flex-col max-h-[75vh]">
          <div className="flex-1 overflow-y-auto min-h-[220px]">{renderCommentsList()}</div>
          {renderEditor()}
        </div>
      ) : (
        <div className="block">
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
