import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSettingsGroup } from '@/services/settings.service';
import { finalizeDepositPayment } from '@/services/payment.service';
import { getAppBaseUrl } from '@/lib/env';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('session_id') || '';
  const baseUrl = getAppBaseUrl(req.nextUrl.origin);

  if (!sessionId) {
    return NextResponse.redirect(`${baseUrl}/wallet?deposit=cancelled`);
  }

  try {
    const acq = await getSettingsGroup('acquiring');
    if (!acq.stripeSecretKey) {
      return NextResponse.redirect(`${baseUrl}/wallet?deposit=error`);
    }

    const stripe = new Stripe(acq.stripeSecretKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid' || session.status === 'complete') {
      await finalizeDepositPayment({
        referenceId: session.id,
        paymentUuid: session.metadata?.paymentUuid,
        outcome: 'completed',
        provider: 'stripe',
      });
      return NextResponse.redirect(`${baseUrl}/wallet?deposit=success&provider=stripe`);
    }

    if (session.status === 'expired') {
      await finalizeDepositPayment({
        referenceId: session.id,
        paymentUuid: session.metadata?.paymentUuid,
        outcome: 'expired',
        provider: 'stripe',
      });
      return NextResponse.redirect(`${baseUrl}/wallet?deposit=failed&provider=stripe`);
    }

    return NextResponse.redirect(`${baseUrl}/wallet?deposit=processing&provider=stripe`);
  } catch {
    return NextResponse.redirect(`${baseUrl}/wallet?deposit=error`);
  }
}
