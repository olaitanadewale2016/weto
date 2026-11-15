import crypto from 'crypto';
import { Types } from 'mongoose';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectDB, withMongoTransaction } from '@/lib/db';
import { getOptionalAuth, requireAuth } from '@/lib/auth/session';
import {
  apiError,
  apiSuccess,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/lib/api-response';
import { Product } from '@/models/Commerce';
import { Bookmark } from '@/models/Post';
import { Media } from '@/models/Media';
import { Wallet, WalletTransaction } from '@/models/Finance';
import {
  ProductCondition,
  ProductStatus,
  ProductType,
  TransactionDirection,
  TransactionStatus,
  TransactionType,
  UserRole,
} from '@/types/enums';
import { isObjectIdLike } from '@/lib/hashids';
import { deleteMediaRecord, serializeMedia } from '@/services/media.service';
import { ensureWallet } from '@/services/wallet.service';
import { dispatchNotification } from '@/services/notification.service';
import { getListingPromotionPlan } from '@/lib/promotions';
import { resolveMediaUrl } from '@/lib/media-url';

async function findProduct(idOrHash: string) {
  return Product.findOne(isObjectIdLike(idOrHash) ? { _id: idOrHash } : { hashId: idOrHash });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ productId: string }> }
) {
  try {
    await connectDB();
    const { productId } = await context.params;
    const authCtx = await getOptionalAuth(req);
    const product = await findProduct(productId);
    if (!product) throw new NotFoundError('Product not found.');

    await Product.updateOne({ _id: product._id }, { $inc: { viewsCount: 1 } });

    const populated = await Product.findById(product._id)
      .populate('userId', 'username firstName lastName avatar verified bio')
      .populate('categoryId', 'localization')
      .populate('storeId')
      .lean();

    const effectivePromoted = Boolean(
      product.isPromoted && (!product.promotedUntil || product.promotedUntil.getTime() > Date.now())
    );
    if (product.isPromoted && !effectivePromoted) {
      await Product.updateOne({ _id: product._id }, { $set: { isPromoted: false } });
    }

    const [mediaRows, bookmarked] = await Promise.all([
      Media.find({ targetType: 'product', targetId: product._id }).sort({ order: 1 }).lean(),
      authCtx
        ? Bookmark.exists({ userId: authCtx.user._id, targetType: 'product', targetId: product._id })
        : false,
    ]);

    const media = mediaRows.map((m) => serializeMedia(m as never));
    const discountAmount = product.discount > 0 ? (product.price * product.discount) / 100 : 0;
    const firstVisual = media.find((m) => m.url || m.publicUrl || m.thumbnailUrl);
    const previewRaw = firstVisual?.url || firstVisual?.publicUrl || firstVisual?.thumbnailUrl || '';
    const sellerObj = populated?.userId as unknown as Record<string, unknown> | null;
    const normalizedSeller =
      sellerObj && typeof sellerObj === 'object'
        ? {
            ...sellerObj,
            avatar:
              resolveMediaUrl(String(sellerObj.avatar || '')) ||
              '/assets/avatars/default-avatar.png',
          }
        : populated?.userId;

    return apiSuccess({
      ...populated,
      id: String(product._id),
      isPromoted: effectivePromoted,
      promotedUntil: product.promotedUntil || null,
      seller: normalizedSeller,
      category: populated?.categoryId,
      store: populated?.storeId,
      salePrice: Math.max(0, Number((product.price - discountAmount).toFixed(2))),
      media,
      previewImageUrl: resolveMediaUrl(previewRaw) || '/assets/products/default-preview.png',
      isBookmarked: Boolean(bookmarked),
    });
  } catch (err) {
    return apiError(err);
  }
}

