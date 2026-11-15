'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ShoppingBag } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { EmptyState } from '@/components/ui/empty-state';
import { apiFetch } from '@/lib/api-client';

interface SavedProduct {
  id: string;
  hashId: string;
  title: string;
  salePrice: number;
  currency: string;
  previewImageUrl: string;
}

export default function SavedProductsPage() {
  const [products, setProducts] = useState<SavedProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ products: SavedProduct[] }>('/marketplace?saved=true')
      .then((res) => setProducts(res.products || []))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell fullWidth>
      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/marketplace" className="p-2 rounded-full hover:bg-fill-sc">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-title-2 font-bold text-lab-pr">Saved Products</h1>
        </div>

        {loading ? (
          <p className="text-lab-sc py-8 text-center">Loading saved items...</p>
        ) : products.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="No saved products yet" description="Bookmark items in Marketplace to track them here." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {products.map((p) => (
              <Link
                key={p.id}
                href={`/marketplace/product/${p.hashId || p.id}`}
                className="rounded-3xl border border-bord-card bg-bg-pr overflow-hidden hover:shadow-vertical-qt"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.previewImageUrl} alt={p.title} className="aspect-[4/3] w-full object-cover" />
                <div className="p-3.5">
                  <p className="font-bold text-lab-pr line-clamp-1">{p.title}</p>
                  <p className="text-brand-900 font-bold mt-1">{p.currency} {p.salePrice.toFixed(2)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
