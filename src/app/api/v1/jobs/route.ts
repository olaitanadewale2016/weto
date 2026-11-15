import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { getOptionalAuth, requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess } from '@/lib/api-response';
import { Category, JobApplication, JobListing } from '@/models/Commerce';
import { Bookmark } from '@/models/Post';
import { CategoryStatus, CategoryType, JobApproval, JobStatus, JobType } from '@/types/enums';
import { encodeId } from '@/lib/hashids';
import { getSettingsGroup } from '@/services/settings.service';

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const authCtx = await getOptionalAuth(req);
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const categoryId = searchParams.get('categoryId');
    const type = searchParams.get('type');
    const remote = searchParams.get('remote') === 'true';
    const urgent = searchParams.get('urgent') === 'true';
    const savedOnly = searchParams.get('saved') === 'true';
    const mine = searchParams.get('mine') === 'true';
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const limit = Math.min(40, Math.max(1, Number(searchParams.get('limit') || 20)));

    const filter: Record<string, unknown> = {};
    if (mine && authCtx) {
      filter.userId = authCtx.user._id;
    } else {
      filter.status = JobStatus.ACTIVE;
      filter.approval = JobApproval.APPROVED;
    }

    if (categoryId) filter.categoryId = new Types.ObjectId(categoryId);
    if (type) filter.type = type;
    if (remote) filter.isRemote = true;
    if (urgent) filter.isUrgent = true;

    if (savedOnly && authCtx) {
      const bms = await Bookmark.find({ userId: authCtx.user._id, targetType: 'job' }).lean();
      filter._id = { $in: bms.map((b) => b.targetId) };
    }

    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { title: { $regex: escaped, $options: 'i' } },
        { overview: { $regex: escaped, $options: 'i' } },
        { description: { $regex: escaped, $options: 'i' } },
        { location: { $regex: escaped, $options: 'i' } },
      ];
    }

    const [jobs, categories, total] = await Promise.all([
      JobListing.find(filter)
        .sort({ isPromoted: -1, isUrgent: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'username firstName lastName avatar verified')
        .populate('categoryId', 'localization')
        .lean(),
      Category.find({ categorizableType: CategoryType.JOB, status: CategoryStatus.ACTIVE }).lean(),
      JobListing.countDocuments(filter),
    ]);

    const jobIds = jobs.map((j) => j._id);
    const [bookmarks, myApps] = await Promise.all([
      authCtx
        ? Bookmark.find({ userId: authCtx.user._id, targetType: 'job', targetId: { $in: jobIds } }).lean()
        : [],
      authCtx
        ? JobApplication.find({ applicantId: authCtx.user._id, jobId: { $in: jobIds } }).lean()
        : [],
    ]);

    const bmSet = new Set(bookmarks.map((b) => String(b.targetId)));
    const appMap = new Map(myApps.map((a) => [String(a.jobId), a.status]));

    return apiSuccess(
      {
        jobs: jobs.map((j) => ({
          ...j,
          id: String(j._id),
          employer: j.userId,
          category: j.categoryId,
          isBookmarked: bmSet.has(String(j._id)),
          applicationStatus: appMap.get(String(j._id)) || null,
        })),
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

const createJobSchema = z.object({
  title: z.string().min(3).max(160),
  overview: z.string().max(400).optional(),
  description: z.string().max(10000).optional(),
  categoryId: z.string().optional(),
  type: z.nativeEnum(JobType).default(JobType.VACANCY),
  income: z.number().nonnegative().nullable().optional(),
  isStartIncome: z.boolean().default(false),
  currency: z.string().optional(),
  location: z.string().max(160).optional(),
  isRemote: z.boolean().default(true),
  isUrgent: z.boolean().default(false),
  publishNow: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const [body, appCfg] = await Promise.all([
      req.json().then((raw) => createJobSchema.parse(raw)),
      getSettingsGroup('app'),
    ]);
    const hashId = encodeId(crypto.randomInt(100000, 999999999));

    const job = await JobListing.create({
      hashId,
      userId: user._id,
      categoryId: body.categoryId ? new Types.ObjectId(body.categoryId) : null,
      title: body.title.trim(),
      overview: body.overview?.trim() || '',
      description: body.description?.trim() || '',
      type: body.type,
      income: body.income ?? null,
      isStartIncome: body.isStartIncome,
      currency: (body.currency || appCfg.defaultCurrency || 'USD').toUpperCase(),
      location: body.location?.trim() || null,
      isRemote: body.isRemote,
      isUrgent: body.isUrgent,
      status: body.publishNow ? JobStatus.ACTIVE : JobStatus.DRAFT,
      approval: JobApproval.APPROVED,
    });

    return apiSuccess({ id: String(job._id), hashId: job.hashId }, undefined, 201);
  } catch (err) {
    return apiError(err);
  }
}
