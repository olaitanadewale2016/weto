import fs from 'fs/promises';
import path from 'path';
declare const __non_webpack_require__: ((id: string) => any) | undefined;

// Dynamically resolve sharp without static import/require statements so that bundlers
// (Turbopack/esbuild) do not trace it into Cloudflare Worker server bundles.
// In Node.js/Docker/VPS runtimes where sharp is present, it will load cleanly.
type SharpModule = any;
let _sharpPromise: Promise<SharpModule | null> | null = null;

async function getSharp(): Promise<SharpModule | null> {
  if (!_sharpPromise) {
    _sharpPromise = (async () => {
      try {
        const pkg = ['sh', 'arp'].join('');
        const req =
          typeof __non_webpack_require__ !== 'undefined'
            ? __non_webpack_require__
            : typeof require !== 'undefined'
              ? require
              : null;
        if (req) {
          const mod = req(pkg);
          return mod?.default || mod;
        }
        const dynamicImport = new Function('m', 'return import(m)');
        const mod = await dynamicImport(pkg);
        return mod?.default || mod;
      } catch {
        return null;
      }
    })();
  }
  return _sharpPromise;
}
import { Queue } from 'bullmq';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { DataStat, IMediaDocument, Media, MediaTargetType } from '@/models/Media';
import {
  buildR2Key,
  createPresignedUploadUrl,
  deleteR2Object,
  getPublicR2Url,
  getR2Object,
  headR2Object,
  isR2Configured,
  MediaNamespace,
  putR2Buffer,
} from '@/lib/r2';
import { MediaStatus, MediaType } from '@/types/enums';
import { ValidationError } from '@/lib/api-response';
import { getRedis } from '@/lib/redis';
import { logger } from '@/lib/logger';
import { getSettingsGroup } from './settings.service';

/**
 * Exact PHP ColibriPlus watermark configuration parity (`Source/config/assets.php`).
 */
export const WATERMARK_CONFIG = {
  localPath: 'assets/watermarks/default.png',
  opacity: 0.5,
  video: {
    position: 'absolute' as const,
    y: 30,
    x: 30,
  },
  image: {
    position: 'bottom-right' as const,
    padding: 30,
  },
} as const;

const WATERMARKABLE_IMAGE_TARGETS: ReadonlySet<MediaTargetType> = new Set<MediaTargetType>([
  'post',
  'story_frame',
  'message',
  'product',
]);

const WATERMARKABLE_IMAGE_NAMESPACES: ReadonlySet<MediaNamespace> = new Set<MediaNamespace>([
  'posts',
  'stories',
  'chats',
  'marketplace',
]);

const WATERMARKABLE_VIDEO_TARGETS: ReadonlySet<MediaTargetType> = new Set<MediaTargetType>([
  'post',
  'story_frame',
]);

export function shouldWatermarkImage(params: {
  targetType?: MediaTargetType;
  namespace?: MediaNamespace;
  mimeType: string;
}): boolean {
  const cleanMime = params.mimeType.split(';')[0].trim().toLowerCase();
  if (
    !cleanMime.startsWith('image/') ||
    cleanMime === 'image/gif' ||
    cleanMime.includes('svg') ||
    cleanMime.includes('icon')
  ) {
    return false;
  }
  if (params.targetType) {
    return WATERMARKABLE_IMAGE_TARGETS.has(params.targetType);
  }
  if (params.namespace) {
    return WATERMARKABLE_IMAGE_NAMESPACES.has(params.namespace);
  }
  return false;
}

export function shouldWatermarkVideo(params: {
  targetType?: MediaTargetType;
  mediaType?: MediaType;
}): boolean {
  if (params.mediaType && params.mediaType !== MediaType.VIDEO) {
    return false;
  }
  if (params.targetType) {
    return WATERMARKABLE_VIDEO_TARGETS.has(params.targetType);
  }
  return true;
}

const WATERMARK_CACHE_TTL_MS = 30_000;

let cachedWatermark: {
  sourceKey: string;
  buffer: Buffer;
  expiresAt: number;
} | null = null;

export function clearWatermarkCache(): void {
  cachedWatermark = null;
}

