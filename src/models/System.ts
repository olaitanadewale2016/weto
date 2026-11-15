import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface ISettingDocument extends Document {
  group: string;
  payload: Record<string, unknown>;
  updatedAt: Date;
}

const SettingSchema = new Schema<ISettingDocument>(
  {
    group: { type: String, required: true, unique: true },
    payload: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true }
);

export const Setting: Model<ISettingDocument> =
  mongoose.models.Setting || mongoose.model<ISettingDocument>('Setting', SettingSchema);

export interface ICurrencyDocument extends Document {
  alpha3Code: string;
  name: string;
  symbol: string;
  symbolNative: string;
  status: boolean;
  usageCount: number;
  isDefault: boolean;
  order: number;
  createdAt: Date;
}

const CurrencySchema = new Schema<ICurrencyDocument>(
  {
    alpha3Code: { type: String, required: true, unique: true, uppercase: true },
    name: { type: String, required: true },
    symbol: { type: String, required: true },
    symbolNative: { type: String, required: true },
    status: { type: Boolean, default: true },
    usageCount: { type: Number, default: 0 },
    isDefault: { type: Boolean, default: false },
    order: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export const Currency: Model<ICurrencyDocument> =
  mongoose.models.Currency || mongoose.model<ICurrencyDocument>('Currency', CurrencySchema);

export interface ILocaleDocument extends Document {
  alpha2Code: string;
  name: string;
  nativeName: string;
  flagPath?: string | null;
  direction: 'ltr' | 'rtl';
  order: number;
  status: boolean;
  isDefault: boolean;
  usageCount: number;
  createdAt: Date;
}

const LocaleSchema = new Schema<ILocaleDocument>(
  {
    alpha2Code: { type: String, required: true, unique: true, lowercase: true },
    name: { type: String, required: true },
    nativeName: { type: String, required: true },
    flagPath: { type: String, default: null },
    direction: { type: String, enum: ['ltr', 'rtl'], default: 'ltr' },
    order: { type: Number, default: 0 },
    status: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    usageCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Locale: Model<ILocaleDocument> =
  mongoose.models.Locale || mongoose.model<ILocaleDocument>('Locale', LocaleSchema);

export interface IApiKeyDocument extends Document {
  userId: Types.ObjectId;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: string[];
  rateLimitPerMinute: number;
  isActive: boolean;
  lastUsedAt?: Date | null;
  expiresAt?: Date | null;
  createdAt: Date;
}

const ApiKeySchema = new Schema<IApiKeyDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    keyPrefix: { type: String, required: true },
    keyHash: { type: String, required: true, unique: true },
    scopes: { type: [String], default: ['read'] },
    rateLimitPerMinute: { type: Number, default: 60 },
    isActive: { type: Boolean, default: true },
    lastUsedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const ApiKey: Model<IApiKeyDocument> =
  mongoose.models.ApiKey || mongoose.model<IApiKeyDocument>('ApiKey', ApiKeySchema);

export interface IStaticPageDocument extends Document {
  slug: string;
  title: string;
  contentByLocale: Record<string, string>;
  updatedAt: Date;
}

const StaticPageSchema = new Schema<IStaticPageDocument>(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    contentByLocale: { type: Schema.Types.Mixed, default: () => ({ en: '' }) },
  },
  { timestamps: true }
);

export const StaticPage: Model<IStaticPageDocument> =
  mongoose.models.StaticPage || mongoose.model<IStaticPageDocument>('StaticPage', StaticPageSchema);
