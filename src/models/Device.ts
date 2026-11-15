import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IDeviceDocument extends Document {
  userId: Types.ObjectId;
  deviceHash: string;
  fcmToken?: string | null;
  pushEnabled: boolean;
  platform: string;
  platformVersion?: string | null;
  browser: string;
  browserVersion?: string | null;
  ipAddress: string;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  timezone?: string | null;
  userAgent?: string | null;
  platformType: 'desktop' | 'mobile' | 'tablet';
  lastOnline: Date;
  isTerminated: boolean;
  isLocationUnknown: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceSchema = new Schema<IDeviceDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deviceHash: { type: String, required: true },
    fcmToken: { type: String, default: null, sparse: true, index: true },
    pushEnabled: { type: Boolean, default: false },
    platform: { type: String, default: 'Unknown' },
    platformVersion: { type: String, default: null },
    browser: { type: String, default: 'Unknown' },
    browserVersion: { type: String, default: null },
    ipAddress: { type: String, default: '0.0.0.0' },
    country: { type: String, default: null },
    region: { type: String, default: null },
    city: { type: String, default: null },
    timezone: { type: String, default: null },
    userAgent: { type: String, default: null },
    platformType: { type: String, enum: ['desktop', 'mobile', 'tablet'], default: 'desktop' },
    lastOnline: { type: Date, default: () => new Date() },
    isTerminated: { type: Boolean, default: false },
    isLocationUnknown: { type: Boolean, default: false },
  },
  { timestamps: true }
);

DeviceSchema.index({ userId: 1, deviceHash: 1 }, { unique: true });

export const Device: Model<IDeviceDocument> =
  mongoose.models.Device || mongoose.model<IDeviceDocument>('Device', DeviceSchema);