export async function resolveWatermarkBuffer(watermarkUrl?: string | null): Promise<Buffer | null> {
  const normalizedUrl = (watermarkUrl || `/${WATERMARK_CONFIG.localPath}`).trim();
  if (
    cachedWatermark &&
    cachedWatermark.sourceKey === normalizedUrl &&
    cachedWatermark.expiresAt > Date.now()
  ) {
    return cachedWatermark.buffer;
  }

  let loaded: Buffer | null = null;

  try {
    if (normalizedUrl.startsWith('/api/v1/media/proxy')) {
      const parsed = new URL(normalizedUrl, 'http://localhost');
      const r2Key = parsed.searchParams.get('key')?.trim();
      if (r2Key && !r2Key.startsWith('assets/') && isR2Configured()) {
        const obj = await getR2Object(r2Key);
        const bytes = await obj.Body?.transformToByteArray();
        if (bytes && bytes.length > 0) {
          loaded = Buffer.from(bytes);
        }
      } else if (r2Key && r2Key.startsWith('assets/')) {
        const localAssetPath = path.join(process.cwd(), 'public', r2Key.replace(/^\/+/, ''));
        loaded = await fs.readFile(localAssetPath);
      }
    } else if (normalizedUrl.startsWith('http://') || normalizedUrl.startsWith('https://')) {
      const res = await fetch(normalizedUrl);
      if (res.ok) {
        const arr = await res.arrayBuffer();
        if (arr.byteLength > 0) {
          loaded = Buffer.from(arr);
        }
      }
    } else if (
      normalizedUrl.startsWith('/assets/') ||
      normalizedUrl.startsWith('assets/')
    ) {
      const cleanRel = normalizedUrl.replace(/^\/+/, '');
      const absPath = path.join(process.cwd(), 'public', cleanRel);
      loaded = await fs.readFile(absPath);
    } else if (normalizedUrl && isR2Configured()) {
      const obj = await getR2Object(normalizedUrl.replace(/^\/+/, ''));
      const bytes = await obj.Body?.transformToByteArray();
      if (bytes && bytes.length > 0) {
        loaded = Buffer.from(bytes);
      }
    }
  } catch (err) {
    logger.warn({ err, watermarkUrl: normalizedUrl }, 'Custom watermark load failed; falling back to default.png');
  }

  if (!loaded) {
    try {
      const defaultPath = path.join(process.cwd(), 'public', WATERMARK_CONFIG.localPath);
      loaded = await fs.readFile(defaultPath);
    } catch (err) {
      logger.warn({ err }, 'Default watermark asset could not be read from disk');
      return null;
    }
  }

  cachedWatermark = {
    sourceKey: normalizedUrl,
    buffer: loaded,
    expiresAt: Date.now() + WATERMARK_CACHE_TTL_MS,
  };
  return loaded;
}

/**
 * Matches PHP `ImageUploadService::scaleTo1080x1920()` for story images (`StoryMediaController.php:129`).
 */
export async function scaleStoryImageTo1080x1920(
  inputBuffer: Buffer,
  mimeType = 'image/webp'
): Promise<Buffer> {
  try {
    const sharp = await getSharp();
    if (!sharp) return inputBuffer;
    const pipeline = sharp(inputBuffer, { failOn: 'none' })
      .rotate()
      .resize(1080, 1920, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      });

    if (mimeType === 'image/png') {
      return await pipeline.png({ compressionLevel: 8 }).toBuffer();
    }
    if (mimeType === 'image/webp') {
      return await pipeline.webp({ quality: 82 }).toBuffer();
    }
    if (mimeType === 'image/avif') {
      return await pipeline.avif({ quality: 75 }).toBuffer();
    }
    return await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
  } catch {
    return inputBuffer;
  }
}

/**
 * Scales the alpha channel of a watermark PNG buffer by `opacity` (default 0.5 / 50%).
 */
