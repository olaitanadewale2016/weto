import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, NotFoundError } from '@/lib/api-response';
import { BusinessAccount, JobListing, Product, Store } from '@/models/Commerce';
import { Ad } from '@/models/Finance';
import { ensureWallet } from '@/services/wallet.service';
import { JobStatus, ProductStatus } from '@/types/enums';

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const [
      business,
      stores,
      productsCount,
      activeProductsCount,
      jobsCount,
      activeJobsCount,
      adsCount,
      wallet,
      adStats,
      jobStats,
    ] = await Promise.all([
      BusinessAccount.findOne({ userId: user._id }).lean(),
      Store.find({ userId: user._id }).sort({ createdAt: -1 }).lean(),
      Product.countDocuments({ userId: user._id }),
      Product.countDocuments({ userId: user._id, status: ProductStatus.ACTIVE }),
      JobListing.countDocuments({ userId: user._id }),
      JobListing.countDocuments({ userId: user._id, status: JobStatus.ACTIVE }),
      Ad.countDocuments({ userId: user._id }),
      ensureWallet(user._id),
      Ad.aggregate([
        { $match: { userId: user._id } },
        {
          $group: {
            _id: null,
            totalViews: { $sum: '$viewsCount' },
            totalSpend: { $sum: '$spentBudget' },
          },
        },
      ]),
      JobListing.aggregate([
        { $match: { userId: user._id } },
        { $group: { _id: null, totalApplications: { $sum: '$applicationsCount' } } },
      ]),
    ]);

    const totalAdViews = Number(adStats[0]?.totalViews || 0);
    const totalAdSpend = Number(adStats[0]?.totalSpend || 0);
    const totalJobApplications = Number(jobStats[0]?.totalApplications || 0);

    return apiSuccess({
      business,
      stores: stores.map((s) => ({ ...s, id: String(s._id) })),
      metrics: {
        productsCount,
        activeProductsCount,
        jobsCount,
        activeJobsCount,
        totalJobApplications,
        adsCount,
        walletBalance: wallet.balance,
        walletCurrency: wallet.currency,
        totalAdViews,
        totalAdSpend,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}

const upsertBusinessSchema = z.object({
  kind: z.enum(['business_account', 'store']).default('business_account'),
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  logo: z.string().optional(),
  cover: z.string().optional(),
  businessEmail: z.string().email().optional().or(z.literal('')),
  businessPhone: z.string().max(40).optional(),
  website: z.string().max(255).optional(),
  addressLine1: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postalCode: z.string().max(30).optional(),
  country: z.string().max(80).optional(),
  taxNumber: z.string().max(80).optional(),
  caption: z.string().max(160).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const body = upsertBusinessSchema.parse(await req.json());

    if (body.kind === 'store') {
      const store = await Store.create({
        userId: user._id,
        name: body.name.trim(),
        caption: body.caption?.trim() || '',
        description: body.description?.trim() || '',
        logo: body.logo || null,
        address: body.addressLine1 || null,
        phone: body.businessPhone || null,
        email: body.businessEmail || null,
        website: body.website || null,
      });
      return apiSuccess(store, undefined, 201);
    }

    const updated = await BusinessAccount.findOneAndUpdate(
      { userId: user._id },
      {
        $set: {
          name: body.name.trim(),
          description: body.description?.trim() || '',
          ...(body.logo ? { logo: body.logo } : {}),
          ...(body.cover ? { cover: body.cover } : {}),
          businessEmail: body.businessEmail || null,
          businessPhone: body.businessPhone || null,
          website: body.website || null,
          addressLine1: body.addressLine1 || null,
          city: body.city || null,
          state: body.state || null,
          postalCode: body.postalCode || null,
          country: body.country || null,
          taxNumber: body.taxNumber || null,
        },
      },
      { upsert: true, new: true }
    );

    return apiSuccess(updated);
  } catch (err) {
    return apiError(err);
  }
}

const updateStoreSchema = z.object({
  storeId: z.string().min(1),
  name: z.string().min(2).max(120).optional(),
  caption: z.string().max(160).optional(),
  description: z.string().max(2000).optional(),
  logo: z.string().nullable().optional(),
  addressLine1: z.string().max(255).nullable().optional(),
  businessPhone: z.string().max(40).nullable().optional(),
  businessEmail: z.string().email().optional().or(z.literal('')).or(z.null()),
  website: z.string().max(255).nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const body = updateStoreSchema.parse(await req.json());
    const upd: Record<string, unknown> = {};
    if (body.name !== undefined) upd.name = body.name.trim();
    if (body.caption !== undefined) upd.caption = body.caption.trim();
    if (body.description !== undefined) upd.description = body.description.trim();
    if (body.logo !== undefined) upd.logo = body.logo || null;
    if (body.addressLine1 !== undefined) upd.address = body.addressLine1 || null;
    if (body.businessPhone !== undefined) upd.phone = body.businessPhone || null;
    if (body.businessEmail !== undefined) upd.email = body.businessEmail || null;
    if (body.website !== undefined) upd.website = body.website || null;

    const updated = await Store.findOneAndUpdate(
      { _id: body.storeId, userId: user._id },
      { $set: upd },
      { new: true }
    ).lean();
    if (!updated) throw new NotFoundError('Store not found.');

    return apiSuccess({ ...updated, id: String(updated._id) });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const storeId = new URL(req.url).searchParams.get('storeId') || '';
    const deleted = await Store.findOneAndDelete({ _id: storeId, userId: user._id }).lean();
    if (!deleted) throw new NotFoundError('Store not found.');
    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
