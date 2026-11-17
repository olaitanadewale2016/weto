import crypto from 'crypto';
import { Types } from 'mongoose';
import { connectDB, withMongoTransaction } from '@/lib/db';
import { Wallet, WalletTransaction, Cashout, IWalletDocument } from '@/models/Finance';
import { User } from '@/models/User';
import {
  CashoutStatus,
  TransactionDirection,
  TransactionStatus,
  TransactionType,
} from '@/types/enums';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/api-response';
import { calculateCommission } from '@/lib/utils';
import { getSettingsGroup } from './settings.service';
import { writeAuditLog } from '@/lib/audit';
import { dispatchNotification } from './notification.service';

export async function generateWalletNumber(prefix = 'W'): Promise<string> {
  const rand = crypto.randomInt(10000000, 99999999);
  const suffix = crypto.randomInt(1000, 9999);
  return `${prefix}-${rand}-${suffix}`;
}

export async function ensureWallet(userId: string | Types.ObjectId): Promise<IWalletDocument> {
  await connectDB();
  const uid = new Types.ObjectId(String(userId));
  const existing = await Wallet.findOne({ userId: uid });
  if (existing) return existing;

  const [walletCfg, appCfg] = await Promise.all([
    getSettingsGroup('wallet'),
    getSettingsGroup('app'),
  ]);

  const walletNumber = await generateWalletNumber(walletCfg.walletNumberPrefix || 'W');
  return Wallet.create({
    userId: uid,
    walletNumber,
    balance: walletCfg.defaultBalance || 0,
    currency: appCfg.defaultCurrency || 'NGN',
  });
}

export async function creditWalletIdempotent(params: {
  userId: string | Types.ObjectId;
  amount: number;
  currency: string;
  transactionType: TransactionType;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}) {
  if (params.amount <= 0) throw new ValidationError('Credit amount must be positive.');

  return withMongoTransaction(async (session) => {
    const existingTx = await WalletTransaction.findOne({
      idempotencyKey: params.idempotencyKey,
    }).session(session);
    if (existingTx) {
      return { duplicate: true, transaction: existingTx };
    }

    const uid = new Types.ObjectId(String(params.userId));
    let wallet = await Wallet.findOne({ userId: uid }).session(session);
    if (!wallet) {
      const [walletCfg, appCfg] = await Promise.all([
        getSettingsGroup('wallet'),
        getSettingsGroup('app'),
      ]);
      const walletNumber = await generateWalletNumber(walletCfg.walletNumberPrefix || 'W');
      const created = await Wallet.create(
        [
          {
            userId: uid,
            walletNumber,
            balance: 0,
            currency: params.currency || appCfg.defaultCurrency || 'NGN',
          },
        ],
        { session }
      );
      wallet = created[0];
    }

    const updatedWallet = await Wallet.findOneAndUpdate(
      { _id: wallet._id },
      { $inc: { balance: Number(params.amount.toFixed(2)) } },
      { new: true, session }
    );

    const [tx] = await WalletTransaction.create(
      [
        {
          walletId: wallet._id,
          userId: uid,
          amount: Number(params.amount.toFixed(2)),
          commission: 0,
          currency: params.currency || wallet.currency,
          transactionType: params.transactionType,
          isInternal: false,
          direction: TransactionDirection.INCOMING,
          status: TransactionStatus.COMPLETED,
          idempotencyKey: params.idempotencyKey,
          metadata: params.metadata ?? {},
        },
      ],
      { session }
    );

    return { duplicate: false, wallet: updatedWallet, transaction: tx };
  });
}

export interface WalletRecipientPreview {
  walletNumber: string;
  user: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    name: string;
    avatar: string;
    verified: boolean;
  };
}

function toRecipientPreview(
  user: {
    _id: unknown;
    username: string;
    firstName?: string | null;
    lastName?: string | null;
    avatar?: string | null;
    verified?: boolean | null;
  },
  walletNumber: string
): WalletRecipientPreview {
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username;
  return {
    walletNumber,
    user: {
      id: String(user._id),
      username: user.username,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      name: fullName,
      avatar: user.avatar || '/assets/avatars/default-avatar.png',
      verified: Boolean(user.verified),
    },
  };
}

