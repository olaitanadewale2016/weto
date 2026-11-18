'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  X,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { MarketplaceAdCard } from '@/components/ads/FeedAdCard';
import { computeFeedAdSlotIndices } from '@/lib/ads-client';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import {
  ProductCard,
  MarketplaceProductItem,
} from '@/components/marketplace/ProductCard';
import {
  MarketplaceCategoryOption,
  ProductCreateModal,
} from '@/components/marketplace/ProductCreateModal';
import { apiFetch } from '@/lib/api-client';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';

interface FilterDraft {
  categories: string[];
  priceFrom: string;
  priceTo: string;
  currencies: string[];
  conditions: string[];
  types: string[];
  withDiscount: boolean;
}

const EMPTY_FILTERS: FilterDraft = {
  categories: [],
  priceFrom: '',
  priceTo: '',
  currencies: [],
  conditions: [],
  types: [],
  withDiscount: false,
};

function countActiveFilters(f: FilterDraft): number {
  let count = 0;
  if (f.categories.length > 0) count++;
  if (f.priceFrom.trim() || f.priceTo.trim()) count++;
  if (f.currencies.length > 0) count++;
  if (f.conditions.length > 0) count++;
  if (f.types.length > 0) count++;
  if (f.withDiscount) count++;
  return count;
}

function toggleArrayItem(arr: string[], item: string): string[] {
  return arr.includes(item) ? arr.filter((v) => v !== item) : [...arr, item];
}

