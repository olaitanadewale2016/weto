'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  Bookmark,
  Bot,
  CheckCircle2,
  Circle,
  Eye,
  ExternalLink,
  FileDown,
  Flag,
  Globe,
  Heart,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pause,
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
import { MediaLightbox } from '@/components/ui/media-lightbox';
import { VideoWatermarkOverlay } from '@/components/ui/video-watermark';
import { ReportModal } from '@/components/modals/ReportModal';
import { PublicationCommentsSection } from '@/components/feed/PublicationCommentsSection';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';
import { apiFetch } from '@/lib/api-client';
import { formatRelativeTime } from '@/lib/i18n';
import { resolveMediaUrl } from '@/lib/media-url';
import { GiphyAttribution } from '@/components/feed/GiphyPicker';
import { cn } from '@/lib/utils';

export interface SerializedMedia {
  id?: string;
  _id?: string;
  type: 'image' | 'video' | 'audio' | 'document';
  publicUrl?: string;
  url?: string;
  thumbnailUrl?: string | null;
  lqipBase64?: string | null;
  mimeType?: string;
  extension?: string;
  sizeBytes?: number;
  durationSeconds?: number;
  filename?: string;
  width?: number;
  height?: number;
  metadata?: {
    watermarked?: boolean;
    [key: string]: unknown;
  };
}

const KNOWN_FILE_FORMAT_ICONS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'text',
  'mp3',
  'mp4',
]);

const AUDIO_WAVEFORM_BARS = [
  28, 52, 74, 42, 88, 60, 36, 92, 68, 46, 80, 54, 34, 72, 94, 58, 40, 82, 64, 38, 70, 48, 86, 56,
  32, 66, 78, 44,
];

function formatMediaBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAudioDuration(secs?: number): string {
  if (!secs || secs <= 0) return '';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getFileFormatIconSrc(extension?: string, filename?: string): string {
  const ext = (extension || filename?.split('.').pop() || '').toLowerCase().trim();
  const icon = KNOWN_FILE_FORMAT_ICONS.has(ext) ? ext : 'text';
  return `/assets/icons/file-format/${icon}.png`;
}

export interface SerializedPost {
  id: string;
  hashId: string;
  author: {
    _id: string;
    id?: string;
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
  isQuoting?: boolean;
  profilePinned?: boolean;
  globalPinned?: boolean;
  gifUrl?: string;
  media?: SerializedMedia[];
  poll?: {
    choices: Array<{
      id?: string;
      text: string;
      votesCount: number;
      percentage?: number;
      voters?: string[];
    }>;
    votesByUser?: Record<string, string>;
    voterIds?: string[];
    totalVotes?: number;
    isAnonymous?: boolean;
    isCancellable?: boolean;
    expiresAt?: string | null;
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
    id?: string;
    hashId?: string;
    content?: string;
    type?: string;
    gifUrl?: string;
    media?: SerializedMedia[];
    poll?: SerializedPost['poll'];
    createdAt?: string;
    author?: {
      username: string;
      firstName: string;
      lastName: string;
      avatar: string;
      verified?: boolean;
    };
    userId?: {
      username: string;
      firstName: string;
      lastName: string;
      avatar: string;
      verified?: boolean;
    };
  } | null;
  reactionsCount: number;
  commentsCount: number;
  repostsCount: number;
  viewsCount: number;
  viewerReactions?: string[];
  isBookmarked?: boolean;
  viewerReposted?: boolean;
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
  isDetailView = false,
}: {
  post: SerializedPost;
  onDeleted?: (id: string) => void;
  onQuote?: (post: SerializedPost) => void;
  isDetailView?: boolean;
}) {
  const router = useRouter();
  const { user, locale, playAudio, soundbarTrack, isAudioPlaying, togglePlayAudio, socket } =
    useApp();
  const { error, success } = useToast();

  const [viewerReactions, setViewerReactions] = useState<string[]>(post.viewerReactions || []);
  const [reactionsCount, setReactionsCount] = useState(post.reactionsCount || 0);
  const [commentsCount, setCommentsCount] = useState(post.commentsCount || 0);
  const [repostsCount, setRepostsCount] = useState(post.repostsCount || 0);
  const [reposted, setReposted] = useState(Boolean(post.viewerReposted));
  const [bookmarked, setBookmarked] = useState(Boolean(post.isBookmarked));
  const [pinned, setPinned] = useState(Boolean(post.profilePinned));
  const [revealSensitive, setRevealSensitive] = useState(false);
  const [pollState, setPollState] = useState(post.poll);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [repostMenuOpen, setRepostMenuOpen] = useState(false);
  const [internalQuoteOpen, setInternalQuoteOpen] = useState(false);
  const [quoteDraft, setQuoteDraft] = useState('');
  const [submittingQuote, setSubmittingQuote] = useState(false);
  const [mobileCommentsOpen, setMobileCommentsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const liked = viewerReactions.length > 0;

  const postImages = (post.media || []).filter((m) => m.type === 'image');
  const postGifOffset = post.gifUrl ? 1 : 0;
  const lightboxImages = [
    ...(post.gifUrl ? [{ url: post.gifUrl, lqipBase64: null, alt: 'GIF attachment' }] : []),
    ...postImages.map((m) => ({
      url: m.publicUrl || m.url || '',
      lqipBase64: m.lqipBase64,
      alt: m.filename || 'Publication media',
    })),
  ];

  const isOwner = Boolean(user && post.author?._id && String(post.author._id) === user.id);
  const authorHandle = (
    (isOwner ? user?.username : post.author?.username) ||
    post.author?.username ||
    (post.author?._id ? String(post.author._id) : '')
  ).trim();
  const authorHref = authorHandle ? `/@${encodeURIComponent(authorHandle).replace(/%40/g, '@')}` : null;
  const authorAvatarSrc = isOwner && user ? user.avatar : post.author?.avatar;
  const authorVerified = Boolean(isOwner && user ? user.verified : post.author?.verified);
  const authorDisplayName = isOwner && user
    ? `${user.firstName} ${user.lastName}`.trim() || user.username
    : `${post.author?.firstName || ''} ${post.author?.lastName || ''}`.trim() ||
    post.author?.username ||
    'User';

  useEffect(() => {
    const id = setTimeout(() => {
      setReactionsCount(post.reactionsCount || 0);
      setCommentsCount(post.commentsCount || 0);
      setRepostsCount(post.repostsCount || 0);
      setReposted(Boolean(post.viewerReposted));
      setPollState(post.poll);
      setPinned(Boolean(post.profilePinned));
    }, 0);
    return () => clearTimeout(id);
  }, [
    post.reactionsCount,
    post.commentsCount,
    post.repostsCount,
    post.viewerReposted,
    post.poll,
    post.profilePinned,
  ]);

  useEffect(() => {
    if (!socket || !post.id) return;
    socket.emit('join:post', { postId: post.id });
    const onReactionUpdate = (data: {
      postId?: string;
      postHashId?: string;
      reactionsCount?: number;
      repostsCount?: number;
      poll?: SerializedPost['poll'];
    }) => {
      if (
        data.postId !== post.id &&
        data.postId !== post.hashId &&
        data.postHashId !== post.id &&
        data.postHashId !== post.hashId
      ) {
        return;
      }
      if (typeof data.reactionsCount === 'number') setReactionsCount(data.reactionsCount);
      if (typeof data.repostsCount === 'number') setRepostsCount(data.repostsCount);
      if (data.poll && Array.isArray(data.poll.choices)) setPollState(data.poll);
    };
    const onCommentNew = (data: { postId?: string; commentsCount?: number }) => {
      if (data.postId !== post.id) return;
      if (typeof data.commentsCount === 'number') {
        setCommentsCount(data.commentsCount);
      } else {
        setCommentsCount((c) => c + 1);
      }
    };
    const onCommentDeleted = (data: { postId?: string; commentsCount?: number }) => {
      if (data.postId !== post.id) return;
      if (typeof data.commentsCount === 'number') {
        setCommentsCount(data.commentsCount);
      } else {
        setCommentsCount((c) => Math.max(0, c - 1));
      }
    };
    socket.on('post:reaction:update', onReactionUpdate);
    socket.on('post:comment:new', onCommentNew);
    socket.on('post:comment:deleted', onCommentDeleted);
    return () => {
      socket.emit('leave:post', { postId: post.id });
      socket.off('post:reaction:update', onReactionUpdate);
      socket.off('post:comment:new', onCommentNew);
      socket.off('post:comment:deleted', onCommentDeleted);
    };
  }, [socket, post.id]);

  async function handleRepost() {
    setRepostMenuOpen(false);
    if (!user) {
      error('Please sign in to repost');
      return;
    }
    const prevReposted = reposted;
    const prevCount = repostsCount;
    setReposted(!prevReposted);
    setRepostsCount(prevReposted ? Math.max(0, prevCount - 1) : prevCount + 1);
    try {
      const res = await apiFetch<{ reposted?: boolean; repostsCount?: number }>(
        `/posts/${post.id}/react`,
        {
          method: 'POST',
          json: { action: 'repost' },
        }
      );
      if (typeof res.reposted === 'boolean') setReposted(res.reposted);
      if (typeof res.repostsCount === 'number') setRepostsCount(res.repostsCount);
      success(res.reposted === false ? 'Removed repost' : 'Reposted to your timeline');
    } catch (err) {
      setReposted(prevReposted);
      setRepostsCount(prevCount);
      error('Could not repost', err instanceof Error ? err.message : undefined);
    }
  }

  async function handleSubmitInternalQuote(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      error('Please sign in to quote posts');
      return;
    }
    if (submittingQuote) return;
    setSubmittingQuote(true);
    try {
      await apiFetch('/posts', {
        method: 'POST',
        json: {
          content: quoteDraft.trim(),
          quotePostId: post.id,
        },
      });
      setRepostsCount((c) => c + 1);
      setQuoteDraft('');
      setInternalQuoteOpen(false);
      success('Quote published!');
    } catch (err) {
      error('Could not publish quote', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmittingQuote(false);
    }
  }

  async function toggleReaction(unifiedId = '2764-fe0f') {
    if (!user) {
      error('Please sign in to react');
      return;
    }
    const prevReactions = viewerReactions;
    const prevCount = reactionsCount;
    const isAlreadyReacted = prevReactions.includes(unifiedId);
    const nextReactions = isAlreadyReacted
      ? prevReactions.filter((id) => id !== unifiedId)
      : [...prevReactions, unifiedId];
    const nextCount = isAlreadyReacted ? Math.max(0, prevCount - 1) : prevCount + 1;

    setViewerReactions(nextReactions);
    setReactionsCount(nextCount);

    try {
      const res = await apiFetch<{
        active?: boolean;
        reacted?: boolean;
        reactionsCount?: number;
        viewerReactions?: string[];
      }>(`/posts/${post.id}/react`, {
        method: 'POST',
        json: { action: 'react', unifiedId },
      });
      if (Array.isArray(res.viewerReactions)) {
        setViewerReactions(res.viewerReactions);
      } else if (typeof res.reacted === 'boolean') {
        setViewerReactions(res.reacted ? [unifiedId] : []);
      }
      if (typeof res.reactionsCount === 'number') {
        setReactionsCount(res.reactionsCount);
      }
    } catch {
      setViewerReactions(prevReactions);
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
      if (res.poll && Array.isArray(res.poll.choices)) {
        setPollState(res.poll);
      }
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
  const isPureRepost = Boolean(
    post.isQuoting && (!post.content || !post.content.trim()) && quoteData && quoteData.hashId
  );

  const isShortStatusPost =
    Boolean(post.content) &&
    !post.title &&
    !post.gifUrl &&
    !post.poll &&
    !post.linkSnapshot &&
    (!post.media || post.media.length === 0) &&
    !quoteData &&
    post.content.trim().length <= 120;

  return (
    <article className="bg-bg-pr border-b border-bord-tr transition-colors">
      <div className="px-4 pt-4 space-y-3">
        {(post.globalPinned || pinned) && (
          <div className="flex items-center gap-1.5 text-cap-l text-lab-sc">
            <Pin className="h-3.5 w-3.5 text-lab-sc" />
            <span>{post.globalPinned ? 'Featured publication' : 'Pinned post'}</span>
          </div>
        )}

        {isPureRepost && (
          <div className="flex items-center gap-1.5 text-cap-l text-lab-sc font-medium">
            <Repeat2 className="h-3.5 w-3.5 text-green-900 shrink-0" />
            <span>{authorDisplayName} reposted</span>
          </div>
        )}

        {/* Single-line Name + Single-line Metadata Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {authorHref ? (
              <Link
                href={authorHref}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 cursor-pointer block rounded-full hover:opacity-90 transition-opacity"
                aria-label={`View ${authorDisplayName}'s profile`}
              >
                <Avatar
                  src={authorAvatarSrc}
                  alt={authorHandle || authorDisplayName}
                  verified={authorVerified}
                  size="md"
                />
              </Link>
            ) : (
              <div className="shrink-0">
                <Avatar
                  src={authorAvatarSrc}
                  alt={authorDisplayName}
                  verified={authorVerified}
                  size="md"
                />
              </div>
            )}

            <div className="flex-1 min-w-0">
              {/* Line 1: Author Display Name & Verified / AI Badge */}
              <div className="flex items-center gap-1.5 min-w-0">
                {authorHref ? (
                  <Link
                    href={authorHref}
                    onClick={(e) => e.stopPropagation()}
                    className="text-par-n font-bold text-lab-pr hover:underline truncate cursor-pointer"
                  >
                    {authorDisplayName}
                  </Link>
                ) : (
                  <span className="text-par-n font-bold text-lab-pr truncate">
                    {authorDisplayName}
                  </span>
                )}
                {authorVerified && (
                  <span className="inline-flex text-brand-900 shrink-0" title="Verified">
                    <CheckCircle2 className="size-4 fill-brand-900 text-bg-pr" />
                  </span>
                )}
                {authorHandle && (
                  <span className="text-cap-l text-lab-sc font-normal truncate hidden sm:inline">
                    @{authorHandle}
                  </span>
                )}
                {post.isAiGenerated && (
                  <Badge variant="default" className="shrink-0 text-[10px] px-1.5 py-0 h-4">
                    <Bot className="h-2.5 w-2.5" /> AI
                  </Badge>
                )}
              </div>

              {/* Line 2: Timestamp · Audience / Globe · Location */}
              <div className="flex items-center gap-1 text-cap-l text-lab-sc font-normal leading-tight mt-0.5 whitespace-nowrap overflow-hidden min-w-0">
                <Link
                  href={`/publication/${post.hashId}`}
                  className="hover:underline shrink-0 text-lab-sc"
                >
                  {formatRelativeTime(post.createdAt, locale)}
                </Link>
                <span className="text-lab-tr shrink-0">·</span>
                <span title="Public" className="inline-flex items-center"><Globe className="size-3.5 text-lab-sc shrink-0" /></span>
                {post.location && (
                  <span className="inline-flex items-center gap-0.5 min-w-0 truncate">
                    <span className="text-lab-tr shrink-0">·</span>
                    <MapPin className="size-3.5 shrink-0" />
                    <span className="truncate">{post.location}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="relative shrink-0">
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
        {post.title && <h3 className="text-title-3 font-semibold text-lab-pr">{post.title}</h3>}

        {post.content && (
          <div className="text-par-m text-lab-pr whitespace-pre-wrap break-words leading-relaxed">
            {renderRichContent(translatedText || post.content)}
            {translating && <span className="ml-2 text-cap-s text-lab-tr">Translating...</span>}
          </div>
        )}
      </div>

      {/* Edge-to-Edge Full-Width Media Section (no horizontal margin) */}
      {(post.gifUrl || (post.media && post.media.length > 0)) && (
        <div className="mt-3 space-y-2.5">
          {/* Sensitive Wrapper */}
          {post.isSensitive && !revealSensitive ? (
            <div className="px-4">
              <div className="rounded-2xl border border-bord-pr bg-fill-sc p-6 text-center space-y-2">
                <p className="text-par-n font-semibold text-lab-pr">Sensitive Media</p>
                <p className="text-cap-l text-lab-sc">The author marked this media as sensitive.</p>
                <Button size="sm" variant="outline" onClick={() => setRevealSensitive(true)}>
                  <Eye className="h-3.5 w-3.5" /> View media
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* GIF matching PHP PublicationGif.vue */}
              {post.gifUrl && (
                <button
                  type="button"
                  onClick={() => setLightboxIndex(0)}
                  className="block w-full relative overflow-hidden bg-fill-qt/50 cursor-pointer text-left flex items-center justify-center max-h-[500px] sm:max-h-[540px]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={post.gifUrl}
                    alt="GIF attachment"
                    loading="lazy"
                    decoding="async"
                    onLoad={(e) => {
                      e.currentTarget.removeAttribute('data-media-retry-src');
                    }}
                    onError={(e) => {
                      if (e.currentTarget.naturalWidth > 0) return;
                      if (post.gifUrl) e.currentTarget.dataset.mediaRetrySrc = post.gifUrl;
                    }}
                    className="w-full max-h-[500px] sm:max-h-[540px] object-contain block mx-auto"
                  />
                  <GiphyAttribution className="absolute bottom-2.5 left-2.5 z-10" />
                </button>
              )}

              {/* Media attachments matching PHP PublicationImage / Video / Audio / Document */}
              {post.media &&
                post.media.length > 0 &&
                (() => {
                  const images = post.media.filter((m) => m.type === 'image');
                  const videos = post.media.filter((m) => m.type === 'video');
                  const audios = post.media.filter((m) => m.type === 'audio');
                  const documents = post.media.filter((m) => m.type === 'document');

                  return (
                    <div className="space-y-2.5">
                      {/* Image Collage matching PHP PublicationImage.vue — full-width edge-to-edge */}
                      {images.length === 1 && (() => {
                        const m = images[0];
                        const src = resolveMediaUrl(m.publicUrl || m.url) || '';
                        return (
                          <button
                            type="button"
                            onClick={() => setLightboxIndex(postGifOffset)}
                            className="block w-full overflow-hidden bg-fill-qt/50 cursor-pointer flex items-center justify-center max-h-[500px] sm:max-h-[540px]"
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
                              loading="eager"
                              decoding="async"
                              onLoad={(e) => {
                                e.currentTarget.removeAttribute('data-media-retry-src');
                              }}
                              onError={(e) => {
                                if (e.currentTarget.naturalWidth > 0) return;
                                if (src) e.currentTarget.dataset.mediaRetrySrc = src;
                              }}
                              className="w-full max-h-[500px] sm:max-h-[540px] object-contain block mx-auto"
                            />
                          </button>
                        );
                      })()}

                      {images.length === 2 && (
                        <div className="grid grid-cols-2 gap-0.5 overflow-hidden bg-bg-pr h-[340px] sm:h-[400px]">
                          {images.map((m, idx) => {
                            const src = resolveMediaUrl(m.publicUrl || m.url) || '';
                            return (
                              <button
                                key={m.id || idx}
                                type="button"
                                onClick={() => setLightboxIndex(postGifOffset + idx)}
                                className="block w-full h-full overflow-hidden bg-fill-qt cursor-pointer"
                                style={
                                  m.lqipBase64
                                    ? {
                                      backgroundImage: `url(${m.lqipBase64})`,
                                      backgroundSize: 'cover',
                                    }
                                    : undefined
                                }
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={src}
                                  alt={m.filename || 'Post image'}
                                  loading="lazy"
                                  decoding="async"
                                  onLoad={(e) => {
                                    e.currentTarget.removeAttribute('data-media-retry-src');
                                  }}
                                  onError={(e) => {
                                    if (e.currentTarget.naturalWidth > 0) return;
                                    if (src) e.currentTarget.dataset.mediaRetrySrc = src;
                                  }}
                                  className="w-full h-full object-cover block hover:scale-[1.01] transition-transform"
                                />
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {images.length === 3 && (
                        <div className="grid grid-cols-3 grid-rows-2 gap-0.5 h-[360px] sm:h-[420px] overflow-hidden bg-bg-pr">
                          {images.map((m, idx) => {
                            const src = resolveMediaUrl(m.publicUrl || m.url) || '';
                            return (
                              <button
                                key={m.id || idx}
                                type="button"
                                onClick={() => setLightboxIndex(postGifOffset + idx)}
                                className={cn(
                                  'block w-full h-full overflow-hidden bg-fill-qt cursor-pointer',
                                  idx === 0 && 'col-span-2 row-span-2'
                                )}
                                style={
                                  m.lqipBase64
                                    ? {
                                      backgroundImage: `url(${m.lqipBase64})`,
                                      backgroundSize: 'cover',
                                    }
                                    : undefined
                                }
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={src}
                                  alt={m.filename || 'Post image'}
                                  loading="lazy"
                                  decoding="async"
                                  onLoad={(e) => {
                                    e.currentTarget.removeAttribute('data-media-retry-src');
                                  }}
                                  onError={(e) => {
                                    if (e.currentTarget.naturalWidth > 0) return;
                                    if (src) e.currentTarget.dataset.mediaRetrySrc = src;
                                  }}
                                  className="w-full h-full object-cover block hover:scale-[1.01] transition-transform"
                                />
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {images.length === 4 && (
                        <div className="grid grid-cols-2 grid-rows-2 gap-0.5 h-[360px] sm:h-[420px] overflow-hidden bg-bg-pr">
                          {images.map((m, idx) => {
                            const src = resolveMediaUrl(m.publicUrl || m.url) || '';
                            return (
                              <button
                                key={m.id || idx}
                                type="button"
                                onClick={() => setLightboxIndex(postGifOffset + idx)}
                                className="block w-full h-full overflow-hidden bg-fill-qt cursor-pointer"
                                style={
                                  m.lqipBase64
                                    ? {
                                      backgroundImage: `url(${m.lqipBase64})`,
                                      backgroundSize: 'cover',
                                    }
                                    : undefined
                                }
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={src}
                                  alt={m.filename || 'Post image'}
                                  loading="lazy"
                                  decoding="async"
                                  onLoad={(e) => {
                                    e.currentTarget.removeAttribute('data-media-retry-src');
                                  }}
                                  onError={(e) => {
                                    if (e.currentTarget.naturalWidth > 0) return;
                                    if (src) e.currentTarget.dataset.mediaRetrySrc = src;
                                  }}
                                  className="w-full h-full object-cover block hover:scale-[1.01] transition-transform"
                                />
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {images.length >= 5 && (
                        <div className="overflow-hidden bg-bg-pr space-y-0.5 h-[360px] sm:h-[420px] flex flex-col">
                          <div className="grid grid-cols-3 gap-0.5 flex-1">
                            {images.slice(0, 3).map((m, idx) => {
                              const src = resolveMediaUrl(m.publicUrl || m.url) || '';
                              return (
                                <button
                                  key={m.id || idx}
                                  type="button"
                                  onClick={() => setLightboxIndex(postGifOffset + idx)}
                                  className="block w-full h-full overflow-hidden bg-fill-qt cursor-pointer"
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
                                    decoding="async"
                                    onLoad={(e) => {
                                      e.currentTarget.removeAttribute('data-media-retry-src');
                                    }}
                                    onError={(e) => {
                                      if (e.currentTarget.naturalWidth > 0) return;
                                      if (src) e.currentTarget.dataset.mediaRetrySrc = src;
                                    }}
                                    className="w-full h-full object-cover block"
                                  />
                                </button>
                              );
                            })}
                          </div>
                          <div className="grid grid-cols-2 gap-0.5 flex-1">
                            {images.slice(3, 5).map((m, idx) => {
                              const src = resolveMediaUrl(m.publicUrl || m.url) || '';
                              const extraCount = idx === 1 ? images.length - 5 : 0;
                              return (
                                <button
                                  key={m.id || idx + 3}
                                  type="button"
                                  onClick={() => setLightboxIndex(postGifOffset + idx + 3)}
                                  className="relative block w-full h-full overflow-hidden bg-fill-qt cursor-pointer"
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
                                    decoding="async"
                                    onLoad={(e) => {
                                      e.currentTarget.removeAttribute('data-media-retry-src');
                                    }}
                                    onError={(e) => {
                                      if (e.currentTarget.naturalWidth > 0) return;
                                      if (src) e.currentTarget.dataset.mediaRetrySrc = src;
                                    }}
                                    className="w-full h-full object-cover block"
                                  />
                                  {extraCount > 0 && (
                                    <span className="absolute inset-0 bg-black/50 text-white text-title-2 font-bold flex items-center justify-center">
                                      +{extraCount}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Video Cards — full width edge-to-edge with zero side margin */}
                      {videos.map((m, idx) => {
                        const src = m.publicUrl || m.url || '';
                        return (
                          <div
                            key={m.id || `vid-${idx}`}
                            className="relative w-full overflow-hidden bg-black flex items-center justify-center max-h-[500px] sm:max-h-[540px]"
                          >
                            <video
                              src={src}
                              poster={m.thumbnailUrl || undefined}
                              controls
                              playsInline
                              preload="metadata"
                              className="w-full max-h-[500px] sm:max-h-[540px] object-contain block mx-auto"
                            />
                            <VideoWatermarkOverlay watermarked={Boolean(m.metadata?.watermarked)} />
                          </div>
                        );
                      })}

                      {/* Audio Waveform Cards matching PHP PublicationAudio.vue / AudioPlayer.vue */}
                      {audios.map((m, idx) => {
                        const src = m.publicUrl || m.url || '';
                        const trackId = `${post.id}-aud-${idx}`;
                        const isThisTrack = soundbarTrack?.id === trackId;
                        const isPlayingThis = isThisTrack && isAudioPlaying;
                        const metaParts = [
                          formatAudioDuration(m.durationSeconds),
                          formatMediaBytes(m.sizeBytes),
                        ].filter(Boolean);
                        return (
                          <div key={m.id || `aud-${idx}`} className="px-4">
                            <div
                              className="flex items-center gap-3.5 rounded-2xl bg-fill-fv/40 px-3.5 py-3"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  if (isThisTrack) {
                                    togglePlayAudio();
                                  } else {
                                    playAudio({
                                      id: trackId,
                                      title: m.filename || post.title || 'Audio track',
                                      artist: `@${post.author?.username}`,
                                      src,
                                    });
                                  }
                                }}
                                className="size-10 rounded-full bg-brand-900 text-white flex items-center justify-center shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
                                aria-label={isPlayingThis ? 'Pause audio' : 'Play audio'}
                              >
                                {isPlayingThis ? (
                                  <Pause className="size-4 fill-current" />
                                ) : (
                                  <Play className="size-4 fill-current ml-0.5" />
                                )}
                              </button>

                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-par-s font-semibold text-lab-pr truncate">
                                    {m.filename || 'Audio attachment'}
                                  </p>
                                  {metaParts.length > 0 && (
                                    <span className="text-cap-s text-lab-tr shrink-0 tabular-nums">
                                      {metaParts.join(' · ')}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-end gap-0.5 h-6 overflow-hidden">
                                  {AUDIO_WAVEFORM_BARS.map((heightPct, barIdx) => (
                                    <span
                                      key={barIdx}
                                      className={cn(
                                        'flex-1 rounded-full transition-colors',
                                        isPlayingThis && barIdx % 2 === 0
                                          ? 'bg-brand-900 animate-pulse'
                                          : isThisTrack
                                            ? 'bg-brand-900/75'
                                            : 'bg-fill-pr'
                                      )}
                                      style={{ height: `${heightPct}%` }}
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Document Download Cards matching PHP PublicationDocument.vue */}
                      {documents.map((m, idx) => {
                        const src = m.publicUrl || m.url || '';
                        const ext = (
                          m.extension ||
                          m.filename?.split('.').pop() ||
                          'FILE'
                        ).toUpperCase();
                        const sizeStr = formatMediaBytes(m.sizeBytes);
                        const subline = [sizeStr, ext].filter(Boolean).join(' · ');
                        return (
                          <div key={m.id || `doc-${idx}`} className="px-4">
                            <a
                              href={src}
                              target="_blank"
                              rel="noopener noreferrer"
                              download={m.filename || true}
                              className="flex items-center justify-between gap-3 rounded-2xl bg-fill-fv/30 p-3 hover:bg-fill-fv/70 transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="size-10 bg-bg-pr flex items-center justify-center shrink-0 overflow-hidden p-1.5">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={getFileFormatIconSrc(m.extension, m.filename)}
                                    alt={ext}
                                    className="size-7 object-contain"
                                  />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-par-s font-semibold text-lab-pr2 truncate">
                                    {m.filename || 'Document attachment'}
                                  </p>
                                  <p className="text-cap-s text-lab-sc truncate">{subline}</p>
                                </div>
                              </div>
                              <span className="size-8 rounded-full bg-bg-pr flex items-center justify-center text-lab-sc shrink-0">
                                <FileDown className="size-4" />
                              </span>
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
            </>
          )}
        </div>
      )}

      <div className="px-4 pb-3 pt-2.5 space-y-3">

        {/* Poll matching PHP PublicationPoll.vue & PollChoiceItem.vue */}
        {pollState && pollState.choices && pollState.choices.length > 0 && (() => {
          const totalVotes =
            typeof pollState.totalVotes === 'number'
              ? pollState.totalVotes
              : pollState.choices.reduce((acc, c) => acc + (c.votesCount || 0), 0);
          const myVoteId = user ? pollState.votesByUser?.[user.id] : undefined;
          const isPollExpired = Boolean(
            pollState.expiresAt && new Date(pollState.expiresAt) < new Date()
          );
          return (
            <div className="block pt-1">
              <div className="mb-2 flex items-center gap-1 text-lab-sc">
                <Globe className="size-3.5 shrink-0" />
                <span className="text-par-s">
                  {pollState.isAnonymous ? 'Anonymous poll' : 'Public poll'}
                </span>
              </div>

              <div className="space-y-2 mb-2">
                {pollState.choices.map((ch, idx) => {
                  const choiceId = ch.id || `c_${idx}`;
                  const pct =
                    typeof ch.percentage === 'number'
                      ? ch.percentage
                      : totalVotes > 0
                        ? Math.round(((ch.votesCount || 0) / totalVotes) * 100)
                        : 0;
                  const voted = Boolean(
                    user && (myVoteId === choiceId || ch.voters?.includes(user.id))
                  );
                  return (
                    <button
                      key={choiceId}
                      type="button"
                      disabled={isPollExpired}
                      onClick={() => votePoll(idx, choiceId)}
                      className={cn(
                        'px-4 py-2.5 border overflow-hidden rounded-xl relative block w-full text-left transition-colors cursor-pointer disabled:cursor-default',
                        voted
                          ? 'border-brand-900/60 bg-fill-qt/40'
                          : 'border-bord-pr hover:border-lab-tr'
                      )}
                    >
                      <div className="flex items-center justify-between text-lab-pr2 relative z-10">
                        <span className="size-4 mr-2.5 shrink-0 inline-flex items-center justify-center">
                          {voted ? (
                            <CheckCircle2 className="size-4 text-green-900" />
                          ) : (
                            <Circle className="size-4 text-lab-sc" />
                          )}
                        </span>
                        <span
                          className={cn(
                            'text-par-m flex-1 truncate mr-4',
                            voted ? 'font-semibold text-lab-pr' : 'font-medium text-lab-pr2'
                          )}
                        >
                          {ch.text}
                        </span>
                        <span className="text-par-s font-semibold shrink-0">{pct}%</span>
                      </div>
                      <span
                        className="absolute inset-y-0 left-0 bg-bord-pr/70 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </button>
                  );
                })}
              </div>

              <div className="text-center">
                <span className="text-cap-l text-lab-sc">
                  {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'} -{' '}
                  {isPollExpired ? 'Final results' : 'Active poll'}
                </span>
              </div>
            </div>
          );
        })()}

        {/* Link Snapshot matching PHP LinkSnapshot.vue */}
        {post.linkSnapshot && (
          <a
            href={post.linkSnapshot.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-2xl border border-bord-card overflow-hidden hover:bg-fill-fv/40 transition-colors"
          >
            {post.linkSnapshot.image && (
              <div className="overflow-hidden border-b border-bord-card bg-fill-qt">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.linkSnapshot.image}
                  alt={post.linkSnapshot.title || 'Link preview'}
                  loading="lazy"
                  className="w-full max-h-72 object-cover block"
                />
              </div>
            )}
            <div className="p-3 md:p-4 space-y-1">
              {post.linkSnapshot.title && (
                <p className="text-par-m font-semibold text-lab-pr2 line-clamp-2">
                  {post.linkSnapshot.title}
                </p>
              )}
              {post.linkSnapshot.description && (
                <p className="text-par-s text-lab-sc line-clamp-2">
                  {post.linkSnapshot.description}
                </p>
              )}
              <p className="text-cap-l text-brand-900 hover:underline flex items-center gap-1 pt-0.5 truncate">
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="truncate">{post.linkSnapshot.domain || post.linkSnapshot.url}</span>
              </p>
            </div>
          </a>
        )}

        {/* Quoted Post matching PHP PublicationQuote.vue */}
        {quoteData && quoteData.hashId && (() => {
          const quotedMedia = Array.isArray(quoteData.media) ? quoteData.media : [];
          const quotedImages = quotedMedia.filter((m) => m.type === 'image');
          const quotedVideos = quotedMedia.filter((m) => m.type === 'video');
          const quotedDisplayName =
            `${quoteAuthor?.firstName || ''} ${quoteAuthor?.lastName || ''}`.trim() ||
            quoteAuthor?.username ||
            'User';
          return (
            <div
              role="link"
              tabIndex={0}
              onClick={() => router.push(`/publication/${quoteData.hashId}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  router.push(`/publication/${quoteData.hashId}`);
                }
              }}
              className="block rounded-2xl border border-bord-card bg-fill-fv/40 overflow-hidden hover:bg-fill-fv/70 transition-colors cursor-pointer"
            >
              <div className="p-3.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-cap-l text-lab-sc min-w-0">
                  {quoteAuthor?.username ? (
                    <Link
                      href={`/@${encodeURIComponent(quoteAuthor.username)}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-2 min-w-0 hover:underline"
                    >
                      <Avatar
                        src={quoteAuthor?.avatar}
                        alt={quoteAuthor?.username}
                        verified={quoteAuthor?.verified}
                        size="xs"
                      />
                      <span className="font-semibold text-lab-pr truncate">
                        {quotedDisplayName}
                      </span>
                      <span className="truncate text-lab-sc">@{quoteAuthor?.username}</span>
                    </Link>
                  ) : (
                    <div className="inline-flex items-center gap-2 min-w-0">
                      <Avatar
                        src={quoteAuthor?.avatar}
                        alt={quoteAuthor?.username}
                        verified={quoteAuthor?.verified}
                        size="xs"
                      />
                      <span className="font-semibold text-lab-pr truncate">
                        {quotedDisplayName}
                      </span>
                    </div>
                  )}
                  {quoteData.createdAt && (
                    <span className="text-cap-s text-lab-sc shrink-0">
                      {formatRelativeTime(quoteData.createdAt, locale)}
                    </span>
                  )}
                </div>

                {quoteData.content && (
                  <p className="text-par-n text-lab-pr line-clamp-3 leading-snug whitespace-pre-wrap">
                    {quoteData.content}
                  </p>
                )}

                {quotedImages.length > 0 && (
                  <div className="overflow-hidden rounded-xl border border-bord-tr bg-fill-qt mt-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolveMediaUrl(quotedImages[0].publicUrl || quotedImages[0].url) || ''}
                      alt={quotedImages[0].filename || 'Quoted post image'}
                      loading="lazy"
                      className="w-full max-h-56 object-cover block"
                    />
                  </div>
                )}

                {quotedVideos.length > 0 && (
                  <div className="overflow-hidden rounded-xl bg-black mt-2">
                    <video
                      src={quotedVideos[0].publicUrl || quotedVideos[0].url || ''}
                      controls
                      className="w-full max-h-56 object-contain block mx-auto"
                    />
                  </div>
                )}

                {quoteData.poll && quoteData.poll.choices?.length ? (
                  <div className="inline-flex items-center gap-1.5 text-par-s text-brand-900 font-medium pt-1">
                    <BarChart3 className="size-4" />
                    <span>Poll ({quoteData.poll.choices.length} choices)</span>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })()}

        {/* Engagement Bar matching Facebook / TimelinePublication style */}
        <div className="flex items-center justify-between pt-2.5 mt-1 border-t border-bord-tr text-lab-sc">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => toggleReaction('2764-fe0f')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-par-s font-semibold hover:bg-fill-tr hover:text-lab-pr transition-colors cursor-pointer',
                liked && 'text-red-900 font-semibold'
              )}
            >
              <Heart className={cn('h-[18px] w-[18px]', liked && 'fill-current')} />
              <span>{reactionsCount}</span>
            </button>
            <div className="hidden sm:flex items-center gap-0.5">
              {REACTION_EMOJIS.slice(1).map((em) => {
                const isReacted = viewerReactions.includes(em.id);
                return (
                  <button
                    key={em.id}
                    type="button"
                    onClick={() => toggleReaction(em.id)}
                    className={cn(
                      'h-7 w-7 rounded-full hover:bg-fill-tr text-sm flex items-center justify-center cursor-pointer transition-transform',
                      isReacted && 'bg-fill-sc scale-110 ring-1 ring-brand-900/40'
                    )}
                    title={isReacted ? `Remove ${em.label}` : `React ${em.label}`}
                  >
                    {em.label}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (isDetailView) {
                const textarea = document.querySelector<HTMLTextAreaElement>('textarea');
                textarea?.focus();
                return;
              }
              if (typeof window !== 'undefined' && window.innerWidth < 768) {
                setMobileCommentsOpen(true);
              } else {
                router.push(`/publication/${post.hashId}`);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-par-s font-semibold hover:bg-fill-tr hover:text-lab-pr transition-colors cursor-pointer"
          >
            <MessageCircle className="h-[18px] w-[18px]" />
            <span>{commentsCount}</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setRepostMenuOpen((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-par-s font-semibold hover:bg-fill-tr hover:text-lab-pr transition-colors cursor-pointer',
                reposted && 'text-green-900 font-semibold'
              )}
              title="Repost or Quote"
            >
              <Repeat2 className="h-[18px] w-[18px]" />
              <span>{repostsCount}</span>
            </button>
            {repostMenuOpen && (
              <div className="absolute bottom-full mb-1 left-0 w-44 rounded-2xl border border-bord-pr bg-bg-pr shadow-vertical-tr py-1 z-20">
                <button
                  type="button"
                  onClick={handleRepost}
                  className="w-full px-3.5 py-2 text-left text-par-s text-lab-pr hover:bg-fill-pr cursor-pointer flex items-center gap-2"
                >
                  <Repeat2 className="size-4 text-lab-sc" />
                  <span>{reposted ? 'Undo repost' : 'Repost'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRepostMenuOpen(false);
                    if (onQuote) {
                      onQuote(post);
                    } else {
                      setInternalQuoteOpen(true);
                    }
                  }}
                  className="w-full px-3.5 py-2 text-left text-par-s text-lab-pr hover:bg-fill-pr cursor-pointer flex items-center gap-2"
                >
                  <MessageCircle className="size-4 text-lab-sc" />
                  <span>Quote post</span>
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
              <Bookmark className={cn('h-[18px] w-[18px]', bookmarked && 'fill-current')} />
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="p-2 rounded-full hover:bg-fill-tr hover:text-lab-pr transition-colors cursor-pointer"
              aria-label="Share"
            >
              <Share2 className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>

        {/* Comment Bar matching PHP desktop/components/timeline/feed/TimelinePublication.vue */}
        {!isDetailView && (
          <div className="pt-1.5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined' && window.innerWidth < 768) {
                  setMobileCommentsOpen(true);
                } else {
                  router.push(`/publication/${post.hashId}`);
                }
              }}
              className="inline-flex items-center gap-2 text-par-s text-lab-sc hover:text-lab-pr font-medium cursor-pointer transition-colors"
            >
              <span>
                {commentsCount > 0
                  ? `Show all comments (${commentsCount})`
                  : 'Leave a comment'}
              </span>
            </button>
          </div>
        )}
      </div>

      <div className="h-2 bg-fill-fv/50 border-t border-bord-tr/60" />

      {/* Mobile Comments ActionSheet matching PHP mobile/components/timeline/feed/parts/comments/PublicationComments.vue */}
      <Modal
        open={mobileCommentsOpen}
        onClose={() => setMobileCommentsOpen(false)}
        title={`Comments (${commentsCount})`}
        maxWidthClass="max-w-lg"
        bodyClassName="p-0"
      >
        {mobileCommentsOpen && (
          <PublicationCommentsSection
            postId={post.id}
            postHashId={post.hashId}
            postOwnerId={String(post.author?._id || post.author?.id || '')}
            commentsCount={commentsCount}
            onCommentsCountChange={(nextCount) => setCommentsCount(nextCount)}
            sheetMode
          />
        )}
      </Modal>

      {/* Fallback Quote Post Modal when parent page does not supply onQuote */}
      <Modal
        open={internalQuoteOpen}
        onClose={() => {
          if (!submittingQuote) setInternalQuoteOpen(false);
        }}
        title="Quote Publication"
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleSubmitInternalQuote} className="p-4 space-y-4">
          <textarea
            value={quoteDraft}
            onChange={(e) => setQuoteDraft(e.target.value)}
            placeholder="Add a comment to your quote..."
            rows={3}
            className="w-full rounded-2xl bg-input-pr border border-bord-card p-3 text-par-n text-lab-pr placeholder:text-lab-tr focus:outline-none focus:border-brand-900"
          />
          <div className="rounded-2xl border border-bord-pr bg-fill-pr/40 p-3 text-par-s text-lab-sc">
            <p className="font-semibold text-lab-pr">
              @{post.author?.username} · {authorDisplayName}
            </p>
            <p className="line-clamp-2 mt-1">{post.content || 'Media publication'}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setInternalQuoteOpen(false)}
              disabled={submittingQuote}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={submittingQuote}>
              Publish Quote
            </Button>
          </div>
        </form>
      </Modal>

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="post"
        targetId={post.id}
      />

      <MediaLightbox
        open={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
        initialIndex={lightboxIndex ?? 0}
        images={lightboxImages}
        albumName={
          post.author
            ? `${post.author.firstName} ${post.author.lastName} (@${post.author.username})`
            : undefined
        }
        date={formatRelativeTime(post.createdAt)}
      />
    </article>
  );
}
