'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BadgeCheck,
  Bell,
  BellRing,
  Check,
  CheckCheck,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { apiFetch } from '@/lib/api-client';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';
import { formatRelativeTime } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface NotificationItem {
  id: string;
  type?: string;
  title?: string;
  message: string;
  actionUrl?: string | null;
  previewLqip?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  readAt?: string | null;
  createdAt: string;
  actor?: {
    id?: string;
    name?: string;
    username: string;
    firstName: string;
    lastName: string;
    avatar: string;
    verified?: boolean;
  } | null;
}

type DateGroupKey = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'earlier';

const DATE_GROUP_LABELS: Record<DateGroupKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This week',
  this_month: 'This month',
  earlier: 'Earlier',
};

const DATE_GROUP_ORDER: DateGroupKey[] = [
  'today',
  'yesterday',
  'this_week',
  'this_month',
  'earlier',
];

function getDateGroupKey(isoDate: string): DateGroupKey {
  const date = new Date(isoDate);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 86_400_000;
  const startWeek = startToday - 6 * 86_400_000;
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const ts = date.getTime();

  if (ts >= startToday) return 'today';
  if (ts >= startYesterday) return 'yesterday';
  if (ts >= startWeek) return 'this_week';
  if (ts >= startMonth) return 'this_month';
  return 'earlier';
}

function getNotificationActorName(actor?: NotificationItem['actor']): string {
  if (!actor) return '';
  return (
    [actor.firstName, actor.lastName].filter(Boolean).join(' ').trim() ||
    actor.name ||
    (actor.username ? `@${actor.username}` : '')
  );
}

function getNotificationActionText(message: string, actor?: NotificationItem['actor']): string {
  const clean = message.trim();
  if (!actor?.username) return clean;
  const handle = `@${actor.username}`;
  if (clean.toLowerCase().startsWith(handle.toLowerCase())) {
    return clean.slice(handle.length).trimStart();
  }
  return clean;
}

