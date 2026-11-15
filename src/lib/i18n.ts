import { Dictionary, enDictionary } from '@/locales/en';
import { LOCALE_DICTIONARIES } from '@/locales/translations';

export const SUPPORTED_LOCALES = [
  { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr' as const },
  { code: 'es', name: 'Español', nativeName: 'Español', direction: 'ltr' as const },
  { code: 'fr', name: 'Français', nativeName: 'Français', direction: 'ltr' as const },
  { code: 'de', name: 'Deutsch', nativeName: 'Deutsch', direction: 'ltr' as const },
  { code: 'pt', name: 'Português', nativeName: 'Português', direction: 'ltr' as const },
  { code: 'ru', name: 'Русский', nativeName: 'Русский', direction: 'ltr' as const },
  { code: 'ar', name: 'العربية', nativeName: 'العربية', direction: 'rtl' as const },
] as const;

const RTL_LANGUAGE_CODES = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'ku', 'sd', 'ug', 'yi', 'dv']);

export function getDictionary(locale = 'en'): Dictionary {
  const code = locale.toLowerCase().slice(0, 2);
  return LOCALE_DICTIONARIES[code] || enDictionary;
}

export function isRtlLocale(
  locale = 'en',
  availableLocales?: Array<{ code?: string; alpha2Code?: string; direction?: string; isRtl?: boolean }>
): boolean {
  const code = locale.toLowerCase().slice(0, 2);
  const found = availableLocales?.find(
    (l) => (l.code || l.alpha2Code || '').toLowerCase() === code
  );
  if (found) {
    return Boolean(found.isRtl || found.direction === 'rtl');
  }
  return RTL_LANGUAGE_CODES.has(code);
}

export function formatLocalizedDate(date: Date | string, locale = 'en'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(d);
  } catch {
    return d.toDateString();
  }
}

export function formatRelativeTime(date: Date | string, locale = 'en'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffSeconds = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);
  try {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (abs < 60) return rtf.format(diffSeconds, 'second');
    if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(diffSeconds / 3600), 'hour');
    if (abs < 2592000) return rtf.format(Math.round(diffSeconds / 86400), 'day');
  } catch {
    // Fallback below
  }
  return formatLocalizedDate(d, locale);
}
