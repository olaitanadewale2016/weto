'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  Flag,
  MapPin,
  MessageCircle,
  Package,
  Power,
  Share2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MediaLightbox } from '@/components/ui/media-lightbox';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { ReportModal } from '@/components/modals/ReportModal';
import {
  MarketplaceCategoryOption,
  ProductCreateModal,
} from '@/components/marketplace/ProductCreateModal';
import { ProductPromoteModal } from '@/components/marketplace/ProductPromoteModal';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency } from '@/lib/currency';
import { formatRelativeTime } from '@/lib/i18n';
import { resolveMediaUrl } from '@/lib/media-url';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';

interface ProductDetail {
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
  status?: string;
  stockQuantity: number;
  address?: string;
  viewsCount: number;
  isPromoted?: boolean;
  promotedUntil?: string | null;
  createdAt?: string;
  isBookmarked: boolean;
  previewImageUrl: string;
  media: Array<{ id?: string; publicUrl?: string; url?: string; lqipBase64?: string | null }>;
  seller: {
    _id: string;
    username: string;
    firstName: string;
    lastName: string;
    avatar: string;
    verified?: boolean;
  };
  category?: { _id?: string; id?: string; localization?: { en?: string } };
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, bootstrap, locale } = useApp();
  const { error, success } = useToast();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [categories, setCategories] = useState<MarketplaceCategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePhoto, setActivePhoto] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  // PHP ChatLauncher state
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);

  const loadProduct = useCallback(async () => {
    setLoading(true);
    try {
      const [data, listData] = await Promise.all([
        apiFetch<ProductDetail>(`/marketplace/${params.id}`),
        apiFetch<{ categories: MarketplaceCategoryOption[] }>('/marketplace?limit=1').catch(() => ({
          categories: [],
        })),
      ]);
      setProduct(data);
      setCategories(listData.categories || []);
    } catch {
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadProduct();
    }, 0);
    return () => clearTimeout(id);
  }, [loadProduct]);

  function openChatLauncher() {
    if (!product) return;
    if (!user) {
      router.push('/auth/login');
      return;
    }
    setChatMessage(`Hi, I'm interested in "${product.title}". Is it still available?`);
    setChatModalOpen(true);
  }

  async function handleSendSellerMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !product) {
      router.push('/auth/login');
      return;
    }
    const text = chatMessage.trim();
    if (!text) return;

    setSendingChat(true);
    try {
      const chat = await apiFetch<{ id: string }>('/chats', {
        method: 'POST',
        json: { type: 'direct', targetUserId: product.seller._id },
      });

      const formattedSalePrice = formatCurrency(
        product.salePrice,
        product.currency,
        bootstrap?.currencies,
        locale
      );

      await apiFetch(`/chats/${chat.id}`, {
        method: 'POST',
        json: {
          type: 'text',
          content: text,
          contextRef: {
            kind: 'product',
            id: product.id,
            hashId: product.hashId,
            title: product.title,
            priceLabel: formattedSalePrice,
            imageUrl:
              product.media?.[0]?.publicUrl || product.media?.[0]?.url || product.previewImageUrl,
          },
        },
      });
      setChatModalOpen(false);
      router.push(`/messenger/c/${chat.id}`);
    } catch (err) {
      error('Could not message seller', err instanceof Error ? err.message : undefined);
    } finally {
      setSendingChat(false);
    }
  }

  async function toggleBookmark() {
    if (!user || !product) {
      router.push('/auth/login');
      return;
    }
    try {
      const res = await apiFetch<{ bookmarked: boolean }>(`/marketplace/${product.id}`, {
        method: 'PATCH',
        json: { action: 'bookmark' },
      });
      setProduct((p) => (p ? { ...p, isBookmarked: res.bookmarked } : p));
      success(res.bookmarked ? 'Saved to wishlist' : 'Removed from saved');
    } catch {
      // ignore
    }
  }

  async function toggleProductStatus() {
    if (!product) return;
    setTogglingStatus(true);
    try {
      const res = await apiFetch<{ status: string }>(`/marketplace/${product.id}`, {
        method: 'PATCH',
        json: { action: 'toggle_status' },
      });
      setProduct((prev) => (prev ? { ...prev, status: res.status } : prev));
      success(`Listing marked ${res.status}`);
    } catch (err) {
      error('Status update failed', err instanceof Error ? err.message : undefined);
    } finally {
      setTogglingStatus(false);
    }
  }

  async function deleteListing() {
    if (!product) return;
    if (!window.confirm('Delete this product listing permanently?')) return;
    try {
      await apiFetch(`/marketplace/${product.id}`, { method: 'DELETE' });
      success('Listing deleted');
      router.push('/marketplace');
    } catch (err) {
      error('Delete failed', err instanceof Error ? err.message : undefined);
    }
  }

  if (loading) {
    return (
      <AppShell fullWidth>
        <div className="p-8 text-center text-lab-sc">Loading product...</div>
      </AppShell>
    );
  }

  if (!product) {
    return (
      <AppShell fullWidth>
        <div className="p-10 text-center space-y-3">
          <p className="text-title-3 font-bold text-lab-pr">Product listing not found</p>
          <Link href="/marketplace">
            <Button variant="primary">Back to Marketplace</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const isOwner = user && String(product.seller._id) === user.id;
  const fallbackPreview =
    resolveMediaUrl(product.previewImageUrl) || '/assets/products/default-preview.png';
  const photos =
    product.media && product.media.length > 0
      ? product.media.map((m) => ({
          url: resolveMediaUrl(m.publicUrl || m.url) || fallbackPreview,
          lqipBase64: m.lqipBase64,
          alt: product.title,
        }))
      : [{ url: fallbackPreview, alt: product.title }];

  const safeActiveIndex = Math.min(activePhoto, photos.length - 1);
  const currentPhoto = photos[safeActiveIndex] || photos[0];
  const isLongDescription = (product.description || '').length > 260;

  return (
    <AppShell fullWidth>
      {/* PHP ProductHeader */}
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] md:top-0 z-20 bg-bg-pr/95 backdrop-blur-md border-b border-bord-tr px-4 h-14 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => router.back()}
            className="size-8 rounded-full hover:bg-fill-tr flex items-center justify-center text-lab-pr cursor-pointer shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-title-3 font-bold text-lab-pr truncate">Product details</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href);
              success('Product link copied');
            }}
            className="size-9 rounded-full hover:bg-fill-qt flex items-center justify-center text-lab-pr2 cursor-pointer"
            aria-label="Share product"
            title="Copy link"
          >
            <Share2 className="h-4 w-4" />
          </button>
          {!isOwner ? (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="size-9 rounded-full hover:bg-fill-qt flex items-center justify-center text-red-900 cursor-pointer"
              aria-label="Report listing"
              title="Report listing"
            >
              <Flag className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          {/* Left: Multi-slide Gallery + Click-to-Lightbox */}
          <div className="lg:col-span-7 space-y-3">
            <div className="relative aspect-square sm:aspect-[4/3] rounded-3xl border border-bord-card bg-fill-sc overflow-hidden group">
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="block w-full h-full cursor-zoom-in"
                aria-label="Open full-screen photo viewer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={currentPhoto.url}
                  src={currentPhoto.url}
                  alt={product.title}
                  decoding="async"
                  fetchPriority="high"
                  onLoad={(e) => {
                    e.currentTarget.dataset.fallbackApplied = '';
                  }}
                  onError={(e) => {
                    if (e.currentTarget.dataset.fallbackApplied !== '1') {
                      e.currentTarget.dataset.fallbackApplied = '1';
                      e.currentTarget.src = '/assets/products/default-preview.png';
                    }
                  }}
                  className="h-full w-full object-contain bg-fill-qt"
                />
              </button>

              {photos.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setActivePhoto((prev) => (prev > 0 ? prev - 1 : photos.length - 1))
                    }
                    className="absolute left-3 top-1/2 -translate-y-1/2 size-9 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center transition-colors cursor-pointer"
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setActivePhoto((prev) => (prev < photos.length - 1 ? prev + 1 : 0))
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 size-9 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center transition-colors cursor-pointer"
                    aria-label="Next photo"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                  <span className="absolute bottom-3 right-3 rounded-full bg-black/65 text-white px-2.5 py-0.5 text-cap-s font-semibold">
                    {safeActiveIndex + 1}/{photos.length}
                  </span>
                </>
              ) : null}
            </div>

            {photos.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {photos.map((photo, i) => (
                  <button
                    key={`${photo.url}-${i}`}
                    type="button"
                    onClick={() => setActivePhoto(i)}
                    className={cn(
                      'size-16 rounded-2xl overflow-hidden border-2 shrink-0 cursor-pointer transition-all',
                      safeActiveIndex === i
                        ? 'border-brand-900 opacity-100'
                        : 'border-transparent opacity-70 hover:opacity-100'
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt=""
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
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Right: PHP ProductOverviewCard */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-3xl border border-bord-card bg-bg-pr p-4 sm:p-5 space-y-4">
              {/* Seller bar + Bookmark toggle */}
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-bord-tr">
                <Link
                  href={`/@${product.seller.username}`}
                  className="flex items-center gap-2.5 min-w-0"
                >
                  <Avatar
                    src={product.seller.avatar}
                    alt={product.seller.username}
                    verified={product.seller.verified}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="text-par-s font-bold text-lab-pr truncate">
                      {product.seller.firstName} {product.seller.lastName}
                    </p>
                    <p className="text-cap-s text-lab-sc truncate">@{product.seller.username}</p>
                  </div>
                </Link>

                <button
                  type="button"
                  onClick={toggleBookmark}
                  className={cn(
                    'size-9 rounded-full border border-bord-pr flex items-center justify-center transition-colors cursor-pointer shrink-0',
                    product.isBookmarked
                      ? 'bg-fill-qt text-lab-pr'
                      : 'text-lab-sc hover:bg-fill-qt hover:text-lab-pr'
                  )}
                  aria-label={product.isBookmarked ? 'Remove bookmark' : 'Bookmark listing'}
                >
                  <Bookmark className={cn('h-4 w-4', product.isBookmarked && 'fill-current')} />
                </button>
              </div>

              {/* Badges + Title + Price */}
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {product.isPromoted ? <Badge variant="brand">Promoted</Badge> : null}
                  {product.status === 'inactive' ? <Badge variant="danger">Inactive</Badge> : null}
                  {product.category?.localization?.en ? (
                    <Badge variant="brand">{product.category.localization.en}</Badge>
                  ) : null}
                  <Badge className="capitalize">{product.condition}</Badge>
                  <Badge variant="outline" className="capitalize">
                    {product.type}
                  </Badge>
                </div>

                <h1 className="text-title-2 font-bold text-lab-pr leading-snug">{product.title}</h1>

                <div className="flex items-baseline gap-2.5 flex-wrap pt-1">
                  <span className="text-title-1 font-bold text-lab-pr">
                    {formatCurrency(product.salePrice, product.currency, bootstrap?.currencies, locale)}
                  </span>
                  {product.discount > 0 ? (
                    <>
                      <span className="text-par-n text-lab-tr line-through">
                        {formatCurrency(product.price, product.currency, bootstrap?.currencies, locale)}
                      </span>
                      <Badge variant="danger">-{product.discount}% OFF</Badge>
                    </>
                  ) : null}
                </div>
              </div>

              {/* Metadata */}
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-cap-l text-lab-sc pt-1">
                <span className="inline-flex items-center gap-1">
                  <Package className="size-3.5" />
                  {product.stockQuantity > 0 ? `${product.stockQuantity} in stock` : 'Out of stock'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Eye className="size-3.5" /> {product.viewsCount || 0} views
                </span>
                {product.address ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" /> {product.address}
                  </span>
                ) : null}
                {product.createdAt ? (
                  <span>Listed {formatRelativeTime(product.createdAt, locale)}</span>
                ) : null}
              </div>

              {/* Ask Seller CTA or Owner Controls */}
              <div className="pt-2 space-y-2.5">
                {!isOwner ? (
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full rounded-full"
                    onClick={openChatLauncher}
                  >
                    <MessageCircle className="h-4 w-4" /> Ask seller
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Button
                      variant="primary"
                      size="md"
                      className="w-full rounded-full"
                      onClick={() => setPromoteOpen(true)}
                    >
                      <Sparkles className="h-4 w-4" />
                      {product.isPromoted ? 'Extend listing promotion' : 'Promote listing'}
                    </Button>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                        <Edit3 className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        loading={togglingStatus}
                        onClick={toggleProductStatus}
                      >
                        <Power className="h-3.5 w-3.5" />{' '}
                        {product.status === 'active' ? 'Pause' : 'Activate'}
                      </Button>
                      <Button variant="danger" size="sm" onClick={deleteListing}>
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* PHP ProductDescriptionCard */}
            <div className="rounded-3xl border border-bord-card bg-bg-pr p-4 sm:p-5 space-y-3">
              <h2 className="text-par-l font-bold text-lab-pr">Product Description</h2>

              <div className="grid grid-cols-2 gap-2.5 text-cap-l bg-fill-qt/60 rounded-2xl p-3">
                <div>
                  <p className="text-lab-sc">Condition</p>
                  <p className="font-semibold text-lab-pr capitalize">{product.condition}</p>
                </div>
                <div>
                  <p className="text-lab-sc">Product Type</p>
                  <p className="font-semibold text-lab-pr capitalize">{product.type}</p>
                </div>
                <div>
                  <p className="text-lab-sc">Stock Quantity</p>
                  <p className="font-semibold text-lab-pr">{product.stockQuantity}</p>
                </div>
                <div>
                  <p className="text-lab-sc">Currency</p>
                  <p className="font-semibold text-lab-pr">{product.currency}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <p
                  className={cn(
                    'text-par-n text-lab-pr whitespace-pre-wrap leading-relaxed',
                    !descExpanded && isLongDescription && 'line-clamp-4'
                  )}
                >
                  {product.description || 'No additional description provided.'}
                </p>
                {isLongDescription ? (
                  <button
                    type="button"
                    onClick={() => setDescExpanded((v) => !v)}
                    className="text-cap-l font-semibold text-brand-900 hover:underline cursor-pointer"
                  >
                    {descExpanded ? 'See less' : 'See full description'}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PHP ChatLauncher Modal */}
      <Modal
        open={chatModalOpen}
        onClose={() => setChatModalOpen(false)}
        title="Ask seller"
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleSendSellerMessage} className="space-y-4 min-w-0">
          <div className="flex items-center gap-3 rounded-2xl border border-bord-card bg-fill-qt/50 p-3 min-w-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentPhoto.url}
              alt={product.title}
              onLoad={(e) => {
                e.currentTarget.dataset.fallbackApplied = '';
              }}
              onError={(e) => {
                if (e.currentTarget.dataset.fallbackApplied !== '1') {
                  e.currentTarget.dataset.fallbackApplied = '1';
                  e.currentTarget.src = '/assets/products/default-preview.png';
                }
              }}
              className="size-14 rounded-xl object-cover shrink-0 bg-fill-tr"
            />
            <div className="min-w-0 flex-1">
              <p className="text-par-s font-bold text-lab-pr truncate">{product.title}</p>
              <p className="text-cap-l font-bold text-brand-900">
                {formatCurrency(product.salePrice, product.currency, bootstrap?.currencies, locale)}
              </p>
              <p className="text-cap-s text-lab-sc truncate">
                Seller: {product.seller.firstName} {product.seller.lastName}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Textarea
              label="Your message"
              rows={4}
              maxLength={500}
              placeholder="Ask about availability, delivery, or condition..."
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              required
            />
            <div className="flex justify-end text-cap-s text-lab-sc">
              {chatMessage.length}/500
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setChatModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={sendingChat}>
              Send message
            </Button>
          </div>
        </form>
      </Modal>

      <MediaLightbox
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        images={photos}
        initialIndex={safeActiveIndex}
        albumName={product.title}
      />

      <ProductCreateModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        categories={categories}
        editProduct={{
          id: product.id,
          title: product.title,
          description: product.description,
          categoryId: product.category?._id || product.category?.id || '',
          condition: product.condition,
          type: product.type,
          currency: product.currency,
          stockQuantity: product.stockQuantity,
          price: product.price,
          discount: product.discount,
          address: product.address || '',
          existingMedia: product.media || [],
        }}
        onSaved={() => void loadProduct()}
      />

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="product"
        targetId={product.id}
      />

      <ProductPromoteModal
        open={promoteOpen}
        onClose={() => setPromoteOpen(false)}
        product={{
          id: product.id,
          title: product.title,
          isPromoted: product.isPromoted,
          promotedUntil: product.promotedUntil,
        }}
        onPromoted={({ isPromoted, promotedUntil }) =>
          setProduct((prev) => (prev ? { ...prev, isPromoted, promotedUntil } : prev))
        }
      />
    </AppShell>
  );
}
