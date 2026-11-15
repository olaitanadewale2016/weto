import sharp from 'sharp';
import { Queue } from 'bullmq';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { DataStat, IMediaDocument, Media, MediaTargetType } from '@/models/Media';
import {
  buildR2Key,
  createPresignedUploadUrl,
  deleteR2Object,
  getPublicR2Url,
  headR2Object,
  isR2Configured,
  MediaNamespace,
  putR2Buffer,
} from '@/lib/r2';
import { MediaStatus, MediaType } from '@/types/enums';
import { ValidationError } from '@/lib/api-response';
import { getRedis } from '@/lib/redis';
import { logger } from '@/lib/logger';

const ALLOWED_MIMES: Record<MediaType, string[]> = {
  [MediaType.IMAGE]: [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'image/avif',
    'image/bmp',
  ],
  [MediaType.VIDEO]: [
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-matroska',
    'video/3gpp',
  ],
  [MediaType.VIDEO_CIRCLE]: ['video/mp4', 'video/webm'],
  [MediaType.AUDIO]: [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/ogg',
    'audio/webm',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac',
    'audio/flac',
  ],
  [MediaType.DOCUMENT]: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'text/plain',
    'text/csv',
    'application/octet-stream',
  ],
  [MediaType.GIF]: ['image/gif', 'video/mp4'],
  [MediaType.TEXT]: ['text/plain'],
};

const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
  'image/x-bmp': 'image/bmp',
  'image/x-ms-bmp': 'image/bmp',
  'video/x-m4v': 'video/mp4',
  'audio/mp3': 'audio/mpeg',
  'audio/x-mpeg': 'audio/mpeg',
  'audio/m4a': 'audio/mp4',
  'audio/x-m4a': 'audio/mp4',
  'application/vnd.rar': 'application/x-rar-compressed',
  'application/x-rar': 'application/x-rar-compressed',
  'application/x-zip': 'application/zip',
  'text/comma-separated-values': 'text/csv',
};

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  '3gp': 'video/3gpp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
  rar: 'application/x-rar-compressed',
};

export function normalizeMediaMime(mimeType: string, filename = ''): string {
  const cleaned = mimeType.split(';')[0].trim().toLowerCase();
  const aliased = MIME_ALIASES[cleaned] || cleaned;
  if (aliased && aliased !== 'application/octet-stream') {
    return aliased;
  }
  const ext = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() || '' : '';
  return EXT_TO_MIME[ext] || aliased || 'application/octet-stream';
}

const MAX_SIZE_BYTES: Record<MediaType, number> = {
  [MediaType.IMAGE]: 15 * 1024 * 1024, // 15 MB
  [MediaType.VIDEO]: 250 * 1024 * 1024, // 250 MB
  [MediaType.VIDEO_CIRCLE]: 50 * 1024 * 1024,
  [MediaType.AUDIO]: 50 * 1024 * 1024,
  [MediaType.DOCUMENT]: 50 * 1024 * 1024,
  [MediaType.GIF]: 15 * 1024 * 1024,
  [MediaType.TEXT]: 1 * 1024 * 1024,
};

let mediaQueue: Queue | null = null;

export function isMediaWorkerEnabled(): boolean {
  if (process.env.ENABLE_MEDIA_WORKER === 'true') return true;
  if (process.env.ENABLE_MEDIA_WORKER === 'false') return false;
  // On Vercel serverless, assume no background BullMQ worker is attached unless explicitly enabled
  return !process.env.VERCEL;
}

export function getMediaQueue(): Queue | null {
  if (!isMediaWorkerEnabled()) return null;
  if (mediaQueue) return mediaQueue;
  const redis = getRedis();
  if (!redis) return null;
  mediaQueue = new Queue('media-processing', { connection: redis });
  return mediaQueue;
}

