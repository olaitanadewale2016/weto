'use client';

import React, { useEffect, useState } from 'react';
import { BusinessPortalHeader } from '@/components/business/BusinessPortalHeader';
import { apiFetch } from '@/lib/api-client';

export default function BusinessNotificationsPage() {
  const [items, setItems] = useState<Array<{ id: string; title?: string; message: string; createdAt: string }>>([]);

  useEffect(() => {
    apiFetch<Array<{ id: string; title?: string; message: string; createdAt: string }>>('/notifications?tab=important')
      .then((res) => setItems(Array.isArray(res) ? res : []))
      .catch(() => setItems([]));
  }, []);

  return (
    <div className="space-y-6">
        <BusinessPortalHeader title="Business & Campaign Alerts" subtitle="Job applications, ad approvals, and financial notifications." />
        {items.length === 0 ? (
          <p className="text-lab-sc text-center py-8">No important business alerts yet.</p>
        ) : (
          <div className="divide-y divide-bord-pr rounded-3xl border border-bord-card overflow-hidden">
            {items.map((n) => (
              <div key={n.id} className="p-4 bg-bg-pr">
                {n.title && <p className="font-bold text-lab-pr">{n.title}</p>}
                <p className="text-par-n text-lab-sc">{n.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
  );
}
