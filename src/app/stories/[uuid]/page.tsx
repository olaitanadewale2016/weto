'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Eye, Pause, Play, Send, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { VideoWatermarkOverlay } from '@/components/ui/video-watermark';
import { apiFetch } from '@/lib/api-client';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';
import { formatRelativeTime } from '@/lib/i18n';

interface StoryFrame {
  id: string;
  storyUuid: string;
  type: 'text' | 'image' | 'video';
  content?: string;
  durationSeconds: number;
  viewsCount: number;
  isViewed?: boolean;
  media?: {
    publicUrl?: string;
    url?: string;
    metadata?: { watermarked?: boolean; [key: string]: unknown };
  } | null;
  meta?: { bgColor?: string };
  createdAt: string;
  expiresAt?: string;
}

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

function isStoryFrameActive(frame: { expiresAt?: string; createdAt?: string }, nowMs: number): boolean {
  if (frame.expiresAt) {
    const expMs = new Date(frame.expiresAt).getTime();
    if (Number.isFinite(expMs) && expMs <= nowMs) return false;
  }
  if (frame.createdAt) {
    const createdMs = new Date(frame.createdAt).getTime();
    if (Number.isFinite(createdMs) && createdMs + STORY_TTL_MS <= nowMs) return false;
  }
  return true;
}

interface StoryGroup {
  storyUuid: string;
  user: {
    _id: string;
    username: string;
    firstName: string;
    lastName: string;
    avatar: string;
    verified?: boolean;
  };
  isOwner?: boolean;
  frames: StoryFrame[];
}

interface ViewerItem {
  user: { username: string; firstName: string; lastName: string; avatar: string };
  reaction?: string;
  viewedAt: string;
}

function StoryAdjacentPreview({
  group,
  onClick,
}: {
  group: StoryGroup;
  onClick: () => void;
}) {
  const previewFrame = group.frames[0];
  const src = previewFrame?.media?.publicUrl || previewFrame?.media?.url;
  const displayName = `${group.user.firstName || ''} ${group.user.lastName || ''}`.trim() || group.user.username;

  return (
    <button
      type="button"
      onClick={onClick}
      className="hidden lg:flex relative w-[220px] xl:w-[240px] h-[390px] xl:h-[426px] rounded-3xl overflow-hidden bg-neutral-900/90 border border-white/10 opacity-45 hover:opacity-80 hover:scale-[1.02] transition-all cursor-pointer shrink-0 flex-col items-center justify-center"
      style={
        previewFrame?.type === 'text'
          ? { backgroundColor: previewFrame.meta?.bgColor || '#4A5CF9' }
          : undefined
      }
      aria-label={`View story from ${displayName}`}
    >
      {previewFrame?.type === 'image' && src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={displayName} className="absolute inset-0 w-full h-full object-cover blur-[2px] brightness-75" />
      )}
      {previewFrame?.type === 'video' && src && (
        <video src={src} muted playsInline className="absolute inset-0 w-full h-full object-cover blur-[2px] brightness-75" />
      )}
      <div className="relative z-10 flex flex-col items-center gap-2 px-4 text-white text-center">
        <div className="p-1 rounded-full border-2 border-white/70">
          <Avatar src={group.user.avatar} alt={group.user.username} size="md" />
        </div>
        <p className="text-par-n font-semibold line-clamp-1">{displayName}</p>
        <p className="text-cap-s text-white/75">{group.frames.length} frame{group.frames.length === 1 ? '' : 's'}</p>
      </div>
    </button>
  );
}

