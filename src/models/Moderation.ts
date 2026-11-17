import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { BlacklistType, CensorLevel, ReportStatus, ReportType } from '@/types/enums';

export interface IReportDocument extends Document {
  reporterId: Types.ObjectId;
  reportableId: Types.ObjectId;
  reportableType: ReportType;
  status: ReportStatus;
  reasonIndex: number;
  reporterComment?: string | null;
  reviewerId?: Types.ObjectId | null;
  reviewerNotes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const ReportSchema = new Schema<IReportDocument>(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reportableId: { type: Schema.Types.ObjectId, required: true, index: true },
    reportableType: { type: String, enum: Object.values(ReportType), required: true, index: true },
    status: { type: String, enum: Object.values(ReportStatus), default: ReportStatus.PENDING, index: true },
    reasonIndex: { type: Number, required: true },
    reporterComment: { type: String, default: null },
    reviewerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewerNotes: { type: String, default: null },
  },
  { timestamps: true }
);

export const Report: Model<IReportDocument> =
  mongoose.models.Report || mongoose.model<IReportDocument>('Report', ReportSchema);

export const MODERATION_ACTION_TYPES = [
  'warn',
  'remove_content',
  'suspend',
  'ban',
  'unban',
  'restrict',
  'dismiss_report',
  'resolve_report',
  'delete_user',
  'verify_user',
  'unverify_user',
  'grant_author',
  'revoke_author',
  'set_wallet_balance',
  'approve_product',
  'reject_product',
  'approve_job',
  'reject_job',
  'verify_business',
  'reject_business',
  'approve_ad',
  'reject_ad',
  'pause_ad',
  'publish_ad',
  'blacklist_add',
  'approve_authorship',
  'reject_authorship',
  'approve_cashout',
  'reject_cashout',
  'delete_chat',
  'delete_chat_message',
  'create_group',
  'update_group',
  'broadcast_group_message',
] as const;

export type ModerationActionType = (typeof MODERATION_ACTION_TYPES)[number];

export interface IModerationActionDocument extends Document {
  moderatorId: Types.ObjectId;
  targetUserId?: Types.ObjectId | null;
  targetType: string;
  targetId: string;
  action: ModerationActionType;
  reason: string;
  expiresAt?: Date | null;
  createdAt: Date;
}

const ModerationActionSchema = new Schema<IModerationActionDocument>(
  {
    moderatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    targetType: { type: String, required: true },
    targetId: { type: String, required: true },
    action: {
      type: String,
      enum: MODERATION_ACTION_TYPES,
      required: true,
    },
    reason: { type: String, default: '' },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const ModerationAction: Model<IModerationActionDocument> =
  mongoose.models.ModerationAction ||
  mongoose.model<IModerationActionDocument>('ModerationAction', ModerationActionSchema);

export interface ICensorDocument extends Document {
  word: string;
  level: CensorLevel;
}

const CensorSchema = new Schema<ICensorDocument>({
  word: { type: String, required: true, unique: true, lowercase: true, trim: true },
  level: { type: String, enum: Object.values(CensorLevel), default: CensorLevel.REPLACED },
});

export const Censor: Model<ICensorDocument> =
  mongoose.models.Censor || mongoose.model<ICensorDocument>('Censor', CensorSchema);

export interface IBlacklistDocument extends Document {
  adminId?: Types.ObjectId | null;
  type: BlacklistType;
  blacklistable: string;
  reason?: string | null;
  addedAt: Date;
  expiresAt?: Date | null;
}

const BlacklistSchema = new Schema<IBlacklistDocument>({
  adminId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  type: { type: String, enum: Object.values(BlacklistType), required: true, index: true },
  blacklistable: { type: String, required: true, unique: true, trim: true },
  reason: { type: String, default: null },
  addedAt: { type: Date, default: () => new Date() },
  expiresAt: { type: Date, default: null, index: true },
});

export const Blacklist: Model<IBlacklistDocument> =
  mongoose.models.Blacklist || mongoose.model<IBlacklistDocument>('Blacklist', BlacklistSchema);