function validateMediaUploadParams(params: {
  namespace: MediaNamespace;
  mediaType: MediaType;
  mimeType: string;
  sizeBytes: number;
  filename: string;
}) {
  const normalizedMime = normalizeMediaMime(params.mimeType, params.filename);
  const baseAllowed = ALLOWED_MIMES[params.mediaType] || [];
  const systemExtras =
    params.namespace === 'system' && params.mediaType === MediaType.IMAGE
      ? ['image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']
      : [];
  const allowed = [...baseAllowed, ...systemExtras];

  if (!allowed.includes(normalizedMime)) {
    throw new ValidationError(`Unsupported MIME type ${normalizedMime} for ${params.mediaType}.`);
  }

  const maxBytes = MAX_SIZE_BYTES[params.mediaType] ?? 15 * 1024 * 1024;
  if (params.sizeBytes <= 0 || params.sizeBytes > maxBytes) {
    throw new ValidationError(`File size exceeds allowed limit of ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }

  if (!isR2Configured()) {
    throw new ValidationError('Cloudflare R2 storage is not configured in environment variables.');
  }

  const extFromName = params.filename.includes('.') ? params.filename.split('.').pop()?.toLowerCase() : '';
  const extFromMime = normalizedMime.split('/')[1]?.replace(/[^a-z0-9]/g, '') || '';
  const ext = (extFromName || extFromMime || 'bin')
    .replace(/^mpeg$/, 'mp3')
    .replace(/^quicktime$/, 'mov')
    .replace(/^svgxml$/, 'svg')
    .replace(/^xicon$|^vndmicrosofticon$/, 'ico');

  return { normalizedMime, ext };
}

export async function createMediaUploadSession(params: {
  ownerId: string;
  namespace: MediaNamespace;
  targetType: MediaTargetType;
  mediaType: MediaType;
  mimeType: string;
  sizeBytes: number;
  filename: string;
  order?: number;
}) {
  const { normalizedMime, ext } = validateMediaUploadParams(params);

  await connectDB();
  const r2Key = buildR2Key(params.namespace, params.ownerId, ext);
  const presigned = await createPresignedUploadUrl({
    key: r2Key,
    contentType: normalizedMime,
    contentLength: params.sizeBytes,
  });

  const media = await Media.create({
    ownerId: new Types.ObjectId(params.ownerId),
    targetType: params.targetType,
    r2Key,
    type: params.mediaType,
    status: MediaStatus.PENDING,
    storageProvider: 'r2',
    extension: ext,
    mime: normalizedMime,
    sizeBytes: params.sizeBytes,
    order: params.order ?? 0,
    metadata: { originalFilename: params.filename },
  });

  return {
    mediaId: String(media._id),
    uploadUrl: presigned.uploadUrl,
    r2Key,
    publicUrl: getPublicR2Url(r2Key),
  };
}

export async function uploadMediaBufferDirectly(params: {
  ownerId: string;
  namespace: MediaNamespace;
  targetType: MediaTargetType;
  mediaType: MediaType;
  mimeType: string;
  buffer: Buffer;
  filename: string;
  order?: number;
  durationSeconds?: number;
  existingMediaId?: string;
}) {
  const { normalizedMime, ext } = validateMediaUploadParams({
    namespace: params.namespace,
    mediaType: params.mediaType,
    mimeType: params.mimeType,
    sizeBytes: params.buffer.length,
    filename: params.filename,
  });

  await connectDB();
  const existingPending =
    params.existingMediaId && Types.ObjectId.isValid(params.existingMediaId)
      ? await Media.findOne({
          _id: new Types.ObjectId(params.existingMediaId),
          ownerId: new Types.ObjectId(params.ownerId),
          status: MediaStatus.PENDING,
        })
      : null;

  const r2Key =
    existingPending && existingPending.extension === ext
      ? existingPending.r2Key
      : buildR2Key(params.namespace, params.ownerId, ext);
  await putR2Buffer({
    key: r2Key,
    body: params.buffer,
    contentType: normalizedMime,
  });

  let lqipBase64 = '';
  let width: number | undefined;
  let height: number | undefined;
  if (params.mediaType === MediaType.IMAGE && !normalizedMime.includes('svg') && !normalizedMime.includes('icon')) {
    lqipBase64 = await generateLqipBase64(params.buffer);
    try {
      const meta = await sharp(params.buffer).metadata();
      width = meta.width;
      height = meta.height;
    } catch {
      // Ignore dimension detection failures for exotic image formats
    }
  }

  let media: IMediaDocument;
  if (existingPending) {
    existingPending.r2Key = r2Key;
    existingPending.extension = ext;
    existingPending.mime = normalizedMime;
    existingPending.sizeBytes = params.buffer.length;
    existingPending.lqipBase64 = lqipBase64 || null;
    existingPending.status = MediaStatus.PROCESSED;
    existingPending.metadata = {
      ...existingPending.metadata,
      originalFilename: params.filename,
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
      ...(params.durationSeconds !== undefined ? { durationSeconds: params.durationSeconds } : {}),
    };
    await existingPending.save();
    media = existingPending;
  } else {
    media = await Media.create({
      ownerId: new Types.ObjectId(params.ownerId),
      targetType: params.targetType,
      r2Key,
      type: params.mediaType,
      status: MediaStatus.PROCESSED,
      storageProvider: 'r2',
      extension: ext,
      mime: normalizedMime,
      sizeBytes: params.buffer.length,
      lqipBase64: lqipBase64 || null,
      order: params.order ?? 0,
      metadata: {
        originalFilename: params.filename,
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
        ...(params.durationSeconds !== undefined ? { durationSeconds: params.durationSeconds } : {}),
      },
    });
  }

  await DataStat.updateOne(
    { mediaType: media.type, storageProvider: 'r2' },
    { $inc: { contentSizeBytes: params.buffer.length, contentItems: 1 } },
    { upsert: true }
  ).catch((err) => logger.warn({ err }, 'DataStat update failed after upload'));

  return serializeMedia(media);
}

export async function completeMediaUpload(params: {
  mediaId: string;
  ownerId: string;
  lqipBase64?: string | null;
  width?: number;
  height?: number;
  durationSeconds?: number;
}) {
  await connectDB();
  const media = await Media.findOne({
    _id: new Types.ObjectId(params.mediaId),
    ownerId: new Types.ObjectId(params.ownerId),
  });
  if (!media) throw new ValidationError('Media upload record not found.');

  let verifiedSize = media.sizeBytes;
  if (isR2Configured()) {
    const head = await headR2Object(media.r2Key);
    verifiedSize = head.ContentLength ?? media.sizeBytes;
  }

  const needsAsyncTranscode =
    media.type === MediaType.VIDEO ||
    media.type === MediaType.VIDEO_CIRCLE ||
    media.type === MediaType.AUDIO;

  media.sizeBytes = verifiedSize;
  if (params.lqipBase64) media.lqipBase64 = params.lqipBase64;
  media.metadata = {
    ...media.metadata,
    ...(params.width ? { width: params.width } : {}),
    ...(params.height ? { height: params.height } : {}),
    ...(params.durationSeconds ? { durationSeconds: params.durationSeconds } : {}),
  };
  media.status = needsAsyncTranscode ? MediaStatus.PROCESSING : MediaStatus.PROCESSED;
  await media.save();

  await DataStat.updateOne(
    { mediaType: media.type, storageProvider: 'r2' },
    { $inc: { contentSizeBytes: verifiedSize, contentItems: 1 } },
    { upsert: true }
  ).catch((err) => logger.warn({ err }, 'DataStat update failed after completion'));

  if (needsAsyncTranscode) {
    const q = getMediaQueue();
    if (q) {
      await q.add('transcode-media', {
        mediaId: String(media._id),
        ownerId: String(media.ownerId),
        targetType: media.targetType,
        mediaType: media.type,
        r2Key: media.r2Key,
      });
    } else {
      // If Redis/Worker isn't running, mark processed so uploads remain usable in single-process dev
      media.status = MediaStatus.PROCESSED;
      await media.save();
    }
  }

  return serializeMedia(media);
}

export async function generateLqipBase64(buffer: Buffer): Promise<string> {
  try {
    const small = await sharp(buffer).resize(16).blur(1).webp({ quality: 40 }).toBuffer();
    return `data:image/webp;base64,${small.toString('base64')}`;
  } catch (err) {
    logger.warn({ err }, 'LQIP generation failed');
    return '';
  }
}

export async function deleteMediaRecord(mediaId: string) {
  await connectDB();
  const media = await Media.findById(mediaId);
  if (!media) return;

  if (media.storageProvider === 'r2' && isR2Configured()) {
    await Promise.all([
      deleteR2Object(media.r2Key).catch(() => { }),
      media.thumbnailR2Key ? deleteR2Object(media.thumbnailR2Key).catch(() => { }) : Promise.resolve(),
    ]);
  }

  await DataStat.updateOne(
    { mediaType: media.type, storageProvider: media.storageProvider },
    {
      $inc: {
        contentSizeBytes: -(media.sizeBytes + media.thumbnailSizeBytes),
        contentItems: -1,
      },
    }
  );

  await Media.deleteOne({ _id: media._id });
}

export function serializeMedia(media: IMediaDocument) {
  const rawSource =
    media.storageProvider === 'external'
      ? media.externalUrl || media.r2Key
      : media.r2Key || media.externalUrl;
  const resolvedUrl = rawSource ? getPublicR2Url(rawSource) || '' : '';
  const rawThumb =
    media.thumbnailR2Key || (media.metadata?.thumbnailUrl as string | undefined) || '';
  return {
    id: String(media._id),
    type: media.type,
    status: media.status,
    visibility: media.visibility,
    mime: media.mime,
    mimeType: media.mime,
    extension: media.extension,
    sizeBytes: media.sizeBytes,
    filename: (media.metadata?.originalFilename as string | undefined) || undefined,
    durationSeconds: (media.metadata?.durationSeconds as number | undefined) || undefined,
    lqipBase64: media.lqipBase64 || null,
    url: resolvedUrl,
    publicUrl: resolvedUrl,
    thumbnailUrl: rawThumb ? getPublicR2Url(rawThumb) : null,
    metadata: media.metadata,
  };
}
