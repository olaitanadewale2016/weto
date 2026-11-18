'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Bookmark,
  Edit3,
  Eye,
  Flag,
  MessageCircle,
  Power,
  Share2,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { FeedAdCard } from '@/components/ads/FeedAdCard';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MediaLightbox } from '@/components/ui/media-lightbox';
import { Modal } from '@/components/ui/modal';
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
      <AppShell hideMobileHeader>
        <div className="p-8 text-center text-lab-sc">Loading product...</div>
      </AppShell>
    );
  }

  if (!product) {
    return (
      <AppShell hideMobileHeader>
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
    <AppShell hideMobileHeader>
      {/* PHP ProductHeader */}
      <div className="sticky top-0 z-20 pt-safe px-safe bg-bg-pr/95 backdrop-blur-md border-b border-bord-pr px-4 h-14 flex items-center justify-between gap-2">
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

      {/* PHP ProductOverviewCard.vue: edge-to-edge swipe gallery + p-4 overview + divider + ProductDescriptionCard */}
      <div>
        <div className="border-b border-bord-pr bg-fill-tr relative group">
          <div className="flex gap-px overflow-x-auto snap-x snap-mandatory hidden-scroll">
            {photos.map((photo, idx) => (
              <button
                key={`${photo.url}-${idx}`}
                type="button"
                onClick={() => {
                  setActivePhoto(idx);
                  setLightboxOpen(true);
                }}
                className={cn(
                  'relative shrink-0 snap-start overflow-hidden cursor-zoom-in bg-fill-qt',
                  photos.length === 1
                    ? 'w-full aspect-[4/3]'
                    : photos.length === 2
                      ? 'w-1/2 aspect-square'
                      : 'w-[42%] sm:w-[41%] aspect-square'
                )}
                aria-label={`View photo ${idx + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={photo.alt}
                  loading={idx === 0 ? 'eager' : 'lazy'}
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
                  className="h-full w-full object-cover hover:scale-105 transition-transform duration-200"
                />
              </button>
            ))}
          </div>
          {photos.length > 1 && (
            <span className="absolute bottom-2.5 right-2.5 rounded-full bg-black/65 text-white px-2.5 py-0.5 text-cap-s font-semibold pointer-events-none">
              {photos.length} photos
            </span>
          )}
        </div>

        <div className="p-4 border-b border-bord-pr space-y-3">
          {/* Seller Row + Bookmark */}
          <div className="flex justify-between items-center gap-3">
            <Link href={`/@${product.seller.username}`} className="flex items-center gap-2.5 min-w-0">
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
                'size-9 rounded-full hover:bg-fill-qt flex items-center justify-center transition-colors cursor-pointer shrink-0',
                product.isBookmarked ? 'text-brand-900' : 'text-lab-pr2 hover:text-brand-900'
              )}
              aria-label={product.isBookmarked ? 'Remove bookmark' : 'Bookmark listing'}
            >
              <Bookmark className={cn('h-5 w-5', product.isBookmarked && 'fill-current')} />
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              {product.isPromoted ? <Badge variant="brand">Promoted</Badge> : null}
              {product.status === 'inactive' ? <Badge variant="danger">Inactive</Badge> : null}
              {product.discount > 0 ? <Badge variant="danger">-{product.discount}%</Badge> : null}
            </div>
            <h1 className="text-title-3 text-lab-pr2 leading-snug font-medium max-w-11/12">
              {product.title}
            </h1>
            <div className="flex gap-2 items-center flex-wrap">
              <span className="text-title-3 text-lab-pr font-bold">
                {formatCurrency(product.salePrice, product.currency, bootstrap?.currencies, locale)}
              </span>
              {product.discount > 0 ? (
                <span className="text-cap-l text-lab-sc line-through">
                  {formatCurrency(product.price, product.currency, bootstrap?.currencies, locale)}
                </span>
              ) : null}
            </div>
            <p className="text-par-n text-lab-sc">
              {[
                product.category?.localization?.en || 'Marketplace',
                product.stockQuantity > 0 ? `${product.stockQuantity} in stock` : 'Out of stock',
                product.createdAt ? formatRelativeTime(product.createdAt, locale) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>

          {/* Primary Actions Row matching PHP ProductOverviewCard */}
          {!isOwner ? (
            <div className="flex items-center gap-3 pt-1 leading-none flex-wrap">
              <Button
                variant="primary"
                size="md"
                className="rounded-full"
                onClick={openChatLauncher}
              >
                <MessageCircle className="h-4 w-4" /> Ask seller
              </Button>
              <Link href={`/@${product.seller.username}`}>
                <Button variant="outline" size="md" className="rounded-full">
                  View profile
                </Button>
              </Link>
              <div className="ml-auto inline-flex items-center gap-1.5 text-cap-l text-lab-sc shrink-0">
                <Eye className="size-4" />
                <span>{product.viewsCount || 0}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="primary"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setPromoteOpen(true)}
                >
                  <TrendingUp className="h-4 w-4" />
                  {product.isPromoted ? 'Extend promotion' : 'Promote listing'}
                </Button>
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => setEditOpen(true)}>
                  <Edit3 className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  loading={togglingStatus}
                  onClick={toggleProductStatus}
                >
                  <Power className="h-3.5 w-3.5" />
                  {product.status === 'active' ? 'Pause' : 'Activate'}
                </Button>
                <Button variant="danger" size="sm" className="rounded-full" onClick={deleteListing}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
                <div className="ml-auto inline-flex items-center gap-1.5 text-cap-l text-lab-sc shrink-0">
                  <Eye className="size-4" />
                  <span>{product.viewsCount || 0}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* PHP ProductDescriptionCard */}
        <div className="p-4 space-y-3">
          <h2 className="text-par-l font-bold text-lab-pr">Product Description</h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-cap-l bg-fill-qt/60 rounded-2xl p-3">
            <div>
              <p className="text-lab-sc">Condition</p>
              <p className="font-semibold text-lab-pr capitalize">{product.condition}</p>
            </div>
            <div>
              <p className="text-lab-sc">Product Type</p>
              <p className="font-semibold text-lab-pr capitalize">{product.type}</p>
            </div>
            <div>
              <p className="text-lab-sc">Stock</p>
              <p className="font-semibold text-lab-pr">{product.stockQuantity}</p>
            </div>
            <div>
              <p className="text-lab-sc">Location</p>
              <p className="font-semibold text-lab-pr truncate">{product.address || 'Available'}</p>
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

        <div className="lg:hidden border-t border-bord-pr">
          <FeedAdCard slotIndex={701} />
        </div>
      </div>

      {/* PHP ChatLauncher Modal ("Write message") */}
      <Modal
        open={chatModalOpen}
        onClose={() => setChatModalOpen(false)}
        title="Write message"
        maxWidthClass="max-w-md"
        bodyClassName="p-0"
      >
        <form onSubmit={handleSendSellerMessage} className="min-w-0">
          <div className="p-5 flex items-center gap-3 border-b border-bord-pr bg-fill-qt/30">
            <Avatar
              src={product.seller.avatar}
              alt={product.seller.username}
              verified={product.seller.verified}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <p className="text-par-n font-bold text-lab-pr truncate">
                {product.seller.firstName} {product.seller.lastName}
              </p>
              <p className="text-cap-l text-lab-sc truncate">@{product.seller.username}</p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentPhoto.url}
              alt={product.title}
              className="size-11 rounded-lg object-cover shrink-0 bg-fill-tr border border-bord-card"
            />
          </div>

          <div className="relative border-b border-bord-pr">
            <textarea
              rows={4}
              maxLength={500}
              placeholder="Ask about availability, delivery, or condition..."
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              className="resize-none w-full px-4 pt-3.5 pb-8 bg-transparent text-par-n text-lab-pr2 max-h-72 overflow-y-auto outline-hidden placeholder:font-light placeholder:text-par-s"
              required
            />
            <span className="absolute bottom-2.5 left-4 text-lab-sc text-cap-l">
              {chatMessage.length}/500
            </span>
          </div>

          <div className="flex justify-center py-4 px-4">
            <Button type="submit" variant="primary" className="rounded-full px-6" loading={sendingChat}>
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