const patchProductSchema = z.object({
  action: z.enum(['update', 'bookmark', 'toggle_status', 'promote']).default('update'),
  promotionPlan: z.enum(['3d', '7d', '14d']).optional(),
  title: z.string().min(3).max(160).optional(),
  description: z.string().max(5000).optional(),
  categoryId: z.string().nullable().optional(),
  condition: z.nativeEnum(ProductCondition).optional(),
  type: z.nativeEnum(ProductType).optional(),
  currency: z.string().max(8).optional(),
  price: z.number().min(0).optional(),
  discount: z.number().min(0).max(99).optional(),
  stockQuantity: z.number().int().min(0).optional(),
  address: z.string().optional(),
  isPromoted: z.boolean().optional(),
  status: z.nativeEnum(ProductStatus).optional(),
  mediaIds: z.array(z.string()).max(10).optional(),
  removeMediaIds: z.array(z.string()).max(10).optional(),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ productId: string }> }
) {
  try {
    const { user } = await requireAuth(req);
    const { productId } = await context.params;
    const body = patchProductSchema.parse(await req.json());
    const product = await findProduct(productId);
    if (!product) throw new NotFoundError('Product not found.');

    if (body.action === 'bookmark') {
      const existing = await Bookmark.findOne({
        userId: user._id,
        targetType: 'product',
        targetId: product._id,
      });
      if (existing) {
        await Bookmark.deleteOne({ _id: existing._id });
        await Product.updateOne({ _id: product._id, bookmarksCount: { $gt: 0 } }, { $inc: { bookmarksCount: -1 } });
        return apiSuccess({ bookmarked: false });
      }
      await Bookmark.create({ userId: user._id, targetType: 'product', targetId: product._id });
      await Product.updateOne({ _id: product._id }, { $inc: { bookmarksCount: 1 } });
      return apiSuccess({ bookmarked: true });
    }

    const isOwner = String(product.userId) === String(user._id);
    const isAdmin = user.role === UserRole.ROOT || user.role === UserRole.ADMIN;
    if (!isOwner && !isAdmin) throw new ForbiddenError('Cannot modify this product.');

    if (body.action === 'toggle_status') {
      product.status =
        product.status === ProductStatus.ACTIVE ? ProductStatus.INACTIVE : ProductStatus.ACTIVE;
      await product.save();
      return apiSuccess({ id: String(product._id), status: product.status, updated: true });
    }

    if (body.action === 'promote') {
      const plan = getListingPromotionPlan(body.promotionPlan);
      const wallet = await ensureWallet(user._id);

      const baseStart =
        product.isPromoted && product.promotedUntil && product.promotedUntil.getTime() > Date.now()
          ? product.promotedUntil.getTime()
          : Date.now();
      const promotedUntil = new Date(baseStart + plan.durationDays * 24 * 60 * 60 * 1000);
      const tnxRef = `PROMO-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

      await withMongoTransaction(async (session) => {
        const updatedWallet = await Wallet.findOneAndUpdate(
          { _id: wallet._id, balance: { $gte: plan.price } },
          { $inc: { balance: -plan.price } },
          { new: true, session }
        );
        if (!updatedWallet) {
          throw new ValidationError(
            `Insufficient wallet balance. ${plan.price} ${wallet.currency} required to activate ${plan.label}.`
          );
        }

        await WalletTransaction.create(
          [
            {
              walletId: updatedWallet._id,
              userId: user._id,
              amount: plan.price,
              commission: 0,
              currency: updatedWallet.currency,
              transactionType: TransactionType.ADVERTISING,
              isInternal: true,
              direction: TransactionDirection.OUTGOING,
              status: TransactionStatus.COMPLETED,
              idempotencyKey: `promo_${product._id}_${crypto.randomUUID()}`,
              metadata: {
                tnxId: tnxRef,
                sourceName: `Listing boost: ${product.title}`,
                productId: String(product._id),
                productHashId: product.hashId,
                planId: plan.id,
                planLabel: plan.label,
                durationDays: plan.durationDays,
              },
            },
          ],
          { session }
        );

        await Product.updateOne(
          { _id: product._id },
          {
            $set: {
              isPromoted: true,
              promotedUntil,
              status: ProductStatus.ACTIVE,
            },
          },
          { session }
        );
      });

      await dispatchNotification({
        recipientId: user._id,
        actorId: user._id,
        type: 'product_promoted',
        category: 'important',
        title: 'Listing Promoted',
        message: `Your listing "${product.title}" is now Promoted (${plan.label}).`,
        entityType: 'product',
        entityId: String(product._id),
        actionUrl: `/marketplace/product/${product.hashId || product._id}`,
      });

      return apiSuccess({
        id: String(product._id),
        isPromoted: true,
        promotedUntil: promotedUntil.toISOString(),
        plan,
      });
    }

    if (body.title !== undefined) product.title = body.title.trim();
    if (body.description !== undefined) product.description = body.description.trim();
    if (body.categoryId !== undefined) {
      product.categoryId =
        body.categoryId && Types.ObjectId.isValid(body.categoryId)
          ? new Types.ObjectId(body.categoryId)
          : null;
    }
    if (body.condition !== undefined) product.condition = body.condition;
    if (body.type !== undefined) product.type = body.type;
    if (body.currency !== undefined) product.currency = body.currency.toUpperCase();
    if (body.price !== undefined) product.price = body.price;
    if (body.discount !== undefined) product.discount = body.discount;
    if (body.stockQuantity !== undefined) product.stockQuantity = body.stockQuantity;
    if (body.address !== undefined) product.address = body.address;
    if (body.isPromoted !== undefined && isAdmin) product.isPromoted = body.isPromoted;
    if (body.status !== undefined) product.status = body.status;

    await product.save();

    if (body.removeMediaIds && body.removeMediaIds.length > 0) {
      const validRemoveIds = body.removeMediaIds.filter((mid) => Types.ObjectId.isValid(mid));
      if (validRemoveIds.length > 0) {
        const removable = await Media.find({
          _id: { $in: validRemoveIds.map((id) => new Types.ObjectId(id)) },
          targetType: 'product',
          targetId: product._id,
          ...(isAdmin ? {} : { ownerId: user._id }),
        })
          .select('_id')
          .lean();
        await Promise.all(removable.map((m) => deleteMediaRecord(String(m._id))));
      }
    }

    if (body.mediaIds && body.mediaIds.length > 0) {
      const validIds = body.mediaIds.filter((mid) => Types.ObjectId.isValid(mid));
      if (validIds.length > 0) {
        const existingCount = await Media.countDocuments({
          targetType: 'product',
          targetId: product._id,
        });
        await Media.bulkWrite(
          validIds.map((mid, idx) => ({
            updateOne: {
              filter: {
                _id: new Types.ObjectId(mid),
                ...(isAdmin ? {} : { ownerId: user._id }),
              },
              update: {
                $set: {
                  targetType: 'product',
                  targetId: product._id,
                  order: existingCount + idx,
                },
              },
            },
          }))
        );
      }
    }

    return apiSuccess({ id: String(product._id), status: product.status, updated: true });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ productId: string }> }
) {
  try {
    const { user } = await requireAuth(req);
    const { productId } = await context.params;
    const product = await findProduct(productId);
    if (!product) throw new NotFoundError('Product not found.');

    const isOwner = String(product.userId) === String(user._id);
    const isAdmin = user.role === UserRole.ROOT || user.role === UserRole.ADMIN;
    if (!isOwner && !isAdmin) throw new ForbiddenError('Cannot delete this product.');

    const media = await Media.find({ targetType: 'product', targetId: product._id }).select('_id');
    await Promise.all(media.map((m) => deleteMediaRecord(String(m._id))));
    await Bookmark.deleteMany({ targetType: 'product', targetId: product._id });
    await Product.deleteOne({ _id: product._id });

    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
