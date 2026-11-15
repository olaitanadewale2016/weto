import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const customTwMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-family': [{ font: ['outfit'] }],
      'font-size': [
        {
          text: [
            'lg-title',
            'title-1',
            'title-2',
            'title-3',
            'par-l',
            'par-m',
            'par-n',
            'par-s',
            'cap-l',
            'cap-s',
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return customTwMerge(clsx(inputs));
}

export function formatMoney(
  amount: number | string,
  currency = 'USD',
  locale = 'en-US'
): string {
  const numeric = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isNaN(numeric)) return `0.00 ${currency}`;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `${numeric.toFixed(2)} ${currency}`;
  }
}

export function abbreviateNumber(num: number): string {
  if (num < 1000) return String(num);
  if (num < 1_000_000) return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  if (num < 1_000_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  return `${(num / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
}

export function truncateText(text: string, maxLength = 140): string {
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}...`;
}

/**
 * Computes net payout and fee given a gross amount and commission percentage.
 * All rounding uses integer minor units (cents) to avoid floating-point drift.
 */
export function calculateCommission(
  grossAmount: number,
  commissionPercent: number
): { gross: number; fee: number; net: number } {
  const grossCents = Math.round(grossAmount * 100);
  const feeCents = Math.round((grossCents * commissionPercent) / 100);
  const netCents = Math.max(0, grossCents - feeCents);
  return {
    gross: grossCents / 100,
    fee: feeCents / 100,
    net: netCents / 100,
  };
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(2, local.length - 2))}@${domain}`;
}

export function extractHashtags(text: string): string[] {
  const matches = text.match(/#([\p{L}\p{N}_]+)/gu) || [];
  return [...new Set(matches.map((t) => t.slice(1).toLowerCase()))];
}

export function extractMentions(text: string): string[] {
  const matches = text.match(/@([a-zA-Z0-9._]+)/g) || [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

export function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"')]+/gi) || [];
  return [...new Set(matches)];
}
