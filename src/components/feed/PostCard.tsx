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
import { MediaLightbox } from '@/components/ui/media-lightbox';
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
  lqipBase64?: string | null;
  mimeType?: string;
  extension?: string;
  sizeBytes?: number;
  durationSeconds?: number;
  filename?: string;
  width?: number;
  height?: number;
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
  const { user, locale, playAudio, soundbarTrack, isAudioPlaying, togglePlayAudio, socket } =
    useApp();
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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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
        <Link href={`/@${isOwner ? user.username : post.author?.username}`} className="shrink-0">
          <Avatar
            src={isOwner ? user.avatar : post.author?.avatar}
            alt={isOwner ? user.username : post.author?.username}
            verified={isOwner ? user.verified : post.author?.verified}
            size="sm"
          />
        </Link>

        <div className="flex-1 min-w-0 space-y-2">
          {/* Header Row */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <Link
                href={`/@${isOwner ? user.username : post.author?.username}`}
                className="text-par-n font-bold text-lab-pr hover:underline truncate"
              >
                {isOwner ? `${user.firstName} ${user.lastName}` : `${post.author?.firstName} ${post.author?.lastName}`}
              </Link>
              <Link href={`/@${isOwner ? user.username : post.author?.username}`} className="text-cap-l text-lab-sc truncate">
                @{isOwner ? user.username : post.author?.username}
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
              {/* GIF matching PHP PublicationGif.vue */}
              {post.gifUrl && (
                <button
                  type="button"
                  onClick={() => setLightboxIndex(0)}
                  className="block w-full relative rounded-2xl overflow-hidden border border-bord-card bg-fill-qt cursor-pointer text-left"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={post.gifUrl}
                    alt="GIF attachment"
                    loading="lazy"
                    decoding="async"
                    className="w-full max-h-[460px] min-h-40 object-cover block"
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
                      {/* Image Collage matching PHP PublicationImage.vue */}
                      {images.length === 1 && (() => {
                        const m = images[0];
                        const src = m.publicUrl || m.url || '';
                        return (
                          <button
                            type="button"
                            onClick={() => setLightboxIndex(postGifOffset)}
                            className="block w-full rounded-2xl overflow-hidden border border-bord-card bg-fill-qt cursor-pointer"
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
                              className="w-full max-h-[500px] min-h-40 object-cover block"
                            />
                          </button>
                        );
                      })()}

                      {images.length === 2 && (
                        <div className="grid grid-cols-2 gap-0.5 rounded-2xl overflow-hidden border border-bord-card bg-bord-card">
                          {images.map((m, idx) => {
                            const src = m.publicUrl || m.url || '';
                            return (
                              <button
                                key={m.id || idx}
                                type="button"
                                onClick={() => setLightboxIndex(postGifOffset + idx)}
                                className="block w-full h-64 sm:h-72 overflow-hidden bg-fill-qt cursor-pointer"
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
                                  className="w-full h-full object-cover block hover:scale-[1.01] transition-transform"
                                />
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {images.length === 3 && (
                        <div className="grid grid-cols-3 grid-rows-2 gap-0.5 h-72 sm:h-80 rounded-2xl overflow-hidden border border-bord-card bg-bord-card">
                          {images.map((m, idx) => {
                            const src = m.publicUrl || m.url || '';
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
                                  className="w-full h-full object-cover block hover:scale-[1.01] transition-transform"
                                />
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {images.length === 4 && (
                        <div className="grid grid-cols-3 gap-0.5 rounded-2xl overflow-hidden border border-bord-card bg-bord-card">
                          {images.map((m, idx) => {
                            const src = m.publicUrl || m.url || '';
                            return (
                              <button
                                key={m.id || idx}
                                type="button"
                                onClick={() => setLightboxIndex(postGifOffset + idx)}
                                className={cn(
                                  'block w-full overflow-hidden bg-fill-qt cursor-pointer',
                                  idx === 3 ? 'col-span-3 h-48 sm:h-52' : 'h-36 sm:h-40'
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
                                  className="w-full h-full object-cover block hover:scale-[1.01] transition-transform"
                                />
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {images.length >= 5 && (
                        <div className="rounded-2xl overflow-hidden border border-bord-card bg-bord-card space-y-0.5">
                          <div className="grid grid-cols-3 gap-0.5">
                            {images.slice(0, 3).map((m, idx) => {
                              const src = m.publicUrl || m.url || '';
                              return (
                                <button
                                  key={m.id || idx}
                                  type="button"
                                  onClick={() => setLightboxIndex(postGifOffset + idx)}
                                  className="block w-full h-36 sm:h-40 overflow-hidden bg-fill-qt cursor-pointer"
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
                                    className="w-full h-full object-cover block"
                                  />
                                </button>
                              );
                            })}
                          </div>
                          <div className="grid grid-cols-2 gap-0.5">
                            {images.slice(3, 5).map((m, idx) => {
                              const src = m.publicUrl || m.url || '';
                              const extraCount = idx === 1 ? images.length - 5 : 0;
                              return (
                                <button
                                  key={m.id || idx + 3}
                                  type="button"
                                  onClick={() => setLightboxIndex(postGifOffset + idx + 3)}
                                  className="relative block w-full h-40 sm:h-44 overflow-hidden bg-fill-qt cursor-pointer"
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

                      {/* Video Cards matching PHP PublicationVideo.vue */}
                      {videos.map((m, idx) => {
                        const src = m.publicUrl || m.url || '';
                        const isPortrait = Boolean(m.height && m.width && m.height > m.width);
                        return (
                          <div
                            key={m.id || `vid-${idx}`}
                            className={cn(
                              'rounded-2xl overflow-hidden border border-bord-card bg-black',
                              isPortrait ? 'max-w-[320px]' : 'w-full'
                            )}
                          >
                            <video
                              src={src}
                              poster={m.thumbnailUrl || undefined}
                              controls
                              playsInline
                              preload="metadata"
                              className="w-full max-h-[500px] block"
                            />
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
                          <div
                            key={m.id || `aud-${idx}`}
                            className="flex items-center gap-3.5 rounded-2xl border border-bord-card bg-fill-fv/40 px-3.5 py-3"
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
                          <a
                            key={m.id || `doc-${idx}`}
                            href={src}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={m.filename || true}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-bord-card bg-fill-fv/30 p-3 hover:bg-fill-fv/70 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="size-10 rounded-xl bg-bg-pr border border-bord-card flex items-center justify-center shrink-0 overflow-hidden p-1.5">
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
                            <span className="size-8 rounded-full border border-bord-card bg-bg-pr flex items-center justify-center text-lab-sc shrink-0">
                              <FileDown className="size-4" />
                            </span>
                          </a>
                        );
                      })}
                    </div>
                  );
                })()}
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
          {quoteData && quoteData.hashId && (
            <Link
              href={`/publication/${quoteData.hashId}`}
              className="block rounded-2xl border border-bord-card bg-fill-fv/30 p-3.5 space-y-1.5 hover:bg-fill-fv/60 transition-colors"
            >
              <div className="flex items-center gap-2 text-cap-l text-lab-sc">
                <Avatar
                  src={quoteAuthor?.avatar}
                  alt={quoteAuthor?.username}
                  verified={quoteAuthor?.verified}
                  size="xs"
                />
                <span className="font-semibold text-lab-pr flex items-center gap-1 truncate">
                  {quoteAuthor?.firstName} {quoteAuthor?.lastName}
                </span>
                <span className="truncate">@{quoteAuthor?.username}</span>
              </div>
              {quoteData.content && (
                <p className="text-par-n text-lab-pr line-clamp-3 leading-snug">{quoteData.content}</p>
              )}
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
