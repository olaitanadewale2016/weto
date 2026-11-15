import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { ConfirmationType } from '@/types/enums';

export interface IVerificationDocument extends Document {
  userId?: Types.ObjectId | null;
  identifier: string;
  type: ConfirmationType;
  codeHash: string;
  confirmed: boolean;
  expiresAt: Date;
  createdAt: Date;
}

const VerificationSchema = new Schema<IVerificationDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    identifier: { type: String, required: true, index: true },
    type: { type: String, enum: Object.values(ConfirmationType), required: true },
    codeHash: { type: String, required: true },
    confirmed: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

VerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Verification: Model<IVerificationDocument> =
  mongoose.models.Verification ||
  mongoose.model<IVerificationDocument>('Verification', VerificationSchema);
