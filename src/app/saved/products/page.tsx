'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShoppingBag } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { EmptyState } from '@/components/ui/empty-state';
import {
  MarketplaceProductItem,
  ProductCard,
} from '@/components/marketplace/ProductCard';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/providers/ToastProvider';

export default function SavedProductsPage() {
  const router = useRouter();
  const { success } = useToast();
  const [products, setProducts] = useState<MarketplaceProductItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSaved = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ products: MarketplaceProductItem[] }>('/marketplace?saved=true');
      setProducts(res.products || []);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadSaved();
    }, 0);
    return () => clearTimeout(id);
  }, [loadSaved]);

  async function handleToggleBookmark(productId: string) {
    try {
      const res = await apiFetch<{ bookmarked: boolean }>(`/marketplace/${productId}`, {
        method: 'PATCH',
        json: { action: 'bookmark' },
      });
      if (!res.bookmarked) {
        setProducts((prev) => prev.filter((item) => item.id !== productId));
        success('Removed from saved products');
      }
    } catch {
      // ignore
    }
  }

  return (
    <AppShell hideMobileHeader>
      {/* PHP BookmarksHeader */}
      <div className="sticky top-0 z-20 pt-safe px-safe bg-bg-pr/95 backdrop-blur-md border-b border-bord-pr">
        <div className="px-4 py-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="md:hidden p-1.5 -ml-1.5 rounded-full text-lab-pr hover:bg-fill-tr cursor-pointer shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-title-3 font-bold text-lab-pr truncate">Saved &amp; Bookmarks</h1>
        </div>

        <div className="flex border-t border-bord-tr/60 px-2">
          <Link
            href="/bookmarks"
            className="flex-1 py-2.5 text-center text-par-s font-semibold text-lab-sc hover:text-lab-pr border-b-2 border-transparent"
          >
            Posts
          </Link>
          <Link
            href="/saved/products"
            className="flex-1 py-2.5 text-center text-par-s font-bold text-lab-pr border-b-2 border-brand-900"
          >
            Products
          </Link>
          <Link
            href="/saved/jobs"
            className="flex-1 py-2.5 text-center text-par-s font-semibold text-lab-sc hover:text-lab-pr border-b-2 border-transparent"
          >
            Jobs
          </Link>
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <p className="text-lab-sc py-10 text-center">Loading saved products...</p>
        ) : products.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="No saved products yet"
            description="Bookmark items in Marketplace to track them here."
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} onToggleBookmark={handleToggleBookmark} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
