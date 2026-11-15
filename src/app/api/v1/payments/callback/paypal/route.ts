import { NextRequest, NextResponse } from 'next/server';
import { getSettingsGroup } from '@/services/settings.service';
import { finalizeDepositPayment } from '@/services/payment.service';
import { getAppBaseUrl } from '@/lib/env';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const orderId = searchParams.get('token');
  const paymentUuid = searchParams.get('paymentUuid') || undefined;
  const baseUrl = getAppBaseUrl(req.nextUrl.origin);

  if (action === 'cancel' || !orderId) {
    if (paymentUuid) {
      await finalizeDepositPayment({ paymentUuid, outcome: 'failed', provider: 'paypal' });
    }
    return NextResponse.redirect(`${baseUrl}/wallet?deposit=cancelled`);
  }

  try {
    const acq = await getSettingsGroup('acquiring');
    const ppBase =
      acq.paypalMode === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';

    const tokenRes = await fetch(`${ppBase}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${acq.paypalClientId}:${acq.paypalSecretKey}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const { access_token } = (await tokenRes.json()) as { access_token?: string };

    if (!access_token) {
      return NextResponse.redirect(`${baseUrl}/wallet?deposit=error`);
    }

    const capRes = await fetch(`${ppBase}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
    });
    const capData = (await capRes.json()) as { status?: string };

    if (capData.status === 'COMPLETED') {
      await finalizeDepositPayment({
        referenceId: orderId,
        paymentUuid,
        outcome: 'completed',
        provider: 'paypal',
      });
      return NextResponse.redirect(`${baseUrl}/wallet?deposit=success&provider=paypal`);
    }

    return NextResponse.redirect(`${baseUrl}/wallet?deposit=failed`);
  } catch {
    return NextResponse.redirect(`${baseUrl}/wallet?deposit=error`);
  }
}
