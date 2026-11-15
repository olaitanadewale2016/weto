import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess } from '@/lib/api-response';
import { completeMediaUpload } from '@/services/media.service';

const completeSchema = z.object({
  mediaId: z.string().min(1),
  lqipBase64: z.string().nullable().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSeconds: z.number().nonnegative().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req, { allowOnboarding: true });
    const body = completeSchema.parse(await req.json());
    const media = await completeMediaUpload({
      ...body,
      ownerId: String(user._id),
    });
    return apiSuccess(media);
  } catch (err) {
    return apiError(err);
  }
}
