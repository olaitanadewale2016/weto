import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type NotificationCategory = 'all' | 'mentions' | 'important';

export interface INotificationDocument extends Document {
  userId: Types.ObjectId;
  actorId?: Types.ObjectId | null;
  type: string;
  category: NotificationCategory;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
  previewLqip?: string | null;
  data: Record<string, unknown>;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotificationDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    type: { type: String, required: true, index: true },
    category: {
      type: String,
      enum: ['all', 'mentions', 'important'],
      default: 'all',
      index: true,
    },
    title: { type: String, default: '' },
    message: { type: String, required: true },
    entityType: { type: String, default: null },
    entityId: { type: String, default: null },
    actionUrl: { type: String, default: null },
    previewLqip: { type: String, default: null },
    data: { type: Schema.Types.Mixed, default: () => ({}) },
    readAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

NotificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });

export const Notification: Model<INotificationDocument> =
  mongoose.models.Notification ||
  mongoose.model<INotificationDocument>('Notification', NotificationSchema);
