import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api-response';
import { getClientIp } from '@/lib/auth/session';
import { getServerEnv } from '@/lib/env';
import { lookupIpLocationWithHeaders, normalizeIpAddress } from '@/services/translation.service';

export async function GET(req: NextRequest) {
  try {
    const rawIp = await getClientIp(req);
    const ip = normalizeIpAddress(rawIp);
    const env = getServerEnv();
    const location = await lookupIpLocationWithHeaders(ip, req.headers);

    return apiSuccess({
      ip,
      configured: Boolean(env.IPINFO_TOKEN) || Boolean(location.country),
      ...location,
    });
  } catch (err) {
    return apiError(err);
  }
}
