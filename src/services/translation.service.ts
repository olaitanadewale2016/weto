import { getServerEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getAiCapabilities, translateWithAi } from '@/services/ai.service';

export async function translateText(params: {
  text: string;
  targetLang: string;
  sourceLang?: string;
}): Promise<{ translatedText: string; detectedLanguage?: string }> {
  const env = getServerEnv();
  if (env.TRANSLATION_SERVICE === 'disabled') {
    throw new Error('TRANSLATION_DISABLED');
  }

  const baseUrl = env.TRANSLATION_SERVICE_API_URL.replace(/\/+$/, '');
  try {
    const res = await fetch(`${baseUrl}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        q: params.text,
        source: params.sourceLang || 'auto',
        target: params.targetLang,
        format: 'text',
        ...(env.TRANSLATION_SERVICE_API_KEY ? { api_key: env.TRANSLATION_SERVICE_API_KEY } : {}),
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      translatedText?: string;
      detectedLanguage?: { language?: string };
      error?: string;
    };

    if (res.ok && data.translatedText) {
      return {
        translatedText: data.translatedText,
        detectedLanguage: data.detectedLanguage?.language,
      };
    }

    throw new Error(data.error || `Translation service returned ${res.status}`);
  } catch (err) {
    if (getAiCapabilities().enabled) {
      return translateWithAi(params);
    }
    throw err;
  }
}

export interface GeoLocationResult {
  country: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  unknown: boolean;
  source?: 'ipinfo' | 'vercel' | 'cloudflare' | 'none';
}

function safeDecodeHeader(val: string | null): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

export function resolveGeoFromHeaders(
  headerBag?: Pick<Headers, 'get'> | null
): GeoLocationResult {
  if (!headerBag) {
    return { country: null, region: null, city: null, timezone: null, unknown: true, source: 'none' };
  }
  const vercelCountry = headerBag.get('x-vercel-ip-country')?.trim().toUpperCase() || null;
  const cfCountry = headerBag.get('cf-ipcountry')?.trim().toUpperCase() || null;
  const rawCountry =
    vercelCountry || (cfCountry && cfCountry !== 'XX' && cfCountry !== 'T1' ? cfCountry : null);
  const region = safeDecodeHeader(headerBag.get('x-vercel-ip-country-region'));
  const city = safeDecodeHeader(headerBag.get('x-vercel-ip-city'));
  const timezone = safeDecodeHeader(headerBag.get('x-vercel-ip-timezone'));
  const unknown = !rawCountry && !region && !city;
  return {
    country: rawCountry && rawCountry.length === 2 ? rawCountry : null,
    region,
    city,
    timezone,
    unknown,
    source: vercelCountry ? 'vercel' : rawCountry ? 'cloudflare' : 'none',
  };
}

export function normalizeIpAddress(rawIp: string): string {
  const first = rawIp.split(',')[0]?.trim() || '';
  return first.startsWith('::ffff:') ? first.slice(7) : first;
}

export function isPrivateIpAddress(ip: string): boolean {
  if (!ip || ip === '0.0.0.0' || ip === '::1' || ip === 'localhost') return true;
  if (ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) {
    return true;
  }
  const match172 = /^172\.(\d+)\./.exec(ip);
  if (match172) {
    const second = Number(match172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  const match100 = /^100\.(\d+)\./.exec(ip);
  if (match100) {
    const second = Number(match100[1]);
    if (second >= 64 && second <= 127) return true;
  }
  const lower = ip.toLowerCase();
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:')) {
    return true;
  }
  return false;
}

export function parseDeviceUserAgent(ua: string): {
  platform: string;
  browser: string;
  platformType: 'desktop' | 'mobile' | 'tablet';
} {
  const lower = ua.toLowerCase();
  const platformType: 'desktop' | 'mobile' | 'tablet' = /ipad|tablet/i.test(ua)
    ? 'tablet'
    : /mobile|android|iphone|ipod/i.test(ua)
      ? 'mobile'
      : 'desktop';

  let platform = 'Unknown OS';
  if (lower.includes('iphone') || lower.includes('ipad') || lower.includes('ipod')) platform = 'iOS';
  else if (lower.includes('android')) platform = 'Android';
  else if (lower.includes('windows')) platform = 'Windows';
  else if (lower.includes('mac os') || lower.includes('macintosh')) platform = 'macOS';
  else if (lower.includes('linux')) platform = 'Linux';

  let browser = 'Browser';
  if (lower.includes('edg/')) browser = 'Edge';
  else if (lower.includes('opr/') || lower.includes('opera')) browser = 'Opera';
  else if (lower.includes('chrome/') && !lower.includes('edg/')) browser = 'Chrome';
  else if (lower.includes('firefox/')) browser = 'Firefox';
  else if (lower.includes('safari/') && !lower.includes('chrome/')) browser = 'Safari';

  return { platform, browser, platformType };
}

export async function lookupIpLocation(rawIp: string): Promise<GeoLocationResult> {
  const env = getServerEnv();
  const ip = normalizeIpAddress(rawIp);
  if (isPrivateIpAddress(ip) || !env.IPINFO_TOKEN) {
    return { country: null, region: null, city: null, timezone: null, unknown: true, source: 'none' };
  }

  try {
    const res = await fetch(
      `https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${encodeURIComponent(env.IPINFO_TOKEN)}`,
      { signal: AbortSignal.timeout(5000), cache: 'no-store' }
    );
    if (!res.ok) {
      return { country: null, region: null, city: null, timezone: null, unknown: true, source: 'none' };
    }
    const json = (await res.json()) as {
      country?: string;
      region?: string;
      city?: string;
      timezone?: string;
    };
    const normalizedCountry = json.country?.trim().toUpperCase() || null;
    const unknown = !normalizedCountry && !json.region && !json.city;
    return {
      country: normalizedCountry,
      region: json.region ?? null,
      city: json.city ?? null,
      timezone: json.timezone ?? null,
      unknown,
      source: unknown ? 'none' : 'ipinfo',
    };
  } catch {
    return { country: null, region: null, city: null, timezone: null, unknown: true, source: 'none' };
  }
}

export async function lookupIpLocationWithHeaders(
  rawIp: string,
  headerBag?: Pick<Headers, 'get'> | null
): Promise<GeoLocationResult> {
  const ipGeo = await lookupIpLocation(rawIp);
  if (!ipGeo.unknown && ipGeo.country) {
    return ipGeo;
  }
  const headerGeo = resolveGeoFromHeaders(headerBag);
  if (!headerGeo.unknown) {
    return {
      country: ipGeo.country || headerGeo.country,
      region: ipGeo.region || headerGeo.region,
      city: ipGeo.city || headerGeo.city,
      timezone: ipGeo.timezone || headerGeo.timezone,
      unknown: !(ipGeo.country || headerGeo.country) && !(ipGeo.city || headerGeo.city),
      source: ipGeo.country ? ipGeo.source : headerGeo.source,
    };
  }
  return ipGeo;
}

export async function sendSms(to: string, message: string): Promise<{ sent: boolean }> {
  const env = getServerEnv();
  if (env.SMS_DRIVER === 'log') {
    logger.info({ to, message }, 'SMS (log driver)');
    return { sent: true };
  }

  if (env.SMS_DRIVER === 'vonage' && process.env.VONAGE_API_KEY && process.env.VONAGE_API_SECRET) {
    const res = await fetch('https://rest.nexmo.com/sms/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.VONAGE_API_KEY,
        api_secret: process.env.VONAGE_API_SECRET,
        from: process.env.VONAGE_FROM || 'Weto',
        to,
        text: message,
      }),
    });
    return { sent: res.ok };
  }

  logger.warn({ driver: env.SMS_DRIVER }, 'SMS driver credentials missing; message skipped');
  return { sent: false };
}
