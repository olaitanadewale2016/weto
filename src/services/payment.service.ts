import crypto from 'crypto';
import Stripe from 'stripe';
import { connectDB } from '@/lib/db';
import { Payment } from '@/models/Finance';
import { User } from '@/models/User';
import { PaymentStatus, PaymentType, TransactionType } from '@/types/enums';
import { getSettingsGroup } from './settings.service';
import { creditWalletIdempotent } from './wallet.service';
import { dispatchNotification } from './notification.service';
import { ValidationError } from '@/lib/api-response';
import { writeAuditLog } from '@/lib/audit';
import { getAppBaseUrl } from '@/lib/env';

export type PaymentDriverName = 'paystack' | 'stripe' | 'paypal' | 'yoo_kassa' | 'robokassa';

export interface InitiateDepositResult {
  paymentUuid: string;
  referenceId: string;
  checkoutUrl: string;
  provider: PaymentDriverName;
}

export async function getEnabledPaymentProviders() {
  const acq = await getSettingsGroup('acquiring');
  return [
    {
      id: 'paystack' as const,
      key: 'paystack' as const,
      name: acq.paystackName || 'Paystack',
      enabled: Boolean(acq.paystackStatus && acq.paystackSecretKey),
      logo: '/assets/payments/paystack.png',
    },
    {
      id: 'stripe' as const,
      key: 'stripe' as const,
      name: acq.stripeName || 'Stripe',
      enabled: Boolean(acq.stripeStatus && acq.stripeSecretKey),
      logo: '/assets/payments/stripe.png',
    },
    {
      id: 'paypal' as const,
      key: 'paypal' as const,
      name: acq.paypalName || 'PayPal',
      enabled: Boolean(acq.paypalStatus && acq.paypalClientId && acq.paypalSecretKey),
      logo: '/assets/payments/paypal.png',
    },
    {
      id: 'yoo_kassa' as const,
      key: 'yoo_kassa' as const,
      name: acq.ykName || 'YooKassa',
      enabled: Boolean(acq.ykStatus && acq.ykShopId && acq.ykSecretKey),
      logo: '/assets/payments/yookassa.png',
    },
    {
      id: 'robokassa' as const,
      key: 'robokassa' as const,
      name: acq.rkName || 'RoboKassa',
      enabled: Boolean(acq.rkStatus && acq.rkMerchantLogin && acq.rkPassOne),
      logo: '/assets/payments/robokassa.png',
    },
  ];
}

