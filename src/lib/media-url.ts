import { publicEnv } from './env';

const R2_KEY_NAMESPACES = [
  'avatars/',
  'covers/',
  'posts/',
  'stories/',
  'marketplace/',
  'chats/',
  'system/',
  'businesses/',
  'ads/',
  'documents/',
];

const LOCAL_PUBLIC_PREFIXES = ['assets/', 'pwa/', '_next/', 'api/'];

/**
 * Resolves a stored media value (full URL, local `/assets/...` path, or R2 object key)
 * into a browser-loadable URL without pulling server-only AWS SDK code into client bundles.
 */
export function resolveMediaUrl(value?: string | null): string {
  if (!value) return '';
  const trimmed = value.trim().replace(/\\/g, '/');
  if (!trimmed) return '';

  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:')
  ) {
    return trimmed;
  }

  if (trimmed.startsWith('/api/v1/media/proxy')) {
    return trimmed;
  }

  const withoutLeading = trimmed.replace(/^\/+/, '');

  if (LOCAL_PUBLIC_PREFIXES.some((prefix) => withoutLeading.startsWith(prefix))) {
    return `/${withoutLeading}`;
  }

  const isKnownR2Namespace = R2_KEY_NAMESPACES.some((ns) => withoutLeading.startsWith(ns));
  if (isKnownR2Namespace || !trimmed.startsWith('/')) {
    const base = (publicEnv.r2PublicUrl || '').replace(/\/+$/, '');
    if (base) {
      return `${base}/${withoutLeading}`;
    }
    return `/api/v1/media/proxy?key=${encodeURIComponent(withoutLeading)}`;
  }

  return `/${withoutLeading}`;
}
