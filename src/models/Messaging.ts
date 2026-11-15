import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import {
  ChatInviteStatus,
  ChatType,
  GroupPrivacy,
  GroupStatus,
  GroupVisibility,
  MessageType,
} from '@/types/enums';
import { ILinkSnapshot, IReactionSummary } from './Post';

export interface IChatParticipant {
  userId: Types.ObjectId;
  role: 'owner' | 'admin' | 'member';
  lastReadMessageId?: Types.ObjectId | null;
  lastReadAt?: Date | null;
  isArchived: boolean;
  isHidden: boolean;
  clearedAt?: Date | null;
  joinedAt: Date;
}

export interface IChatDocument extends Document {
  _id: Types.ObjectId;
  legacyMysqlId?: number;
  chatUuid: string;
  type: ChatType;
  participants: IChatParticipant[];
  group?: {
    ownerId: Types.ObjectId;
    name: string;
    description: string;
    avatar?: string | null;
    visibility: GroupVisibility;
    privacy: GroupPrivacy;
    status: GroupStatus;
    verified: boolean;
    verifiedAt?: Date | null;
  } | null;
  lastMessageId?: Types.ObjectId | null;
  lastMessagePreview?: string | null;
  lastActivity: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ChatSchema = new Schema<IChatDocument>(
  {
    legacyMysqlId: { type: Number, index: true, sparse: true },
    chatUuid: { type: String, required: true, unique: true },
    type: { type: String, enum: Object.values(ChatType), default: ChatType.DIRECT, index: true },
    participants: {
      type: [
        {
          userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
          lastReadMessageId: { type: Schema.Types.ObjectId, default: null },
          lastReadAt: { type: Date, default: null },
          isArchived: { type: Boolean, default: false },
          isHidden: { type: Boolean, default: false },
          clearedAt: { type: Date, default: null },
          joinedAt: { type: Date, default: () => new Date() },
        },
      ],
      default: [],
    },
    group: {
      type: {
        ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        name: { type: String, default: '' },
        description: { type: String, default: '' },
        avatar: { type: String, default: '/assets/avatars/default-avatar.png' },
        visibility: {
          type: String,
          enum: Object.values(GroupVisibility),
          default: GroupVisibility.PUBLIC,
        },
        privacy: { type: String, enum: Object.values(GroupPrivacy), default: GroupPrivacy.OPEN },
        status: { type: String, enum: Object.values(GroupStatus), default: GroupStatus.ACTIVE },
        verified: { type: Boolean, default: false },
        verifiedAt: { type: Date, default: null },
      },
      default: null,
      _id: false,
    },
    lastMessageId: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    lastMessagePreview: { type: String, default: null },
    lastActivity: { type: Date, default: () => new Date(), index: true },
  },
  { timestamps: true }
);

ChatSchema.index({ 'participants.userId': 1, lastActivity: -1 });

export const Chat: Model<IChatDocument> =
  mongoose.models.Chat || mongoose.model<IChatDocument>('Chat', ChatSchema);

export interface IMessageDocument extends Document {
  _id: Types.ObjectId;
  chatId: Types.ObjectId;
  chatUuid: string;
  senderId: Types.ObjectId;
  parentId?: Types.ObjectId | null;
  type: MessageType;
  content?: string | null;
  mediaId?: Types.ObjectId | null;
  linkSnapshot?: ILinkSnapshot | null;
  textLanguage: string;
  isDeleted: boolean;
  hiddenForUserIds: Types.ObjectId[];
  deliveredTo: Types.ObjectId[];
  readBy: Types.ObjectId[];
  reactionSummary: IReactionSummary[];
  contextRef?: {
    kind: 'product' | 'job';
    id: string;
    hashId?: string;
    title: string;
    priceLabel?: string;
    imageUrl?: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessageDocument>(
  {
    chatId: { type: Schema.Types.ObjectId, ref: 'Chat', required: true, index: true },
    chatUuid: { type: String, required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    type: { type: String, enum: Object.values(MessageType), default: MessageType.TEXT },
    content: { type: String, default: null },
    mediaId: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    linkSnapshot: { type: Schema.Types.Mixed, default: null },
    textLanguage: { type: String, default: 'en' },
    isDeleted: { type: Boolean, default: false },
    hiddenForUserIds: { type: [Schema.Types.ObjectId], default: [] },
    deliveredTo: { type: [Schema.Types.ObjectId], default: [] },
    readBy: { type: [Schema.Types.ObjectId], default: [] },
    reactionSummary: {
      type: [
        {
          unifiedId: { type: String, required: true },
          nativeSymbol: { type: String, default: '' },
          count: { type: Number, default: 0 },
        },
      ],
      default: [],
      _id: false,
    },
    contextRef: {
      type: {
        kind: { type: String, enum: ['product', 'job'] },
        id: { type: String },
        hashId: { type: String },
        title: { type: String },
        priceLabel: { type: String },
        imageUrl: { type: String },
      },
      default: null,
      _id: false,
    },
  },
  { timestamps: true }
);

MessageSchema.index({ chatId: 1, createdAt: -1 });
MessageSchema.index({ content: 'text' });

export const Message: Model<IMessageDocument> =
  mongoose.models.Message || mongoose.model<IMessageDocument>('Message', MessageSchema);

export interface IChatInviteDocument extends Document {
  chatId: Types.ObjectId;
  senderId: Types.ObjectId;
  receiverId: Types.ObjectId;
  status: ChatInviteStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ChatInviteSchema = new Schema<IChatInviteDocument>(
  {
    chatId: { type: Schema.Types.ObjectId, ref: 'Chat', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: {
      type: String,
      enum: Object.values(ChatInviteStatus),
      default: ChatInviteStatus.PENDING,
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

ChatInviteSchema.index({ chatId: 1, receiverId: 1, senderId: 1 }, { unique: true });

export const ChatInvite: Model<IChatInviteDocument> =
  mongoose.models.ChatInvite || mongoose.model<IChatInviteDocument>('ChatInvite', ChatInviteSchema);
