import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { ASRStatus, FollowStatus } from '@/types/enums';

export interface IFollowDocument extends Document {
  followerId: Types.ObjectId;
  followingId: Types.ObjectId;
  status: FollowStatus;
  createdAt: Date;
  updatedAt: Date;
}

const FollowSchema = new Schema<IFollowDocument>(
  {
    followerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    followingId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: Object.values(FollowStatus),
      default: FollowStatus.FOLLOWING,
      index: true,
    },
  },
  { timestamps: true }
);

FollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true });
FollowSchema.index({ followingId: 1, status: 1 });

export const Follow: Model<IFollowDocument> =
  mongoose.models.Follow || mongoose.model<IFollowDocument>('Follow', FollowSchema);

export interface IMuteDocument extends Document {
  muterId: Types.ObjectId;
  mutedId: Types.ObjectId;
  createdAt: Date;
}

const MuteSchema = new Schema<IMuteDocument>(
  {
    muterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    mutedId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
MuteSchema.index({ muterId: 1, mutedId: 1 }, { unique: true });

export const Mute: Model<IMuteDocument> =
  mongoose.models.Mute || mongoose.model<IMuteDocument>('Mute', MuteSchema);

export interface IBlockDocument extends Document {
  blockerId: Types.ObjectId;
  blockedId: Types.ObjectId;
  createdAt: Date;
}

const BlockSchema = new Schema<IBlockDocument>(
  {
    blockerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    blockedId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
BlockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
BlockSchema.index({ blockedId: 1, blockerId: 1 });

export const Block: Model<IBlockDocument> =
  mongoose.models.Block || mongoose.model<IBlockDocument>('Block', BlockSchema);

export interface IAuthorshipRequestDocument extends Document {
  userId: Types.ObjectId;
  status: ASRStatus;
  reviewerNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AuthorshipRequestSchema = new Schema<IAuthorshipRequestDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: Object.values(ASRStatus), default: ASRStatus.PENDING, index: true },
    reviewerNotes: { type: String, default: '' },
  },
  { timestamps: true }
);

export const AuthorshipRequest: Model<IAuthorshipRequestDocument> =
  mongoose.models.AuthorshipRequest ||
  mongoose.model<IAuthorshipRequestDocument>('AuthorshipRequest', AuthorshipRequestSchema);

export interface IDeletionFeedbackDocument extends Document {
  feedbackMessage: string;
  username: string;
  fullName: string;
  email: string;
  phone: string;
  registeredAt: Date;
  publications: number;
  followers: number;
  following: number;
  ipAddress: string;
  userAgent: string;
  deletedAt: Date;
}

const DeletionFeedbackSchema = new Schema<IDeletionFeedbackDocument>({
  feedbackMessage: { type: String, default: '' },
  username: { type: String, default: '' },
  fullName: { type: String, default: '' },
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  registeredAt: { type: Date },
  publications: { type: Number, default: 0 },
  followers: { type: Number, default: 0 },
  following: { type: Number, default: 0 },
  ipAddress: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  deletedAt: { type: Date, default: () => new Date() },
});

export const DeletionFeedback: Model<IDeletionFeedbackDocument> =
  mongoose.models.DeletionFeedback ||
  mongoose.model<IDeletionFeedbackDocument>('DeletionFeedback', DeletionFeedbackSchema);
