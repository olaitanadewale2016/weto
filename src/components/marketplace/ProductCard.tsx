'use client';

import React from 'react';
import Link from 'next/link';
import { Bookmark } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/currency';
import { resolveMediaUrl } from '@/lib/media-url';
import { useApp } from '@/components/providers/AppContext';
import { cn } from '@/lib/utils';

export interface MarketplaceProductItem {
  id: string;
  hashId: string;
  title: string;
  description?: string;
  price: number;
  salePrice: number;
  discount: number;
  currency: string;
  condition?: string;
  type?: string;
  stockQuantity?: number;
  address?: string;
  isPromoted?: boolean;
  isBookmarked?: boolean;
  previewImageUrl: string;
  seller?: {
    username: string;
    firstName?: string;
    lastName?: string;
  };
}

interface ProductCardProps {
  product: MarketplaceProductItem;
  onToggleBookmark?: (productId: string) => void;
}

/**
 * Shared PHP-parity Marketplace Product Card (`ProductCard.vue`).
 */
export function ProductCard({ product, onToggleBookmark }: ProductCardProps) {
  const { bootstrap, locale } = useApp();
  const productHref = `/marketplace/product/${product.hashId || product.id}`;
  const previewSrc =
    resolveMediaUrl(product.previewImageUrl) || '/assets/products/default-preview.png';
  const sellerDisplay =
    `${product.seller?.firstName || ''} ${product.seller?.lastName || ''}`.trim() ||
    (product.seller?.username ? `@${product.seller.username}` : '');

  return (
    <div className="group flex flex-col">
      <div className="relative aspect-square rounded-lg overflow-hidden mb-2 bg-fill-tr">
        <Link href={productHref} className="block h-full w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={previewSrc}
            src={previewSrc}
            alt={product.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            onLoad={(e) => {
              e.currentTarget.dataset.fallbackApplied = '';
            }}
            onError={(e) => {
              if (e.currentTarget.dataset.fallbackApplied !== '1') {
                e.currentTarget.dataset.fallbackApplied = '1';
                e.currentTarget.src = '/assets/products/default-preview.png';
              }
            }}
          />
        </Link>
        {product.isPromoted ? (
          <Badge variant="brand" className="absolute top-2 left-2 shadow-sm pointer-events-none">
            Promoted
          </Badge>
        ) : null}
        {product.discount > 0 ? (
          <Badge variant="danger" className="absolute top-2 right-2 shadow-sm pointer-events-none">
            -{product.discount}%
          </Badge>
        ) : null}
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="flex items-start justify-between gap-1.5 mb-1">
          <Link href={productHref} className="min-w-0 flex-1 max-w-11/12">
            <h3 className="text-par-s font-normal line-clamp-2 text-lab-pr hover:underline leading-snug">
              {product.title}
            </h3>
          </Link>
          {onToggleBookmark ? (
            <button
              type="button"
              onClick={() => onToggleBookmark(product.id)}
              className={cn(
                'shrink-0 p-0.5 cursor-pointer transition-colors',
                product.isBookmarked ? 'text-brand-900' : 'text-lab-tr hover:text-lab-pr'
              )}
              aria-label={product.isBookmarked ? 'Remove saved product' : 'Save product'}
            >
              <Bookmark className={cn('h-4 w-4', product.isBookmarked && 'fill-current')} />
            </button>
          ) : null}
        </div>

        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-lab-pr2 text-par-n font-semibold">
            {formatCurrency(product.salePrice, product.currency, bootstrap?.currencies, locale)}
          </span>
          {product.discount > 0 ? (
            <span className="text-lab-sc text-par-s line-through">
              {formatCurrency(product.price, product.currency, bootstrap?.currencies, locale)}
            </span>
          ) : null}
        </div>

        <div className="text-par-s text-lab-sc overflow-hidden truncate">
          {product.seller?.username ? (
            <Link href={`/@${product.seller.username}`} className="hover:underline">
              {sellerDisplay}
            </Link>
          ) : null}
          {sellerDisplay && (product.address || product.condition) ? ', ' : ''}
          <span className="capitalize">{product.address || product.condition || 'Available'}</span>
        </div>
      </div>
    </div>
  );
}