export async function lookupWalletRecipient(
  query: string,
  excludeUserId?: string
): Promise<WalletRecipientPreview | null> {
  const clean = query.trim();
  if (!clean) return null;
  await connectDB();

  let walletDoc = await Wallet.findOne({ walletNumber: clean }).lean();
  let targetUser = walletDoc
    ? await User.findById(walletDoc.userId)
        .select('username firstName lastName avatar verified deletedAt')
        .lean()
    : null;

  if (!targetUser) {
    const cleanUsername = clean.replace(/^@/, '').toLowerCase();
    targetUser = await User.findOne({ username: cleanUsername, deletedAt: null })
      .select('username firstName lastName avatar verified')
      .lean();
    if (targetUser) {
      const ensured = await ensureWallet(targetUser._id);
      walletDoc = ensured.toObject();
    }
  }

  if (!targetUser || !walletDoc) return null;
  if (excludeUserId && String(targetUser._id) === String(excludeUserId)) return null;

  return toRecipientPreview(targetUser, walletDoc.walletNumber);
}

export async function getRecentTransferReceivers(
  userId: string,
  limit = 6
): Promise<WalletRecipientPreview[]> {
  await connectDB();
  const uid = new Types.ObjectId(userId);
  const recentTxs = await WalletTransaction.find({
    userId: uid,
    transactionType: TransactionType.TRANSFER,
    direction: TransactionDirection.OUTGOING,
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .select('metadata')
    .lean();

  const seenIds = new Set<string>();
  const receiverIds: string[] = [];
  const walletByReceiver = new Map<string, string>();

  for (const tx of recentTxs) {
    const meta = (tx.metadata || {}) as Record<string, unknown>;
    const rid = typeof meta.receiverId === 'string' ? meta.receiverId : '';
    const rWallet = typeof meta.receiverWalletNumber === 'string' ? meta.receiverWalletNumber : '';
    if (rid && rid !== userId && !seenIds.has(rid)) {
      seenIds.add(rid);
      receiverIds.push(rid);
      if (rWallet) walletByReceiver.set(rid, rWallet);
      if (receiverIds.length >= limit) break;
    }
  }

  if (receiverIds.length === 0) return [];

  const [users, wallets] = await Promise.all([
    User.find({ _id: { $in: receiverIds }, deletedAt: null })
      .select('username firstName lastName avatar verified')
      .lean(),
    Wallet.find({ userId: { $in: receiverIds } }).select('userId walletNumber').lean(),
  ]);

  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const walletMap = new Map(wallets.map((w) => [String(w.userId), w.walletNumber]));

  return receiverIds
    .map((rid) => {
      const u = userMap.get(rid);
      const wn = walletMap.get(rid) || walletByReceiver.get(rid);
      if (!u || !wn) return null;
      return toRecipientPreview(u, wn);
    })
    .filter((item): item is WalletRecipientPreview => item !== null);
}

export async function transferFunds(params: {
  senderId: string;
  receiverWalletNumberOrUsername: string;
  amount: number;
  message?: string;
  idempotencyKey?: string;
}) {
  const walletCfg = await getSettingsGroup('wallet');
  if (!walletCfg.enabled) throw new ValidationError('Wallet transfers are disabled.');
  if (params.amount < walletCfg.transferMinAmount || params.amount > walletCfg.transferMaxAmount) {
    throw new ValidationError(
      `Transfer amount must be between ${walletCfg.transferMinAmount} and ${walletCfg.transferMaxAmount}.`
    );
  }

  await connectDB();
  let receiverWallet: IWalletDocument | null = await Wallet.findOne({
    walletNumber: params.receiverWalletNumberOrUsername.trim(),
  });

  if (!receiverWallet) {
    const cleanUsername = params.receiverWalletNumberOrUsername.replace(/^@/, '').toLowerCase();
    const receiverUser = await User.findOne({ username: cleanUsername, deletedAt: null });
    if (receiverUser) {
      receiverWallet = await ensureWallet(receiverUser._id);
    }
  }

  if (!receiverWallet) {
    throw new NotFoundError('Recipient wallet or user not found.');
  }

  if (String(receiverWallet.userId) === String(params.senderId)) {
    throw new ValidationError('Cannot transfer funds to your own wallet.');
  }

  const [senderUser, receiverUserDoc] = await Promise.all([
    User.findById(params.senderId).select('username firstName lastName').lean(),
    User.findById(receiverWallet.userId).select('username firstName lastName').lean(),
  ]);

  const senderName =
    `${senderUser?.firstName || ''} ${senderUser?.lastName || ''}`.trim() ||
    (senderUser?.username ? `@${senderUser.username}` : 'Wallet User');
  const receiverName =
    `${receiverUserDoc?.firstName || ''} ${receiverUserDoc?.lastName || ''}`.trim() ||
    (receiverUserDoc?.username ? `@${receiverUserDoc.username}` : receiverWallet.walletNumber);

  const cleanNote = params.message?.trim().slice(0, 140) || undefined;
  const { gross, fee, net } = calculateCommission(params.amount, walletCfg.commissionTransfer);
  const idemKey = params.idempotencyKey || `tr_${crypto.randomUUID()}`;
  const tnxRef = `TX-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  const result = await withMongoTransaction(async (session) => {
    const existing = await WalletTransaction.findOne({ idempotencyKey: `${idemKey}_out` }).session(
      session
    );
    if (existing) throw new ConflictError('Duplicate transfer request.');

    // Atomic conditional debit: only succeeds if balance >= gross
    const senderWallet = await Wallet.findOneAndUpdate(
      { userId: new Types.ObjectId(params.senderId), balance: { $gte: gross } },
      { $inc: { balance: -gross } },
      { new: true, session }
    );
    if (!senderWallet) {
      throw new ValidationError('Insufficient wallet balance.');
    }

    const updatedReceiverWallet = await Wallet.findOneAndUpdate(
      { _id: receiverWallet!._id },
      { $inc: { balance: net } },
      { new: true, session }
    );

    const [outTx] = await WalletTransaction.create(
      [
        {
          walletId: senderWallet._id,
          userId: senderWallet.userId,
          amount: gross,
          commission: fee,
          currency: senderWallet.currency,
          transactionType: TransactionType.TRANSFER,
          isInternal: true,
          direction: TransactionDirection.OUTGOING,
          status: TransactionStatus.COMPLETED,
          idempotencyKey: `${idemKey}_out`,
          metadata: {
            tnxId: tnxRef,
            sourceName: receiverName,
            receiverId: String(receiverWallet!.userId),
            receiverUsername: receiverUserDoc?.username || null,
            receiverWalletNumber: receiverWallet!.walletNumber,
            netCredited: net,
            ...(cleanNote ? { message: cleanNote } : {}),
          },
        },
      ],
      { session }
    );

    await WalletTransaction.create(
      [
        {
          walletId: receiverWallet!._id,
          userId: receiverWallet!.userId,
          amount: net,
          commission: fee,
          currency: receiverWallet!.currency,
          transactionType: TransactionType.TRANSFER,
          isInternal: true,
          direction: TransactionDirection.INCOMING,
          status: TransactionStatus.COMPLETED,
          idempotencyKey: `${idemKey}_in`,
          metadata: {
            tnxId: tnxRef,
            sourceName: senderName,
            senderId: params.senderId,
            senderUsername: senderUser?.username || null,
            senderWalletNumber: senderWallet.walletNumber,
            ...(cleanNote ? { message: cleanNote } : {}),
          },
        },
      ],
      { session }
    );

    return { senderWallet, updatedReceiverWallet, outTx };
  });

  await Promise.all([
    writeAuditLog({
      actorId: params.senderId,
      action: 'wallet.transfer',
      targetType: 'wallet',
      targetId: String(receiverWallet._id),
      metadata: { gross, fee, net },
    }),
    dispatchNotification({
      recipientId: receiverWallet.userId,
      actorId: params.senderId,
      type: 'PAYMENT_RECEIVED',
      category: 'important',
      title: 'Payment Received',
      message: `has transferred ${net.toFixed(2)} ${receiverWallet.currency} to your wallet.`,
      actionUrl: '/wallet',
      forceChannels: true,
    }),
  ]);

  return result;
}

export async function requestCashout(params: {
  userId: string;
  amount: number;
  paymentMethod: string;
  credentials: string;
}) {
  const walletCfg = await getSettingsGroup('wallet');
  if (
    params.amount < walletCfg.withdrawMinAmount ||
    params.amount > walletCfg.withdrawMaxAmount
  ) {
    throw new ValidationError(
      `Withdrawal must be between ${walletCfg.withdrawMinAmount} and ${walletCfg.withdrawMaxAmount}.`
    );
  }

  await connectDB();
  const pendingExists = await Cashout.exists({
    userId: new Types.ObjectId(params.userId),
    status: CashoutStatus.PENDING,
  });
  if (pendingExists) {
    throw new ConflictError('You already have a pending withdrawal request.');
  }

  const { gross, fee, net } = calculateCommission(params.amount, walletCfg.commissionWithdraw);
  const requestCode = `CSH-${crypto.randomInt(100000, 999999)}`;

  const cashout = await withMongoTransaction(async (session) => {
    const wallet = await Wallet.findOneAndUpdate(
      { userId: new Types.ObjectId(params.userId), balance: { $gte: gross } },
      { $inc: { balance: -gross } },
      { new: true, session }
    );
    if (!wallet) {
      throw new ValidationError('Insufficient wallet balance.');
    }

    const [created] = await Cashout.create(
      [
        {
          userId: wallet.userId,
          requestCode,
          amount: gross,
          commissionPercentage: walletCfg.commissionWithdraw,
          toPay: net,
          currency: wallet.currency,
          paymentMethod: params.paymentMethod,
          credentials: params.credentials,
          status: CashoutStatus.PENDING,
        },
      ],
      { session }
    );

    await WalletTransaction.create(
      [
        {
          walletId: wallet._id,
          userId: wallet.userId,
          amount: gross,
          commission: fee,
          currency: wallet.currency,
          transactionType: TransactionType.WITHDRAW,
          isInternal: false,
          direction: TransactionDirection.OUTGOING,
          status: TransactionStatus.PENDING,
          idempotencyKey: `cashout_${created._id}`,
          metadata: { requestCode, paymentMethod: params.paymentMethod },
        },
      ],
      { session }
    );

    return created;
  });

  await writeAuditLog({
    actorId: params.userId,
    action: 'wallet.cashout_requested',
    targetType: 'cashout',
    targetId: String(cashout._id),
    metadata: { gross, net, paymentMethod: params.paymentMethod },
  });

  return cashout;
}

export async function reviewCashout(params: {
  adminId: string;
  cashoutId: string;
  decision: 'paid' | 'rejected';
  reviewerNotes?: string;
}) {
  const cashout = await withMongoTransaction(async (session) => {
    const doc = await Cashout.findById(params.cashoutId).session(session);
    if (!doc) throw new NotFoundError('Cashout request not found.');
    if (doc.status !== CashoutStatus.PENDING) {
      throw new ConflictError('Cashout request has already been processed.');
    }

    doc.status = params.decision === 'paid' ? CashoutStatus.PAID : CashoutStatus.REJECTED;
    if (params.reviewerNotes) doc.reviewerNotes = params.reviewerNotes;
    await doc.save({ session });

    if (params.decision === 'rejected') {
      const wallet = await Wallet.findOneAndUpdate(
        { userId: doc.userId },
        { $inc: { balance: doc.amount } },
        { new: true, session }
      );
      if (wallet) {
        await WalletTransaction.create(
          [
            {
              walletId: wallet._id,
              userId: doc.userId,
              amount: doc.amount,
              commission: 0,
              currency: doc.currency,
              transactionType: TransactionType.REFUND,
              isInternal: true,
              direction: TransactionDirection.INCOMING,
              status: TransactionStatus.COMPLETED,
              idempotencyKey: `cashout_refund_${doc._id}`,
              metadata: { requestCode: doc.requestCode, reason: params.reviewerNotes || 'Rejected' },
            },
          ],
          { session }
        );
      }
    } else {
      await WalletTransaction.updateOne(
        { idempotencyKey: `cashout_${doc._id}` },
        { $set: { status: TransactionStatus.COMPLETED } }
      ).session(session);
    }

    return doc;
  });

  await Promise.all([
    writeAuditLog({
      actorId: params.adminId,
      action: `admin.cashout_${params.decision}`,
      targetType: 'cashout',
      targetId: String(cashout._id),
      metadata: { amount: cashout.amount, reviewerNotes: params.reviewerNotes },
    }),
    dispatchNotification({
      recipientId: cashout.userId,
      type: `CASHOUT_${params.decision.toUpperCase()}`,
      category: 'important',
      title: params.decision === 'paid' ? 'Withdrawal Paid' : 'Withdrawal Rejected',
      message:
        params.decision === 'paid'
          ? `Your withdrawal ${cashout.requestCode} for ${cashout.toPay} ${cashout.currency} has been marked as paid.`
          : `Your withdrawal ${cashout.requestCode} was rejected and ${cashout.amount} ${cashout.currency} has been returned to your wallet.`,
      actionUrl: '/wallet',
      forceChannels: true,
    }),
  ]);

  return cashout;
}

/** Atomically settles a paid group entry fee or member tip from payer wallet to group owner wallet */
export async function settleGroupWalletPayment(params: {
  payerId: string;
  ownerId: string;
  chatId: string;
  groupName: string;
  amount: number;
  kind: 'group_entry' | 'group_tip';
  note?: string;
  idempotencyKey?: string;
}) {
  const cleanAmount = Number(Number(params.amount).toFixed(2));
  if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
    throw new ValidationError('Payment amount must be positive.');
  }
  if (String(params.payerId) === String(params.ownerId)) {
    return { skippedOwnGroup: true, gross: 0, net: 0, fee: 0, tnxRef: null };
  }

  await connectDB();
  const [walletCfg, appCfg] = await Promise.all([
    getSettingsGroup('wallet'),
    getSettingsGroup('app'),
  ]);
  if (!walletCfg.enabled) throw new ValidationError('Wallet payments are currently disabled.');

  const ownerWalletDoc = await ensureWallet(params.ownerId);
  const { gross, fee, net } = calculateCommission(cleanAmount, walletCfg.commissionTransfer || 0);
  const idemKey = params.idempotencyKey || `grp_${params.kind}_${params.chatId}_${params.payerId}_${crypto.randomUUID()}`;
  const tnxRef = `GRP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const currency = ownerWalletDoc.currency || appCfg.defaultCurrency || 'NGN';

  await withMongoTransaction(async (session) => {
    const existing = await WalletTransaction.findOne({ idempotencyKey: `${idemKey}_out` }).session(
      session
    );
    if (existing) return;

    const payerWallet = await Wallet.findOneAndUpdate(
      { userId: new Types.ObjectId(params.payerId), balance: { $gte: gross } },
      { $inc: { balance: -gross } },
      { new: true, session }
    );
    if (!payerWallet) {
      throw new ValidationError(
        `Insufficient wallet balance (${gross.toLocaleString()} ${currency} required). Top up in Wallet to continue.`
      );
    }

    await Wallet.findOneAndUpdate(
      { _id: ownerWalletDoc._id },
      { $inc: { balance: net } },
      { new: true, session }
    );

    const commonMeta = {
      kind: params.kind,
      chatId: params.chatId,
      groupName: params.groupName,
      payerId: params.payerId,
      ownerId: params.ownerId,
      note: params.note || undefined,
      fee,
      tnxRef,
    };

    await WalletTransaction.create(
      [
        {
          walletId: payerWallet._id,
          userId: new Types.ObjectId(params.payerId),
          amount: gross,
          commission: fee,
          currency,
          transactionType: TransactionType.PAYMENT,
          isInternal: true,
          direction: TransactionDirection.OUTGOING,
          status: TransactionStatus.COMPLETED,
          idempotencyKey: `${idemKey}_out`,
          metadata: commonMeta,
        },
        {
          walletId: ownerWalletDoc._id,
          userId: new Types.ObjectId(params.ownerId),
          amount: net,
          commission: fee,
          currency,
          transactionType: TransactionType.PAYMENT,
          isInternal: true,
          direction: TransactionDirection.INCOMING,
          status: TransactionStatus.COMPLETED,
          idempotencyKey: `${idemKey}_in`,
          metadata: commonMeta,
        },
      ],
      { session }
    );
  });

  await dispatchNotification({
    recipientId: params.ownerId,
    actorId: params.payerId,
    type: 'GROUP_MONETIZATION',
    category: 'important',
    title: params.kind === 'group_entry' ? 'Paid Group Member Joined' : 'Group Tip Received',
    message:
      params.kind === 'group_entry'
        ? `You earned ${net.toLocaleString()} ${currency} from a new paid member in ${params.groupName}.`
        : `You received a ${net.toLocaleString()} ${currency} tip in ${params.groupName}.`,
    actionUrl: `/messenger/c/${params.chatId}`,
  }).catch(() => undefined);

  return { skippedOwnGroup: false, gross, net, fee, tnxRef, currency };
}
