import { NextRequest, NextResponse } from 'next/server';
import { getSettingsGroup } from '@/services/settings.service';
import { finalizeDepositPayment } from '@/services/payment.service';
import { getAppBaseUrl } from '@/lib/env';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const reference = searchParams.get('reference') || searchParams.get('trxref') || '';
  const baseUrl = getAppBaseUrl(req.nextUrl.origin);

  if (!reference) {
    return NextResponse.redirect(`${baseUrl}/wallet?deposit=cancelled`);
  }

  try {
    const acq = await getSettingsGroup('acquiring');
    if (!acq.paystackSecretKey) {
      return NextResponse.redirect(`${baseUrl}/wallet?deposit=error`);
    }

    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${acq.paystackSecretKey}`,
        },
      }
    );
    const verifyJson = (await verifyRes.json()) as {
      status?: boolean;
      data?: {
        status?: string;
        reference?: string;
        metadata?: { paymentUuid?: string };
      };
    };

    if (verifyRes.ok && verifyJson.status && verifyJson.data?.status === 'success') {
      await finalizeDepositPayment({
        referenceId: verifyJson.data.reference || reference,
        paymentUuid: verifyJson.data.metadata?.paymentUuid || reference,
        outcome: 'completed',
        provider: 'paystack',
      });
      return NextResponse.redirect(`${baseUrl}/wallet?deposit=success&provider=paystack`);
    }

    await finalizeDepositPayment({
      referenceId: reference,
      paymentUuid: reference,
      outcome: 'failed',
      provider: 'paystack',
    });
    return NextResponse.redirect(`${baseUrl}/wallet?deposit=failed&provider=paystack`);
  } catch {
    return NextResponse.redirect(`${baseUrl}/wallet?deposit=error`);
  }
}
