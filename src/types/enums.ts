/**
 * All ColibriPlus domain enums ported from app/Enums/*.php
 */

export enum UserRole {
  ROOT = 'root',
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  USER = 'user',
}

export enum UserStatus {
  ACTIVE = 'active',
  BLOCKED = 'blocked',
  SUSPENDED = 'suspended',
  ONBOARDING = 'onboarding',
}

export enum UserType {
  READER = 'reader',
  AUTHOR = 'author',
}

export enum ASRStatus {
  PENDING = 'pending',
  REJECTED = 'rejected',
  APPROVED = 'approved',
}

export enum FollowStatus {
  REQUESTED = 'requested',
  FOLLOWING = 'following',
  REJECTED = 'rejected',
  BLOCKED = 'blocked',
}

export enum PrivacyPermit {
  ALL = 'all',
  FOLLOWERS = 'followers',
  NOBODY = 'nobody',
  APPROVED = 'approved',
}

export enum F2AType {
  EMAIL = 'email',
  SMS = 'sms',
}

export enum NotificationType {
  EMAIL = 'email',
  PUSH = 'push',
  TELEGRAM = 'telegram',
}

export enum ConfirmationType {
  EMAIL = 'email',
  PHONE = 'phone',
}

export enum BlacklistType {
  IP = 'ip_address',
  EMAIL = 'email',
  PHONE = 'phone',
  USERNAME = 'username',
}

export enum CensorLevel {
  BANNED = 'banned',
  WARNING = 'warning',
  REPLACED = 'replaced',
}

export enum UserBanReason {
  CENSOR = 'censor',
  REPORT = 'report',
  ADMIN = 'admin',
}

export enum ReportStatus {
  PENDING = 'pending',
  IGNORED = 'ignored',
  PROCESSED = 'processed',
}

export enum ReportType {
  POST = 'post',
  COMMENT = 'comment',
  USER = 'user',
  STORY = 'story',
  GROUP = 'group',
  PRODUCT = 'product',
  MESSAGE = 'message',
}

export enum PostStatus {
  ACTIVE = 'active',
  DRAFT = 'draft',
  PUBLISHED = 'published',
  DELETED = 'deleted',
  PROCESSING_VIDEO = 'processing_video',
}

export enum PostType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  DOCUMENT = 'document',
  POLL = 'poll',
  GIF = 'gif',
}

export enum PinType {
  GLOBAL = 'global',
  PROFILE = 'profile',
}

export enum PinContent {
  POST = 'post',
}

export enum MediaStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  UNPROCESSED = 'unprocessed',
  FAILED = 'failed',
}

export enum MediaType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  VIDEO_CIRCLE = 'video_circle',
  AUDIO = 'audio',
  DOCUMENT = 'document',
  GIF = 'gif',
}

export enum MediaVisibility {
  VISIBLE = 'visible',
  HIDDEN = 'hidden',
}

export enum StoryPrivacy {
  ALL = 'all',
  FOLLOWERS = 'followers',
  SELECTED_USERS = 'selected_users',
}

export enum StoryStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PROCESSING = 'processing',
}

export enum StoryType {
  VIDEO = 'video',
  IMAGE = 'image',
  TEXT = 'text',
}

export enum ChatType {
  DIRECT = 'direct',
  GROUP = 'group',
}

export enum ChatInviteStatus {
  PENDING = 'pending',
  DECLINED = 'declined',
  ACCEPTED = 'accepted',
}

export enum GroupPrivacy {
  OPEN = 'open',
  REQUEST = 'request',
  CLOSED = 'closed',
}

export enum GroupStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

export enum GroupVisibility {
  PUBLIC = 'public',
  HIDDEN = 'hidden',
  PRIVATE = 'private',
}

export enum MessageType {
  TEXT = 'text',
  AUDIO = 'audio',
  IMAGE = 'image',
  VIDEO = 'video',
  VIDEO_CIRCLE = 'video_circle',
  DOCUMENT = 'document',
  GIF = 'gif',
  STICKER = 'sticker',
  POLL = 'poll',
  LOCATION = 'location',
  SYSTEM = 'system',
}

export enum CategoryStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DRAFT = 'draft',
}

export enum CategoryType {
  UNCATEGORIZED = 'uncategorized',
  PRODUCT = 'product',
  JOB = 'job',
}

export enum ProductApproval {
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PENDING = 'pending',
}

export enum ProductCondition {
  USED = 'used',
  NEW = 'new',
  ACCEPTABLE = 'acceptable',
  REFURBISHED = 'refurbished',
  DEFECTIVE = 'defective',
}

export enum ProductStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum ProductType {
  PHYSICAL = 'physical',
  DIGITAL = 'digital',
  SERVICE = 'service',
  SUBSCRIPTION = 'subscription',
  MEMBERSHIP = 'membership',
  EVENT_TICKET = 'event_ticket',
  GIFT_CARD = 'gift_card',
}

export enum StoreStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

export enum JobApproval {
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PENDING = 'pending',
}

export enum JobStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum JobType {
  VACANCY = 'vacancy',
  PROJECT = 'project',
  FULL_TIME = 'full_time',
  PART_TIME = 'part_time',
  CONTRACT = 'contract',
  FREELANCE = 'freelance',
}

export enum AdApproval {
  APPROVED = 'approved',
  PENDING = 'pending',
  REJECTED = 'rejected',
}

export enum AdStatus {
  PUBLISHED = 'published',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  DRAFT = 'draft',
}

export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
  CHARGEBACK = 'chargeback',
  CHARGEBACK_REVERSED = 'chargeback_reversed',
}

export enum PaymentType {
  DEPOSIT = 'deposit',
}

export enum CashoutStatus {
  PENDING = 'pending',
  PAID = 'paid',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

export enum TransactionDirection {
  INCOMING = 'incoming',
  OUTGOING = 'outgoing',
}

export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum TransactionType {
  DEPOSIT = 'deposit',
  WITHDRAW = 'withdraw',
  TRANSFER = 'transfer',
  PAYMENT = 'payment',
  REFUND = 'refund',
  ADVERTISING = 'advertising',
}
