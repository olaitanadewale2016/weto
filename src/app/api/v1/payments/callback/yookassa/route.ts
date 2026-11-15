import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Payment } from '@/models/Finance';
import { getSettingsGroup } from '@/services/settings.service';
import { finalizeDepositPayment } from '@/services/payment.service';
import { getAppBaseUrl } from '@/lib/env';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const paymentUuid = searchParams.get('paymentUuid') || '';
  const baseUrl = getAppBaseUrl(req.nextUrl.origin);

  if (!paymentUuid) {
    return NextResponse.redirect(`${baseUrl}/wallet?deposit=cancelled`);
  }

  try {
    await connectDB();
    const [acq, payment] = await Promise.all([
      getSettingsGroup('acquiring'),
      Payment.findOne({ paymentUuid }).lean(),
    ]);

    if (!payment?.referenceId || !acq.ykShopId || !acq.ykSecretKey) {
      return NextResponse.redirect(`${baseUrl}/wallet?deposit=error`);
    }

    const res = await fetch(`https://api.yookassa.ru/v3/payments/${encodeURIComponent(payment.referenceId)}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${acq.ykShopId}:${acq.ykSecretKey}`).toString('base64')}`,
      },
    });
    const verified = (await res.json()) as { id?: string; status?: string };

    if (verified.status === 'succeeded') {
      await finalizeDepositPayment({
        referenceId: verified.id || payment.referenceId,
        paymentUuid,
        outcome: 'completed',
        provider: 'yoo_kassa',
      });
      return NextResponse.redirect(`${baseUrl}/wallet?deposit=success&provider=yoo_kassa`);
    }

    if (verified.status === 'canceled') {
      await finalizeDepositPayment({
        referenceId: verified.id || payment.referenceId,
        paymentUuid,
        outcome: 'failed',
        provider: 'yoo_kassa',
      });
      return NextResponse.redirect(`${baseUrl}/wallet?deposit=failed&provider=yoo_kassa`);
    }

    return NextResponse.redirect(`${baseUrl}/wallet?deposit=processing&provider=yoo_kassa`);
  } catch {
    return NextResponse.redirect(`${baseUrl}/wallet?deposit=error`);
  }
}
