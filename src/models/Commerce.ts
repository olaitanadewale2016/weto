import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import {
  CategoryStatus,
  CategoryType,
  JobApproval,
  JobStatus,
  JobType,
  ProductApproval,
  ProductCondition,
  ProductStatus,
  ProductType,
  StoreStatus,
} from '@/types/enums';

export interface IBusinessAccountDocument extends Document {
  userId: Types.ObjectId;
  name: string;
  logo?: string | null;
  cover?: string | null;
  description?: string | null;
  industryId?: number | null;
  businessEmail?: string | null;
  businessPhone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  taxNumber?: string | null;
  billingAddress: Record<string, unknown>;
  website?: string | null;
  verified: boolean;
  isReviewed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BusinessAccountSchema = new Schema<IBusinessAccountDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, required: true, trim: true },
    logo: { type: String, default: null },
    cover: { type: String, default: null },
    description: { type: String, default: null },
    industryId: { type: Number, default: null },
    businessEmail: { type: String, default: null },
    businessPhone: { type: String, default: null },
    addressLine1: { type: String, default: null },
    addressLine2: { type: String, default: null },
    city: { type: String, default: null },
    state: { type: String, default: null },
    postalCode: { type: String, default: null },
    country: { type: String, default: null },
    taxNumber: { type: String, default: null },
    billingAddress: { type: Schema.Types.Mixed, default: () => ({}) },
    website: { type: String, default: null },
    verified: { type: Boolean, default: false },
    isReviewed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const BusinessAccount: Model<IBusinessAccountDocument> =
  mongoose.models.BusinessAccount ||
  mongoose.model<IBusinessAccountDocument>('BusinessAccount', BusinessAccountSchema);

