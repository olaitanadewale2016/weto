'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Edit3, Plus, Power, ShoppingBag, Sparkles, Trash2 } from 'lucide-react';
import { BusinessPortalHeader } from '@/components/business/BusinessPortalHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  EditableProductData,
  MarketplaceCategoryOption,
  ProductCreateModal,
} from '@/components/marketplace/ProductCreateModal';
import { ProductPromoteModal } from '@/components/marketplace/ProductPromoteModal';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency } from '@/lib/currency';
import { resolveMediaUrl } from '@/lib/media-url';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';

interface MyProduct {
  id: string;
  hashId: string;
  title: string;
  description?: string;
  price: number;
  salePrice: number;
  discount?: number;
  currency: string;
  condition?: string;
  type?: string;
  stockQuantity?: number;
  address?: string;
  status: string;
  approval: string;
  isPromoted?: boolean;
  promotedUntil?: string | null;
  previewImageUrl: string;
  category?: { _id?: string; id?: string };
}

export default function BusinessMarketPage() {
  const { bootstrap, locale } = useApp();
  const { error, success } = useToast();
  const [items, setItems] = useState<MyProduct[]>([]);
  const [categories, setCategories] = useState<MarketplaceCategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<EditableProductData | null>(null);
  const [promoting, setPromoting] = useState<MyProduct | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const loadInventory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        products: MyProduct[];
        categories: MarketplaceCategoryOption[];
      }>('/marketplace?mine=true');
      setItems(res.products || []);
      setCategories(res.categories || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadInventory();
    }, 0);
    return () => clearTimeout(id);
  }, [loadInventory]);

  async function toggleStatus(productId: string) {
    try {
      const res = await apiFetch<{ status: string }>(`/marketplace/${productId}`, {
        method: 'PATCH',
        json: { action: 'toggle_status' },
      });
      setItems((prev) =>
        prev.map((item) => (item.id === productId ? { ...item, status: res.status } : item))
      );
      success(`Listing marked ${res.status}`);
    } catch (err) {
      error('Could not update status', err instanceof Error ? err.message : undefined);
    }
  }

  async function deleteProduct(productId: string) {
    if (!window.confirm('Delete this product listing permanently?')) return;
    try {
      await apiFetch(`/marketplace/${productId}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((item) => item.id !== productId));
      success('Listing deleted');
    } catch (err) {
      error('Delete failed', err instanceof Error ? err.message : undefined);
    }
  }

  return (
    <div className="space-y-6">
      <BusinessPortalHeader
        title="My Store Listings"
        subtitle="Create, edit, pause, or remove inventory published under your account."
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {[
            { key: 'all', label: `All (${items.length})` },
            { key: 'active', label: 'Active' },
            { key: 'inactive', label: 'Paused / Draft' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key as 'all' | 'active' | 'inactive')}
              className={`rounded-full px-3.5 py-1.5 text-cap-l font-semibold transition-colors cursor-pointer ${
                statusFilter === tab.key
                  ? 'bg-lab-pr text-bg-pr'
                  : 'bg-fill-qt text-lab-sc hover:text-lab-pr'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/marketplace">
            <Button variant="outline" size="sm">View Public Marketplace</Button>
          </Link>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setEditing(null);
              setCreateOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New Listing
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-lab-sc py-8 text-center">Loading inventory...</p>
      ) : items.filter((p) => statusFilter === 'all' ? true : statusFilter === 'active' ? p.status === 'active' : p.status !== 'active').length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No store listings yet"
          description="Create your first product listing to sell on Weto Marketplace."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items
            .filter((p) =>
              statusFilter === 'all' ? true : statusFilter === 'active' ? p.status === 'active' : p.status !== 'active'
            )
            .map((p) => (
            <div
              key={p.id}
              className="rounded-3xl border border-bord-card bg-bg-pr overflow-hidden flex flex-col"
            >
              <Link href={`/marketplace/product/${p.hashId || p.id}`} className="relative block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveMediaUrl(p.previewImageUrl) || '/assets/products/default-preview.png'}
                  alt={p.title}
                  loading="lazy"
                  decoding="async"
                  onLoad={(e) => {
                    e.currentTarget.dataset.fallbackApplied = '';
                  }}
                  onError={(e) => {
                    if (e.currentTarget.dataset.fallbackApplied !== '1') {
                      e.currentTarget.dataset.fallbackApplied = '1';
                      e.currentTarget.src = '/assets/products/default-preview.png';
                    }
                  }}
                  className="h-44 w-full object-cover bg-fill-qt"
                />
                {p.isPromoted ? (
                  <Badge variant="brand" className="absolute top-2.5 left-2.5 shadow-sm">
                    Promoted
                  </Badge>
                ) : null}
              </Link>
              <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/marketplace/product/${p.hashId || p.id}`}
                      className="font-bold text-lab-pr hover:underline line-clamp-1"
                    >
                      {p.title}
                    </Link>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge
                        variant={
                          p.approval === 'approved'
                            ? 'success'
                            : p.approval === 'rejected'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {p.approval}
                      </Badge>
                      <Badge variant={p.status === 'active' ? 'success' : 'outline'}>
                        {p.status}
                      </Badge>
                    </div>
                  </div>
                  <p className="font-bold text-brand-900">
                    {formatCurrency(p.salePrice, p.currency, bootstrap?.currencies, locale)}
                  </p>
                  {p.approval === 'pending' && (
                    <p className="text-cap-s text-amber-700 dark:text-amber-400">
                      Awaiting moderator approval before appearing in public marketplace search.
                    </p>
                  )}
                  {p.approval === 'rejected' && (
                    <p className="text-cap-s text-red-900">
                      Rejected by moderation. Edit product details or contact support.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-bord-tr">
                  <Button
                    size="sm"
                    variant={p.isPromoted ? 'secondary' : 'primary'}
                    onClick={() => setPromoting(p)}
                    title={p.isPromoted ? 'Extend promotion' : 'Promote listing'}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {p.isPromoted ? 'Boosted' : 'Promote'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setEditing({
                        id: p.id,
                        title: p.title,
                        description: p.description || '',
                        categoryId: p.category?._id || p.category?.id || '',
                        condition: p.condition || 'new',
                        type: p.type || 'physical',
                        currency: p.currency,
                        stockQuantity: p.stockQuantity ?? 1,
                        price: p.price,
                        discount: p.discount ?? 0,
                        address: p.address || '',
                      });
                      setCreateOpen(true);
                    }}
                  >
                    <Edit3 className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleStatus(p.id)}
                    title={p.status === 'active' ? 'Pause listing' : 'Activate listing'}
                  >
                    <Power className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => deleteProduct(p.id)}
                    title="Delete listing"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ProductCreateModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        categories={categories}
        editProduct={editing}
        onSaved={() => void loadInventory()}
      />

      <ProductPromoteModal
        open={Boolean(promoting)}
        onClose={() => setPromoting(null)}
        product={
          promoting
            ? {
              id: promoting.id,
              title: promoting.title,
              isPromoted: promoting.isPromoted,
              promotedUntil: promoting.promotedUntil,
            }
            : null
        }
        onPromoted={({ productId, isPromoted, promotedUntil }) =>
          setItems((prev) =>
            prev.map((item) =>
              item.id === productId
                ? { ...item, isPromoted, promotedUntil, status: 'active' }
                : item
            )
          )
        }
      />
    </div>
  );
}
