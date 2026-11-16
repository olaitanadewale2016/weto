import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import {
  AdApproval,
  AdStatus,
  CashoutStatus,
  PaymentStatus,
  PaymentType,
  TransactionDirection,
  TransactionStatus,
  TransactionType,
} from '@/types/enums';

export interface IWalletDocument extends Document {
  userId: Types.ObjectId;
  walletNumber: string;
  balance: number; // Stored in major currency units with 2-decimal precision; calculations done in minor integer cents
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

const WalletSchema = new Schema<IWalletDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    walletNumber: { type: String, required: true, unique: true },
    balance: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'USD' },
  },
  { timestamps: true }
);

export const Wallet: Model<IWalletDocument> =
  mongoose.models.Wallet || mongoose.model<IWalletDocument>('Wallet', WalletSchema);

export interface IWalletTransactionDocument extends Document {
  walletId: Types.ObjectId;
  userId: Types.ObjectId;
  amount: number;
  commission: number;
  currency: string;
  transactionType: TransactionType;
  isInternal: boolean;
  direction: TransactionDirection;
  status: TransactionStatus;
  idempotencyKey?: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const WalletTransactionSchema = new Schema<IWalletTransactionDocument>(
  {
    walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    commission: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'USD' },
    transactionType: { type: String, enum: Object.values(TransactionType), required: true },
    isInternal: { type: Boolean, default: false },
    direction: { type: String, enum: Object.values(TransactionDirection), required: true },
    status: {
      type: String,
      enum: Object.values(TransactionStatus),
      default: TransactionStatus.COMPLETED,
    },
    idempotencyKey: { type: String, unique: true, sparse: true },
    metadata: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

WalletTransactionSchema.index({ walletId: 1, createdAt: -1 });

export const WalletTransaction: Model<IWalletTransactionDocument> =
  mongoose.models.WalletTransaction ||
  mongoose.model<IWalletTransactionDocument>('WalletTransaction', WalletTransactionSchema);

export interface IPaymentDocument extends Document {
  userId: Types.ObjectId;
  paymentUuid: string;
  referenceId?: string | null;
  paymentType: PaymentType;
  paymentMethod: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  description?: string | null;
  idempotencyKey?: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPaymentDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    paymentUuid: { type: String, required: true, unique: true },
    referenceId: { type: String, default: null, index: true },
    paymentType: { type: String, enum: Object.values(PaymentType), default: PaymentType.DEPOSIT },
    paymentMethod: { type: String, required: true },
    status: { type: String, enum: Object.values(PaymentStatus), default: PaymentStatus.PENDING, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD' },
    description: { type: String, default: null },
    idempotencyKey: { type: String, unique: true, sparse: true },
    metadata: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true }
);

export const Payment: Model<IPaymentDocument> =
  mongoose.models.Payment || mongoose.model<IPaymentDocument>('Payment', PaymentSchema);

export interface ICashoutDocument extends Document {
  userId: Types.ObjectId;
  requestCode: string;
  amount: number;
  commissionPercentage: number;
  toPay: number;
  currency: string;
  paymentMethod: string;
  credentials: string;
  reviewerNotes?: string | null;
  status: CashoutStatus;
  createdAt: Date;
  updatedAt: Date;
}

const CashoutSchema = new Schema<ICashoutDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    requestCode: { type: String, required: true, unique: true },
    amount: { type: Number, required: true, min: 0 },
    commissionPercentage: { type: Number, default: 0 },
    toPay: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD' },
    paymentMethod: { type: String, required: true },
    credentials: { type: String, required: true },
    reviewerNotes: { type: String, default: null },
    status: { type: String, enum: Object.values(CashoutStatus), default: CashoutStatus.PENDING, index: true },
  },
  { timestamps: true }
);

export const Cashout: Model<ICashoutDocument> =
  mongoose.models.Cashout || mongoose.model<ICashoutDocument>('Cashout', CashoutSchema);

export interface IAdDocument extends Document {
  userId: Types.ObjectId;
  title?: string | null;
  content?: string | null;
  ctaText?: string | null;
  status: AdStatus;
  type?: string | null;
  totalBudget: number;
  allocatedBudget?: number;
  spentBudget: number;
  pricePerView: number;
  targetUrl?: string | null;
  mediaId?: Types.ObjectId | null;
  approval: AdApproval;
  viewsCount: number;
  clicksCount: number;
  dailySpent?: number;
  dailySpentDate?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  lastShowAt?: Date | null;
  lastChargeAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const AdSchema = new Schema<IAdDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, default: null },
    content: { type: String, default: null },
    ctaText: { type: String, default: null },
    status: { type: String, enum: Object.values(AdStatus), default: AdStatus.DRAFT, index: true },
    type: { type: String, default: 'feed' },
    totalBudget: { type: Number, default: 0, min: 0 },
    allocatedBudget: { type: Number, default: 0, min: 0 },
    spentBudget: { type: Number, default: 0, min: 0 },
    pricePerView: { type: Number, default: 25, min: 0 },
    targetUrl: { type: String, default: null },
    mediaId: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    approval: { type: String, enum: Object.values(AdApproval), default: AdApproval.PENDING, index: true },
    viewsCount: { type: Number, default: 0, min: 0 },
    clicksCount: { type: Number, default: 0, min: 0 },
    dailySpent: { type: Number, default: 0, min: 0 },
    dailySpentDate: { type: String, default: null },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    lastShowAt: { type: Date, default: null },
    lastChargeAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Compound indexes for multi-bucket O(log N) ad auction retrieval at 10,000+ campaigns scale
AdSchema.index({ status: 1, approval: 1, lastShowAt: 1, pricePerView: -1 });
AdSchema.index({ status: 1, approval: 1, pricePerView: -1, clicksCount: -1 });
AdSchema.index({ status: 1, approval: 1, viewsCount: 1, createdAt: -1 });
AdSchema.index({ status: 1, approval: 1, createdAt: -1 });

export const Ad: Model<IAdDocument> =
  mongoose.models.Ad || mongoose.model<IAdDocument>('Ad', AdSchema);

export interface IAuditLogDocument extends Document {
  actorId?: Types.ObjectId | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLogDocument>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    action: { type: String, required: true, index: true },
    targetType: { type: String, default: null },
    targetId: { type: String, default: null },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ createdAt: -1 });

export const AuditLog: Model<IAuditLogDocument> =
  mongoose.models.AuditLog || mongoose.model<IAuditLogDocument>('AuditLog', AuditLogSchema);

export interface ICreatorSubscriptionDocument extends Document {
  creatorId: Types.ObjectId;
  subscriberId: Types.ObjectId;
  amount: number;
  currency: string;
  status: 'active' | 'cancelled';
  lastPaidAt: Date;
  currentPeriodEnd: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CreatorSubscriptionSchema = new Schema<ICreatorSubscriptionDocument>(
  {
    creatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subscriberId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD' },
    status: { type: String, enum: ['active', 'cancelled'], default: 'active', index: true },
    lastPaidAt: { type: Date, default: () => new Date() },
    currentPeriodEnd: { type: Date, required: true },
  },
  { timestamps: true }
);

CreatorSubscriptionSchema.index({ creatorId: 1, subscriberId: 1 }, { unique: true });

export const CreatorSubscription: Model<ICreatorSubscriptionDocument> =
  mongoose.models.CreatorSubscription ||
  mongoose.model<ICreatorSubscriptionDocument>('CreatorSubscription', CreatorSubscriptionSchema);
