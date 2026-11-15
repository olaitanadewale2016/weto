'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Bookmark, Flag, MapPin, MessageCircle, Share2, Trash2 } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ReportModal } from '@/components/modals/ReportModal';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency } from '@/lib/currency';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';

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
  stockQuantity: number;
  address?: string;
  viewsCount: number;
  isBookmarked: boolean;
  previewImageUrl: string;
  media: Array<{ publicUrl?: string; url?: string }>;
  seller: {
    _id: string;
    username: string;
    firstName: string;
    lastName: string;
    avatar: string;
    verified?: boolean;
  };
  category?: { localization?: { en?: string } };
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, bootstrap, locale } = useApp();
  const { error, success } = useToast();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePhoto, setActivePhoto] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);

  const loadProduct = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<ProductDetail>(`/marketplace/${params.id}`);
      setProduct(data);
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

  async function contactSeller() {
    if (!user || !product) {
      router.push('/auth/login');
      return;
    }
    try {
      const chat = await apiFetch<{ id: string }>('/chats', {
        method: 'POST',
        json: { type: 'direct', targetUserId: product.seller._id },
      });
      await apiFetch(`/chats/${chat.id}`, {
        method: 'POST',
        json: {
          type: 'text',
          content: `Hi! I'm interested in "${product.title}" (${product.currency} ${product.salePrice}).`,
          contextRef: { kind: 'product', id: product.id, title: product.title },
        },
      });
      router.push(`/messenger/c/${chat.id}`);
    } catch (err) {
      error('Could not message seller', err instanceof Error ? err.message : undefined);
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

  async function deleteListing() {
    if (!product) return;
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
        <div className="p-10 text-center text-lab-sc">Product listing not found.</div>
      </AppShell>
    );
  }

  const isOwner = user && String(product.seller._id) === user.id;
  const photos =
    product.media && product.media.length > 0
      ? product.media.map((m) => m.publicUrl || m.url || product.previewImageUrl)
      : [product.previewImageUrl];

  return (
    <AppShell fullWidth>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
        <Link href="/marketplace" className="inline-flex items-center gap-2 text-par-n text-lab-sc hover:text-lab-pr">
          <ArrowLeft className="h-4 w-4" /> Back to Marketplace
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Gallery */}
          <div className="space-y-3">
            <div className="aspect-square rounded-3xl border border-bord-card bg-fill-sc overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photos[activePhoto] || product.previewImageUrl}
                alt={product.title}
                className="h-full w-full object-cover"
              />
            </div>
            {photos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto">
                {photos.map((src, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActivePhoto(i)}
                    className={`h-16 w-16 rounded-2xl overflow-hidden border-2 shrink-0 ${
                      activePhoto === i ? 'border-brand-900' : 'border-transparent'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {product.category?.localization?.en && (
                  <Badge variant="brand">{product.category.localization.en}</Badge>
                )}
                <Badge>{product.condition}</Badge>
                <Badge variant="outline">{product.type}</Badge>
              </div>
              <h1 className="text-title-1 font-bold text-lab-pr">{product.title}</h1>
              <div className="flex items-baseline gap-3">
                <span className="text-lg-title font-bold text-lab-pr2">
                  {formatCurrency(product.salePrice, product.currency, bootstrap?.currencies, locale)}
                </span>
                {product.discount > 0 && (
                  <span className="text-par-l text-lab-tr line-through">
                    {formatCurrency(product.price, product.currency, bootstrap?.currencies, locale)}
                  </span>
                )}
              </div>
            </div>

            {product.address && (
              <p className="flex items-center gap-1.5 text-par-n text-lab-sc">
                <MapPin className="h-4 w-4 text-lab-sc" /> {product.address}
              </p>
            )}

            <p className="text-par-m text-lab-pr whitespace-pre-wrap leading-relaxed">
              {product.description}
            </p>

            {/* Seller Card */}
            <Link
              href={`/@${product.seller.username}`}
              className="flex items-center justify-between rounded-2xl border border-bord-pr p-3.5 hover:bg-fill-pr"
            >
              <div className="flex items-center gap-3">
                <Avatar src={product.seller.avatar} alt={product.seller.username} verified={product.seller.verified} size="md" />
                <div>
                  <p className="text-par-n font-bold text-lab-pr">
                    {product.seller.firstName} {product.seller.lastName}
                  </p>
                  <p className="text-cap-l text-lab-sc">@{product.seller.username}</p>
                </div>
              </div>
              <span className="text-cap-l text-brand-900 font-semibold">View Seller</span>
            </Link>

            {/* Actions */}
            <div className="flex flex-wrap gap-2.5 pt-2">
              {!isOwner ? (
                <Button variant="primary" size="lg" className="flex-1" onClick={contactSeller}>
                  <MessageCircle className="h-4 w-4" /> Contact Seller
                </Button>
              ) : (
                <Button variant="danger" size="lg" onClick={deleteListing}>
                  <Trash2 className="h-4 w-4" /> Delete Listing
                </Button>
              )}
              <Button variant="outline" size="lg" onClick={toggleBookmark}>
                <Bookmark className={`h-4 w-4 ${product.isBookmarked ? 'fill-current text-lab-pr' : 'text-lab-pr3'}`} />
                {product.isBookmarked ? 'Saved' : 'Save'}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  success('Product link copied');
                }}
              >
                <Share2 className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setReportOpen(true)}>
                <Flag className="h-4 w-4 text-red-900" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="product"
        targetId={product.id}
      />
    </AppShell>
  );
}
