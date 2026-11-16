import '../scripts/load-env';
import { Worker, Queue } from 'bullmq';
import Redis from 'ioredis';
import mongoose from 'mongoose';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Emitter } from '@socket.io/redis-emitter';

const execFileAsync = promisify(execFile);

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';

/**
 * Exact PHP ColibriPlus watermark configuration (`Source/config/assets.php`).
 */
const WATERMARK_CONFIG = {
  localPath: 'assets/watermarks/default.png',
  video: {
    position: 'absolute',
    y: 30,
    x: 30,
  },
  image: {
    position: 'bottom-right',
    padding: 30,
  },
} as const;

function createR2() {
  const endpoint =
    process.env.R2_ENDPOINT ||
    (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '');

  if (!endpoint || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    return null;
  }

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

async function runMaintenanceSchedules() {
  const queue = new Queue('maintenance', { connection: new Redis(REDIS_URL, { maxRetriesPerRequest: null }) });
  // Repeat daily story cleanup (every 6 hours) and weekly chat invite cleanup
  await queue.add(
    'clear-expired-stories',
    {},
    { repeat: { every: 6 * 60 * 60 * 1000 }, jobId: 'repeat-clear-expired-stories' }
  );
  await queue.add(
    'clear-expired-chat-invites',
    {},
    { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: 'repeat-clear-expired-chat-invites' }
  );
}

async function bootstrap() {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB_NAME || 'colibriplus',
    });
  }

  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  const emitter = new Emitter(redis);
  const r2 = createR2();
  const bucket = process.env.R2_BUCKET_NAME || 'colibriplus-media';

  const mediaWorker = new Worker(
    'media-processing',
    async (job) => {
      const { mediaId, ownerId, targetType, mediaType, r2Key } = job.data as {
        mediaId: string;
        ownerId: string;
        targetType?: string;
        mediaType: string;
        r2Key: string;
      };

      const mediaCol = mongoose.connection.collection('media');
      const settingsCol = mongoose.connection.collection('settings');
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cp-media-'));

      try {
        if (!r2) {
          await mediaCol.updateOne(
            { _id: new mongoose.Types.ObjectId(mediaId) },
            { $set: { status: 'processed' } }
          );
          return;
        }

        const getRes = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: r2Key }));
        const inputBytes = await getRes.Body?.transformToByteArray();
        if (!inputBytes) throw new Error('Empty R2 object body');

        const inputPath = path.join(tmpDir, path.basename(r2Key));
        await fs.writeFile(inputPath, inputBytes);

        if (mediaType === 'audio') {
          const outKey = r2Key.replace(/\.[^.]+$/, '.mp3');
          const outPath = path.join(tmpDir, 'output.mp3');
          await execFileAsync(FFMPEG_PATH, ['-y', '-i', inputPath, '-b:a', '128k', outPath]);
          const outBuf = await fs.readFile(outPath);
          await r2.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: outKey,
              Body: outBuf,
              ContentType: 'audio/mpeg',
            })
          );
          await mediaCol.updateOne(
            { _id: new mongoose.Types.ObjectId(mediaId) },
            { $set: { r2Key: outKey, mime: 'audio/mpeg', extension: 'mp3', status: 'processed', sizeBytes: outBuf.length } }
          );
        } else {
          const outKey = r2Key.replace(/\.[^.]+$/, '.mp4');
          const thumbKey = r2Key.replace(/\.[^.]+$/, '_thumb.jpg');
          const outPath = path.join(tmpDir, 'output.mp4');
          const thumbPath = path.join(tmpDir, 'thumb.jpg');

          const brandSettingDoc = await settingsCol.findOne({ group: 'brand' });
          const brandPayload = (brandSettingDoc?.payload || {}) as {
            imagesWatermarkEnabled?: boolean;
            videosWatermarkEnabled?: boolean;
            watermarkUrl?: string;
          };
          const videosWatermarkEnabled = brandPayload.videosWatermarkEnabled ?? true;
          const imagesWatermarkEnabled = brandPayload.imagesWatermarkEnabled ?? true;
          const watermarkUrl = (brandPayload.watermarkUrl || `/${WATERMARK_CONFIG.localPath}`).trim();

          // Resolve watermark PNG buffer (custom R2/HTTP asset or public/assets/watermarks/default.png)
          let wmBuffer: Buffer | null = null;
          try {
            if (watermarkUrl.startsWith('/api/v1/media/proxy')) {
              const parsed = new URL(watermarkUrl, 'http://localhost');
              const wmKey = parsed.searchParams.get('key')?.trim();
              if (wmKey && !wmKey.startsWith('assets/')) {
                const wmObj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: wmKey }));
                const wmBytes = await wmObj.Body?.transformToByteArray();
                if (wmBytes && wmBytes.length > 0) wmBuffer = Buffer.from(wmBytes);
              }
            } else if (watermarkUrl.startsWith('http://') || watermarkUrl.startsWith('https://')) {
              const res = await fetch(watermarkUrl);
              if (res.ok) wmBuffer = Buffer.from(await res.arrayBuffer());
            } else if (!watermarkUrl.startsWith('/') && !watermarkUrl.startsWith('assets/')) {
              const wmObj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: watermarkUrl }));
              const wmBytes = await wmObj.Body?.transformToByteArray();
              if (wmBytes && wmBytes.length > 0) wmBuffer = Buffer.from(wmBytes);
            }
          } catch {
            // Fall back to default.png on disk
          }

          if (!wmBuffer) {
            const defaultWmPath = path.join(process.cwd(), 'public', WATERMARK_CONFIG.localPath);
            wmBuffer = await fs.readFile(defaultWmPath).catch(() => null);
          }

          const shouldWatermarkVideo =
            Boolean(videosWatermarkEnabled) &&
            Boolean(wmBuffer) &&
            mediaType === 'video' &&
            (!targetType || targetType === 'post' || targetType === 'story_frame');

          if (shouldWatermarkVideo && wmBuffer) {
            const wmFilePath = path.join(tmpDir, 'watermark.png');
            await fs.writeFile(wmFilePath, wmBuffer);
            await execFileAsync(FFMPEG_PATH, [
              '-y',
              '-i',
              inputPath,
              '-i',
              wmFilePath,
              '-filter_complex',
              `[0:v][1:v]overlay=${WATERMARK_CONFIG.video.x}:${WATERMARK_CONFIG.video.y}[outv]`,
              '-map',
              '[outv]',
              '-map',
              '0:a?',
              '-c:v',
              'libx264',
              '-b:v',
              '1000k',
              '-movflags',
              '+faststart',
              '-c:a',
              'aac',
              outPath,
            ]);
          } else {
            await execFileAsync(FFMPEG_PATH, [
              '-y',
              '-i',
              inputPath,
              '-c:v',
              'libx264',
              '-b:v',
              '1000k',
              '-movflags',
              '+faststart',
              '-c:a',
              'aac',
              outPath,
            ]);
          }

          await execFileAsync(FFMPEG_PATH, ['-y', '-i', outPath, '-ss', '00:00:01', '-vframes', '1', thumbPath]);

          const [outBuf, rawThumbBuf] = await Promise.all([fs.readFile(outPath), fs.readFile(thumbPath)]);
          let thumbBuf: Buffer = rawThumbBuf;

          // Match PHP `PostVideoController.php:88` -> watermark video thumbnail when images_watermark_enabled
          if (imagesWatermarkEnabled && wmBuffer && (!targetType || targetType === 'post')) {
            try {
              const thumbMeta = await sharp(thumbBuf).metadata();
              const wmMeta = await sharp(wmBuffer).metadata();
              const tw = thumbMeta.width || 0;
              const th = thumbMeta.height || 0;
              const ww = wmMeta.width || 64;
              const wh = wmMeta.height || 64;
              const pad = WATERMARK_CONFIG.image.padding;
              if (tw >= ww + pad * 2 && th >= wh + pad * 2) {
                thumbBuf = await sharp(thumbBuf)
                  .composite([{ input: wmBuffer, left: tw - ww - pad, top: th - wh - pad }])
                  .jpeg({ quality: 80 })
                  .toBuffer();
              }
            } catch {
              // Keep raw thumbnail if composite fails
            }
          }

          await Promise.all([
            r2.send(
              new PutObjectCommand({
                Bucket: bucket,
                Key: outKey,
                Body: outBuf,
                ContentType: 'video/mp4',
              })
            ),
            r2.send(
              new PutObjectCommand({
                Bucket: bucket,
                Key: thumbKey,
                Body: thumbBuf,
                ContentType: 'image/jpeg',
              })
            ),
          ]);

          await mediaCol.updateOne(
            { _id: new mongoose.Types.ObjectId(mediaId) },
            {
              $set: {
                r2Key: outKey,
                thumbnailR2Key: thumbKey,
                mime: 'video/mp4',
                extension: 'mp4',
                status: 'processed',
                sizeBytes: outBuf.length,
                thumbnailSizeBytes: thumbBuf.length,
                'metadata.watermarked': shouldWatermarkVideo,
              },
            }
          );
        }

        emitter.to(`user:${ownerId}`).emit('timeline:media:processed', { mediaId });
      } catch (err) {
        console.warn(`[worker] Media processing fallback/error for ${mediaId}:`, err);
        await mediaCol.updateOne(
          { _id: new mongoose.Types.ObjectId(mediaId) },
          { $set: { status: 'processed' } }
        );
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    },
    { connection: redis, concurrency: 2 }
  );

  const maintenanceWorker = new Worker(
    'maintenance',
    async (job) => {
      const now = new Date();
      if (job.name === 'clear-expired-stories') {
        await mongoose.connection
          .collection('storyframes')
          .deleteMany({ isHighlight: false, expiresAt: { $lt: now } });
      } else if (job.name === 'clear-expired-chat-invites') {
        await mongoose.connection
          .collection('chatinvites')
          .deleteMany({ expiresAt: { $lt: now } });
      }
    },
    { connection: redis }
  );

  await runMaintenanceSchedules().catch((e) => console.warn('[worker] Schedule error:', e));

  console.log('[worker] Weto BullMQ worker listening');

  process.on('SIGTERM', async () => {
    await Promise.all([mediaWorker.close(), maintenanceWorker.close()]);
    process.exit(0);
  });
}

bootstrap().catch((err) => {
  console.error('[worker] Fatal startup error:', err);
  process.exit(1);
});
