export interface ListingPromotionPlan {
  id: '3d' | '7d' | '14d';
  label: string;
  durationDays: number;
  price: number;
  badgeText: string;
  description: string;
}

export const LISTING_PROMOTION_PLANS: ListingPromotionPlan[] = [
  {
    id: '3d',
    label: '3-Day Boost',
    durationDays: 3,
    price: 5,
    badgeText: 'Starter',
    description: 'Pinned ahead of standard listings for 72 hours with a Promoted badge.',
  },
  {
    id: '7d',
    label: '7-Day Featured',
    durationDays: 7,
    price: 10,
    badgeText: 'Most Popular',
    description: 'Top marketplace placement for a full week across search and category feeds.',
  },
  {
    id: '14d',
    label: '14-Day Spotlight',
    durationDays: 14,
    price: 18,
    badgeText: 'Best Value',
    description: 'Maximum exposure for two weeks at 35% lower daily cost.',
  },
];

export function getListingPromotionPlan(id?: string): ListingPromotionPlan {
  return (
    LISTING_PROMOTION_PLANS.find((plan) => plan.id === id) || LISTING_PROMOTION_PLANS[1]
  );
}
