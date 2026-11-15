import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess } from '@/lib/api-response';
import { Report } from '@/models/Moderation';
import { ReportType } from '@/types/enums';
import { REPORT_REASONS } from '@/data/world';

export async function GET(req: NextRequest) {
  const type = (new URL(req.url).searchParams.get('type') || 'post') as keyof typeof REPORT_REASONS;
  return apiSuccess(REPORT_REASONS[type] || REPORT_REASONS.post);
}

const submitReportSchema = z.object({
  reportableType: z.nativeEnum(ReportType),
  reportableId: z.string().min(1),
  reasonIndex: z.number().int().min(0).max(20),
  comment: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const body = submitReportSchema.parse(await req.json());

    const report = await Report.create({
      reporterId: user._id,
      reportableId: new Types.ObjectId(body.reportableId),
      reportableType: body.reportableType,
      reasonIndex: body.reasonIndex,
      reporterComment: body.comment?.trim() || null,
    });

    return apiSuccess({ id: String(report._id), submitted: true }, undefined, 201);
  } catch (err) {
    return apiError(err);
  }
}
