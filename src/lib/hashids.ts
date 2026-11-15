import Hashids from 'hashids';

let instance: Hashids | null = null;

function getHashids(): Hashids {
  if (!instance) {
    const salt = process.env.HASHIDS_SALT || 'colibriplus-default-salt-change-me';
    instance = new Hashids(salt, 16);
  }
  return instance;
}

export function encodeId(id: number): string {
  return getHashids().encode(id);
}

export function decodeId(hashId: string): number | null {
  try {
    const decoded = getHashids().decode(hashId);
    if (!decoded.length) return null;
    return Number(decoded[0]);
  } catch {
    return null;
  }
}

/**
 * Generates a compact URL-safe short ID for new MongoDB documents if needed,
 * while also supporting standard MongoDB ObjectId strings and legacy Hashids.
 */
export function isObjectIdLike(value: string): boolean {
  return /^[a-f\d]{24}$/i.test(value);
}
