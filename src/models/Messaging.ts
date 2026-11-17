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
  isMuted?: boolean;
  mutedUntil?: Date | null;
  clearedAt?: Date | null;
  joinedAt: Date;
}

export interface IChatGroupMeta {
  ownerId: Types.ObjectId;
  name: string;
  description: string;
  avatar?: string | null;
  coverImage?: string | null;
  category?: string;
  slug?: string;
  inviteCode?: string;
  visibility: GroupVisibility;
  privacy: GroupPrivacy;
  status: GroupStatus;
  verified: boolean;
  verifiedAt?: Date | null;
  isDefault?: boolean;
  isPinned?: boolean;
  autoJoin?: boolean;
  unleavable?: boolean;
  postingMode?: 'everyone' | 'admins_only';
  requiresApproval?: boolean;
  isPasswordProtected?: boolean;
  passwordHash?: string | null;
  pendingJoinUserIds?: Types.ObjectId[];
  bannedUserIds?: Types.ObjectId[];
}

export interface IChatDocument extends Document {
  _id: Types.ObjectId;
  legacyMysqlId?: number;
  chatUuid: string;
  type: ChatType;
  participants: IChatParticipant[];
  group?: IChatGroupMeta | null;
  lastMessageId?: Types.ObjectId | null;
  lastMessagePreview?: string | null;
  pinnedMessageIds: Types.ObjectId[];
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
          isMuted: { type: Boolean, default: false },
          mutedUntil: { type: Date, default: null },
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
        coverImage: { type: String, default: null },
        category: { type: String, default: 'General' },
        slug: { type: String, default: '' },
        inviteCode: { type: String, default: '' },
        visibility: {
          type: String,
          enum: Object.values(GroupVisibility),
          default: GroupVisibility.PUBLIC,
        },
        privacy: { type: String, enum: Object.values(GroupPrivacy), default: GroupPrivacy.OPEN },
        status: { type: String, enum: Object.values(GroupStatus), default: GroupStatus.ACTIVE },
        verified: { type: Boolean, default: false },
        verifiedAt: { type: Date, default: null },
        isDefault: { type: Boolean, default: false },
        isPinned: { type: Boolean, default: false },
        autoJoin: { type: Boolean, default: false },
        unleavable: { type: Boolean, default: false },
        postingMode: { type: String, enum: ['everyone', 'admins_only'], default: 'everyone' },
        requiresApproval: { type: Boolean, default: false },
        isPasswordProtected: { type: Boolean, default: false },
        passwordHash: { type: String, default: null },
        pendingJoinUserIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
        bannedUserIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
      },
      default: null,
      _id: false,
    },
    lastMessageId: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    lastMessagePreview: { type: String, default: null },
    pinnedMessageIds: { type: [Schema.Types.ObjectId], ref: 'Message', default: [] },
    lastActivity: { type: Date, default: () => new Date(), index: true },
  },
  { timestamps: true }
);

ChatSchema.index({ 'participants.userId': 1, lastActivity: -1 });

export const Chat: Model<IChatDocument> =
  mongoose.models.Chat || mongoose.model<IChatDocument>('Chat', ChatSchema);

export interface IChatPollOption {
  id: string;
  text: string;
  voterIds: Types.ObjectId[];
}

export interface IChatPoll {
  question: string;
  options: IChatPollOption[];
}

export interface IMessageDocument extends Document {
  _id: Types.ObjectId;
  chatId: Types.ObjectId;
  chatUuid: string;
  senderId: Types.ObjectId;
  parentId?: Types.ObjectId | null;
  forwardedFromId?: Types.ObjectId | null;
  type: MessageType;
  content?: string | null;
  mediaId?: Types.ObjectId | null;
  stickerUrl?: string | null;
  poll?: IChatPoll | null;
  location?: {
    lat: number;
    lng: number;
    label?: string;
  } | null;
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
    forwardedFromId: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    type: { type: String, enum: Object.values(MessageType), default: MessageType.TEXT },
    content: { type: String, default: null },
    mediaId: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    stickerUrl: { type: String, default: null },
    poll: {
      type: {
        question: { type: String, required: true },
        options: {
          type: [
            {
              id: { type: String, required: true },
              text: { type: String, required: true },
              voterIds: { type: [Schema.Types.ObjectId], default: [] },
            },
          ],
          default: [],
          _id: false,
        },
      },
      default: null,
      _id: false,
    },
    location: {
      type: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        label: { type: String, default: '' },
      },
      default: null,
      _id: false,
    },
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

export interface IChatCallParticipant {
  userId: Types.ObjectId;
  muted: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
  remoteMutedByAdmin?: boolean;
  joinedAt: Date;
  lastHeartbeatAt: Date;
}

export interface IChatCallSignal {
  _id: Types.ObjectId;
  fromUserId: Types.ObjectId;
  toUserId: Types.ObjectId;
  kind: 'offer' | 'answer' | 'ice';
  payload: unknown;
  createdAt: Date;
}

export interface IChatCallDocument extends Document {
  _id: Types.ObjectId;
  callUuid: string;
  chatId: Types.ObjectId;
  chatType: ChatType;
  initiatorId: Types.ObjectId;
  targetUserIds: Types.ObjectId[];
  audioOnly: boolean;
  status: 'ringing' | 'active' | 'ended' | 'rejected';
  participants: IChatCallParticipant[];
  signals: IChatCallSignal[];
  startedAt: Date;
  endedAt?: Date | null;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ChatCallSchema = new Schema<IChatCallDocument>(
  {
    callUuid: { type: String, required: true, unique: true },
    chatId: { type: Schema.Types.ObjectId, ref: 'Chat', required: true, index: true },
    chatType: { type: String, enum: Object.values(ChatType), default: ChatType.DIRECT },
    initiatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetUserIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [], index: true },
    audioOnly: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['ringing', 'active', 'ended', 'rejected'],
      default: 'ringing',
      index: true,
    },
    participants: {
      type: [
        {
          userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          muted: { type: Boolean, default: false },
          cameraEnabled: { type: Boolean, default: true },
          screenSharing: { type: Boolean, default: false },
          remoteMutedByAdmin: { type: Boolean, default: false },
          joinedAt: { type: Date, default: () => new Date() },
          lastHeartbeatAt: { type: Date, default: () => new Date() },
        },
      ],
      default: [],
      _id: false,
    },
    signals: {
      type: [
        {
          fromUserId: { type: Schema.Types.ObjectId, required: true },
          toUserId: { type: Schema.Types.ObjectId, required: true },
          kind: { type: String, enum: ['offer', 'answer', 'ice'], required: true },
          payload: { type: Schema.Types.Mixed, required: true },
          createdAt: { type: Date, default: () => new Date() },
        },
      ],
      default: [],
    },
    startedAt: { type: Date, default: () => new Date() },
    endedAt: { type: Date, default: null },
    lastActivityAt: { type: Date, default: () => new Date(), index: true },
  },
  { timestamps: true }
);

ChatCallSchema.index({ chatId: 1, status: 1, lastActivityAt: -1 });
ChatCallSchema.index({ targetUserIds: 1, status: 1, lastActivityAt: -1 });

export const ChatCall: Model<IChatCallDocument> =
  mongoose.models.ChatCall || mongoose.model<IChatCallDocument>('ChatCall', ChatCallSchema);
