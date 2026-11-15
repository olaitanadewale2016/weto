import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess } from '@/lib/api-response';
import { BusinessAccount, JobListing, Product, Store } from '@/models/Commerce';
import { Ad } from '@/models/Finance';
import { ensureWallet } from '@/services/wallet.service';

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const [business, stores, productsCount, jobsCount, adsCount, wallet, recentAds] = await Promise.all([
      BusinessAccount.findOne({ userId: user._id }).lean(),
      Store.find({ userId: user._id }).lean(),
      Product.countDocuments({ userId: user._id }),
      JobListing.countDocuments({ userId: user._id }),
      Ad.countDocuments({ userId: user._id }),
      ensureWallet(user._id),
      Ad.find({ userId: user._id }).sort({ createdAt: -1 }).limit(5).lean(),
    ]);

    const totalAdViews = recentAds.reduce((sum, a) => sum + (a.viewsCount || 0), 0);
    const totalAdSpend = recentAds.reduce((sum, a) => sum + (a.spentBudget || 0), 0);

    return apiSuccess({
      business,
      stores,
      metrics: {
        productsCount,
        jobsCount,
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
