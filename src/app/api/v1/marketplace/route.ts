import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { getOptionalAuth, requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess } from '@/lib/api-response';
import { Category, Product } from '@/models/Commerce';
import { Bookmark } from '@/models/Post';
import { Media } from '@/models/Media';
import {
  CategoryStatus,
  CategoryType,
  ProductApproval,
  ProductCondition,
  ProductStatus,
  ProductType,
} from '@/types/enums';
import { encodeId } from '@/lib/hashids';
import { serializeMedia } from '@/services/media.service';
import { getSettingsGroup } from '@/services/settings.service';

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const authCtx = await getOptionalAuth(req);
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const categoryId = searchParams.get('categoryId');
    const condition = searchParams.get('condition');
    const type = searchParams.get('type');
    const savedOnly = searchParams.get('saved') === 'true';
    const mine = searchParams.get('mine') === 'true';
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const limit = Math.min(40, Math.max(1, Number(searchParams.get('limit') || 20)));

    const filter: Record<string, unknown> = {};
    if (mine && authCtx) {
      filter.userId = authCtx.user._id;
    } else {
      filter.status = ProductStatus.ACTIVE;
      filter.approval = ProductApproval.APPROVED;
    }

    if (categoryId) filter.categoryId = new Types.ObjectId(categoryId);
    if (condition) filter.condition = condition;
    if (type) filter.type = type;

    if (savedOnly && authCtx) {
      const bms = await Bookmark.find({ userId: authCtx.user._id, targetType: 'product' }).lean();
      filter._id = { $in: bms.map((b) => b.targetId) };
    }

    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { title: { $regex: escaped, $options: 'i' } },
        { description: { $regex: escaped, $options: 'i' } },
        { address: { $regex: escaped, $options: 'i' } },
      ];
    }

    const [products, categories, total] = await Promise.all([
      Product.find(filter)
        .sort({ isPromoted: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'username firstName lastName avatar verified')
        .populate('categoryId', 'localization')
        .populate('storeId', 'name logo rating')
        .lean(),
      Category.find({ categorizableType: CategoryType.PRODUCT, status: CategoryStatus.ACTIVE }).lean(),
      Product.countDocuments(filter),
    ]);

    const productIds = products.map((p) => p._id);
    const [mediaRows, bookmarks] = await Promise.all([
      Media.find({ targetType: 'product', targetId: { $in: productIds } }).sort({ order: 1 }).lean(),
      authCtx
        ? Bookmark.find({ userId: authCtx.user._id, targetType: 'product', targetId: { $in: productIds } }).lean()
        : [],
    ]);

    const mediaMap = new Map<string, ReturnType<typeof serializeMedia>[]>();
    for (const m of mediaRows) {
      const k = String(m.targetId);
      const arr = mediaMap.get(k) || [];
      arr.push(serializeMedia(m as never));
      mediaMap.set(k, arr);
    }

    const bmSet = new Set(bookmarks.map((b) => String(b.targetId)));

    return apiSuccess(
      {
        products: products.map((p) => {
          const media = mediaMap.get(String(p._id)) || [];
          const discountAmount = p.discount > 0 ? (p.price * p.discount) / 100 : 0;
          return {
            ...p,
            id: String(p._id),
            seller: p.userId,
            category: p.categoryId,
            store: p.storeId,
            salePrice: Math.max(0, Number((p.price - discountAmount).toFixed(2))),
            media,
            previewImageUrl: media[0]?.url || '/assets/products/default-preview.png',
            isBookmarked: bmSet.has(String(p._id)),
          };
        }),
        categories: categories.map((c) => ({
          id: String(c._id),
          name: c.localization?.en || 'Category',
          localization: c.localization,
        })),
      },
      { page, limit, total }
    );
  } catch (err) {
    return apiError(err);
  }
}

const createProductSchema = z.object({
  title: z.string().min(3).max(160),
  description: z.string().max(5000).optional(),
  categoryId: z.string().optional(),
  storeId: z.string().optional(),
  condition: z.nativeEnum(ProductCondition).default(ProductCondition.NEW),
  type: z.nativeEnum(ProductType).default(ProductType.PHYSICAL),
  currency: z.string().optional(),
  stockQuantity: z.number().int().min(0).default(1),
  price: z.number().min(0),
  discount: z.number().min(0).max(99).default(0),
  address: z.string().max(255).optional(),
  mediaIds: z.array(z.string()).max(10).optional(),
  publishNow: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const [body, appCfg] = await Promise.all([
      req.json().then((raw) => createProductSchema.parse(raw)),
      getSettingsGroup('app'),
    ]);
    const hashId = encodeId(crypto.randomInt(100000, 999999999));

    const product = await Product.create({
      hashId,
      userId: user._id,
      categoryId: body.categoryId ? new Types.ObjectId(body.categoryId) : null,
      storeId: body.storeId ? new Types.ObjectId(body.storeId) : null,
      title: body.title.trim(),
      description: body.description?.trim() || '',
      condition: body.condition,
      type: body.type,
      currency: (body.currency || appCfg.defaultCurrency || 'USD').toUpperCase(),
      stockQuantity: body.stockQuantity,
      price: body.price,
      discount: body.discount,
      address: body.address?.trim() || null,
      status: body.publishNow ? ProductStatus.ACTIVE : ProductStatus.DRAFT,
      approval: ProductApproval.APPROVED, // Configurable via admin auto-approve or pending queue
    });

    if (body.mediaIds && body.mediaIds.length > 0) {
      await Media.updateMany(
        { _id: { $in: body.mediaIds }, ownerId: user._id },
        { $set: { targetType: 'product', targetId: product._id } }
      );
    }

    return apiSuccess({ id: String(product._id), hashId: product.hashId }, undefined, 201);
  } catch (err) {
    return apiError(err);
  }
}
