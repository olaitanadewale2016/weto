import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSettingsGroup } from '@/services/settings.service';
import { finalizeDepositPayment } from '@/services/payment.service';
import { logger } from '@/lib/logger';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider } = await context.params;
  const acq = await getSettingsGroup('acquiring');

  try {
    if (provider === 'paystack') {
      if (!acq.paystackSecretKey) {
        return NextResponse.json({ error: 'Paystack webhook not configured' }, { status: 400 });
      }
      const rawBody = await req.text();
      const sig = req.headers.get('x-paystack-signature') || '';
      const expected = crypto
        .createHmac('sha512', acq.paystackSecretKey)
        .update(rawBody)
        .digest('hex');
      if (!sig || sig !== expected) {
        return NextResponse.json({ error: 'Invalid Paystack signature' }, { status: 400 });
      }
      const event = JSON.parse(rawBody) as {
        event?: string;
        data?: { reference?: string; metadata?: { paymentUuid?: string } };
      };
      if (event.event === 'charge.success' && event.data?.reference) {
        await finalizeDepositPayment({
          referenceId: event.data.reference,
          paymentUuid: event.data.metadata?.paymentUuid || event.data.reference,
          outcome: 'completed',
          provider: 'paystack',
        });
      }
      return NextResponse.json({ received: true });
    }

    if (provider === 'stripe') {
      const sig = req.headers.get('stripe-signature');
      if (!sig || !acq.stripeSecretKey || !acq.stripeWebhookSecret) {
        return NextResponse.json({ error: 'Stripe webhook not configured' }, { status: 400 });
      }
      const rawBody = await req.text();
      const stripe = new Stripe(acq.stripeSecretKey);
      const event = stripe.webhooks.constructEvent(rawBody, sig, acq.stripeWebhookSecret);

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        await finalizeDepositPayment({
          referenceId: session.id,
          paymentUuid: session.metadata?.paymentUuid,
          outcome: 'completed',
          provider: 'stripe',
        });
      } else if (event.type === 'checkout.session.expired') {
        const session = event.data.object as Stripe.Checkout.Session;
        await finalizeDepositPayment({ referenceId: session.id, outcome: 'expired', provider: 'stripe' });
      } else if (event.type === 'charge.refunded') {
        const charge = event.data.object as Stripe.Charge;
        if (charge.payment_intent) {
          await finalizeDepositPayment({
            referenceId: String(charge.payment_intent),
            outcome: 'refunded',
            provider: 'stripe',
          });
        }
      }
      return NextResponse.json({ received: true });
    }

    if (provider === 'paypal') {
      const bodyText = await req.text();
      const event = JSON.parse(bodyText) as {
        event_type?: string;
        resource?: { id?: string; custom_id?: string };
      };

      // Verify signature via PayPal Webhook Signature API when webhookId configured
      if (acq.paypalClientId && acq.paypalSecretKey && acq.paypalWebhookId) {
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
        if (access_token) {
          const verifyRes = await fetch(`${ppBase}/v1/notifications/verify-webhook-signature`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              auth_algo: req.headers.get('paypal-auth-algo'),
              cert_url: req.headers.get('paypal-cert-url'),
              transmission_id: req.headers.get('paypal-transmission-id'),
              transmission_sig: req.headers.get('paypal-transmission-sig'),
              transmission_time: req.headers.get('paypal-transmission-time'),
              webhook_id: acq.paypalWebhookId,
              webhook_event: event,
            }),
          });
          const verifyData = (await verifyRes.json()) as { verification_status?: string };
          if (verifyData.verification_status !== 'SUCCESS') {
            return NextResponse.json({ error: 'Invalid PayPal signature' }, { status: 400 });
          }
        }
      }

      if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
        await finalizeDepositPayment({
          paymentUuid: event.resource?.custom_id,
          referenceId: event.resource?.id,
          outcome: 'completed',
          provider: 'paypal',
        });
      }
      return NextResponse.json({ received: true });
    }

    if (provider === 'yoo_kassa') {
      const payload = (await req.json()) as {
        event?: string;
        object?: { id?: string; metadata?: { paymentUuid?: string } };
      };
      // Re-query YooKassa API directly to prevent spoofed webhook payloads
      if (payload.object?.id && acq.ykShopId && acq.ykSecretKey) {
        const check = await fetch(`https://api.yookassa.ru/v3/payments/${payload.object.id}`, {
          headers: {
            Authorization: `Basic ${Buffer.from(`${acq.ykShopId}:${acq.ykSecretKey}`).toString('base64')}`,
          },
        });
        const verified = (await check.json()) as { id?: string; status?: string };
        if (verified.status === 'succeeded') {
          await finalizeDepositPayment({
            referenceId: verified.id,
            paymentUuid: payload.object.metadata?.paymentUuid,
            outcome: 'completed',
            provider: 'yoo_kassa',
          });
        } else if (verified.status === 'canceled') {
          await finalizeDepositPayment({
            referenceId: verified.id,
            outcome: 'failed',
            provider: 'yoo_kassa',
          });
        }
      }
      return NextResponse.json({ received: true });
    }

    if (provider === 'robokassa') {
      const form = await req.formData();
      const outSum = String(form.get('OutSum') || '');
      const invId = String(form.get('InvId') || '');
      const sig = String(form.get('SignatureValue') || '').toUpperCase();
      const shpUuid = String(form.get('Shp_uuid') || '');

      const expected = crypto
        .createHash('md5')
        .update(`${outSum}:${invId}:${acq.rkPassTwo}:Shp_uuid=${shpUuid}`)
        .digest('hex')
        .toUpperCase();

      if (!acq.rkPassTwo || sig !== expected) {
        return new NextResponse('bad sign', { status: 400 });
      }

      await finalizeDepositPayment({
        referenceId: invId,
        paymentUuid: shpUuid,
        outcome: 'completed',
        provider: 'robokassa',
      });
      return new NextResponse(`OK${invId}`, { status: 200 });
    }

    return NextResponse.json({ error: 'Unknown payment provider' }, { status: 404 });
  } catch (err) {
    logger.error({ err, provider }, 'Payment webhook processing failed');
    return NextResponse.json({ error: 'Webhook processing error' }, { status: 400 });
  }
}
