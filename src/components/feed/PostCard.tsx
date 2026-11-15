'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bookmark,
  Bot,
  Eye,
  ExternalLink,
  FileDown,
  Flag,
  Globe,
  Heart,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pin,
  Play,
  Repeat2,
  Share2,
  Trash2,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { ReportModal } from '@/components/modals/ReportModal';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';
import { apiFetch } from '@/lib/api-client';
import { formatRelativeTime } from '@/lib/i18n';
import { GiphyAttribution } from '@/components/feed/GiphyPicker';
import { cn } from '@/lib/utils';

export interface SerializedMedia {
  id?: string;
  _id?: string;
  type: 'image' | 'video' | 'audio' | 'document';
  publicUrl?: string;
  url?: string;
  thumbnailUrl?: string | null;
  lqipBase64?: string;
  mimeType?: string;
  filename?: string;
  width?: number;
  height?: number;
}

export interface SerializedPost {
  id: string;
  hashId: string;
  author: {
    _id: string;
    username: string;
    firstName: string;
    lastName: string;
    avatar: string;
    verified?: boolean;
  };
  title?: string;
  content: string;
  type: string;
  location?: string;
  isSensitive?: boolean;
  isAiGenerated?: boolean;
  profilePinned?: boolean;
  globalPinned?: boolean;
  gifUrl?: string;
  media?: SerializedMedia[];
  poll?: {
    choices: Array<{ id?: string; text: string; votesCount: number; voters?: string[] }>;
    votesByUser?: Record<string, string>;
    totalVotes?: number;
    isAnonymous?: boolean;
    expiresAt?: string;
  };
  linkSnapshot?: {
    url: string;
    title?: string;
    description?: string;
    image?: string;
    domain?: string;
  };
  quotePostId?: {
    _id?: string;
    hashId?: string;
    content?: string;
    author?: { username: string; firstName: string; lastName: string; avatar: string };
    userId?: { username: string; firstName: string; lastName: string; avatar: string };
  } | null;
  reactionsCount: number;
  commentsCount: number;
  repostsCount: number;
  viewsCount: number;
  viewerReactions?: string[];
  isBookmarked?: boolean;
  createdAt: string;
}

const REACTION_EMOJIS = [
  { id: '2764-fe0f', label: '❤️' },
  { id: '1f525', label: '🔥' },
  { id: '1f44f', label: '👏' },
  { id: '1f602', label: '😂' },
  { id: '1f62e', label: '😮' },
];

