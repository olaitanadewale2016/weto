export interface CurrencyOption {
  code?: string;
  alpha3Code?: string;
  name?: string;
  symbol?: string;
  symbolNative?: string;
  isDefault?: boolean;
}

const KNOWN_SYMBOLS: Record<string, string> = {
  NGN: '₦',
  USD: '$',
  EUR: '€',
  GBP: '£',
  GHS: '₵',
  KES: 'KSh',
  ZAR: 'R',
  CAD: 'C$',
  AUD: 'A$',
  RUB: '₽',
  JPY: '¥',
  CNY: '¥',
  INR: '₹',
  AED: 'د.إ',
  SAR: '﷼',
};

export function normalizeCurrencyCode(currencyCode?: string | null, fallback = 'USD'): string {
  const clean = (currencyCode || fallback || 'USD').trim().toUpperCase();
  return clean || 'USD';
}

export function getCurrencySymbol(
  currencyCode?: string | null,
  currencies?: CurrencyOption[] | null
): string {
  const code = normalizeCurrencyCode(currencyCode);
  const found = currencies?.find(
    (c) => (c.code || c.alpha3Code || '').toUpperCase() === code
  );
  if (found?.symbolNative) return found.symbolNative;
  if (found?.symbol) return found.symbol;
  return KNOWN_SYMBOLS[code] || code;
}

export function formatCurrency(
  amount: number | string | null | undefined,
  currencyCode?: string | null,
  currencies?: CurrencyOption[] | null,
  locale = 'en',
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
): string {
  const numeric = typeof amount === 'string' ? parseFloat(amount) : Number(amount ?? 0);
  const safeVal = Number.isFinite(numeric) ? numeric : 0;
  const code = normalizeCurrencyCode(currencyCode);

  const symbol = getCurrencySymbol(code, currencies);
  const isZeroDecimalHint = code === 'NGN' || code === 'JPY';
  const minFrac = options?.minimumFractionDigits ?? (isZeroDecimalHint && Number.isInteger(safeVal) ? 0 : 2);
  const maxFrac = options?.maximumFractionDigits ?? 2;

  try {
    const formattedNumber = new Intl.NumberFormat(locale || 'en', {
      minimumFractionDigits: minFrac,
      maximumFractionDigits: maxFrac,
    }).format(safeVal);
    return symbol.length <= 2 ? `${symbol}${formattedNumber}` : `${symbol} ${formattedNumber}`;
  } catch {
    return symbol.length <= 2
      ? `${symbol}${safeVal.toFixed(maxFrac)}`
      : `${symbol} ${safeVal.toFixed(maxFrac)}`;
  }
}