export async function initiateWalletDeposit(params: {
  userId: string;
  amount: number;
  provider: PaymentDriverName;
  currency?: string;
}): Promise<InitiateDepositResult> {
  const [walletCfg, appCfg, acq] = await Promise.all([
    getSettingsGroup('wallet'),
    getSettingsGroup('app'),
    getSettingsGroup('acquiring'),
  ]);

  if (!walletCfg.enabled) throw new ValidationError('Wallet is currently disabled.');
  if (params.amount < walletCfg.depositMinAmount || params.amount > walletCfg.depositMaxAmount) {
    throw new ValidationError(
      `Deposit must be between ${walletCfg.depositMinAmount} and ${walletCfg.depositMaxAmount}.`
    );
  }

  await connectDB();
  const baseUrl = getAppBaseUrl();
  const currency = (params.currency || appCfg.defaultCurrency || 'USD').toUpperCase();
  const paymentUuid: string = crypto.randomUUID();

  let referenceId: string = paymentUuid;
  let checkoutUrl = '';

  if (params.provider === 'paystack') {
    if (!acq.paystackStatus || !acq.paystackSecretKey) {
      throw new ValidationError('Paystack payment gateway is not configured.');
    }
    const payer = await User.findById(params.userId).select('email').lean();
    const email = payer?.email || `user-${params.userId}@weto.app`;
    const psCurrency = (acq.paystackCurrency || currency || 'NGN').toUpperCase();
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${acq.paystackSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: Math.round(params.amount * 100),
        currency: psCurrency,
        reference: paymentUuid,
        callback_url: `${baseUrl}/api/v1/payments/callback/paystack`,
        metadata: {
          paymentUuid,
          userId: params.userId,
          paymentType: PaymentType.DEPOSIT,
        },
      }),
    });
    const psJson = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: { authorization_url?: string; reference?: string };
    };
    if (!res.ok || !psJson.status || !psJson.data?.authorization_url) {
      throw new ValidationError(psJson.message || 'Failed to initialize Paystack checkout.');
    }
    referenceId = psJson.data.reference || paymentUuid;
    checkoutUrl = psJson.data.authorization_url;
  } else if (params.provider === 'stripe') {
    if (!acq.stripeStatus || !acq.stripeSecretKey) {
      throw new ValidationError('Stripe payment gateway is not configured.');
    }
    const zeroDecimalCurrencies = new Set([
      'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA',
      'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
    ]);
    const unitAmount = zeroDecimalCurrencies.has(currency)
      ? Math.round(params.amount)
      : Math.round(params.amount * 100);
    const stripe = new Stripe(acq.stripeSecretKey);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: { name: `${appCfg.name} Wallet Deposit` },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      metadata: { paymentUuid, userId: params.userId, paymentType: PaymentType.DEPOSIT },
      success_url: `${baseUrl}/api/v1/payments/callback/stripe?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/wallet?deposit=cancelled`,
    });
    if (!session.url) {
      throw new ValidationError('Failed to initialize Stripe checkout session.');
    }
    referenceId = session.id;
    checkoutUrl = session.url;
  } else if (params.provider === 'paypal') {
    if (!acq.paypalStatus || !acq.paypalClientId || !acq.paypalSecretKey) {
      throw new ValidationError('PayPal payment gateway is not configured.');
    }
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
    const tokenJson = (await tokenRes.json()) as { access_token?: string; error_description?: string };
    if (!tokenRes.ok || !tokenJson.access_token) {
      throw new ValidationError(tokenJson.error_description || 'Failed to authenticate with PayPal.');
    }

    const orderRes = await fetch(`${ppBase}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            custom_id: paymentUuid,
            amount: { currency_code: currency, value: params.amount.toFixed(2) },
          },
        ],
        application_context: {
          return_url: `${baseUrl}/api/v1/payments/callback/paypal?action=success&paymentUuid=${paymentUuid}`,
          cancel_url: `${baseUrl}/api/v1/payments/callback/paypal?action=cancel&paymentUuid=${paymentUuid}`,
        },
      }),
    });
    const orderJson = (await orderRes.json()) as {
      id?: string;
      message?: string;
      links?: Array<{ rel: string; href: string }>;
    };
    const approveUrl = orderJson.links?.find((l) => l.rel === 'approve')?.href;
    if (!orderRes.ok || !orderJson.id || !approveUrl) {
      throw new ValidationError(orderJson.message || 'Failed to initialize PayPal checkout order.');
    }
    referenceId = orderJson.id;
    checkoutUrl = approveUrl;
  } else if (params.provider === 'yoo_kassa') {
    if (!acq.ykStatus || !acq.ykShopId || !acq.ykSecretKey) {
      throw new ValidationError('YooKassa payment gateway is not configured.');
    }
    const ykCurrency = acq.ykCurrency || 'RUB';
    const res = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${acq.ykShopId}:${acq.ykSecretKey}`).toString('base64')}`,
        'Idempotence-Key': paymentUuid,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: { value: params.amount.toFixed(2), currency: ykCurrency },
        confirmation: {
          type: 'redirect',
          return_url: `${baseUrl}/api/v1/payments/callback/yookassa?paymentUuid=${paymentUuid}`,
        },
        capture: true,
        description: `${appCfg.name} Wallet Deposit`,
        metadata: { paymentUuid, userId: params.userId },
      }),
    });
    const ykJson = (await res.json()) as {
      id?: string;
      description?: string;
      confirmation?: { confirmation_url?: string };
    };
    if (!res.ok || !ykJson.id || !ykJson.confirmation?.confirmation_url) {
      throw new ValidationError(ykJson.description || 'Failed to initialize YooKassa payment.');
    }
    referenceId = ykJson.id;
    checkoutUrl = ykJson.confirmation.confirmation_url;
  } else if (params.provider === 'robokassa') {
    if (!acq.rkStatus || !acq.rkMerchantLogin || !acq.rkPassOne) {
      throw new ValidationError('RoboKassa payment gateway is not configured.');
    }
    const invId = crypto.randomInt(100000, 999999999);
    const outSum = params.amount.toFixed(2);
    const sigStr = `${acq.rkMerchantLogin}:${outSum}:${invId}:${acq.rkPassOne}:Shp_uuid=${paymentUuid}`;
    const signature = crypto.createHash('md5').update(sigStr).digest('hex');
    referenceId = String(invId);
    const qs = new URLSearchParams({
      MerchantLogin: acq.rkMerchantLogin,
      OutSum: outSum,
      InvId: String(invId),
      Description: `${appCfg.name} Wallet Deposit`,
      SignatureValue: signature,
      Shp_uuid: paymentUuid,
      ...(acq.rkMode === 'test' ? { IsTest: '1' } : {}),
    });
    checkoutUrl = `https://auth.robokassa.ru/Merchant/Index.aspx?${qs.toString()}`;
  }

  await Payment.create({
    userId: params.userId,
    paymentUuid,
    referenceId,
    paymentType: PaymentType.DEPOSIT,
    paymentMethod: params.provider,
    status: PaymentStatus.PENDING,
    amount: params.amount,
    currency,
    description: `${appCfg.name} Wallet Deposit`,
    idempotencyKey: `pay_${paymentUuid}`,
  });

  return { paymentUuid, referenceId, checkoutUrl, provider: params.provider };
}

