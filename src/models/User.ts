import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import {
  F2AType,
  NotificationType,
  PrivacyPermit,
  UserRole,
  UserStatus,
  UserType,
} from '@/types/enums';

export interface INotificationChannelPrefs {
  directMessages: boolean;
  reactions: boolean;
  comments: boolean;
  sharedPosts: boolean;
  followers: boolean;
  followRequest: boolean;
  mentions: boolean;
}

export interface ISocialLinkItem {
  platform: string;
  url: string;
}

export interface ISocialAccountItem {
  providerName: string;
  providerId: string;
  email?: string;
}

export interface IUserDocument extends Document {
  _id: Types.ObjectId;
  legacyMysqlId?: number;
  legacyPasswordHash?: string | null;
  firebaseUid?: string;
  ownerAccountId?: Types.ObjectId | null;
  firstName: string;
  lastName: string;
  username: string;
  caption: string;
  category?: string | null;
  bio: string;
  country?: string | null;
  city?: string | null;
  birthDay?: string | null;
  birthMonth?: string | null;
  birthYear?: string | null;
  age?: string | null;
  gender: string;
  email: string;
  phone: string;
  website: string;
  lastActive: Date;
  ipAddress: string;
  language: string;
  avatar?: string | null;
  cover?: string | null;
  verified: boolean;
  verifiedAt?: Date | null;
  emailVerifiedAt?: Date | null;
  status: UserStatus;
  role: UserRole;
  type: UserType;
  theme: 'light' | 'dark';
  publicationsCount: number;
  followersCount: number;
  followingCount: number;
  tips: Record<string, boolean>;
  onboardingStep?: string | null;
  socialAccounts: ISocialAccountItem[];
  socialLinks: ISocialLinkItem[];
  privacySettings: {
    emailPrivacy: boolean;
    phonePrivacy: boolean;
    birthdatePrivacy: boolean;
    countryPrivacy: boolean;
    cityPrivacy: boolean;
    genderPrivacy: boolean;
    onlinePrivacy: boolean;
    lastSeenPrivacy: boolean;
    searchPrivacy: boolean;
  };
  permitSettings: {
    mentions: PrivacyPermit;
    followers: PrivacyPermit;
    directMessages: PrivacyPermit;
    storyReplies: PrivacyPermit;
    groupInvites: PrivacyPermit;
    paymentTransfers: PrivacyPermit;
  };
  notificationSettings: {
    email: INotificationChannelPrefs;
    push: INotificationChannelPrefs;
  };
  securitySettings: {
    twoFactorEnabled: boolean;
    twoFactorType: F2AType;
    loginNotification: boolean;
    loginNotificationType: NotificationType;
  };
  monetization: {
    tipsEnabled: boolean;
    subscriptionsEnabled: boolean;
    monthlyPrice: number;
    currency: string;
    description: string;
    totalEarnings: number;
  };
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationChannelPrefsSchema = new Schema<INotificationChannelPrefs>(
  {
    directMessages: { type: Boolean, default: true },
    reactions: { type: Boolean, default: true },
    comments: { type: Boolean, default: true },
    sharedPosts: { type: Boolean, default: true },
    followers: { type: Boolean, default: true },
    followRequest: { type: Boolean, default: true },
    mentions: { type: Boolean, default: true },
  },
  { _id: false }
);

const UserSchema = new Schema<IUserDocument>(
  {
    legacyMysqlId: { type: Number, index: true, sparse: true },
    legacyPasswordHash: { type: String, default: null, select: false },
    firebaseUid: { type: String, unique: true, sparse: true },
    ownerAccountId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    firstName: { type: String, default: '', trim: true, maxlength: 64 },
    lastName: { type: String, default: '', trim: true, maxlength: 64 },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 40,
    },
    caption: { type: String, default: '', trim: true, maxlength: 64 },
    category: { type: String, default: null },
    bio: { type: String, default: '', maxlength: 500 },
    country: { type: String, default: null },
    city: { type: String, default: null },
    birthDay: { type: String, default: null },
    birthMonth: { type: String, default: null },
    birthYear: { type: String, default: null },
    age: { type: String, default: null },
    gender: { type: String, default: 'male' },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: '', trim: true },
    website: { type: String, default: '', trim: true },
    lastActive: { type: Date, default: () => new Date() },
    ipAddress: { type: String, default: '0.0.0.0' },
    language: { type: String, default: 'en' },
    avatar: { type: String, default: '/assets/avatars/default-avatar.png' },
    cover: { type: String, default: '/assets/covers/default-cover.png' },
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
    emailVerifiedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: Object.values(UserStatus),
      default: UserStatus.ONBOARDING,
      index: true,
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.USER,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(UserType),
      default: UserType.READER,
      index: true,
    },
    theme: { type: String, enum: ['light', 'dark'], default: 'light' },
    publicationsCount: { type: Number, default: 0, min: 0 },
    followersCount: { type: Number, default: 0, min: 0 },
    followingCount: { type: Number, default: 0, min: 0 },
    tips: { type: Schema.Types.Mixed, default: () => ({}) },
    onboardingStep: { type: String, default: 'profile' },
    socialAccounts: {
      type: [
        {
          providerName: { type: String, required: true },
          providerId: { type: String, required: true },
          email: { type: String },
        },
      ],
      default: [],
    },
    socialLinks: {
      type: [
        {
          platform: { type: String, required: true },
          url: { type: String, default: '' },
        },
      ],
      default: [],
    },
    privacySettings: {
      type: {
        emailPrivacy: { type: Boolean, default: false },
        phonePrivacy: { type: Boolean, default: false },
        birthdatePrivacy: { type: Boolean, default: false },
        countryPrivacy: { type: Boolean, default: false },
        cityPrivacy: { type: Boolean, default: false },
        genderPrivacy: { type: Boolean, default: false },
        onlinePrivacy: { type: Boolean, default: false },
        lastSeenPrivacy: { type: Boolean, default: false },
        searchPrivacy: { type: Boolean, default: false },
      },
      default: () => ({}),
      _id: false,
    },
    permitSettings: {
      type: {
        mentions: { type: String, enum: Object.values(PrivacyPermit), default: PrivacyPermit.ALL },
        followers: { type: String, enum: Object.values(PrivacyPermit), default: PrivacyPermit.ALL },
        directMessages: { type: String, enum: Object.values(PrivacyPermit), default: PrivacyPermit.ALL },
        storyReplies: { type: String, enum: Object.values(PrivacyPermit), default: PrivacyPermit.ALL },
        groupInvites: { type: String, enum: Object.values(PrivacyPermit), default: PrivacyPermit.ALL },
        paymentTransfers: { type: String, enum: Object.values(PrivacyPermit), default: PrivacyPermit.ALL },
      },
      default: () => ({}),
      _id: false,
    },
    notificationSettings: {
      email: { type: NotificationChannelPrefsSchema, default: () => ({}) },
      push: { type: NotificationChannelPrefsSchema, default: () => ({}) },
    },
    securitySettings: {
      type: {
        twoFactorEnabled: { type: Boolean, default: false },
        twoFactorType: { type: String, enum: Object.values(F2AType), default: F2AType.EMAIL },
        loginNotification: { type: Boolean, default: false },
        loginNotificationType: {
          type: String,
          enum: Object.values(NotificationType),
          default: NotificationType.EMAIL,
        },
      },
      default: () => ({}),
      _id: false,
    },
    monetization: {
      type: {
        tipsEnabled: { type: Boolean, default: false },
        subscriptionsEnabled: { type: Boolean, default: false },
        monthlyPrice: { type: Number, default: 5, min: 1 },
        currency: { type: String, default: 'USD' },
        description: { type: String, default: '' },
        totalEarnings: { type: Number, default: 0, min: 0 },
      },
      default: () => ({}),
      _id: false,
    },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

UserSchema.index({ username: 'text', firstName: 'text', lastName: 'text', bio: 'text' });
UserSchema.index({ status: 1, type: 1, createdAt: -1 });

export const User: Model<IUserDocument> =
  mongoose.models.User || mongoose.model<IUserDocument>('User', UserSchema);
