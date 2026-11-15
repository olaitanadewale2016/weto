import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess } from '@/lib/api-response';
import { Cashout, WalletTransaction } from '@/models/Finance';
import {
  ensureWallet,
  getRecentTransferReceivers,
  lookupWalletRecipient,
  requestCashout,
  transferFunds,
} from '@/services/wallet.service';
import { getEnabledPaymentProviders, initiateWalletDeposit } from '@/services/payment.service';
import { getSettingsGroup } from '@/services/settings.service';

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const lookupQuery = new URL(req.url).searchParams.get('lookup');
    if (lookupQuery !== null) {
      const recipient = await lookupWalletRecipient(lookupQuery, String(user._id));
      return apiSuccess({ recipient });
    }

    const [wallet, transactions, cashouts, providers, walletCfg, recentReceivers] = await Promise.all([
      ensureWallet(user._id),
      WalletTransaction.find({ userId: user._id }).sort({ createdAt: -1 }).limit(50).lean(),
      Cashout.find({ userId: user._id }).sort({ createdAt: -1 }).limit(20).lean(),
      getEnabledPaymentProviders(),
      getSettingsGroup('wallet'),
      getRecentTransferReceivers(String(user._id)),
    ]);

    const normalizedCashoutMethods = (walletCfg.cashoutMethods || []).map((m) =>
      typeof m === 'string'
        ? { key: m.toLowerCase().replace(/\s+/g, '_'), name: m }
        : m
    );
    const enabledProviders = providers.filter((p) => p.enabled);

    return apiSuccess({
      wallet: {
        id: String(wallet._id),
        walletNumber: wallet.walletNumber,
        balance: wallet.balance,
        currency: wallet.currency,
      },
      limits: {
        depositMin: walletCfg.depositMinAmount,
        depositMax: walletCfg.depositMaxAmount,
        transferMin: walletCfg.transferMinAmount,
        transferMax: walletCfg.transferMaxAmount,
        withdrawMin: walletCfg.withdrawMinAmount,
        withdrawMax: walletCfg.withdrawMaxAmount,
        commissionTransfer: walletCfg.commissionTransfer,
        commissionWithdraw: walletCfg.commissionWithdraw,
        cashoutMethods: normalizedCashoutMethods,
      },
      providers: enabledProviders,
      recentReceivers,
      transactions: transactions.map((t) => {
        const meta = (t.metadata || {}) as Record<string, unknown>;
        return {
          ...t,
          id: String(t._id),
          tnxId: (typeof meta.tnxId === 'string' && meta.tnxId) || String(t._id).slice(-10).toUpperCase(),
          sourceName:
            (typeof meta.sourceName === 'string' && meta.sourceName) ||
            (typeof meta.provider === 'string' && meta.provider) ||
            (typeof meta.paymentMethod === 'string' && meta.paymentMethod) ||
            'Wallet',
          note: typeof meta.message === 'string' ? meta.message : null,
        };
      }),
      cashouts: cashouts.map((c) => ({ ...c, id: String(c._id) })),
    });
  } catch (err) {
    return apiError(err);
  }
}

const walletActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('deposit'),
    amount: z.number().positive(),
    provider: z.enum(['paystack', 'stripe', 'paypal', 'yoo_kassa', 'robokassa']),
    currency: z.string().optional(),
  }),
  z.object({
    action: z.literal('transfer'),
    recipient: z.string().min(2),
    amount: z.number().positive(),
    message: z.string().max(140).optional(),
    idempotencyKey: z.string().optional(),
  }),
  z.object({
    action: z.literal('cashout'),
    amount: z.number().positive(),
    paymentMethod: z.string().min(2),
    credentials: z.string().min(3).max(255),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const body = walletActionSchema.parse(await req.json());

    if (body.action === 'deposit') {
      const result = await initiateWalletDeposit({
        userId: String(user._id),
        amount: body.amount,
        provider: body.provider,
        currency: body.currency,
      });
      return apiSuccess(result, undefined, 201);
    }

    if (body.action === 'transfer') {
      const result = await transferFunds({
        senderId: String(user._id),
        receiverWalletNumberOrUsername: body.recipient,
        amount: body.amount,
        message: body.message,
        idempotencyKey: body.idempotencyKey,
      });
      return apiSuccess({
        newBalance: result.senderWallet.balance,
        transactionId: String(result.outTx._id),
      });
    }

    if (body.action === 'cashout') {
      const cashout = await requestCashout({
        userId: String(user._id),
        amount: body.amount,
        paymentMethod: body.paymentMethod,
        credentials: body.credentials,
      });
      return apiSuccess(cashout, undefined, 201);
    }

    return apiSuccess({});
  } catch (err) {
    return apiError(err);
  }
}
