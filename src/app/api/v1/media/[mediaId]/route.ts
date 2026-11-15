import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, ForbiddenError, NotFoundError } from '@/lib/api-response';
import { Media } from '@/models/Media';
import { createPresignedDownloadUrl, isR2Configured } from '@/lib/r2';
import { deleteMediaRecord } from '@/services/media.service';
import { UserRole } from '@/types/enums';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ mediaId: string }> }
) {
  try {
    await requireAuth(req);
    const { mediaId } = await context.params;
    const media = await Media.findById(mediaId);
    if (!media) throw new NotFoundError('Media file not found.');

    const filename =
      (media.metadata?.originalFilename as string) || `document.${media.extension || 'bin'}`;

    if (media.storageProvider === 'external' && media.externalUrl) {
      return apiSuccess({ downloadUrl: media.externalUrl, filename });
    }

    if (!isR2Configured()) {
      throw new NotFoundError('R2 storage is not configured.');
    }

    const downloadUrl = await createPresignedDownloadUrl(media.r2Key, 900, filename);
    await Media.updateOne(
      { _id: media._id },
      { $inc: { 'metadata.downloadsCount': 1 } }
    );

    return apiSuccess({ downloadUrl, filename });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { user } = await requireAuth(req);
    const { mediaId } = await context.params;
    const media = await Media.findById(mediaId);
    if (!media) throw new NotFoundError('Media not found.');

    const isAdmin = user.role === UserRole.ROOT || user.role === UserRole.ADMIN;
    if (String(media.ownerId) !== String(user._id) && !isAdmin) {
      throw new ForbiddenError('Cannot delete another user media file.');
    }

    await deleteMediaRecord(mediaId);
    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
