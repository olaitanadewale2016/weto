import { describe, expect, it } from 'vitest';
import {
  abbreviateNumber,
  calculateCommission,
  extractHashtags,
  extractMentions,
  extractUrls,
  formatMoney,
  maskEmail,
  truncateText,
} from '@/lib/utils';
import { decodeId, encodeId, isObjectIdLike } from '@/lib/hashids';

describe('Domain utility calculations', () => {
  it('computes commission in integer cents without floating-point drift', () => {
    expect(calculateCommission(100, 15)).toEqual({ gross: 100, fee: 15, net: 85 });
    expect(calculateCommission(19.99, 10)).toEqual({ gross: 19.99, fee: 2, net: 17.99 });
    expect(calculateCommission(10, 0)).toEqual({ gross: 10, fee: 0, net: 10 });
  });

  it('formats money and abbreviates counts accurately', () => {
    expect(formatMoney(1250.5, 'USD', 'en-US')).toContain('1,250.50');
    expect(abbreviateNumber(950)).toBe('950');
    expect(abbreviateNumber(1500)).toBe('1.5K');
    expect(abbreviateNumber(2_000_000)).toBe('2M');
  });

  it('extracts hashtags, mentions, and URLs cleanly', () => {
    const text = 'Building #ColibriPlus #nextjs with @alex_morgan at https://colibriplus.local/docs';
    expect(extractHashtags(text)).toEqual(['colibriplus', 'nextjs']);
    expect(extractMentions(text)).toEqual(['alex_morgan']);
    expect(extractUrls(text)).toEqual(['https://colibriplus.local/docs']);
  });

  it('masks email and truncates text safely', () => {
    expect(maskEmail('creator@example.com')).toBe('cr*****@example.com');
    expect(truncateText('Hello world', 5)).toBe('Hello...');
  });
});

describe('Hashids & ObjectId helpers', () => {
  it('round-trips numeric IDs deterministically', () => {
    const hash = encodeId(424242);
    expect(hash.length).toBeGreaterThanOrEqual(16);
    expect(decodeId(hash)).toBe(424242);
    expect(decodeId('invalid!!')).toBeNull();
  });

  it('detects 24-char MongoDB ObjectIds', () => {
    expect(isObjectIdLike('507f1f77bcf86cd799439011')).toBe(true);
    expect(isObjectIdLike('not-an-object-id')).toBe(false);
  });
});
