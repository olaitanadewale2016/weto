import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { getOptionalAuth, requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, ConflictError, ForbiddenError, NotFoundError } from '@/lib/api-response';
import { JobApplication, JobListing } from '@/models/Commerce';
import { Bookmark } from '@/models/Post';
import { JobStatus, UserRole } from '@/types/enums';
import { isObjectIdLike } from '@/lib/hashids';
import { dispatchNotification } from '@/services/notification.service';

async function findJob(idOrHash: string) {
  return JobListing.findOne(isObjectIdLike(idOrHash) ? { _id: idOrHash } : { hashId: idOrHash });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    await connectDB();
    const { jobId } = await context.params;
    const authCtx = await getOptionalAuth(req);
    const job = await findJob(jobId);
    if (!job) throw new NotFoundError('Job listing not found.');

    await JobListing.updateOne({ _id: job._id }, { $inc: { viewsCount: 1 } });

    const populated = await JobListing.findById(job._id)
      .populate('userId', 'username firstName lastName avatar verified bio')
      .populate('categoryId', 'localization')
      .lean();

    const isOwner = authCtx ? String(job.userId) === String(authCtx.user._id) : false;

    const [bookmarked, myApp, applications] = await Promise.all([
      authCtx ? Bookmark.exists({ userId: authCtx.user._id, targetType: 'job', targetId: job._id }) : false,
      authCtx ? JobApplication.findOne({ jobId: job._id, applicantId: authCtx.user._id }).lean() : null,
      isOwner
        ? JobApplication.find({ jobId: job._id })
            .sort({ createdAt: -1 })
            .populate('applicantId', 'username firstName lastName avatar verified email')
            .lean()
        : [],
    ]);

    return apiSuccess({
      ...populated,
      id: String(job._id),
      employer: populated?.userId,
      category: populated?.categoryId,
      isBookmarked: Boolean(bookmarked),
      myApplication: myApp,
      ...(isOwner ? { applications } : {}),
    });
  } catch (err) {
    return apiError(err);
  }
}

const applySchema = z.object({
  coverLetter: z.string().max(4000).default(''),
  resumeMediaId: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { user } = await requireAuth(req);
    const { jobId } = await context.params;
    const body = applySchema.parse(await req.json());
    const job = await findJob(jobId);
    if (!job) throw new NotFoundError('Job listing not found.');

    const exists = await JobApplication.exists({ jobId: job._id, applicantId: user._id });
    if (exists) throw new ConflictError('You have already applied for this job.');

    const app = await JobApplication.create({
      jobId: job._id,
      applicantId: user._id,
      employerId: job.userId,
      coverLetter: body.coverLetter.trim(),
      resumeMediaId: body.resumeMediaId ? new Types.ObjectId(body.resumeMediaId) : null,
    });

    await JobListing.updateOne(
      { _id: job._id },
      { $inc: { applicationsCount: 1 }, $set: { lastContactedAt: new Date() } }
    );

    await dispatchNotification({
      recipientId: job.userId,
      actorId: user._id,
      type: 'JOB_APPLICATION',
      category: 'important',
      title: 'New Job Application',
      message: `@${user.username} applied to "${job.title}".`,
      actionUrl: `/jobs/${job.hashId}`,
      forceChannels: true,
    });

    return apiSuccess({ applicationId: String(app._id) }, undefined, 201);
  } catch (err) {
    return apiError(err);
  }
}

const patchJobSchema = z.object({
  action: z.enum(['update', 'bookmark', 'update_application']).default('update'),
  title: z.string().min(3).max(160).optional(),
  overview: z.string().optional(),
  description: z.string().optional(),
  income: z.number().nullable().optional(),
  location: z.string().optional(),
  isRemote: z.boolean().optional(),
  isUrgent: z.boolean().optional(),
  isPromoted: z.boolean().optional(),
  status: z.nativeEnum(JobStatus).optional(),
  applicationId: z.string().optional(),
  applicationStatus: z.enum(['pending', 'reviewed', 'shortlisted', 'rejected', 'hired']).optional(),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { user } = await requireAuth(req);
    const { jobId } = await context.params;
    const body = patchJobSchema.parse(await req.json());
    const job = await findJob(jobId);
    if (!job) throw new NotFoundError('Job listing not found.');

    if (body.action === 'bookmark') {
      const existing = await Bookmark.findOne({
        userId: user._id,
        targetType: 'job',
        targetId: job._id,
      });
      if (existing) {
        await Bookmark.deleteOne({ _id: existing._id });
        await JobListing.updateOne({ _id: job._id, bookmarksCount: { $gt: 0 } }, { $inc: { bookmarksCount: -1 } });
        return apiSuccess({ bookmarked: false });
      }
      await Bookmark.create({ userId: user._id, targetType: 'job', targetId: job._id });
      await JobListing.updateOne({ _id: job._id }, { $inc: { bookmarksCount: 1 } });
      return apiSuccess({ bookmarked: true });
    }

    const isOwner = String(job.userId) === String(user._id);
    const isAdmin = user.role === UserRole.ROOT || user.role === UserRole.ADMIN;
    if (!isOwner && !isAdmin) throw new ForbiddenError('Cannot modify this job.');

    if (body.action === 'update_application' && body.applicationId && body.applicationStatus) {
      const app = await JobApplication.findOneAndUpdate(
        { _id: body.applicationId, jobId: job._id },
        { $set: { status: body.applicationStatus } },
        { new: true }
      );
      if (app) {
        await dispatchNotification({
          recipientId: app.applicantId,
          actorId: user._id,
          type: 'JOB_APPLICATION_STATUS',
          category: 'important',
          title: 'Application Update',
          message: `Your application for "${job.title}" is now ${body.applicationStatus}.`,
          actionUrl: `/jobs/${job.hashId}`,
        });
      }
      return apiSuccess({ updated: true });
    }

    if (body.title !== undefined) job.title = body.title.trim();
    if (body.overview !== undefined) job.overview = body.overview.trim();
    if (body.description !== undefined) job.description = body.description.trim();
    if (body.income !== undefined) job.income = body.income;
    if (body.location !== undefined) job.location = body.location;
    if (body.isRemote !== undefined) job.isRemote = body.isRemote;
    if (body.isUrgent !== undefined) job.isUrgent = body.isUrgent;
    if (body.isPromoted !== undefined) job.isPromoted = body.isPromoted;
    if (body.status !== undefined) job.status = body.status;

    await job.save();
    return apiSuccess({ id: String(job._id), updated: true });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { user } = await requireAuth(req);
    const { jobId } = await context.params;
    const job = await findJob(jobId);
    if (!job) throw new NotFoundError('Job listing not found.');

    const isOwner = String(job.userId) === String(user._id);
    const isAdmin = user.role === UserRole.ROOT || user.role === UserRole.ADMIN;
    if (!isOwner && !isAdmin) throw new ForbiddenError('Cannot delete this job.');

    await Promise.all([
      JobApplication.deleteMany({ jobId: job._id }),
      Bookmark.deleteMany({ targetType: 'job', targetId: job._id }),
      JobListing.deleteOne({ _id: job._id }),
    ]);

    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
