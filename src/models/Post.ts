import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { PinContent, PinType, PostStatus, PostType } from '@/types/enums';

export interface ILinkSnapshot {
  url: string;
  domain?: string;
  title?: string;
  description?: string;
  image?: string;
  metadata?: Record<string, unknown>;
}

export interface IPollChoice {
  id: string;
  text: string;
  votesCount: number;
}

export interface IPostPoll {
  choices: IPollChoice[];
  voterIds: Types.ObjectId[];
  votesByUser: Record<string, string>;
  isAnonymous: boolean;
  isCancellable: boolean;
  expiresAt?: Date | null;
}

export interface IReactionSummary {
  unifiedId: string;
  nativeSymbol: string;
  count: number;
}

export interface IPostDocument extends Document {
  _id: Types.ObjectId;
  legacyMysqlId?: number;
  hashId: string;
  userId: Types.ObjectId;
  quotePostId?: Types.ObjectId | null;
  isQuoting: boolean;
  title: string;
  content: string;
  hashtags: string[];
  mentions: string[];
  location?: string | null;
  status: PostStatus;
  type: PostType;
  textLanguage: string;
  edited: boolean;
  profilePinned: boolean;
  globalPinned: boolean;
  isSensitive: boolean;
  isAiGenerated: boolean;
  viewsCount: number;
  commentsCount: number;
  sharesCount: number;
  bookmarksCount: number;
  quotesCount: number;
  repostsCount: number;
  previewLqipBase64?: string | null;
  linkSnapshot?: ILinkSnapshot | null;
  poll?: IPostPoll | null;
  reactionSummary: IReactionSummary[];
  createdAt: Date;
  updatedAt: Date;
}

const LinkSnapshotSchema = new Schema<ILinkSnapshot>(
  {
    url: { type: String, required: true },
    domain: { type: String },
    title: { type: String },
    description: { type: String },
    image: { type: String },
    metadata: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  { _id: false }
);

const PostSchema = new Schema<IPostDocument>(
  {
    legacyMysqlId: { type: Number, index: true, sparse: true },
    hashId: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    quotePostId: { type: Schema.Types.ObjectId, ref: 'Post', default: null, index: true },
    isQuoting: { type: Boolean, default: false },
    title: { type: String, default: '', trim: true },
    content: { type: String, default: '' },
    hashtags: { type: [String], default: [], index: true },
    mentions: { type: [String], default: [], index: true },
    location: { type: String, default: null },
    status: {
      type: String,
      enum: Object.values(PostStatus),
      default: PostStatus.ACTIVE,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(PostType),
      default: PostType.TEXT,
      index: true,
    },
    textLanguage: { type: String, default: 'en' },
    edited: { type: Boolean, default: false },
    profilePinned: { type: Boolean, default: false },
    globalPinned: { type: Boolean, default: false, index: true },
    isSensitive: { type: Boolean, default: false },
    isAiGenerated: { type: Boolean, default: false },
    viewsCount: { type: Number, default: 0, min: 0 },
    commentsCount: { type: Number, default: 0, min: 0 },
    sharesCount: { type: Number, default: 0, min: 0 },
    bookmarksCount: { type: Number, default: 0, min: 0 },
    quotesCount: { type: Number, default: 0, min: 0 },
    repostsCount: { type: Number, default: 0, min: 0 },
    previewLqipBase64: { type: String, default: null },
    linkSnapshot: { type: LinkSnapshotSchema, default: null },
    poll: {
      type: {
        choices: [
          {
            id: { type: String, required: true },
            text: { type: String, required: true },
            votesCount: { type: Number, default: 0 },
          },
        ],
        voterIds: { type: [Schema.Types.ObjectId], default: [] },
        votesByUser: { type: Schema.Types.Mixed, default: () => ({}) },
        isAnonymous: { type: Boolean, default: false },
        isCancellable: { type: Boolean, default: true },
        expiresAt: { type: Date, default: null },
      },
      default: null,
      _id: false,
    },
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
  },
  { timestamps: true }
);

PostSchema.index({ status: 1, createdAt: -1 });
PostSchema.index({ userId: 1, status: 1, profilePinned: -1, createdAt: -1 });
PostSchema.index({ content: 'text', title: 'text' });

export const Post: Model<IPostDocument> =
  mongoose.models.Post || mongoose.model<IPostDocument>('Post', PostSchema);

export interface ICommentDocument extends Document {
  postId: Types.ObjectId;
  userId: Types.ObjectId;
  parentId?: Types.ObjectId | null;
  content: string;
  textLanguage: string;
  repliesCount: number;
  reactionSummary: IReactionSummary[];
  createdAt: Date;
  updatedAt: Date;
}

const CommentSchema = new Schema<ICommentDocument>(
  {
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Comment', default: null, index: true },
    content: { type: String, required: true },
    textLanguage: { type: String, default: 'en' },
    repliesCount: { type: Number, default: 0, min: 0 },
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
  },
  { timestamps: true }
);

CommentSchema.index({ postId: 1, parentId: 1, createdAt: -1 });

export const Comment: Model<ICommentDocument> =
  mongoose.models.Comment || mongoose.model<ICommentDocument>('Comment', CommentSchema);

export interface IReactionDocument extends Document {
  targetType: 'post' | 'comment' | 'message';
  targetId: Types.ObjectId;
  userId: Types.ObjectId;
  unifiedId: string;
  nativeSymbol: string;
  createdAt: Date;
}

const ReactionSchema = new Schema<IReactionDocument>(
  {
    targetType: { type: String, enum: ['post', 'comment', 'message'], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    unifiedId: { type: String, required: true },
    nativeSymbol: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ReactionSchema.index({ targetType: 1, targetId: 1, userId: 1, unifiedId: 1 }, { unique: true });

export const Reaction: Model<IReactionDocument> =
  mongoose.models.Reaction || mongoose.model<IReactionDocument>('Reaction', ReactionSchema);

export interface IBookmarkDocument extends Document {
  userId: Types.ObjectId;
  targetType: 'post' | 'product' | 'job';
  targetId: Types.ObjectId;
  createdAt: Date;
}

const BookmarkSchema = new Schema<IBookmarkDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: ['post', 'product', 'job'], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

BookmarkSchema.index({ userId: 1, targetType: 1, targetId: 1 }, { unique: true });

export const Bookmark: Model<IBookmarkDocument> =
  mongoose.models.Bookmark || mongoose.model<IBookmarkDocument>('Bookmark', BookmarkSchema);

export interface IPinDocument extends Document {
  userId: Types.ObjectId;
  targetType: PinContent;
  targetId: Types.ObjectId;
  pinType: PinType;
  createdAt: Date;
}

const PinSchema = new Schema<IPinDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: Object.values(PinContent), default: PinContent.POST },
    targetId: { type: Schema.Types.ObjectId, required: true },
    pinType: { type: String, enum: Object.values(PinType), default: PinType.PROFILE, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

PinSchema.index({ userId: 1, targetType: 1, targetId: 1 }, { unique: true });

export const Pin: Model<IPinDocument> =
  mongoose.models.Pin || mongoose.model<IPinDocument>('Pin', PinSchema);
