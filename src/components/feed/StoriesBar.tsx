'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useApp } from '@/components/providers/AppContext';
import { Avatar } from '@/components/ui/avatar';

export interface StoryGroupItem {
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
  hasUnviewed: boolean;
  frames: Array<{
    id: string;
    storyUuid: string;
    type: string;
    content?: string;
    isViewed: boolean;
    media?: { publicUrl?: string; url?: string } | null;
    createdAt?: string;
    expiresAt?: string;
  }>;
}

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

function isFrameActive(frame: { expiresAt?: string; createdAt?: string }, nowMs: number): boolean {
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

function filterActiveStoryGroups(items: StoryGroupItem[], nowMs = Date.now()): StoryGroupItem[] {
  return items
    .map((group) => {
      const frames = (group.frames || []).filter((f) => isFrameActive(f, nowMs));
      return {
        ...group,
        frames,
        hasUnviewed: frames.some((f) => !f.isViewed) && !group.isOwner,
      };
    })
    .filter((group) => group.frames.length > 0);
}

const storiesBarCache: {
  userId: string | null;
  ts: number;
  items: StoryGroupItem[];
} = {
  userId: null,
  ts: 0,
  items: [],
};

export function StoriesBar() {
  const { user, bootstrap } = useApp();
  const [stories, setStories] = useState<StoryGroupItem[]>(() =>
    user?.id && storiesBarCache.userId === user.id
      ? filterActiveStoryGroups(storiesBarCache.items)
      : []
  );

  const fetchStories = useCallback(
    (force = false) => {
      if (!user || bootstrap?.config?.features?.stories === false) return;
      const isFresh =
        !force &&
        storiesBarCache.userId === user.id &&
        Date.now() - storiesBarCache.ts < 30_000;
      if (isFresh) {
        setStories(filterActiveStoryGroups(storiesBarCache.items));
        return;
      }

      apiFetch<StoryGroupItem[]>('/stories')
        .then((res) => {
          const list = filterActiveStoryGroups(Array.isArray(res) ? res : []);
          storiesBarCache.userId = user.id;
          storiesBarCache.items = list;
          storiesBarCache.ts = Date.now();
          setStories(list);
        })
        .catch(() => undefined);
    },
    [user, bootstrap?.config?.features?.stories]
  );

  useEffect(() => {
    fetchStories(false);
  }, [fetchStories]);

  useEffect(() => {
    const pruneExpired = () => {
      setStories((prev) => {
        const active = filterActiveStoryGroups(prev);
        storiesBarCache.items = active;
        return active;
      });
    };
    const onFocusOrVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      pruneExpired();
      fetchStories(false);
    };
    const intervalId = setInterval(pruneExpired, 60_000);
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [fetchStories]);

  useEffect(() => {
    const onStoryChanged = () => {
      storiesBarCache.ts = 0;
      fetchStories(true);
    };
    const onStoryViewed = (ev: Event) => {
      const detail = (ev as CustomEvent<{ storyUuid?: string; frameId?: string }>).detail;
      if (!detail?.frameId && !detail?.storyUuid) return;
      setStories((prev) => {
        const next = prev.map((group) => {
          if (detail.storyUuid && group.storyUuid !== detail.storyUuid) return group;
          const frames = group.frames.map((f) =>
            f.id === detail.frameId ? { ...f, isViewed: true } : f
          );
          return {
            ...group,
            frames,
            hasUnviewed: frames.some((f) => !f.isViewed),
          };
        });
        storiesBarCache.items = next;
        return next;
      });
    };

    window.addEventListener('weto:story-event', onStoryChanged);
    window.addEventListener('weto:story-viewed', onStoryViewed);
    return () => {
      window.removeEventListener('weto:story-event', onStoryChanged);
      window.removeEventListener('weto:story-viewed', onStoryViewed);
    };
  }, [fetchStories]);

  if (!user || bootstrap?.config?.features?.stories === false) return null;

  // Responsive StoriesFeed.vue layout: w-[80px] on mobile, w-[74px] on desktop
  return (
    <div className="pb-4 px-4 flex items-center gap-3 overflow-x-auto hidden-scroll touch-pan-x">
      <Link href="/new/story" className="w-[80px] md:w-[74px] shrink-0 cursor-pointer block">
        <div className="size-[80px] md:size-[74px] relative p-1">
          <div className="size-full rounded-full overflow-hidden">
            <Avatar src={user.avatar} alt={user.username} size="xl" className="size-full bg-fill-pr" />
          </div>
          <div className="border-[3px] border-bg-pr rounded-full inline-flex items-center justify-center text-bg-pr size-[24px] md:size-[22px] bg-lab-pr2 absolute bottom-0.5 right-0.5 z-10">
            <Plus className="size-3.5 stroke-[2.5]" />
          </div>
        </div>
        <div className="text-par-s font-medium text-lab-pr text-center whitespace-nowrap overflow-hidden text-ellipsis">
          New story
        </div>
      </Link>

      {stories.map((st) => {
        const isOwner = st.isOwner || String(st.user?._id) === user.id;
        const showUnreadRing = st.hasUnviewed && !isOwner;
        return (
          <Link key={st.storyUuid} href={`/stories/${st.storyUuid}`} className="w-[80px] md:w-[74px] shrink-0 block">
            <div
              className={`size-[80px] md:size-[74px] relative rounded-full border-2 p-[3px] ${
                !showUnreadRing ? 'border-bord-card' : 'border-transparent'
              }`}
            >
              {showUnreadRing && (
                <div className="absolute inset-0 pointer-events-none">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/assets/avatars/story-avatar-ring.png" alt="Story ring" className="size-full" />
                </div>
              )}
              <div className="rounded-full size-full overflow-hidden">
                <Avatar
                  src={st.user.avatar}
                  alt={st.user.username}
                  size="xl"
                  className="size-full bg-fill-pr"
                />
              </div>
            </div>
            <div className="text-par-s font-medium text-lab-pr text-center whitespace-nowrap overflow-hidden text-ellipsis">
              {isOwner ? 'Your story' : st.user.firstName || st.user.username}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
