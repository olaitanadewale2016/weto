import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { MediaStatus, MediaType, MediaVisibility } from '@/types/enums';

export type MediaTargetType =
  | 'post'
  | 'story_frame'
  | 'message'
  | 'product'
  | 'ad'
  | 'user_avatar'
  | 'user_cover'
  | 'business_logo'
  | 'business_cover'
  | 'job_attachment'
  | 'system_asset';

export interface IMediaDocument extends Document {
  legacyMysqlId?: number;
  ownerId: Types.ObjectId;
  targetType: MediaTargetType;
  targetId?: Types.ObjectId | null;
  r2Key: string;
  thumbnailR2Key?: string | null;
  externalUrl?: string | null;
  lqipBase64?: string | null;
  type: MediaType;
  status: MediaStatus;
  visibility: MediaVisibility;
  storageProvider: 'r2' | 'external';
  extension: string;
  mime: string;
  sizeBytes: number;
  thumbnailSizeBytes: number;
  order: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const MediaSchema = new Schema<IMediaDocument>(
  {
    legacyMysqlId: { type: Number, index: true, sparse: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetType: {
      type: String,
      enum: [
        'post',
        'story_frame',
        'message',
        'product',
        'ad',
        'user_avatar',
        'user_cover',
        'business_logo',
        'business_cover',
        'job_attachment',
        'system_asset',
      ],
      required: true,
    },
    targetId: { type: Schema.Types.ObjectId, default: null },
    r2Key: { type: String, default: '' },
    thumbnailR2Key: { type: String, default: null },
    externalUrl: { type: String, default: null },
    lqipBase64: { type: String, default: null },
    type: { type: String, enum: Object.values(MediaType), default: MediaType.IMAGE, index: true },
    status: { type: String, enum: Object.values(MediaStatus), default: MediaStatus.PENDING, index: true },
    visibility: { type: String, enum: Object.values(MediaVisibility), default: MediaVisibility.VISIBLE },
    storageProvider: { type: String, enum: ['r2', 'external'], default: 'r2' },
    extension: { type: String, default: '' },
    mime: { type: String, default: '' },
    sizeBytes: { type: Number, default: 0, min: 0 },
    thumbnailSizeBytes: { type: Number, default: 0, min: 0 },
    order: { type: Number, default: 0 },
    metadata: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true }
);

MediaSchema.index({ targetType: 1, targetId: 1, order: 1 });
MediaSchema.index({ r2Key: 1 });

export const Media: Model<IMediaDocument> =
  mongoose.models.Media || mongoose.model<IMediaDocument>('Media', MediaSchema);

export interface IDataStatDocument extends Document {
  mediaType: MediaType;
  storageProvider: string;
  contentSizeBytes: number;
  contentItems: number;
  updatedAt: Date;
}

const DataStatSchema = new Schema<IDataStatDocument>(
  {
    mediaType: { type: String, enum: Object.values(MediaType), required: true },
    storageProvider: { type: String, default: 'r2' },
    contentSizeBytes: { type: Number, default: 0, min: 0 },
    contentItems: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

DataStatSchema.index({ mediaType: 1, storageProvider: 1 }, { unique: true });

export const DataStat: Model<IDataStatDocument> =
  mongoose.models.DataStat || mongoose.model<IDataStatDocument>('DataStat', DataStatSchema);
