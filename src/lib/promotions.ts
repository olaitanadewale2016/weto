export interface ListingPromotionPlan {
  id: '3d' | '7d' | '14d';
  label: string;
  durationDays: number;
  price: number;
  badgeText: string;
  description: string;
}

export interface PromotionPricingConfig {
  enabled?: boolean;
  price3d?: number;
  price7d?: number;
  price14d?: number;
}

export const DEFAULT_PROMOTION_PRICES = {
  price3d: 2500,
  price7d: 5000,
  price14d: 8500,
} as const;

export function getListingPromotionPlans(
  config?: PromotionPricingConfig | null
): ListingPromotionPlan[] {
  const p3 = Number(config?.price3d ?? DEFAULT_PROMOTION_PRICES.price3d);
  const p7 = Number(config?.price7d ?? DEFAULT_PROMOTION_PRICES.price7d);
  const p14 = Number(config?.price14d ?? DEFAULT_PROMOTION_PRICES.price14d);

  return [
    {
      id: '3d',
      label: '3-Day Boost',
      durationDays: 3,
      price: Number.isFinite(p3) && p3 > 0 ? p3 : DEFAULT_PROMOTION_PRICES.price3d,
      badgeText: 'Starter',
      description: 'Pinned ahead of standard listings for 72 hours with a Promoted badge.',
    },
    {
      id: '7d',
      label: '7-Day Featured',
      durationDays: 7,
      price: Number.isFinite(p7) && p7 > 0 ? p7 : DEFAULT_PROMOTION_PRICES.price7d,
      badgeText: 'Most Popular',
      description: 'Top marketplace placement for a full week across search and category feeds.',
    },
    {
      id: '14d',
      label: '14-Day Spotlight',
      durationDays: 14,
      price: Number.isFinite(p14) && p14 > 0 ? p14 : DEFAULT_PROMOTION_PRICES.price14d,
      badgeText: 'Best Value',
      description: 'Maximum exposure for two weeks at our lowest daily rate.',
    },
  ];
}

export const LISTING_PROMOTION_PLANS: ListingPromotionPlan[] = getListingPromotionPlans();

export function getListingPromotionPlan(
  id?: string,
  config?: PromotionPricingConfig | null
): ListingPromotionPlan {
  const plans = getListingPromotionPlans(config);
  return plans.find((plan) => plan.id === id) || plans[1];
}