export default function MarketplacePage() {
  const router = useRouter();
  const { user, bootstrap } = useApp();
  const { error } = useToast();

  const [products, setProducts] = useState<MarketplaceProductItem[]>([]);
  const [categories, setCategories] = useState<MarketplaceCategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<FilterDraft>(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState<FilterDraft>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [marketAdSeed] = useState(() => Math.floor(Math.random() * 1000) + 1);

  const marketAdSlots = computeFeedAdSlotIndices(products.length, 'explore', marketAdSeed);

  const loadProducts = useCallback(async () => {
    setProducts((prev) => {
      if (prev.length === 0) setLoading(true);
      return prev;
    });
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set('q', q.trim());
      if (appliedFilters.categories.length > 0) {
        qs.set('categories', appliedFilters.categories.join(','));
      }
      if (appliedFilters.conditions.length > 0) {
        qs.set('conditions', appliedFilters.conditions.join(','));
      }
      if (appliedFilters.types.length > 0) {
        qs.set('types', appliedFilters.types.join(','));
      }
      if (appliedFilters.currencies.length > 0) {
        qs.set('currencies', appliedFilters.currencies.join(','));
      }
      if (appliedFilters.priceFrom.trim()) qs.set('priceFrom', appliedFilters.priceFrom.trim());
      if (appliedFilters.priceTo.trim()) qs.set('priceTo', appliedFilters.priceTo.trim());
      if (appliedFilters.withDiscount) qs.set('withDiscount', 'true');

      const res = await apiFetch<{
        products: MarketplaceProductItem[];
        categories: MarketplaceCategoryOption[];
      }>(`/marketplace?${qs.toString()}`);

      setProducts(res.products || []);
      setCategories(res.categories || []);
    } catch {
      setProducts((prev) => (prev.length > 0 ? prev : []));
    } finally {
      setLoading(false);
    }
  }, [q, appliedFilters]);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadProducts();
    }, 0);
    return () => clearTimeout(id);
  }, [loadProducts]);

  async function toggleBookmark(productId: string) {
    if (!user) {
      error('Sign in to save items');
      return;
    }
    try {
      const res = await apiFetch<{ bookmarked: boolean }>(`/marketplace/${productId}`, {
        method: 'PATCH',
        json: { action: 'bookmark' },
      });
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, isBookmarked: res.bookmarked } : p))
      );
    } catch {
      // ignore
    }
  }

  const activeFilterCount = countActiveFilters(appliedFilters);
  const availableCurrencies = bootstrap?.currencies?.length
    ? bootstrap.currencies
    : [
      {
        code: bootstrap?.config?.defaultCurrency || 'NGN',
        name: bootstrap?.config?.defaultCurrency || 'NGN',
        symbol: '₦',
      },
    ];

  return (
    <AppShell hideMobileHeader>
      {/* PHP CatalogHeader */}
      <div className="sticky top-0 z-20 pt-safe px-safe bg-bg-pr/95 backdrop-blur-md border-b border-bord-tr px-4 h-14 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => router.back()}
            className="size-8 rounded-full hover:bg-fill-tr flex items-center justify-center text-lab-pr cursor-pointer shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-title-3 font-bold text-lab-pr truncate">Marketplace</h1>
        </div>

        <div className="flex items-center gap-2 relative">
          {user ? (
            <>
              <Link
                href="/saved/products"
                className="size-9 rounded-full border border-bord-pr hover:bg-fill-qt flex items-center justify-center text-lab-pr2 transition-colors"
                aria-label="Saved products"
                title="Saved products"
              >
                <Bookmark className="h-4 w-4" />
              </Link>

              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="size-9 rounded-full bg-brand-900 text-white hover:opacity-90 flex items-center justify-center transition-opacity cursor-pointer"
                aria-label="Marketplace menu"
                title="Create listing or manage store"
              >
                <Plus className="h-4 w-4" />
              </button>

              {menuOpen ? (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setMenuOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="absolute right-0 top-11 z-30 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-bord-pr bg-bg-pr/95 backdrop-blur-md shadow-2xl divide-y divide-bord-pr overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setCreateOpen(true);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-fill-qt cursor-pointer transition-colors"
                    >
                      <span className="size-9 rounded-full bg-fill-qt flex items-center justify-center shrink-0 text-lab-pr">
                        <ShoppingBag className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-par-n font-semibold text-lab-pr">Create Listing</p>
                        <p className="text-cap-s text-lab-sc truncate">
                          Publish a new product with photos
                        </p>
                      </div>
                      <ArrowUpRight className="size-4 text-lab-tr shrink-0" />
                    </button>
                    <Link
                      href="/business/market"
                      onClick={() => setMenuOpen(false)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-fill-qt transition-colors"
                    >
                      <span className="size-9 rounded-full bg-fill-qt flex items-center justify-center shrink-0 text-lab-pr">
                        <Store className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-par-n font-semibold text-lab-pr">Business Store</p>
                        <p className="text-cap-s text-lab-sc truncate">
                          Manage store inventory & promotions
                        </p>
                      </div>
                      <ArrowUpRight className="size-4 text-lab-tr shrink-0" />
                    </Link>
                    <Link
                      href="/saved/products"
                      onClick={() => setMenuOpen(false)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-fill-qt transition-colors"
                    >
                      <span className="size-9 rounded-full bg-fill-qt flex items-center justify-center shrink-0 text-lab-pr">
                        <Bookmark className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-par-n font-semibold text-lab-pr">Saved Products</p>
                        <p className="text-cap-s text-lab-sc truncate">
                          View your bookmarked marketplace items
                        </p>
                      </div>
                      <ArrowUpRight className="size-4 text-lab-tr shrink-0" />
                    </Link>
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <Link href="/auth/login">
              <Button variant="primary" size="sm">
                Sign in to Sell
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* PHP Sticky Search + Filter Header (MarketplaceIndex.vue) */}
      <div className="p-4 border-b border-bord-tr space-y-3 bg-bg-pr">
        <div className="relative rounded-full border border-bord-card/90 bg-bg-pr focus-within:border-bord-pr transition-colors">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-lab-sc" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products, categories, or locations..."
            className="w-full h-11 rounded-full bg-transparent pl-10 pr-10 text-par-n text-lab-pr placeholder:text-lab-tr outline-hidden"
          />
          {q ? (
            <button
              type="button"
              onClick={() => setQ('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 size-6 rounded-full hover:bg-fill-qt flex items-center justify-center text-lab-sc cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2">
          <h2 className="text-par-l font-bold text-lab-pr">For you</h2>

          <div className="flex items-center gap-2">
            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setAppliedFilters(EMPTY_FILTERS);
                  setDraftFilters(EMPTY_FILTERS);
                }}
                className="text-cap-l font-semibold text-red-900 hover:underline cursor-pointer px-2"
              >
                Reset filters
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => {
                setDraftFilters(appliedFilters);
                setFilterOpen(true);
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-cap-l font-semibold transition-colors cursor-pointer',
                activeFilterCount > 0
                  ? 'border-brand-900 bg-brand-900/10 text-brand-900'
                  : 'border-bord-pr bg-bg-pr text-lab-pr2 hover:bg-fill-qt'
              )}
            >
              <SlidersHorizontal className="size-3.5" />
              <span>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Product Grid */}
      <div className="p-4">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="space-y-2 animate-pulse">
                <div className="aspect-square rounded-xl bg-fill-qt" />
                <div className="h-3.5 w-3/4 rounded bg-fill-qt" />
                <div className="h-3.5 w-1/2 rounded bg-fill-qt" />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="No listings found"
            description="Try adjusting your search or filters, or publish the first item."
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {products.map((p, idx) => (
              <React.Fragment key={p.id}>
                <ProductCard product={p} onToggleBookmark={toggleBookmark} />
                {marketAdSlots.has(idx) && <MarketplaceAdCard slotIndex={400 + idx} />}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* PHP ProductsFilter Modal */}
      <Modal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter Marketplace"
        maxWidthClass="max-w-lg"
      >
        <div className="space-y-5">
          {categories.length > 0 ? (
            <div className="space-y-2">
              <p className="text-cap-l font-semibold text-lab-pr">Categories</p>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => {
                  const selected = draftFilters.categories.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() =>
                        setDraftFilters((prev) => ({
                          ...prev,
                          categories: toggleArrayItem(prev.categories, cat.id),
                        }))
                      }
                      className={cn(
                        'rounded-full px-3 py-1.5 text-cap-s font-medium border transition-colors cursor-pointer',
                        selected
                          ? 'border-brand-900 bg-brand-900 text-white'
                          : 'border-bord-pr bg-fill-qt/50 text-lab-pr2 hover:bg-fill-qt'
                      )}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-cap-l font-semibold text-lab-pr">Price Range</p>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Price From"
                type="number"
                min="0"
                placeholder="0"
                value={draftFilters.priceFrom}
                onChange={(e) =>
                  setDraftFilters((prev) => ({ ...prev, priceFrom: e.target.value }))
                }
              />
              <Input
                label="Price To"
                type="number"
                min="0"
                placeholder="Any"
                value={draftFilters.priceTo}
                onChange={(e) =>
                  setDraftFilters((prev) => ({ ...prev, priceTo: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-cap-l font-semibold text-lab-pr">Currency</p>
            <div className="flex flex-wrap gap-2">
              {availableCurrencies.map((c) => {
                const selected = draftFilters.currencies.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() =>
                      setDraftFilters((prev) => ({
                        ...prev,
                        currencies: toggleArrayItem(prev.currencies, c.code),
                      }))
                    }
                    className={cn(
                      'rounded-full px-3 py-1.5 text-cap-s font-medium border transition-colors cursor-pointer',
                      selected
                        ? 'border-brand-900 bg-brand-900 text-white'
                        : 'border-bord-pr bg-fill-qt/50 text-lab-pr2 hover:bg-fill-qt'
                    )}
                  >
                    {c.code} ({c.symbol})
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-cap-l font-semibold text-lab-pr">Condition</p>
              <div className="space-y-1.5">
                {[
                  { value: 'new', label: 'New' },
                  { value: 'used', label: 'Used' },
                  { value: 'refurbished', label: 'Refurbished' },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 text-par-s text-lab-pr2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={draftFilters.conditions.includes(opt.value)}
                      onChange={() =>
                        setDraftFilters((prev) => ({
                          ...prev,
                          conditions: toggleArrayItem(prev.conditions, opt.value),
                        }))
                      }
                      className="rounded border-bord-pr"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-cap-l font-semibold text-lab-pr">Listing Type</p>
              <div className="space-y-1.5">
                {[
                  { value: 'physical', label: 'Physical Product' },
                  { value: 'digital', label: 'Digital Product' },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 text-par-s text-lab-pr2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={draftFilters.types.includes(opt.value)}
                      onChange={() =>
                        setDraftFilters((prev) => ({
                          ...prev,
                          types: toggleArrayItem(prev.types, opt.value),
                        }))
                      }
                      className="rounded border-bord-pr"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <label className="flex items-center justify-between rounded-2xl border border-bord-card px-3.5 py-2.5 cursor-pointer hover:bg-fill-qt/40">
            <div>
              <p className="text-par-s font-semibold text-lab-pr">With Discount Only</p>
              <p className="text-cap-s text-lab-sc">Show only discounted listings</p>
            </div>
            <input
              type="checkbox"
              checked={draftFilters.withDiscount}
              onChange={(e) =>
                setDraftFilters((prev) => ({ ...prev, withDiscount: e.target.checked }))
              }
              className="size-4 accent-brand-900"
            />
          </label>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-bord-tr">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraftFilters(EMPTY_FILTERS);
                setAppliedFilters(EMPTY_FILTERS);
                setFilterOpen(false);
              }}
            >
              Reset all
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                setAppliedFilters(draftFilters);
                setFilterOpen(false);
              }}
            >
              Apply Filters
            </Button>
          </div>
        </div>
      </Modal>

      <ProductCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        categories={categories}
        onSaved={() => void loadProducts()}
      />
    </AppShell>
  );
}
