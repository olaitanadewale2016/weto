import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { StoryPrivacy, StoryStatus, StoryType } from '@/types/enums';

export interface IStoryFrameDocument extends Document {
  _id: Types.ObjectId;
  storyUuid: string;
  userId: Types.ObjectId;
  content?: string | null;
  status: StoryStatus;
  type: StoryType;
  privacy: StoryPrivacy;
  allowedUserIds: Types.ObjectId[];
  viewsCount: number;
  isHighlight: boolean;
  durationSeconds: number;
  mediaId?: Types.ObjectId | null;
  meta: Record<string, unknown>;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const StoryFrameSchema = new Schema<IStoryFrameDocument>(
  {
    storyUuid: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    content: { type: String, default: null },
    status: {
      type: String,
      enum: Object.values(StoryStatus),
      default: StoryStatus.DRAFT,
      index: true,
    },
    type: { type: String, enum: Object.values(StoryType), default: StoryType.IMAGE },
    privacy: { type: String, enum: Object.values(StoryPrivacy), default: StoryPrivacy.ALL },
    allowedUserIds: { type: [Schema.Types.ObjectId], default: [] },
    viewsCount: { type: Number, default: 0, min: 0 },
    isHighlight: { type: Boolean, default: false, index: true },
    durationSeconds: { type: Number, default: 5 },
    mediaId: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    meta: { type: Schema.Types.Mixed, default: () => ({}) },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

StoryFrameSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
StoryFrameSchema.index({ userId: 1, status: 1, expiresAt: -1 });

export const StoryFrame: Model<IStoryFrameDocument> =
  mongoose.models.StoryFrame || mongoose.model<IStoryFrameDocument>('StoryFrame', StoryFrameSchema);

export interface IStoryViewDocument extends Document {
  storyFrameId: Types.ObjectId;
  userId: Types.ObjectId;
  reaction?: string | null;
  viewedAt: Date;
}

const StoryViewSchema = new Schema<IStoryViewDocument>({
  storyFrameId: { type: Schema.Types.ObjectId, ref: 'StoryFrame', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reaction: { type: String, default: null },
  viewedAt: { type: Date, default: () => new Date() },
});

StoryViewSchema.index({ storyFrameId: 1, userId: 1 }, { unique: true });

export const StoryView: Model<IStoryViewDocument> =
  mongoose.models.StoryView || mongoose.model<IStoryViewDocument>('StoryView', StoryViewSchema);
