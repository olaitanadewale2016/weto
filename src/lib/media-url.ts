import { publicEnv } from './env';

const R2_KEY_NAMESPACES = [
  'avatars/',
  'covers/',
  'posts/',
  'stories/',
  'marketplace/',
  'chats/',
  'system/',
  'business/',
  'businesses/',
  'jobs/',
  'ads/',
  'documents/',
  'migrated/',
];

const LOCAL_PUBLIC_PREFIXES = ['assets/', 'pwa/', '_next/', 'api/'];

const LEGACY_PUBLIC_ASSET_MAP: Record<string, string> = {
  'assets/avatars/default.png': '/assets/avatars/default-avatar.png',
  'assets/avatars/default': '/assets/avatars/default-avatar.png',
  'assets/covers/default.png': '/assets/covers/default-cover.png',
  'assets/covers/default.jpg': '/assets/covers/default-cover.png',
  'assets/covers/default-cover.jpg': '/assets/covers/default-cover.png',
  'assets/products/default.png': '/assets/products/default-preview.png',
  'assets/products/default-preview.jpg': '/assets/products/default-preview.png',
};

function getSafePublicR2Base(): string {
  const base = (publicEnv.r2PublicUrl || '').trim().replace(/\/+$/, '');
  if (!base) return '';
  try {
    const parsed = new URL(base);
    if (parsed.hostname.endsWith('.r2.cloudflarestorage.com')) {
      return '';
    }
  } catch {
    return '';
  }
  return base;
}

function keyToBrowserUrl(key: string): string {
  const cleanKey = key.replace(/^\/+/, '');
  const base = getSafePublicR2Base();
  if (base) {
    return `${base}/${cleanKey}`;
  }
  return `/api/v1/media/proxy?key=${encodeURIComponent(cleanKey)}`;
}

function extractR2KeyFromS3EndpointUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.hostname.endsWith('.r2.cloudflarestorage.com')) {
      return null;
    }
    const rawPath = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
    if (!rawPath) return null;

    if (R2_KEY_NAMESPACES.some((ns) => rawPath.startsWith(ns))) {
      return rawPath;
    }

    // Path-style R2 S3 URLs include `/<bucketName>/<objectKey>`
    const slashIdx = rawPath.indexOf('/');
    if (slashIdx > 0) {
      const withoutBucket = rawPath.slice(slashIdx + 1);
      if (R2_KEY_NAMESPACES.some((ns) => withoutBucket.startsWith(ns))) {
        return withoutBucket;
      }
    }

    return rawPath;
  } catch {
    return null;
  }
}

/**
 * Resolves a stored media value (full URL, local `/assets/...` path, or R2 object key)
 * into a browser-loadable URL without pulling server-only AWS SDK code into client bundles.
 */
export function resolveMediaUrl(value?: string | null): string {
  if (!value) return '';
  const trimmed = value.trim().replace(/\\/g, '/');
  if (!trimmed) return '';

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const r2Key = extractR2KeyFromS3EndpointUrl(trimmed);
    if (r2Key) {
      return keyToBrowserUrl(r2Key);
    }
    return trimmed;
  }

  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    return trimmed;
  }

  if (trimmed.startsWith('/api/v1/media/proxy')) {
    return trimmed;
  }

  const withoutLeading = trimmed.replace(/^\/+/, '');

  if (LEGACY_PUBLIC_ASSET_MAP[withoutLeading]) {
    return LEGACY_PUBLIC_ASSET_MAP[withoutLeading];
  }

  if (LOCAL_PUBLIC_PREFIXES.some((prefix) => withoutLeading.startsWith(prefix))) {
    return `/${withoutLeading}`;
  }

  const isKnownR2Namespace = R2_KEY_NAMESPACES.some((ns) => withoutLeading.startsWith(ns));
  if (isKnownR2Namespace || !trimmed.startsWith('/')) {
    return keyToBrowserUrl(withoutLeading);
  }

  return `/${withoutLeading}`;
}
