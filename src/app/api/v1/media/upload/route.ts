import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, ForbiddenError, ValidationError } from '@/lib/api-response';
import { uploadMediaBufferDirectly } from '@/services/media.service';
import { MediaType, UserRole } from '@/types/enums';

const metaSchema = z.object({
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
  order: z.coerce.number().int().min(0).optional(),
  durationSeconds: z.coerce.number().nonnegative().optional(),
});

/**
 * Server-assisted upload endpoint backing R2 storage when direct browser presigned PUT
 * is unavailable (e.g., CORS restrictions or system branding assets).
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req, { allowOnboarding: true });
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      throw new ValidationError('No file provided in multipart payload.');
    }

    const parsed = metaSchema.parse({
      namespace: form.get('namespace') || 'posts',
      targetType: form.get('targetType') || 'post',
      mediaType: form.get('mediaType') || MediaType.IMAGE,
      order: form.get('order') || undefined,
      durationSeconds: form.get('durationSeconds') || undefined,
    });

    if (
      (parsed.namespace === 'system' || parsed.targetType === 'system_asset') &&
      ![UserRole.ROOT, UserRole.ADMIN, UserRole.MODERATOR].includes(user.role)
    ) {
      throw new ForbiddenError('Administrator privileges required to upload system assets.');
    }

    const existingMediaId = form.get('existingMediaId');
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadMediaBufferDirectly({
      ownerId: String(user._id),
      namespace: parsed.namespace,
      targetType: parsed.targetType,
      mediaType: parsed.mediaType,
      mimeType: (file.type || 'application/octet-stream').split(';')[0].trim().toLowerCase(),
      buffer,
      filename: file.name || `upload-${Date.now()}`,
      order: parsed.order,
      durationSeconds: parsed.durationSeconds,
      existingMediaId: typeof existingMediaId === 'string' && existingMediaId ? existingMediaId : undefined,
    });

    return apiSuccess(result, undefined, 201);
  } catch (err) {
    return apiError(err);
  }
}
