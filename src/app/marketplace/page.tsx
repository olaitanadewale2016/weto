'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bookmark, Plus, Search, ShoppingBag } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { apiFetch, uploadFileToR2 } from '@/lib/api-client';
import { formatCurrency } from '@/lib/currency';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';

interface CategoryOption {
  id: string;
  name: string;
}

interface ProductItem {
  id: string;
  hashId: string;
  title: string;
  description: string;
  price: number;
  salePrice: number;
  discount: number;
  currency: string;
  condition: string;
  type: string;
  address?: string;
  isPromoted?: boolean;
  isBookmarked?: boolean;
  previewImageUrl: string;
  seller?: { username: string; firstName: string; lastName: string };
}

export default function MarketplacePage() {
  const { user, bootstrap, locale } = useApp();
  const { error, success } = useToast();

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [condition, setCondition] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  // Create Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('49.99');
  const [discount, setDiscount] = useState('0');
  const [currency, setCurrency] = useState('');
  const selectedCurrency = currency || bootstrap?.config?.defaultCurrency || 'NGN';
  const [newCategoryId, setNewCategoryId] = useState('');
  const [newCondition, setNewCondition] = useState('new');
  const [newType, setNewType] = useState('physical');
  const [address, setAddress] = useState('');
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set('q', q.trim());
      if (categoryId) qs.set('categoryId', categoryId);
      if (condition) qs.set('condition', condition);
      const res = await apiFetch<{ products: ProductItem[]; categories: CategoryOption[] }>(
        `/marketplace?${qs.toString()}`
      );
      setProducts(res.products || []);
      setCategories(res.categories || []);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [q, categoryId, condition]);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadProducts();
    }, 0);
    return () => clearTimeout(id);
  }, [loadProducts]);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 6)) {
        const res = await uploadFileToR2(file, 'marketplace', 'product');
        setMediaIds((prev) => [...prev, res.mediaId]);
      }
      success('Product images uploaded');
    } catch (err) {
      error('Upload failed', err instanceof Error ? err.message : undefined);
    } finally {
      setUploading(false);
    }
  }

  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch('/marketplace', {
        method: 'POST',
        json: {
          title: title.trim(),
          description: description.trim(),
          categoryId: newCategoryId || undefined,
          condition: newCondition,
          type: newType,
          currency: selectedCurrency,
          price: Number(price) || 0,
          discount: Number(discount) || 0,
          address: address.trim() || undefined,
          mediaIds,
          publishNow: true,
        },
      });
      success('Product listing published!');
      setCreateOpen(false);
      setTitle('');
      setDescription('');
      setMediaIds([]);
      loadProducts();
    } catch (err) {
      error('Failed to publish listing', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  }

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

  return (
    <AppShell>
      <div className="sticky top-14 md:top-0 z-20 bg-bg-pr/95 backdrop-blur-xs border-b border-bord-tr px-4 py-3.5 flex items-center justify-between gap-2">
        <h1 className="text-title-3 font-bold text-lab-pr">Marketplace</h1>
        {user && (
          <div className="flex items-center gap-2">
            <Link href="/saved/products">
              <Button variant="outline" size="sm">
                <Bookmark className="h-4 w-4" /> Saved
              </Button>
            </Link>
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Sell
            </Button>
          </div>
        )}
      </div>

      {/* Sticky Search & Filters matching PHP MarketplaceIndex */}
      <div className="p-4 border-b border-bord-tr space-y-3">
        <div className="relative rounded-full border border-bord-card/80 bg-bg-pr focus-within:border-bord-pr transition-colors">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-lab-sc" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products or locations..."
            className="w-full h-11 rounded-full bg-transparent pl-10 pr-4 text-par-n text-lab-pr2 placeholder:text-lab-tr outline-hidden"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Select value={condition} onChange={(e) => setCondition(e.target.value)}>
            <option value="">Any Condition</option>
            <option value="new">New</option>
            <option value="used">Used</option>
            <option value="refurbished">Refurbished</option>
          </Select>
        </div>
      </div>

      {/* Product Grid matching PHP ProductCard.vue */}
      <div className="p-4">
        {loading ? (
          <p className="text-center text-lab-sc py-12">Loading marketplace listings...</p>
        ) : products.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="No listings found"
            description="Try adjusting your search or be the first to list a product."
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {products.map((p) => (
              <div key={p.id} className="group flex flex-col">
                <Link
                  href={`/marketplace/product/${p.hashId || p.id}`}
                  className="relative aspect-square rounded-lg overflow-hidden mb-2 bg-fill-tr block"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.previewImageUrl}
                    alt={p.title}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/assets/products/default-preview.png';
                    }}
                  />
                  {p.isPromoted && (
                    <Badge variant="brand" className="absolute top-2 left-2">
                      Promoted
                    </Badge>
                  )}
                  {p.discount > 0 && (
                    <Badge variant="danger" className="absolute top-2 right-2">
                      -{p.discount}%
                    </Badge>
                  )}
                </Link>
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-start justify-between gap-1 mb-0.5">
                    <Link href={`/marketplace/product/${p.hashId || p.id}`} className="min-w-0 flex-1">
                      <h3 className="text-par-s line-clamp-2 text-lab-pr hover:underline">
                        {p.title}
                      </h3>
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggleBookmark(p.id)}
                      className={
                        p.isBookmarked
                          ? 'text-lab-pr shrink-0 cursor-pointer'
                          : 'text-lab-tr hover:text-lab-pr shrink-0 cursor-pointer'
                      }
                      aria-label="Save product"
                    >
                      <Bookmark className={`h-3.5 w-3.5 ${p.isBookmarked ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lab-pr2 text-par-n font-semibold">
                      {formatCurrency(p.salePrice, p.currency, bootstrap?.currencies, locale)}
                    </span>
                    {p.discount > 0 && (
                      <span className="text-lab-sc text-par-s line-through">
                        {formatCurrency(p.price, p.currency, bootstrap?.currencies, locale)}
                      </span>
                    )}
                  </div>
                  <p className="text-par-s text-lab-sc truncate mt-0.5">
                    {p.address || p.condition}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Product Listing">
        <form onSubmit={handleCreateProduct} className="space-y-4">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <Textarea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
          <div className="grid grid-cols-3 gap-2">
            <Input
              label="Price"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
            <Input
              label="Discount %"
              type="number"
              min="0"
              max="99"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
            <Select label="Currency" value={selectedCurrency} onChange={(e) => setCurrency(e.target.value)}>
              {(bootstrap?.currencies?.length
                ? bootstrap.currencies
                : [{ code: bootstrap?.config?.defaultCurrency || 'NGN', name: bootstrap?.config?.defaultCurrency || 'NGN', symbol: '₦' }]
              ).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} ({c.symbol})
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Category" value={newCategoryId} onChange={(e) => setNewCategoryId(e.target.value)}>
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Select label="Condition" value={newCondition} onChange={(e) => setNewCondition(e.target.value)}>
              <option value="new">New</option>
              <option value="used">Used</option>
              <option value="refurbished">Refurbished</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Listing Type" value={newType} onChange={(e) => setNewType(e.target.value)}>
              <option value="physical">Physical Product</option>
              <option value="digital">Digital Download</option>
            </Select>
            <Input label="Location / City" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className="block text-cap-l font-semibold text-lab-pr">Product Photos</label>
            <input type="file" multiple accept="image/*" onChange={handleImageUpload} className="text-cap-l" />
            {uploading && <p className="text-cap-s text-brand-900">Uploading images to Cloudflare R2...</p>}
            {mediaIds.length > 0 && (
              <p className="text-cap-s text-green-900">{mediaIds.length} image(s) attached.</p>
            )}
          </div>

          <Button type="submit" variant="primary" className="w-full" loading={submitting || uploading}>
            Publish Listing
          </Button>
        </form>
      </Modal>
    </AppShell>
  );
}
