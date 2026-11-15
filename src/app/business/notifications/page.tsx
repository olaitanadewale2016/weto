'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { BusinessPortalHeader } from '@/components/business/BusinessPortalHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { apiFetch } from '@/lib/api-client';
import { useApp } from '@/components/providers/AppContext';

interface BusinessAlert {
  id: string;
  title?: string;
  message: string;
  actionUrl?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export default function BusinessNotificationsPage() {
  const router = useRouter();
  const { refreshBootstrap } = useApp();
  const [items, setItems] = useState<BusinessAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<BusinessAlert[]>('/notifications?tab=important');
      setItems(Array.isArray(res) ? res : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadAlerts();
    }, 0);
    return () => clearTimeout(id);
  }, [loadAlerts]);

  async function markRead(notificationId?: string) {
    try {
      await apiFetch('/notifications', {
        method: 'PATCH',
        json: notificationId ? { notificationId } : {},
      });
      setItems((prev) =>
        prev.map((n) =>
          !notificationId || n.id === notificationId ? { ...n, readAt: n.readAt || new Date().toISOString() } : n
        )
      );
      void refreshBootstrap();
    } catch {
      // ignore
    }
  }

  const unreadCount = items.filter((n) => !n.readAt).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <BusinessPortalHeader
          title="Business & Campaign Alerts"
          subtitle="Job applications, ad approvals, moderation decisions, and payout updates."
        />
        {unreadCount > 0 && (
          <Button size="sm" variant="outline" onClick={() => void markRead()}>
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-lab-sc text-center py-8">Loading alerts...</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No business alerts yet"
          description="Updates on ad approvals, job applications, marketplace reviews, and cashouts appear here."
        />
      ) : (
        <div className="divide-y divide-bord-pr rounded-3xl border border-bord-card overflow-hidden bg-bg-pr">
          {items.map((n) => (
            <div
              key={n.id}
              onClick={() => {
                if (!n.readAt) void markRead(n.id);
                if (n.actionUrl) router.push(n.actionUrl);
              }}
              className={`p-4 flex items-start justify-between gap-3 transition-colors ${
                n.actionUrl ? 'cursor-pointer hover:bg-fill-qt/50' : ''
              } ${!n.readAt ? 'bg-brand-900/5' : 'bg-bg-pr'}`}
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {n.title && <p className="font-bold text-lab-pr">{n.title}</p>}
                  {!n.readAt && <Badge variant="brand">New</Badge>}
                </div>
                <p className="text-par-n text-lab-sc">{n.message}</p>
                <p className="text-cap-s text-lab-tr">{new Date(n.createdAt).toLocaleString()}</p>
              </div>
              {n.actionUrl && (
                <span className="text-cap-l font-semibold text-brand-900 shrink-0">View</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