function NotificationSkeletonList() {
  return (
    <div className="divide-y divide-bord-tr">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className="flex items-start gap-3 px-4 py-3.5 animate-pulse">
          <div className="size-10 rounded-full bg-fill-qt shrink-0" />
          <div className="flex-1 space-y-2 pt-0.5">
            <div className="h-3.5 w-3/4 rounded-full bg-fill-qt" />
            <div className="h-3 w-1/3 rounded-full bg-fill-qt" />
          </div>
          <div className="size-10 rounded-lg bg-fill-qt shrink-0" />
        </div>
      ))}
    </div>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const { user, socket, locale, counters, setCounters, enablePushNotifications } = useApp();
  const { success, error } = useToast();

  const [tab, setTab] = useState<'all' | 'mentions' | 'important'>('all');
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [requestDecisionMap, setRequestDecisionMap] = useState<
    Record<string, 'accepted' | 'declined' | 'busy'>
  >({});

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const stored = localStorage.getItem('notificationsSound');
        if (stored === '0') setSoundEnabled(false);
        else {
          if (stored === null) localStorage.setItem('notificationsSound', '1');
          setSoundEnabled(true);
        }
      } catch {
        // ignore storage errors
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<NotificationItem[]>(`/notifications?tab=${tab}`);
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user, tab]);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadNotifications();
    }, 0);
    return () => clearTimeout(id);
  }, [loadNotifications]);

  useEffect(() => {
    const refreshLive = () => {
      void loadNotifications();
    };
    window.addEventListener('weto:notification-event', refreshLive);
    window.addEventListener('weto:network-restored', refreshLive);
    socket?.on('notification:new', refreshLive);
    return () => {
      window.removeEventListener('weto:notification-event', refreshLive);
      window.removeEventListener('weto:network-restored', refreshLive);
      socket?.off('notification:new', refreshLive);
    };
  }, [loadNotifications, socket]);

  // Automatically mark notifications as read when viewed without requiring manual item clicks
  useEffect(() => {
    if (!user || loading) return;
    const hasUnread = items.some((n) => !n.readAt);
    if (!hasUnread) return;

    const timer = setTimeout(async () => {
      try {
        await apiFetch('/notifications', {
          method: 'PATCH',
          json: {},
        });
        setItems((prev) =>
          prev.map((row) => (row.readAt ? row : { ...row, readAt: new Date().toISOString() }))
        );
        setCounters((prev) => ({ ...prev, unreadNotifications: 0 }));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('weto:notification-event'));
        }
      } catch {
        // non-blocking
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [items, user, loading, setCounters]);

  const grouped = useMemo(() => {
    const map: Record<DateGroupKey, NotificationItem[]> = {
      today: [],
      yesterday: [],
      this_week: [],
      this_month: [],
      earlier: [],
    };
    for (const item of items) {
      const key = getDateGroupKey(item.createdAt);
      map[key].push(item);
    }
    return map;
  }, [items]);

  async function markOneRead(n: NotificationItem) {
    if (n.readAt) return;
    setItems((prev) =>
      prev.map((row) => (row.id === n.id ? { ...row, readAt: new Date().toISOString() } : row))
    );
    setCounters((prev) => ({
      ...prev,
      unreadNotifications: Math.max(0, prev.unreadNotifications - 1),
    }));
    try {
      await apiFetch('/notifications', {
        method: 'PATCH',
        json: { notificationId: n.id },
      });
    } catch {
      // non-blocking
    }
  }

  async function markAllRead() {
    const res = await apiFetch<{ unreadCount: number }>('/notifications', {
      method: 'PATCH',
      json: {},
    });
    setCounters((prev) => ({ ...prev, unreadNotifications: res.unreadCount }));
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    success('All notifications marked as read');
  }

  async function clearAll() {
    if (!window.confirm('Clear all notifications?')) return;
    await apiFetch('/notifications', { method: 'DELETE' });
    setItems([]);
    setCounters((prev) => ({ ...prev, unreadNotifications: 0 }));
    success('Notifications cleared');
  }

  async function handleFollowRequestAction(
    n: NotificationItem,
    decision: 'accept_follow' | 'reject_follow'
  ) {
    const targetUserId = n.actor?.id;
    if (!targetUserId) return;
    setRequestDecisionMap((prev) => ({ ...prev, [n.id]: 'busy' }));
    try {
      await apiFetch('/relations', {
        method: 'POST',
        json: { action: decision, targetUserId },
      });
      setRequestDecisionMap((prev) => ({
        ...prev,
        [n.id]: decision === 'accept_follow' ? 'accepted' : 'declined',
      }));
      void markOneRead(n);
      success(
        decision === 'accept_follow' ? 'Follow request accepted' : 'Follow request declined'
      );
    } catch (err) {
      setRequestDecisionMap((prev) => {
        const copy = { ...prev };
        delete copy[n.id];
        return copy;
      });
      error('Could not update follow request', err instanceof Error ? err.message : undefined);
    }
  }

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try {
      localStorage.setItem('notificationsSound', next ? '1' : '0');
    } catch {
      // ignore
    }
    if (next) {
      try {
        const audio = new Audio('/assets/sounds/notifications/notification-received.mp3');
        audio.volume = 0.55;
        audio.play().catch(() => undefined);
      } catch {
        // ignore
      }
      success('Notification sound enabled');
    } else {
      success('Notification sound muted');
    }
  }

  return (
    <AppShell>
      {/* Responsive PHP Notifications Header (respects mobile sticky AppShell header & notch safe area) */}
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] md:top-0 z-20 bg-bg-pr/95 backdrop-blur-md border-b border-bord-pr">
        <div className="px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/"
              className="md:hidden p-1.5 -ml-1.5 rounded-full text-lab-pr hover:bg-fill-tr shrink-0"
              aria-label="Back to home"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-title-3 font-bold text-lab-pr truncate">Notifications</h1>
            {counters.unreadNotifications > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-brand-900 text-white text-cap-s font-semibold px-2 py-0.5 leading-none">
                {counters.unreadNotifications}
              </span>
            )}
          </div>

          {user && (
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={enablePushNotifications}
                title="Enable browser push notifications"
                className="px-2.5 sm:px-3"
              >
                <BellRing className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Push</span>
              </Button>
              {items.some((n) => !n.readAt) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={markAllRead}
                  title="Mark all as read"
                  className="px-2 sm:px-3"
                >
                  <CheckCheck className="h-4 w-4" />
                  <span className="hidden sm:inline">Read all</span>
                </Button>
              )}
              {items.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearAll}
                  title="Clear all notifications"
                  className="text-red-900 px-2"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>

        <Tabs
          value={tab}
          onChange={(k) => setTab(k as 'all' | 'mentions' | 'important')}
          tabs={[
            { key: 'all', label: 'All' },
            { key: 'mentions', label: 'Mentions' },
            { key: 'important', label: 'Important' },
          ]}
        />
      </div>

      {!user ? (
        <div className="p-6">
          <EmptyState
            icon={Bell}
            title="Sign in to see notifications"
            description="Follow creators, post updates, and never miss alerts or tips."
            action={
              <Link href="/auth/login">
                <Button variant="primary">Sign in</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col min-h-[calc(100vh-12rem)] justify-between">
          <div>
            {loading ? (
              <NotificationSkeletonList />
            ) : items.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={Bell}
                  title="You're all caught up"
                  description="No notifications in this category yet."
                />
              </div>
            ) : (
              <div>
                {DATE_GROUP_ORDER.map((groupKey) => {
                  const groupItems = grouped[groupKey];
                  if (groupItems.length === 0) return null;

                  return (
                    <section key={groupKey}>
                      <div className="px-4 py-2 bg-bg-sc/80 border-y border-bord-tr first:border-t-0">
                        <h2 className="text-cap-l font-semibold uppercase tracking-wide text-lab-sc">
                          {DATE_GROUP_LABELS[groupKey]}
                        </h2>
                      </div>

                      <div className="divide-y divide-bord-tr">
                        {groupItems.map((n) => {
                          const actorName = getNotificationActorName(n.actor);
                          const actionText = getNotificationActionText(n.message, n.actor);
                          const isFollowRequest =
                            n.type === 'FOLLOWED_REQUESTED' || n.type === 'follow_request';
                          const reqState = requestDecisionMap[n.id];

                          return (
                            <div
                              key={n.id}
                              onClick={() => {
                                void markOneRead(n);
                                if (!isFollowRequest && n.actionUrl) {
                                  router.push(n.actionUrl);
                                }
                              }}
                              className={cn(
                                'flex items-start gap-3 px-4 py-3.5 transition-colors',
                                !isFollowRequest && n.actionUrl
                                  ? 'cursor-pointer hover:bg-fill-qt/60'
                                  : 'hover:bg-fill-qt/40',
                                !n.readAt && 'bg-brand-900/5'
                              )}
                            >
                              {n.actor?.username ? (
                                <Link
                                  href={`/@${n.actor.username}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void markOneRead(n);
                                  }}
                                  className="shrink-0"
                                >
                                  <Avatar
                                    src={n.actor.avatar}
                                    alt={actorName || n.actor.username}
                                    verified={n.actor.verified}
                                    size="md"
                                  />
                                </Link>
                              ) : (
                                <div className="size-10 rounded-full bg-brand-900/10 text-brand-900 flex items-center justify-center shrink-0">
                                  <Bell className="size-5" />
                                </div>
                              )}

                              <div className="flex-1 min-w-0">
                                {actorName ? (
                                  <p className="text-par-n leading-5 text-lab-sc">
                                    <Link
                                      href={
                                        n.actor?.username ? `/@${n.actor.username}` : n.actionUrl || '/'
                                      }
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void markOneRead(n);
                                      }}
                                      className="font-bold text-lab-pr mr-1 inline-flex items-center gap-1 align-middle hover:underline"
                                    >
                                      <span>{actorName}</span>
                                      {n.actor?.verified && (
                                        <BadgeCheck className="h-3.5 w-3.5 text-brand-900 shrink-0" />
                                      )}
                                    </Link>
                                    <span className="text-lab-pr2">{actionText}</span>
                                  </p>
                                ) : (
                                  <>
                                    {n.title && (
                                      <p className="text-par-n font-bold text-lab-pr">{n.title}</p>
                                    )}
                                    <p className="text-par-n text-lab-sc">{n.message}</p>
                                  </>
                                )}

                                <p className="text-cap-s text-lab-tr mt-1">
                                  {formatRelativeTime(n.createdAt, locale)}
                                </p>

                                {isFollowRequest && n.actor?.id && (
                                  <div
                                    className="flex items-center gap-2 mt-2.5"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {reqState === 'accepted' ? (
                                      <span className="inline-flex items-center gap-1 text-cap-l font-medium text-green-700 dark:text-green-400">
                                        <Check className="size-3.5" /> Accepted
                                      </span>
                                    ) : reqState === 'declined' ? (
                                      <span className="inline-flex items-center gap-1 text-cap-l text-lab-sc">
                                        <X className="size-3.5" /> Declined
                                      </span>
                                    ) : (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="primary"
                                          disabled={reqState === 'busy'}
                                          onClick={() =>
                                            void handleFollowRequestAction(n, 'accept_follow')
                                          }
                                        >
                                          <Check className="size-3.5" /> Accept
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          disabled={reqState === 'busy'}
                                          onClick={() =>
                                            void handleFollowRequestAction(n, 'reject_follow')
                                          }
                                        >
                                          <X className="size-3.5" /> Decline
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {n.previewLqip ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={n.previewLqip}
                                    alt="Preview"
                                    className="size-11 rounded-lg object-cover border border-bord-card bg-fill-qt"
                                  />
                                ) : null}
                                {!n.readAt && (
                                  <span
                                    className="h-2.5 w-2.5 rounded-full bg-brand-900 shrink-0"
                                    aria-label="Unread notification"
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>

          {/* PHP NotificationSoundControl.vue parity */}
          <div className="border-t border-bord-pr bg-bg-sc/60 px-4 py-3 mt-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-9 rounded-full bg-fill-qt flex items-center justify-center text-lab-pr2 shrink-0">
                {soundEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              </div>
              <div className="min-w-0">
                <p className="text-par-s font-semibold text-lab-pr">Notification sound</p>
                <p className="text-cap-s text-lab-sc truncate">
                  {soundEnabled
                    ? 'Plays a chime when new notifications arrive'
                    : 'Muted on this device'}
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={soundEnabled}
              onClick={toggleSound}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                soundEnabled ? 'bg-brand-900' : 'bg-fill-pr'
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block size-5 transform rounded-full bg-white shadow transition duration-200',
                  soundEnabled ? 'translate-x-5' : 'translate-x-0'
                )}
              />
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