export function PostCard({
  post,
  onDeleted,
  onQuote,
}: {
  post: SerializedPost;
  onDeleted?: (id: string) => void;
  onQuote?: (post: SerializedPost) => void;
}) {
  const { user, locale, playAudio, socket } = useApp();
  const { error, success } = useToast();

  const [liked, setLiked] = useState((post.viewerReactions || []).length > 0);
  const [reactionsCount, setReactionsCount] = useState(post.reactionsCount || 0);
  const [commentsCount, setCommentsCount] = useState(post.commentsCount || 0);
  const [repostsCount, setRepostsCount] = useState(post.repostsCount || 0);
  const [bookmarked, setBookmarked] = useState(Boolean(post.isBookmarked));
  const [pinned, setPinned] = useState(Boolean(post.profilePinned));
  const [revealSensitive, setRevealSensitive] = useState(false);
  const [pollState, setPollState] = useState(post.poll);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [repostMenuOpen, setRepostMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const isOwner = user && String(post.author?._id) === user.id;

  useEffect(() => {
    const id = setTimeout(() => {
      setReactionsCount(post.reactionsCount || 0);
      setCommentsCount(post.commentsCount || 0);
      setRepostsCount(post.repostsCount || 0);
      setPollState(post.poll);
      setPinned(Boolean(post.profilePinned));
    }, 0);
    return () => clearTimeout(id);
  }, [post.reactionsCount, post.commentsCount, post.repostsCount, post.poll, post.profilePinned]);

  useEffect(() => {
    if (!socket || !post.id) return;
    socket.emit('join:post', { postId: post.id });
    const onReactionUpdate = (data: {
      postId?: string;
      reactionsCount?: number;
      repostsCount?: number;
      poll?: SerializedPost['poll'];
    }) => {
      if (data.postId !== post.id) return;
      if (typeof data.reactionsCount === 'number') setReactionsCount(data.reactionsCount);
      if (typeof data.repostsCount === 'number') setRepostsCount(data.repostsCount);
      if (data.poll) setPollState(data.poll);
    };
    const onCommentNew = (data: { postId?: string }) => {
      if (data.postId !== post.id) return;
      setCommentsCount((c) => c + 1);
    };
    socket.on('post:reaction:update', onReactionUpdate);
    socket.on('post:comment:new', onCommentNew);
    return () => {
      socket.emit('leave:post', { postId: post.id });
      socket.off('post:reaction:update', onReactionUpdate);
      socket.off('post:comment:new', onCommentNew);
    };
  }, [socket, post.id]);

  async function handleRepost() {
    setRepostMenuOpen(false);
    if (!user) {
      error('Please sign in to repost');
      return;
    }
    setRepostsCount((c) => c + 1);
    try {
      const res = await apiFetch<{ repostsCount?: number }>(`/posts/${post.id}/react`, {
        method: 'POST',
        json: { action: 'repost' },
      });
      if (typeof res.repostsCount === 'number') setRepostsCount(res.repostsCount);
      success('Reposted');
    } catch (err) {
      setRepostsCount((c) => Math.max(0, c - 1));
      error('Could not repost', err instanceof Error ? err.message : undefined);
    }
  }

  async function toggleReaction(unifiedId = '2764-fe0f') {
    if (!user) {
      error('Please sign in to react');
      return;
    }
    const prevLiked = liked;
    const prevCount = reactionsCount;
    setLiked(!prevLiked);
    setReactionsCount(prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1);
    try {
      const res = await apiFetch<{ reacted: boolean; reactionsCount: number }>(
        `/posts/${post.id}/react`,
        {
          method: 'POST',
          json: { action: 'react', unifiedId },
        }
      );
      setLiked(res.reacted);
      if (typeof res.reactionsCount === 'number') setReactionsCount(res.reactionsCount);
    } catch {
      setLiked(prevLiked);
      setReactionsCount(prevCount);
    }
  }

  async function toggleBookmark() {
    if (!user) {
      error('Please sign in to bookmark posts');
      return;
    }
    const prev = bookmarked;
    setBookmarked(!prev);
    try {
      const res = await apiFetch<{ bookmarked: boolean }>(`/posts/${post.id}/react`, {
        method: 'POST',
        json: { action: 'bookmark' },
      });
      setBookmarked(res.bookmarked);
      success(res.bookmarked ? 'Saved to bookmarks' : 'Removed from bookmarks');
    } catch {
      setBookmarked(prev);
    }
  }

  async function votePoll(choiceIndex: number, choiceId?: string) {
    if (!user) {
      error('Please sign in to vote');
      return;
    }
    try {
      const res = await apiFetch<{ poll: SerializedPost['poll'] }>(`/posts/${post.id}/react`, {
        method: 'POST',
        json: { action: 'poll_vote', choiceId: choiceId || `c_${choiceIndex}`, choiceIndex },
      });
      if (res.poll) setPollState(res.poll);
    } catch (err) {
      error('Vote failed', err instanceof Error ? err.message : undefined);
    }
  }

  async function handleTranslate() {
    if (translatedText) {
      setTranslatedText(null);
      return;
    }
    setTranslating(true);
    try {
      const res = await apiFetch<{ translatedText: string }>('/translate', {
        method: 'POST',
        json: { text: post.content, targetLang: locale || 'en' },
      });
      setTranslatedText(res.translatedText);
    } catch (err) {
      error('Translation unavailable', err instanceof Error ? err.message : undefined);
    } finally {
      setTranslating(false);
    }
  }

  async function handleDelete() {
    try {
      await apiFetch(`/posts/${post.id}`, { method: 'DELETE' });
      success('Post deleted');
      onDeleted?.(post.id);
    } catch (err) {
      error('Failed to delete post', err instanceof Error ? err.message : undefined);
    }
  }

  async function handlePin() {
    try {
      await apiFetch(`/posts/${post.id}`, {
        method: 'PATCH',
        json: { profilePinned: !pinned },
      });
      setPinned((v) => !v);
      success(pinned ? 'Unpinned from profile' : 'Pinned to profile');
      setMenuOpen(false);
    } catch (err) {
      error('Action failed', err instanceof Error ? err.message : undefined);
    }
  }

  function handleShare() {
    const url = `${window.location.origin}/publication/${post.hashId}`;
    if (navigator.share) {
      navigator.share({ title: post.title || 'Weto Post', url }).catch(() => undefined);
    } else {
      navigator.clipboard.writeText(url).then(() => success('Link copied to clipboard'));
    }
  }

  function renderRichContent(text: string) {
    const tokens = text.split(/(\s+)/);
    return tokens.map((tok, i) => {
      if (tok.startsWith('#') && tok.length > 1) {
        const tag = tok.slice(1).replace(/[^\w]/g, '');
        return (
          <Link
            key={i}
            href={`/explore?tag=${encodeURIComponent(tag)}`}
            className="text-brand-900 hover:underline font-medium"
          >
            {tok}
          </Link>
        );
      }
      if (tok.startsWith('@') && tok.length > 1) {
        const uname = tok.slice(1).replace(/[^\w.]/g, '');
        return (
          <Link key={i} href={`/@${uname}`} className="text-brand-900 hover:underline font-medium">
            {tok}
          </Link>
        );
      }
      if (tok.startsWith('http://') || tok.startsWith('https://')) {
        return (
          <a
            key={i}
            href={tok}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-900 hover:underline break-all"
          >
            {tok}
          </a>
        );
      }
      return <React.Fragment key={i}>{tok}</React.Fragment>;
    });
  }

  const quoteData = post.quotePostId;
  const quoteAuthor = quoteData?.author || quoteData?.userId;

  return (
    <article className="border-b border-bord-tr p-4 transition-colors">
      {(post.globalPinned || pinned) && (
        <div className="flex items-center gap-1.5 text-cap-s text-lab-sc mb-2 pl-12">
          <Pin className="h-3 w-3 text-lab-sc" />
          <span>{post.globalPinned ? 'Featured publication' : 'Pinned post'}</span>
        </div>
      )}

      <div className="flex gap-3">
        <Link href={`/@${post.author?.username}`} className="shrink-0">
          <Avatar
            src={post.author?.avatar}
            alt={post.author?.username}
            verified={post.author?.verified}
            size="sm"
          />
        </Link>

        <div className="flex-1 min-w-0 space-y-2">
          {/* Header Row */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <Link
                href={`/@${post.author?.username}`}
                className="text-par-n font-bold text-lab-pr hover:underline truncate"
              >
                {post.author?.firstName} {post.author?.lastName}
              </Link>
              <Link href={`/@${post.author?.username}`} className="text-cap-l text-lab-sc truncate">
                @{post.author?.username}
              </Link>
              <span className="text-lab-tr">·</span>
              <Link
                href={`/publication/${post.hashId}`}
                className="text-cap-l text-lab-tr hover:underline"
              >
                {formatRelativeTime(post.createdAt, locale)}
              </Link>
              {post.isAiGenerated && (
                <Badge variant="default">
                  <Bot className="h-3 w-3" /> AI
                </Badge>
              )}
              {post.location && (
                <span className="inline-flex items-center gap-1 text-cap-s text-lab-sc">
                  <MapPin className="h-3 w-3" /> {post.location}
                </span>
              )}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="p-1.5 rounded-full text-lab-tr hover:bg-fill-sc hover:text-lab-pr cursor-pointer"
                aria-label="Post options"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-44 rounded-2xl border border-bord-pr bg-bg-pr shadow-vertical-tr py-1 z-20">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      handleTranslate();
                    }}
                    className="w-full px-3.5 py-2 text-left text-cap-l text-lab-pr hover:bg-fill-pr flex items-center gap-2"
                  >
                    <Globe className="h-4 w-4" /> {translatedText ? 'Show original' : 'Translate'}
                  </button>
                  {isOwner && (
                    <>
                      <button
                        type="button"
                        onClick={handlePin}
                        className="w-full px-3.5 py-2 text-left text-cap-l text-lab-pr hover:bg-fill-pr flex items-center gap-2"
                      >
                        <Pin className="h-4 w-4" /> {pinned ? 'Unpin' : 'Pin to profile'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          handleDelete();
                        }}
                        className="w-full px-3.5 py-2 text-left text-cap-l text-red-900 hover:bg-fill-pr flex items-center gap-2"
                      >
                        <Trash2 className="h-4 w-4" /> Delete
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setReportOpen(true);
                    }}
                    className="w-full px-3.5 py-2 text-left text-cap-l text-red-900 hover:bg-fill-pr flex items-center gap-2"
                  >
                    <Flag className="h-4 w-4" /> Report post
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Title & Body */}
          {post.title && <h3 className="text-par-l font-bold text-lab-pr">{post.title}</h3>}

          {post.content && (
            <div className="text-par-m text-lab-pr whitespace-pre-wrap break-words leading-relaxed">
              {renderRichContent(translatedText || post.content)}
              {translating && <span className="ml-2 text-cap-s text-lab-tr">Translating...</span>}
            </div>
          )}

          {/* Sensitive Wrapper */}
          {post.isSensitive && !revealSensitive && (post.media?.length || post.gifUrl) ? (
            <div className="rounded-2xl border border-bord-pr bg-fill-sc p-6 text-center space-y-2">
              <p className="text-par-n font-semibold text-lab-pr">Sensitive Media</p>
              <p className="text-cap-l text-lab-sc">The author marked this media as sensitive.</p>
              <Button size="sm" variant="outline" onClick={() => setRevealSensitive(true)}>
                <Eye className="h-3.5 w-3.5" /> View media
              </Button>
            </div>
          ) : (
            <>
              {/* GIF */}
              {post.gifUrl && (
                <div className="relative rounded-2xl overflow-hidden border border-bord-card bg-fill-pr">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={post.gifUrl} alt="GIF attachment" className="w-full max-h-96 object-cover" />
                  <GiphyAttribution className="absolute bottom-2 left-2 z-10" />
                </div>
              )}

              {/* Media attachments */}
              {post.media && post.media.length > 0 && (
                <div
                  className={cn(
                    'grid gap-1.5',
                    post.media.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
                  )}
                >
                  {post.media.map((m, idx) => {
                    const src = m.publicUrl || m.url || '';
                    if (m.type === 'image') {
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setLightboxUrl(src)}
                          className="block w-full rounded-2xl overflow-hidden border border-bord-card bg-fill-pr cursor-pointer"
                          style={
                            m.lqipBase64
                              ? { backgroundImage: `url(${m.lqipBase64})`, backgroundSize: 'cover' }
                              : undefined
                          }
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={src}
                            alt={m.filename || 'Post image'}
                            loading="lazy"
                            className="w-full max-h-[460px] object-cover"
                          />
                        </button>
                      );
                    }
                    if (m.type === 'video') {
                      return (
                        <video
                          key={idx}
                          src={src}
                          poster={m.thumbnailUrl || undefined}
                          controls
                          preload="metadata"
                          className="w-full max-h-[460px] rounded-2xl border border-bord-card bg-black"
                        />
                      );
                    }
                    if (m.type === 'audio') {
                      return (
                        <div
                          key={idx}
                          className="col-span-full flex items-center justify-between gap-3 rounded-2xl border border-bord-pr bg-fill-pr p-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <button
                              type="button"
                              onClick={() =>
                                playAudio({
                                  id: `${post.id}-${idx}`,
                                  title: m.filename || post.title || 'Audio track',
                                  artist: `@${post.author?.username}`,
                                  src,
                                })
                              }
                              className="h-10 w-10 rounded-full bg-lab-pr2 text-bg-pr flex items-center justify-center shrink-0 cursor-pointer hover:opacity-90 smoothing"
                            >
                              <Play className="h-4 w-4 ml-0.5" />
                            </button>
                            <div className="min-w-0">
                              <p className="text-par-n font-semibold text-lab-pr truncate">
                                {m.filename || 'Audio clip'}
                              </p>
                              <p className="text-cap-s text-lab-sc">Click to play in Soundbar</p>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <a
                        key={idx}
                        href={src}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="col-span-full flex items-center justify-between rounded-2xl border border-bord-pr bg-fill-pr p-3 hover:bg-fill-sc"
                      >
                        <span className="text-par-n font-medium text-lab-pr truncate">
                          {m.filename || 'Download document'}
                        </span>
                        <FileDown className="h-4 w-4 text-lab-pr2 shrink-0" />
                      </a>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Poll */}
          {pollState && pollState.choices && pollState.choices.length > 0 && (() => {
            const totalVotes = pollState.choices.reduce((acc, c) => acc + (c.votesCount || 0), 0);
            const myVoteId = user ? pollState.votesByUser?.[user.id] : undefined;
            return (
              <div className="rounded-2xl border border-bord-pr bg-fill-pr/40 p-3.5 space-y-2">
                {pollState.choices.map((ch, idx) => {
                  const choiceId = ch.id || `c_${idx}`;
                  const pct = totalVotes > 0 ? Math.round(((ch.votesCount || 0) / totalVotes) * 100) : 0;
                  const voted = Boolean(
                    user && (myVoteId === choiceId || ch.voters?.includes(user.id))
                  );
                  return (
                    <button
                      key={choiceId}
                      type="button"
                      onClick={() => votePoll(idx, choiceId)}
                      className={cn(
                        'relative w-full text-left rounded-xl border p-2.5 overflow-hidden cursor-pointer transition-colors',
                        voted ? 'border-lab-pr2 bg-fill-qt' : 'border-bord-pr hover:bg-fill-fv'
                      )}
                    >
                      <div
                        className="absolute inset-y-0 left-0 bg-fill-sc transition-all"
                        style={{ width: `${pct}%` }}
                      />
                      <div className="relative flex items-center justify-between text-par-n">
                        <span className={cn('font-medium text-lab-pr', voted && 'font-semibold')}>
                          {ch.text}
                        </span>
                        <span className="text-cap-l text-lab-sc">{pct}%</span>
                      </div>
                    </button>
                  );
                })}
                <p className="text-cap-s text-lab-tr">
                  {totalVotes} vote{totalVotes === 1 ? '' : 's'} {pollState.isAnonymous ? '· Anonymous poll' : ''}
                </p>
              </div>
            );
          })()}

          {/* Link Snapshot */}
          {post.linkSnapshot && (
            <a
              href={post.linkSnapshot.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-2xl border border-bord-card overflow-hidden hover:bg-fill-pr/50 transition-colors"
            >
              {post.linkSnapshot.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.linkSnapshot.image}
                  alt={post.linkSnapshot.title || 'Link preview'}
                  className="w-full h-44 object-cover"
                />
              )}
              <div className="p-3 space-y-0.5">
                <p className="text-cap-s text-lab-tr flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" /> {post.linkSnapshot.domain || post.linkSnapshot.url}
                </p>
                {post.linkSnapshot.title && (
                  <p className="text-par-n font-semibold text-lab-pr line-clamp-1">
                    {post.linkSnapshot.title}
                  </p>
                )}
                {post.linkSnapshot.description && (
                  <p className="text-cap-l text-lab-sc line-clamp-2">{post.linkSnapshot.description}</p>
                )}
              </div>
            </a>
          )}

          {/* Quoted Post */}
          {quoteData && quoteData.hashId && (
            <Link
              href={`/publication/${quoteData.hashId}`}
              className="block rounded-2xl border border-bord-card bg-fill-pr/40 p-3 space-y-1 hover:bg-fill-pr"
            >
              <div className="flex items-center gap-2 text-cap-l text-lab-sc">
                <Avatar src={quoteAuthor?.avatar} alt={quoteAuthor?.username} size="xs" />
                <span className="font-semibold text-lab-pr">
                  {quoteAuthor?.firstName} {quoteAuthor?.lastName}
                </span>
                <span>@{quoteAuthor?.username}</span>
              </div>
              <p className="text-par-n text-lab-pr line-clamp-3">{quoteData.content}</p>
            </Link>
          )}

          {/* Engagement Bar matching PHP TimelinePublication.vue + PrimaryIconButton.vue */}
          <div className="flex items-center justify-between pt-1 text-lab-pr3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => toggleReaction('2764-fe0f')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-cap-l hover:bg-fill-tr hover:text-lab-pr transition-colors cursor-pointer',
                  liked && 'text-red-900 font-semibold'
                )}
              >
                <Heart className={cn('h-4 w-4', liked && 'fill-current')} />
                <span>{reactionsCount}</span>
              </button>
              <div className="hidden sm:flex items-center gap-0.5">
                {REACTION_EMOJIS.slice(1).map((em) => (
                  <button
                    key={em.id}
                    type="button"
                    onClick={() => toggleReaction(em.id)}
                    className="h-7 w-7 rounded-full hover:bg-fill-tr text-sm flex items-center justify-center cursor-pointer"
                    title="React"
                  >
                    {em.label}
                  </button>
                ))}
              </div>
            </div>

            <Link
              href={`/publication/${post.hashId}`}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-cap-l hover:bg-fill-tr hover:text-lab-pr transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              <span>{commentsCount}</span>
            </Link>

            <div className="relative">
              <button
                type="button"
                onClick={() => (onQuote ? setRepostMenuOpen((v) => !v) : handleRepost())}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-cap-l hover:bg-fill-tr hover:text-lab-pr transition-colors cursor-pointer"
                title="Repost or Quote"
              >
                <Repeat2 className="h-4 w-4" />
                <span>{repostsCount}</span>
              </button>
              {repostMenuOpen && (
                <div className="absolute bottom-full mb-1 left-0 w-40 rounded-2xl border border-bord-pr bg-bg-pr shadow-vertical-tr py-1 z-20">
                  <button
                    type="button"
                    onClick={handleRepost}
                    className="w-full px-3.5 py-2 text-left text-cap-l text-lab-pr hover:bg-fill-pr"
                  >
                    Repost
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRepostMenuOpen(false);
                      onQuote?.(post);
                    }}
                    className="w-full px-3.5 py-2 text-left text-cap-l text-lab-pr hover:bg-fill-pr"
                  >
                    Quote post
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleBookmark}
                className={cn(
                  'p-2 rounded-full hover:bg-fill-tr hover:text-lab-pr transition-colors cursor-pointer',
                  bookmarked && 'text-lab-pr'
                )}
                aria-label="Bookmark"
              >
                <Bookmark className={cn('h-4 w-4', bookmarked && 'fill-current')} />
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="p-2 rounded-full hover:bg-fill-tr hover:text-lab-pr transition-colors cursor-pointer"
                aria-label="Share"
              >
                <Share2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="post"
        targetId={post.id}
      />

      {lightboxUrl && (
        <Modal
          open={Boolean(lightboxUrl)}
          onClose={() => setLightboxUrl(null)}
          title="Media Preview"
          maxWidthClass="max-w-3xl"
        >
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightboxUrl} alt="Publication media" className="max-h-[78vh] w-auto rounded-2xl object-contain" />
          </div>
        </Modal>
      )}
    </article>
  );
}
