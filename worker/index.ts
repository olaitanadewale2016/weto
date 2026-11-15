import '../scripts/load-env';
import { Worker, Queue } from 'bullmq';
import Redis from 'ioredis';
import mongoose from 'mongoose';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Emitter } from '@socket.io/redis-emitter';

const execFileAsync = promisify(execFile);

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';

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
      const { mediaId, ownerId, mediaType, r2Key } = job.data as {
        mediaId: string;
        ownerId: string;
        mediaType: string;
        r2Key: string;
      };

      const mediaCol = mongoose.connection.collection('media');
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
          await execFileAsync(FFMPEG_PATH, ['-y', '-i', outPath, '-ss', '00:00:01', '-vframes', '1', thumbPath]);

          const [outBuf, thumbBuf] = await Promise.all([fs.readFile(outPath), fs.readFile(thumbPath)]);
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
