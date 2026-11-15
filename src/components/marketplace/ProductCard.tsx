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

  return (
    <div className="group flex flex-col">
      <Link
        href={productHref}
        className="relative aspect-square rounded-xl overflow-hidden mb-2 bg-fill-tr border border-bord-card block"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resolveMediaUrl(product.previewImageUrl) || '/assets/products/default-preview.png'}
          alt={product.title}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/assets/products/default-preview.png';
          }}
        />
        {product.isPromoted ? (
          <Badge variant="brand" className="absolute top-2 left-2 shadow-sm">
            Promoted
          </Badge>
        ) : null}
        {product.discount > 0 ? (
          <Badge variant="danger" className="absolute top-2 right-2 shadow-sm">
            -{product.discount}%
          </Badge>
        ) : null}
      </Link>

      <div className="flex-1 overflow-hidden space-y-0.5">
        <div className="flex items-start justify-between gap-1.5">
          <Link href={productHref} className="min-w-0 flex-1">
            <h3 className="text-par-s font-medium line-clamp-2 text-lab-pr hover:underline leading-snug">
              {product.title}
            </h3>
          </Link>
          {onToggleBookmark ? (
            <button
              type="button"
              onClick={() => onToggleBookmark(product.id)}
              className={cn(
                'shrink-0 p-0.5 cursor-pointer transition-colors',
                product.isBookmarked ? 'text-lab-pr' : 'text-lab-tr hover:text-lab-pr'
              )}
              aria-label={product.isBookmarked ? 'Remove saved product' : 'Save product'}
            >
              <Bookmark className={cn('h-4 w-4', product.isBookmarked && 'fill-current')} />
            </button>
          ) : null}
        </div>

        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-lab-pr text-par-n font-bold">
            {formatCurrency(product.salePrice, product.currency, bootstrap?.currencies, locale)}
          </span>
          {product.discount > 0 ? (
            <span className="text-lab-sc text-cap-l line-through">
              {formatCurrency(product.price, product.currency, bootstrap?.currencies, locale)}
            </span>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 text-cap-s text-lab-sc">
          <span className="truncate capitalize">
            {product.address || product.condition || 'Available'}
          </span>
          {product.seller?.username ? (
            <Link
              href={`/@${product.seller.username}`}
              className="truncate hover:text-lab-pr hover:underline shrink-0"
            >
              @{product.seller.username}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
