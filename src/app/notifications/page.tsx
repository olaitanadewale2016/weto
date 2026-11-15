'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BadgeCheck, Bell, BellRing, CheckCheck, Trash2 } from 'lucide-react';
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
  actionUrl?: string;
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

export default function NotificationsPage() {
  const { user, socket, locale, setCounters, enablePushNotifications } = useApp();
  const { success } = useToast();

  const [tab, setTab] = useState<'all' | 'mentions' | 'important'>('all');
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

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
    socket?.on('notification:new', refreshLive);
    return () => {
      window.removeEventListener('weto:notification-event', refreshLive);
      socket?.off('notification:new', refreshLive);
    };
  }, [loadNotifications, socket]);

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
    await apiFetch('/notifications', { method: 'DELETE' });
    setItems([]);
    setCounters((prev) => ({ ...prev, unreadNotifications: 0 }));
    success('Notifications cleared');
  }

  return (
    <AppShell>
      <div className="sticky top-14 md:top-0 z-20 bg-bg-pr/95 backdrop-blur-md border-b border-bord-pr">
        <div className="px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link href="/" className="md:hidden p-1.5 -ml-1.5 rounded-full text-lab-pr hover:bg-fill-tr">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-title-3 font-bold text-lab-pr">Notifications</h1>
          </div>
          {user && (
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={enablePushNotifications} title="Enable browser push">
                <BellRing className="h-3.5 w-3.5" /> Push
              </Button>
              <Button size="sm" variant="ghost" onClick={markAllRead}>
                <CheckCheck className="h-4 w-4" /> Read all
              </Button>
              <Button size="sm" variant="ghost" onClick={clearAll} className="text-red-900">
                <Trash2 className="h-4 w-4" />
              </Button>
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
            action={
              <Link href="/auth/login">
                <Button variant="primary">Sign in</Button>
              </Link>
            }
          />
        </div>
      ) : loading ? (
        <p className="p-8 text-center text-lab-sc">Loading notifications...</p>
      ) : items.length === 0 ? (
        <div className="p-6">
          <EmptyState icon={Bell} title="You're all caught up" description="No notifications in this category yet." />
        </div>
      ) : (
        <div className="divide-y divide-bord-pr">
          {items.map((n) => {
            const actorName = getNotificationActorName(n.actor);
            const actionText = getNotificationActionText(n.message, n.actor);

            return (
              <Link
                key={n.id}
                href={n.actionUrl || '/'}
                onClick={() => {
                  if (!n.readAt) {
                    apiFetch('/notifications', {
                      method: 'PATCH',
                      json: { notificationId: n.id },
                    }).catch(() => undefined);
                  }
                }}
                className={cn(
                  'flex items-start gap-3 p-4 hover:bg-fill-pr transition-colors',
                  !n.readAt && 'bg-brand-900/5'
                )}
              >
                <Avatar src={n.actor?.avatar} alt={actorName || n.actor?.username} verified={n.actor?.verified} size="md" />
                <div className="flex-1 min-w-0">
                  {actorName ? (
                    <p className="text-par-n leading-5 text-lab-sc">
                      <span className="font-bold text-lab-pr mr-1 inline-flex items-center gap-1 align-middle">
                        <span>{actorName}</span>
                        {n.actor?.verified && (
                          <BadgeCheck className="h-3.5 w-3.5 text-brand-900 shrink-0" />
                        )}
                      </span>
                      <span className="text-lab-pr2">{actionText}</span>
                    </p>
                  ) : (
                    <>
                      {n.title && <p className="text-par-n font-bold text-lab-pr">{n.title}</p>}
                      <p className="text-par-n text-lab-sc">{n.message}</p>
                    </>
                  )}
                  <p className="text-cap-s text-lab-tr mt-1">{formatRelativeTime(n.createdAt, locale)}</p>
                </div>
                {!n.readAt && <span className="h-2.5 w-2.5 rounded-full bg-brand-900 shrink-0 mt-2" />}
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
