import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, ForbiddenError } from '@/lib/api-response';
import { createMediaUploadSession } from '@/services/media.service';
import { MediaType, UserRole } from '@/types/enums';

const presignSchema = z.object({
  namespace: z.enum([
    'avatars',
    'covers',
    'posts',
    'stories',
    'chats',
    'marketplace',
    'business',
    'jobs',
    'ads',
    'documents',
    'system',
  ]),
  targetType: z.enum([
    'post',
    'story_frame',
    'message',
    'product',
    'ad',
    'user_avatar',
    'user_cover',
    'business_logo',
    'business_cover',
    'job_attachment',
    'system_asset',
  ]),
  mediaType: z.nativeEnum(MediaType),
  mimeType: z.string().min(3),
  sizeBytes: z.number().int().positive(),
  filename: z.string().min(1),
  order: z.number().int().min(0).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req, { allowOnboarding: true });
    const body = presignSchema.parse(await req.json());
    if (
      (body.namespace === 'system' || body.targetType === 'system_asset') &&
      ![UserRole.ROOT, UserRole.ADMIN, UserRole.MODERATOR].includes(user.role)
    ) {
      throw new ForbiddenError('Administrator privileges required to upload system assets.');
    }
    const result = await createMediaUploadSession({
      ownerId: String(user._id),
      ...body,
    });
    return apiSuccess(result, undefined, 201);
  } catch (err) {
    return apiError(err);
  }
}