export interface IStoreDocument extends Document {
  userId: Types.ObjectId;
  name: string;
  caption?: string | null;
  description: string;
  logo?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  status: StoreStatus;
  rating: number;
  productsCount: number;
  reviewsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const StoreSchema = new Schema<IStoreDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    caption: { type: String, default: null },
    description: { type: String, default: '' },
    logo: { type: String, default: null },
    address: { type: String, default: null },
    phone: { type: String, default: null },
    email: { type: String, default: null },
    website: { type: String, default: null },
    status: { type: String, enum: Object.values(StoreStatus), default: StoreStatus.ACTIVE },
    rating: { type: Number, default: 0 },
    productsCount: { type: Number, default: 0 },
    reviewsCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Store: Model<IStoreDocument> =
  mongoose.models.Store || mongoose.model<IStoreDocument>('Store', StoreSchema);

export interface ICategoryDocument extends Document {
  legacyMysqlId?: number;
  localization: Record<string, string>;
  parentId?: Types.ObjectId | null;
  categorizableType: CategoryType;
  depth: number;
  status: CategoryStatus;
}

const CategorySchema = new Schema<ICategoryDocument>({
  legacyMysqlId: { type: Number, index: true, sparse: true },
  localization: { type: Schema.Types.Mixed, required: true, default: () => ({ en: 'General' }) },
  parentId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
  categorizableType: {
    type: String,
    enum: Object.values(CategoryType),
    default: CategoryType.UNCATEGORIZED,
    index: true,
  },
  depth: { type: Number, default: 1 },
  status: {
    type: String,
    enum: Object.values(CategoryStatus),
    default: CategoryStatus.ACTIVE,
    index: true,
  },
});

export const Category: Model<ICategoryDocument> =
  mongoose.models.Category || mongoose.model<ICategoryDocument>('Category', CategorySchema);

export interface IProductDocument extends Document {
  legacyMysqlId?: number;
  hashId: string;
  userId: Types.ObjectId;
  storeId?: Types.ObjectId | null;
  categoryId?: Types.ObjectId | null;
  title: string;
  description?: string | null;
  approval: ProductApproval;
  status: ProductStatus;
  condition: ProductCondition;
  type: ProductType;
  currency: string;
  stockQuantity: number;
  price: number;
  discount: number;
  rating: number;
  address?: string | null;
  viewsCount: number;
  contactsCount: number;
  reviewsCount: number;
  bookmarksCount: number;
  isPromoted: boolean;
  lastContactedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProductDocument>(
  {
    legacyMysqlId: { type: Number, index: true, sparse: true },
    hashId: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', default: null },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    approval: {
      type: String,
      enum: Object.values(ProductApproval),
      default: ProductApproval.PENDING,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(ProductStatus),
      default: ProductStatus.DRAFT,
      index: true,
    },
    condition: {
      type: String,
      enum: Object.values(ProductCondition),
      default: ProductCondition.NEW,
    },
    type: { type: String, enum: Object.values(ProductType), default: ProductType.PHYSICAL },
    currency: { type: String, default: 'USD' },
    stockQuantity: { type: Number, default: 1, min: 0 },
    price: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0, max: 100 },
    rating: { type: Number, default: 0 },
    address: { type: String, default: null },
    viewsCount: { type: Number, default: 0 },
    contactsCount: { type: Number, default: 0 },
    reviewsCount: { type: Number, default: 0 },
    bookmarksCount: { type: Number, default: 0 },
    isPromoted: { type: Boolean, default: false, index: true },
    lastContactedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ProductSchema.index({ status: 1, approval: 1, categoryId: 1, createdAt: -1 });
ProductSchema.index({ title: 'text', description: 'text' });

export const Product: Model<IProductDocument> =
  mongoose.models.Product || mongoose.model<IProductDocument>('Product', ProductSchema);

export interface IJobListingDocument extends Document {
  legacyMysqlId?: number;
  hashId: string;
  userId: Types.ObjectId;
  categoryId?: Types.ObjectId | null;
  title: string;
  overview?: string | null;
  description?: string | null;
  status: JobStatus;
  approval: JobApproval;
  type: JobType;
  income?: number | null;
  isStartIncome: boolean;
  currency: string;
  location?: string | null;
  isRemote: boolean;
  isUrgent: boolean;
  isPromoted: boolean;
  viewsCount: number;
  applicationsCount: number;
  bookmarksCount: number;
  lastContactedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const JobListingSchema = new Schema<IJobListingDocument>(
  {
    legacyMysqlId: { type: Number, index: true, sparse: true },
    hashId: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    title: { type: String, required: true, trim: true },
    overview: { type: String, default: null },
    description: { type: String, default: null },
    status: { type: String, enum: Object.values(JobStatus), default: JobStatus.DRAFT, index: true },
    approval: {
      type: String,
      enum: Object.values(JobApproval),
      default: JobApproval.PENDING,
      index: true,
    },
    type: { type: String, enum: Object.values(JobType), default: JobType.VACANCY },
    income: { type: Number, default: null },
    isStartIncome: { type: Boolean, default: false },
    currency: { type: String, default: 'USD' },
    location: { type: String, default: null },
    isRemote: { type: Boolean, default: true },
    isUrgent: { type: Boolean, default: false },
    isPromoted: { type: Boolean, default: false, index: true },
    viewsCount: { type: Number, default: 0 },
    applicationsCount: { type: Number, default: 0 },
    bookmarksCount: { type: Number, default: 0 },
    lastContactedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

JobListingSchema.index({ status: 1, approval: 1, categoryId: 1, createdAt: -1 });
JobListingSchema.index({ title: 'text', overview: 'text', description: 'text' });

export const JobListing: Model<IJobListingDocument> =
  mongoose.models.JobListing || mongoose.model<IJobListingDocument>('JobListing', JobListingSchema);

export interface IJobApplicationDocument extends Document {
  jobId: Types.ObjectId;
  applicantId: Types.ObjectId;
  employerId: Types.ObjectId;
  coverLetter: string;
  resumeMediaId?: Types.ObjectId | null;
  status: 'pending' | 'reviewed' | 'shortlisted' | 'rejected' | 'hired';
  employerNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const JobApplicationSchema = new Schema<IJobApplicationDocument>(
  {
    jobId: { type: Schema.Types.ObjectId, ref: 'JobListing', required: true },
    applicantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    coverLetter: { type: String, default: '' },
    resumeMediaId: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'shortlisted', 'rejected', 'hired'],
      default: 'pending',
    },
    employerNotes: { type: String, default: '' },
  },
  { timestamps: true }
);

JobApplicationSchema.index({ jobId: 1, applicantId: 1 }, { unique: true });

export const JobApplication: Model<IJobApplicationDocument> =
  mongoose.models.JobApplication ||
  mongoose.model<IJobApplicationDocument>('JobApplication', JobApplicationSchema);
