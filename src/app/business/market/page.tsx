'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { BusinessPortalHeader } from '@/components/business/BusinessPortalHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency } from '@/lib/currency';
import { useApp } from '@/components/providers/AppContext';

interface MyProduct {
  id: string;
  hashId: string;
  title: string;
  salePrice: number;
  currency: string;
  status: string;
  approval: string;
  previewImageUrl: string;
}

export default function BusinessMarketPage() {
  const { bootstrap, locale } = useApp();
  const [items, setItems] = useState<MyProduct[]>([]);

  useEffect(() => {
    apiFetch<{ products: MyProduct[] }>('/marketplace?mine=true')
      .then((res) => setItems(res.products || []))
      .catch(() => setItems([]));
  }, []);

  return (
    <div className="space-y-6">
        <BusinessPortalHeader title="My Store Listings" subtitle="Manage inventory published under your account." />
        <div className="flex justify-end">
          <Link href="/marketplace">
            <Button variant="primary">Open Marketplace</Button>
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((p) => (
            <Link key={p.id} href={`/marketplace/product/${p.hashId || p.id}`} className="rounded-3xl border border-bord-card bg-bg-pr overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.previewImageUrl} alt={p.title} className="h-40 w-full object-cover" />
              <div className="p-4 space-y-1.5">
                <div className="flex justify-between gap-2">
                  <p className="font-bold text-lab-pr truncate">{p.title}</p>
                  <Badge variant="brand">{p.status}</Badge>
                </div>
                <p className="font-bold text-brand-900">
                  {formatCurrency(p.salePrice, p.currency, bootstrap?.currencies, locale)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
  );
}