export async function finalizeDepositPayment(params: {
  referenceId?: string;
  paymentUuid?: string;
  outcome: 'completed' | 'failed' | 'expired' | 'refunded';
  provider: string;
}) {
  await connectDB();
  const payment = await Payment.findOne(
    params.paymentUuid
      ? { paymentUuid: params.paymentUuid }
      : { referenceId: params.referenceId }
  );
  if (!payment) return { handled: false, reason: 'payment_not_found' };

  if (params.outcome === 'completed') {
    if (payment.status === PaymentStatus.COMPLETED) {
      return { handled: true, duplicate: true };
    }

    await creditWalletIdempotent({
      userId: payment.userId,
      amount: payment.amount,
      currency: payment.currency,
      transactionType: TransactionType.DEPOSIT,
      idempotencyKey: `deposit_${payment.paymentUuid}`,
      metadata: {
        paymentUuid: payment.paymentUuid,
        referenceId: payment.referenceId,
        provider: params.provider,
      },
    });

    payment.status = PaymentStatus.COMPLETED;
    await payment.save();

    await Promise.all([
      writeAuditLog({
        actorId: payment.userId,
        action: 'payment.deposit_completed',
        targetType: 'payment',
        targetId: String(payment._id),
        metadata: { amount: payment.amount, currency: payment.currency, provider: params.provider },
      }),
      dispatchNotification({
        recipientId: payment.userId,
        type: 'WALLET_DEPOSIT',
        category: 'important',
        title: 'Wallet Deposit Confirmed',
        message: `${payment.amount.toFixed(2)} ${payment.currency} has been credited to your wallet via ${params.provider}.`,
        actionUrl: '/wallet',
        forceChannels: true,
      }),
    ]);

    return { handled: true, duplicate: false };
  }

  if (params.outcome === 'failed') {
    payment.status = PaymentStatus.FAILED;
    await payment.save();
  } else if (params.outcome === 'expired') {
    payment.status = PaymentStatus.EXPIRED;
    await payment.save();
  } else if (params.outcome === 'refunded') {
    payment.status = PaymentStatus.REFUNDED;
    await payment.save();
  }

  return { handled: true };
}
