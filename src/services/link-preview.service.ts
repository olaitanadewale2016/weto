import * as cheerio from 'cheerio';
import dns from 'dns/promises';
import net from 'net';
import { ILinkSnapshot } from '@/models/Post';
import { ValidationError } from '@/lib/api-response';

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 0) return true;
  }
  if (ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) {
    return true;
  }
  return false;
}

export async function fetchLinkSnapshot(rawUrl: string): Promise<ILinkSnapshot> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ValidationError('Invalid URL provided for link preview.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ValidationError('Only HTTP/HTTPS URLs are supported.');
  }

  // SSRF Guard: prevent probing internal/loopback networks
  try {
    const resolved = await dns.lookup(parsed.hostname);
    if (isPrivateIp(resolved.address)) {
      throw new ValidationError('Private network URLs cannot be previewed.');
    }
  } catch (err) {
    if (err instanceof ValidationError) throw err;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'ColibriPlusLinkPreview/2.1 (+https://colibriplus.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    const html = await res.text();
    const $ = cheerio.load(html);

    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').first().text().trim() ||
      parsed.hostname;

    const description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="twitter:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';

    const image =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      '';

    return {
      url: parsed.toString(),
      domain: parsed.hostname.replace(/^www\./, ''),
      title: title.slice(0, 200),
      description: description.slice(0, 400),
      image: image || undefined,
      metadata: { fetchedAt: new Date().toISOString() },
    };
  } catch {
    return {
      url: parsed.toString(),
      domain: parsed.hostname.replace(/^www\./, ''),
      title: parsed.hostname,
      description: '',
    };
  } finally {
    clearTimeout(timeout);
  }
}