export async function applyWatermarkOpacity(
  watermarkBuffer: Buffer,
  opacity: number = WATERMARK_CONFIG.opacity
): Promise<{ data: Buffer; width: number; height: number }> {
  const sharp = await getSharp();
  if (!sharp) {
    return { data: watermarkBuffer, width: 0, height: 0 };
  }
  const clamped = Math.max(0, Math.min(1, opacity));
  const { data, info } = await sharp(watermarkBuffer, { failOn: 'none' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const scaled = Buffer.from(data);
  for (let i = 3; i < scaled.length; i += 4) {
    scaled[i] = Math.round(scaled[i] * clamped);
  }

  const out = await sharp(scaled, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });

  return {
    data: out.data,
    width: out.info.width,
    height: out.info.height,
  };
}

/**
 * Matches PHP `ImageUploadService::watermark()`:
 * Places watermark at `bottom-right` with `30px` x/y padding (at 50% opacity) when `brand.images_watermark_enabled` is true.
 */
export async function applyImageWatermarkBuffer(
  inputBuffer: Buffer,
  mimeType = 'image/webp',
  customWatermarkBuffer?: Buffer | null,
  opacity: number = WATERMARK_CONFIG.opacity
): Promise<Buffer> {
  try {
    const sharp = await getSharp();
    if (!sharp) {
      return inputBuffer;
    }
    const wmBuf = customWatermarkBuffer ?? (await resolveWatermarkBuffer());
    if (!wmBuf || wmBuf.length === 0) {
      return inputBuffer;
    }

    const oriented = await sharp(inputBuffer, { failOn: 'none' })
      .rotate()
      .toBuffer({ resolveWithObject: true });
    const imgWidth = oriented.info.width;
    const imgHeight = oriented.info.height;
    const format = oriented.info.format;

    if (!imgWidth || !imgHeight || imgWidth < 16 || imgHeight < 16) {
      return inputBuffer;
    }

    const wmMeta = await sharp(wmBuf, { failOn: 'none' }).metadata();
    const rawWmW = wmMeta.width || 64;
    const rawWmH = wmMeta.height || 64;

    const basePadding = WATERMARK_CONFIG.image.padding; // 30
    let padding: number = basePadding;
    let finalWmBuf = wmBuf;
    let finalWmW = rawWmW;
    let finalWmH = rawWmH;

    const fitsDefault =
      imgWidth >= rawWmW + basePadding * 2 &&
      imgHeight >= rawWmH + basePadding * 2 &&
      rawWmW <= Math.max(64, Math.round(imgWidth * 0.25)) &&
      rawWmH <= Math.max(64, Math.round(imgHeight * 0.25));

    if (!fitsDefault) {
      padding = Math.min(
        basePadding,
        Math.max(2, Math.floor(Math.min(imgWidth, imgHeight) * 0.08))
      );
      const maxW = Math.max(8, Math.min(Math.floor(imgWidth * 0.25), imgWidth - padding * 2));
      const maxH = Math.max(8, Math.min(Math.floor(imgHeight * 0.25), imgHeight - padding * 2));
      const resized = await sharp(wmBuf, { failOn: 'none' })
        .resize({
          width: maxW,
          height: maxH,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .png()
        .toBuffer({ resolveWithObject: true });
      finalWmBuf = resized.data;
      finalWmW = resized.info.width;
      finalWmH = resized.info.height;
    }

    const translucentWm = await applyWatermarkOpacity(finalWmBuf, opacity);
    finalWmBuf = translucentWm.data;
    finalWmW = translucentWm.width;
    finalWmH = translucentWm.height;

    // PHP `config('assets.watermark.image.position')` === 'bottom-right' with padding = 30
    const left = Math.max(0, imgWidth - finalWmW - padding);
    const top = Math.max(0, imgHeight - finalWmH - padding);

    const composited = sharp(oriented.data, { failOn: 'none' }).composite([
      {
        input: finalWmBuf,
        left,
        top,
      },
    ]);

    const cleanMime = mimeType.split(';')[0].trim().toLowerCase();
    if (cleanMime === 'image/png' || format === 'png') {
      return await composited.png({ compressionLevel: 8 }).toBuffer();
    }
    if (cleanMime === 'image/webp' || format === 'webp') {
      return await composited.webp({ quality: 82 }).toBuffer();
    }
    if (cleanMime === 'image/avif' || format === 'avif') {
      return await composited.avif({ quality: 75 }).toBuffer();
    }
    return await composited.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
  } catch (err) {
    logger.warn({ err }, 'Image watermark composite skipped due to image format error');
    return inputBuffer;
  }
}

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

  let workingBuffer = params.buffer;
  let watermarked = false;

  if (params.mediaType === MediaType.IMAGE && !normalizedMime.includes('svg') && !normalizedMime.includes('icon')) {
    if (params.targetType === 'story_frame' || params.namespace === 'stories') {
      workingBuffer = await scaleStoryImageTo1080x1920(workingBuffer, normalizedMime);
    }
    if (
      shouldWatermarkImage({
        targetType: params.targetType,
        namespace: params.namespace,
        mimeType: normalizedMime,
      })
    ) {
      const brandSettings = await getSettingsGroup('brand');
      if (brandSettings?.imagesWatermarkEnabled) {
        const wmBuffer = await resolveWatermarkBuffer(brandSettings.watermarkUrl);
        workingBuffer = await applyImageWatermarkBuffer(workingBuffer, normalizedMime, wmBuffer);
        watermarked = true;
      }
    }
  }

  await putR2Buffer({
    key: r2Key,
    body: workingBuffer,
    contentType: normalizedMime,
  });

  let lqipBase64 = '';
  let width: number | undefined;
  let height: number | undefined;
  if (params.mediaType === MediaType.IMAGE && !normalizedMime.includes('svg') && !normalizedMime.includes('icon')) {
    lqipBase64 = await generateLqipBase64(workingBuffer);
    try {
      const sharp = await getSharp();
      if (sharp) {
        const meta = await sharp(workingBuffer).metadata();
        width = meta.width;
        height = meta.height;
      }
    } catch {
      // Ignore dimension detection failures for exotic image formats
    }
  }

  let media: IMediaDocument;
  if (existingPending) {
    existingPending.r2Key = r2Key;
    existingPending.extension = ext;
    existingPending.mime = normalizedMime;
    existingPending.sizeBytes = workingBuffer.length;
    existingPending.lqipBase64 = lqipBase64 || null;
    existingPending.status = MediaStatus.PROCESSED;
    existingPending.metadata = {
      ...existingPending.metadata,
      originalFilename: params.filename,
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
      ...(watermarked ? { watermarked: true } : {}),
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
      sizeBytes: workingBuffer.length,
      lqipBase64: lqipBase64 || null,
      order: params.order ?? 0,
      metadata: {
        originalFilename: params.filename,
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
        ...(watermarked ? { watermarked: true } : {}),
        ...(params.durationSeconds !== undefined ? { durationSeconds: params.durationSeconds } : {}),
      },
    });
  }

  const needsAsyncTranscode =
    media.type === MediaType.VIDEO ||
    media.type === MediaType.VIDEO_CIRCLE ||
    media.type === MediaType.AUDIO;
  if (needsAsyncTranscode) {
    const q = getMediaQueue();
    if (q) {
      await q
        .add('transcode-media', {
          mediaId: String(media._id),
          ownerId: String(media.ownerId),
          targetType: media.targetType,
          mediaType: media.type,
          r2Key: media.r2Key,
        })
        .catch((err) => logger.warn({ err }, 'Failed to enqueue media transcode after direct upload'));
    }
  }

  await DataStat.updateOne(
    { mediaType: media.type, storageProvider: 'r2' },
    { $inc: { contentSizeBytes: workingBuffer.length, contentItems: 1 } },
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
  let updatedLqip = params.lqipBase64;
  let updatedWidth = params.width;
  let updatedHeight = params.height;
  let watermarked = Boolean(media.metadata?.watermarked);

  if (isR2Configured()) {
    const namespacePrefix = (media.r2Key.split('/')[0] || '') as MediaNamespace;
    if (
      media.type === MediaType.IMAGE &&
      !watermarked &&
      shouldWatermarkImage({
        targetType: media.targetType,
        namespace: namespacePrefix,
        mimeType: media.mime,
      })
    ) {
      const brandSettings = await getSettingsGroup('brand');
      const isStoryImage = media.targetType === 'story_frame' || namespacePrefix === 'stories';
      if (brandSettings?.imagesWatermarkEnabled || isStoryImage) {
        try {
          const obj = await getR2Object(media.r2Key);
          const bytes = await obj.Body?.transformToByteArray();
          if (bytes && bytes.length > 0) {
            let processedBuf: Buffer = Buffer.from(bytes);
            if (isStoryImage) {
              processedBuf = await scaleStoryImageTo1080x1920(processedBuf, media.mime);
            }
            if (brandSettings?.imagesWatermarkEnabled) {
              const wmBuf = await resolveWatermarkBuffer(brandSettings.watermarkUrl);
              processedBuf = await applyImageWatermarkBuffer(processedBuf, media.mime, wmBuf);
              watermarked = true;
            }
            await putR2Buffer({
              key: media.r2Key,
              body: processedBuf,
              contentType: media.mime,
            });
            verifiedSize = processedBuf.length;
            updatedLqip = (await generateLqipBase64(processedBuf)) || updatedLqip;
            const sharp = await getSharp();
            const meta = sharp ? await sharp(processedBuf).metadata().catch(() => null) : null;
            if (meta?.width) updatedWidth = meta.width;
            if (meta?.height) updatedHeight = meta.height;
          }
        } catch (err) {
          logger.warn({ err, mediaId: params.mediaId }, 'Presigned image watermark post-processing skipped');
          const head = await headR2Object(media.r2Key);
          verifiedSize = head.ContentLength ?? media.sizeBytes;
        }
      } else {
        const head = await headR2Object(media.r2Key);
        verifiedSize = head.ContentLength ?? media.sizeBytes;
      }
    } else {
      const head = await headR2Object(media.r2Key);
      verifiedSize = head.ContentLength ?? media.sizeBytes;
    }
  }

  const needsAsyncTranscode =
    media.type === MediaType.VIDEO ||
    media.type === MediaType.VIDEO_CIRCLE ||
    media.type === MediaType.AUDIO;

  media.sizeBytes = verifiedSize;
  if (updatedLqip) media.lqipBase64 = updatedLqip;
  media.metadata = {
    ...media.metadata,
    ...(updatedWidth ? { width: updatedWidth } : {}),
    ...(updatedHeight ? { height: updatedHeight } : {}),
    ...(watermarked ? { watermarked: true } : {}),
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
    const sharp = await getSharp();
    if (!sharp) return '';
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
