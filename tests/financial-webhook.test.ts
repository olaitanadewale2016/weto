import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/services/settings.service', () => ({
  getSettingsGroup: vi.fn(async () => ({
    stripeSecretKey: '',
    stripeWebhookSecret: '',
    paypalClientId: '',
    paypalSecretKey: '',
    paypalWebhookId: '',
    rkMerchantLogin: 'demo_merchant',
    rkPassTwo: 'secret_pass_two',
  })),
}));

vi.mock('@/services/payment.service', () => ({
  finalizeDepositPayment: vi.fn(async () => ({ ok: true })),
}));

import { POST as webhookPost } from '@/app/api/v1/payments/webhook/[provider]/route';
import { GET as mediaProxyGet } from '@/app/api/v1/media/proxy/route';

describe('Payment Webhook Security & Media Proxy Guardrails', () => {
  it('rejects Stripe webhook without signature or configured secrets', async () => {
    const req = new NextRequest('https://app.example.com/api/v1/payments/webhook/stripe', {
      method: 'POST',
      body: '{}',
    });
    const res = await webhookPost(req, { params: Promise.resolve({ provider: 'stripe' }) });
    expect(res.status).toBe(400);
  });

  it('rejects RoboKassa webhook with invalid MD5 signature', async () => {
    const form = new URLSearchParams({
      OutSum: '50.00',
      InvId: '12345',
      SignatureValue: 'INVALID_SIG',
      Shp_uuid: 'pay_uuid_1',
    });
    const req = new NextRequest('https://app.example.com/api/v1/payments/webhook/robokassa', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const res = await webhookPost(req, { params: Promise.resolve({ provider: 'robokassa' }) });
    expect(res.status).not.toBe(200);
  });

  it('blocks path traversal keys on media proxy endpoint', async () => {
    const req = new NextRequest('https://app.example.com/api/v1/media/proxy?key=../secret.json');
    const res = await mediaProxyGet(req);
    expect(res.status).toBe(422);
  });
});