export default function StoryViewerPage() {
  const params = useParams<{ uuid: string }>();
  const router = useRouter();
  const { user, locale } = useApp();
  const { error, success } = useToast();

  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [groupIdx, setGroupIdx] = useState(0);
  const [frameIdx, setFrameIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewers, setViewers] = useState<ViewerItem[]>([]);
  const [loading, setLoading] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressRef = useRef(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<StoryGroup[]>('/stories')
      .then((res) => {
        if (!active) return;
        const nowMs = Date.now();
        const list = (Array.isArray(res) ? res : [])
          .map((g) => ({
            ...g,
            frames: (g.frames || []).filter((f) => isStoryFrameActive(f, nowMs)),
          }))
          .filter((g) => g.frames.length > 0);
        const targetIdx = list.findIndex((g) => g.storyUuid === params.uuid);
        if (targetIdx >= 0) {
          setGroups(list);
          setGroupIdx(targetIdx);
          const firstUnviewed = list[targetIdx].frames.findIndex((f) => !f.isViewed);
          setFrameIdx(firstUnviewed >= 0 ? firstUnviewed : 0);
        } else {
          setGroups([]);
          setGroupIdx(0);
          setFrameIdx(0);
        }
        progressRef.current = 0;
        setProgress(0);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [params.uuid]);

  const activeGroup = groups[groupIdx];
  const activeFrame = activeGroup?.frames[frameIdx];

  const syncBrowserUrl = useCallback((uuid?: string) => {
    if (!uuid || typeof window === 'undefined') return;
    const nextPath = `/stories/${uuid}`;
    if (window.location.pathname !== nextPath) {
      window.history.replaceState(null, '', nextPath);
    }
  }, []);

  const selectGroup = useCallback(
    (nextIdx: number, startAtLastFrame = false) => {
      const target = groups[nextIdx];
      if (!target) return;
      setGroupIdx(nextIdx);
      const nextFrameIdx = startAtLastFrame ? Math.max(0, target.frames.length - 1) : 0;
      setFrameIdx(nextFrameIdx);
      progressRef.current = 0;
      setProgress(0);
      setPaused(false);
      syncBrowserUrl(target.storyUuid);
    },
    [groups, syncBrowserUrl]
  );

  const goNext = useCallback(() => {
    if (!activeGroup) return;
    if (frameIdx + 1 < activeGroup.frames.length) {
      setFrameIdx((i) => i + 1);
      progressRef.current = 0;
      setProgress(0);
    } else if (groupIdx + 1 < groups.length) {
      selectGroup(groupIdx + 1, false);
    } else {
      router.push('/');
    }
  }, [activeGroup, frameIdx, groupIdx, groups.length, router, selectGroup]);

  const goPrev = useCallback(() => {
    if (frameIdx > 0) {
      setFrameIdx((i) => i - 1);
      progressRef.current = 0;
      setProgress(0);
    } else if (groupIdx > 0) {
      selectGroup(groupIdx - 1, true);
    }
  }, [frameIdx, groupIdx, selectGroup]);

  const hasPrev = frameIdx > 0 || groupIdx > 0;
  const hasNext = Boolean(
    activeGroup && (frameIdx + 1 < activeGroup.frames.length || groupIdx + 1 < groups.length)
  );

  // Record view whenever the active frame changes
  useEffect(() => {
    if (!activeFrame) return;
    apiFetch(`/stories/${activeFrame.id}`, {
      method: 'POST',
      json: { action: 'view' },
    })
      .then(() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('weto:story-viewed', {
              detail: { storyUuid: activeFrame.storyUuid, frameId: activeFrame.id },
            })
          );
        }
      })
      .catch(() => undefined);
  }, [activeFrame]);

  // Smooth progress animation for image / text frames (video frames drive via video element events)
  useEffect(() => {
    if (!activeFrame || paused || activeFrame.type === 'video') return;

    const totalMs = Math.max(2000, (activeFrame.durationSeconds || 5) * 1000);
    const startPct = progressRef.current >= 100 ? 0 : progressRef.current;
    const elapsedAlready = (startPct / 100) * totalMs;
    const startedAt = performance.now() - elapsedAlready;
    let rafId = 0;

    const tick = (now: number) => {
      const pct = Math.min(100, ((now - startedAt) / totalMs) * 100);
      progressRef.current = pct;
      setProgress(pct);
      if (pct >= 100) {
        goNext();
        return;
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [activeFrame, paused, goNext]);

  // Sync video playback state when paused/resumed or muted
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || activeFrame?.type !== 'video') return;
    vid.muted = muted;
    if (paused) {
      vid.pause();
    } else {
      vid.play().catch(() => undefined);
    }
  }, [paused, muted, activeFrame]);

  // Desktop keyboard navigation matching StoryPlayback / StoriesIndex
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        if (e.key === 'Escape') {
          target.blur();
          setPaused(false);
        }
        return;
      }
      if (e.key === 'Escape') {
        router.push('/');
      } else if (e.key === 'ArrowRight') {
        goNext();
      } else if (e.key === 'ArrowLeft') {
        goPrev();
      } else if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrev, router]);

  async function sendReaction(emoji: string) {
    if (!activeFrame) return;
    try {
      await apiFetch(`/stories/${activeFrame.id}`, {
        method: 'POST',
        json: { action: 'react', reaction: emoji },
      });
      success(`Sent ${emoji}`);
    } catch {
      // ignore
    }
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!activeFrame || !replyText.trim()) return;
    try {
      await apiFetch(`/stories/${activeFrame.id}`, {
        method: 'POST',
        json: { action: 'reply', replyText: replyText.trim() },
      });
      setReplyText('');
      setPaused(false);
      success('Reply sent to Messenger');
    } catch (err) {
      error('Could not send reply', err instanceof Error ? err.message : undefined);
    }
  }

  async function openViewers() {
    if (!activeFrame) return;
    setPaused(true);
    setViewersOpen(true);
    try {
      const rows = await apiFetch<ViewerItem[]>(`/stories/${activeFrame.id}`);
      setViewers(Array.isArray(rows) ? rows : []);
    } catch {
      setViewers([]);
    }
  }

  async function deleteFrame() {
    if (!activeFrame || !activeGroup) return;
    const deletingId = activeFrame.id;
    try {
      await apiFetch(`/stories/${deletingId}`, { method: 'DELETE' });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('weto:story-event'));
      }
      success('Story frame deleted');

      const nextGroups = groups
        .map((g, gi) =>
          gi === groupIdx
            ? { ...g, frames: g.frames.filter((f) => f.id !== deletingId) }
            : g
        )
        .filter((g) => g.frames.length > 0);

      if (nextGroups.length === 0) {
        router.push('/');
        return;
      }

      const nextGroupIdx = Math.min(groupIdx, nextGroups.length - 1);
      const nextFrameIdx = Math.min(frameIdx, nextGroups[nextGroupIdx].frames.length - 1);
      setGroups(nextGroups);
      setGroupIdx(nextGroupIdx);
      setFrameIdx(nextFrameIdx);
      progressRef.current = 0;
      setProgress(0);
      syncBrowserUrl(nextGroups[nextGroupIdx].storyUuid);
    } catch (err) {
      error('Delete failed', err instanceof Error ? err.message : undefined);
    }
  }

  function handleTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const touch = e.changedTouches[0];
    if (!start || !touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    // Horizontal swipe switches between users' stories on mobile
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx < 0) {
        if (groupIdx + 1 < groups.length) selectGroup(groupIdx + 1, false);
        else router.push('/');
      } else if (groupIdx > 0) {
        selectGroup(groupIdx - 1, false);
      }
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-[60] h-[100dvh] pt-safe pb-safe px-safe bg-[#101214] text-white flex items-center justify-center">
        Loading story...
      </div>
    );
  }

  if (!activeGroup || !activeFrame) {
    return (
      <div className="fixed inset-0 z-[60] h-[100dvh] bg-[#101214] text-white flex flex-col items-center justify-center gap-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] text-center">
        <p className="text-par-l">This story has expired or is no longer available.</p>
        <Link href="/">
          <Button variant="primary">Back to Feed</Button>
        </Link>
      </div>
    );
  }

  const isOwner = Boolean(user && (activeGroup.isOwner || String(activeGroup.user._id) === user.id));
  const mediaSrc = activeFrame.media?.publicUrl || activeFrame.media?.url;
  const authorDisplayName =
    `${activeGroup.user.firstName || ''} ${activeGroup.user.lastName || ''}`.trim() ||
    activeGroup.user.username;
  const prevGroup = groupIdx > 0 ? groups[groupIdx - 1] : null;
  const nextGroup = groupIdx + 1 < groups.length ? groups[groupIdx + 1] : null;

  return (
    <div
      className="fixed inset-0 h-[100dvh] bg-black md:bg-[#101214] text-white flex items-center justify-center z-[60] overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Desktop Stage Top Bar matching desktop/StoriesIndex.vue */}
      <div className="hidden md:flex fixed top-5 inset-x-6 items-center justify-between z-30 pointer-events-none">
        <span className="text-par-m text-white/85 pointer-events-auto">
          {authorDisplayName}{' '}
          <span className="text-white/50">({activeGroup.frames.length})</span>
        </span>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-par-m text-white/75 hover:text-white pointer-events-auto px-3 py-1.5 rounded-full hover:bg-white/10 transition-colors"
        >
          <X className="h-4 w-4" /> Close
        </Link>
      </div>

      {/* Desktop Carousel Container + Mobile Fullscreen Frame */}
      <div className="flex items-center justify-center gap-6 w-full h-full md:px-10">
        {prevGroup && (
          <StoryAdjacentPreview
            group={prevGroup}
            onClick={() => selectGroup(groupIdx - 1, false)}
          />
        )}

        {/* Active Story Card */}
        <div className="relative w-full h-full md:w-[390px] xl:w-[420px] md:h-[690px] xl:h-[744px] md:max-h-[88vh] md:rounded-3xl overflow-hidden bg-neutral-900 shadow-2xl flex flex-col shrink-0">
          {/* Top Progress Bars & Author Header */}
          <div className="absolute top-0 inset-x-0 z-20 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] space-y-2.5 bg-gradient-to-b from-black/75 via-black/35 to-transparent">
            <div className="flex gap-1">
              {activeGroup.frames.map((f, i) => {
                const widthPct = i < frameIdx ? 100 : i === frameIdx ? progress : 0;
                return (
                  <div key={f.id} className="h-1 flex-1 rounded-full bg-white/30 overflow-hidden">
                    <div
                      className="h-full bg-white transition-[width] duration-75 ease-linear"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2">
              <Link
                href={`/@${activeGroup.user.username}`}
                className="flex items-center gap-2.5 min-w-0"
              >
                <Avatar src={activeGroup.user.avatar} alt={activeGroup.user.username} size="sm" />
                <div className="min-w-0">
                  <p className="text-par-n font-semibold leading-tight truncate">
                    {authorDisplayName}
                  </p>
                  <p className="text-cap-s text-white/75">
                    {formatRelativeTime(activeFrame.createdAt, locale)}
                  </p>
                </div>
              </Link>

              <div className="flex items-center gap-1 shrink-0">
                {activeFrame.type === 'video' && (
                  <button
                    type="button"
                    onClick={() => setMuted((m) => !m)}
                    className="p-2 rounded-full hover:bg-white/15 cursor-pointer"
                    aria-label={muted ? 'Unmute' : 'Mute'}
                  >
                    {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPaused((p) => !p)}
                  className="p-2 rounded-full hover:bg-white/15 cursor-pointer"
                  aria-label={paused ? 'Play' : 'Pause'}
                >
                  {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </button>
                {isOwner && (
                  <button
                    type="button"
                    onClick={deleteFrame}
                    className="p-2 rounded-full hover:bg-white/15 text-red-400 cursor-pointer"
                    aria-label="Delete story frame"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <Link
                  href="/"
                  className="p-2 rounded-full hover:bg-white/15 md:hidden"
                  aria-label="Close story viewer"
                >
                  <X className="h-5 w-5" />
                </Link>
              </div>
            </div>
          </div>

          {/* Media / Text Stage + Tap Zones */}
          <div
            className="flex-1 flex items-center justify-center relative select-none overflow-hidden"
            style={
              activeFrame.type === 'text'
                ? { backgroundColor: activeFrame.meta?.bgColor || '#4A5CF9' }
                : undefined
            }
          >
            {activeFrame.type === 'text' && (
              <p className="px-8 text-center text-title-1 font-bold break-words">
                {activeFrame.content}
              </p>
            )}
            {activeFrame.type === 'image' && mediaSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaSrc} alt="Story" className="h-full w-full object-contain" />
            )}
            {activeFrame.type === 'video' && mediaSrc && (
              <div className="relative h-full w-full flex items-center justify-center">
                <video
                  ref={videoRef}
                  key={activeFrame.id}
                  src={mediaSrc}
                  autoPlay
                  playsInline
                  muted={muted}
                  onTimeUpdate={(e) => {
                    const v = e.currentTarget;
                    if (v.duration && Number.isFinite(v.duration)) {
                      const pct = Math.min(100, (v.currentTime / v.duration) * 100);
                      progressRef.current = pct;
                      setProgress(pct);
                    }
                  }}
                  onEnded={goNext}
                  className="h-full w-full object-contain"
                />
                <VideoWatermarkOverlay watermarked={Boolean(activeFrame.media?.metadata?.watermarked)} />
              </div>
            )}

            {activeFrame.type !== 'text' && activeFrame.content && (
              <div className="absolute bottom-24 inset-x-4 z-20 rounded-2xl bg-black/60 backdrop-blur-xs px-4 py-2 text-center text-par-n pointer-events-none">
                {activeFrame.content}
              </div>
            )}

            {/* Mobile + Card Tap Zones (left 25% prev, center 50% pause/play, right 25% next) */}
            <button
              type="button"
              onClick={goPrev}
              disabled={!hasPrev}
              aria-label="Previous story"
              className="absolute left-0 top-16 bottom-24 w-1/4 z-10 cursor-pointer disabled:cursor-default focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? 'Resume story' : 'Pause story'}
              className="absolute left-1/4 right-1/4 top-16 bottom-24 z-10 cursor-pointer focus:outline-none"
            />
            <button
              type="button"
              onClick={goNext}
              aria-label="Next story"
              className="absolute right-0 top-16 bottom-24 w-1/4 z-10 cursor-pointer focus:outline-none"
            />

            {/* Desktop Chevron Buttons matching desktop/StoryPlayer.vue */}
            {hasPrev && (
              <button
                type="button"
                onClick={goPrev}
                className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 h-9 w-9 rounded-full bg-black/45 items-center justify-center hover:bg-black/75 transition-colors cursor-pointer"
                aria-label="Previous story"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            {hasNext && (
              <button
                type="button"
                onClick={goNext}
                className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 h-9 w-9 rounded-full bg-black/45 items-center justify-center hover:bg-black/75 transition-colors cursor-pointer"
                aria-label="Next story"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Bottom Controls */}
          <div className="px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] bg-gradient-to-t from-black/85 via-black/45 to-transparent space-y-2 z-20">
            {isOwner ? (
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={openViewers}
                  className="flex items-center gap-1.5 text-par-n font-semibold text-white/90 hover:text-white cursor-pointer py-1"
                >
                  <Eye className="h-4 w-4" /> {activeFrame.viewsCount} view{activeFrame.viewsCount === 1 ? '' : 's'}
                </button>
                <Link
                  href="/new/story"
                  className="text-cap-l font-semibold text-white/90 hover:text-white underline"
                >
                  + Add frame
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-3">
                  {['❤️', '🔥', '👏', '😂', '😮'].map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => sendReaction(em)}
                      className="text-xl hover:scale-125 transition-transform cursor-pointer"
                    >
                      {em}
                    </button>
                  ))}
                </div>
                <form onSubmit={sendReply} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onFocus={() => setPaused(true)}
                    onBlur={() => setPaused(false)}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={`Reply to ${activeGroup.user.firstName || activeGroup.user.username}...`}
                    className="flex-1 h-10 rounded-full bg-white/15 border border-white/25 px-4 text-par-n text-white placeholder:text-white/60 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="h-10 w-10 rounded-full bg-brand-900 flex items-center justify-center cursor-pointer shrink-0"
                    aria-label="Send reply"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

        {nextGroup && (
          <StoryAdjacentPreview
            group={nextGroup}
            onClick={() => selectGroup(groupIdx + 1, false)}
          />
        )}
      </div>

      <Modal
        open={viewersOpen}
        onClose={() => {
          setViewersOpen(false);
          setPaused(false);
        }}
        title="Story Viewers"
      >
        {viewers.length === 0 ? (
          <p className="text-center text-lab-sc py-4">No views recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {viewers.map((v, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Avatar src={v.user?.avatar} alt={v.user?.username} size="sm" />
                  <div>
                    <p className="text-par-n font-semibold text-lab-pr">
                      {v.user?.firstName} {v.user?.lastName}
                    </p>
                    <p className="text-cap-s text-lab-sc">@{v.user?.username}</p>
                  </div>
                </div>
                {v.reaction && <span className="text-lg">{v.reaction}</span>}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
