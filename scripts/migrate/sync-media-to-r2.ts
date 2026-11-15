import '../load-env';
import fs from 'fs';
import path from 'path';
import { connectDB } from '../../src/lib/db';
import { buildR2Key, getPublicR2Url, putR2Buffer } from '../../src/lib/r2';
import { DataStat, Media, User } from '../../src/models';
import { MediaStatus, MediaType } from '../../src/types/enums';

function inferMimeAndType(filePath: string): { mime: string; mediaType: MediaType; ext: string } {
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, '') || 'bin';
  if (ext === 'jpg' || ext === 'jpeg') return { mime: 'image/jpeg', mediaType: MediaType.IMAGE, ext };
  if (ext === 'png') return { mime: 'image/png', mediaType: MediaType.IMAGE, ext };
  if (ext === 'webp') return { mime: 'image/webp', mediaType: MediaType.IMAGE, ext };
  if (ext === 'gif') return { mime: 'image/gif', mediaType: MediaType.IMAGE, ext };
  if (ext === 'mp4') return { mime: 'video/mp4', mediaType: MediaType.VIDEO, ext };
  if (ext === 'webm') return { mime: 'video/webm', mediaType: MediaType.VIDEO, ext };
  if (ext === 'mp3') return { mime: 'audio/mpeg', mediaType: MediaType.AUDIO, ext };
  return { mime: 'application/octet-stream', mediaType: MediaType.DOCUMENT, ext };
}

function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkFiles(full));
    else results.push(full);
  }
  return results;
}

async function main() {
  const sourceDir =
    process.env.SOURCE_STORAGE_PATH || path.resolve(process.cwd(), '../Source/storage/app/public');
  const files = walkFiles(sourceDir);
  console.log(`Scanning ${sourceDir}: found ${files.length} files.`);
  if (files.length === 0) process.exit(0);

  await connectDB();
  const rootUser = await User.findOne({}).sort({ createdAt: 1 }).select('_id').lean();
  if (!rootUser) {
    console.error('No users found in MongoDB. Run migrate:data or create a root user first.');
    process.exit(1);
  }

  let uploadedCount = 0;
  for (const absFile of files) {
    const relPath = path.relative(sourceDir, absFile).replace(/\\/g, '/');
    const existing = await Media.findOne({ 'metadata.legacySourcePath': relPath });
    if (existing) continue;

    const buf = fs.readFileSync(absFile);
    const { mime, mediaType, ext } = inferMimeAndType(absFile);
    const r2Key = buildR2Key('migrated', String(rootUser._id), path.basename(absFile));

    await putR2Buffer({ key: r2Key, body: buf, contentType: mime });
    const publicUrl = getPublicR2Url(r2Key);

    await Media.create({
      ownerId: rootUser._id,
      r2Key,
      externalUrl: publicUrl,
      targetType: 'post',
      type: mediaType,
      status: MediaStatus.PROCESSED,
      storageProvider: 'r2',
      extension: ext,
      mime,
      sizeBytes: buf.length,
      metadata: {
        filename: path.basename(absFile),
        legacySourcePath: relPath,
      },
    });

    await DataStat.updateOne(
      { mediaType, storageProvider: 'r2' },
      { $inc: { contentItems: 1, contentSizeBytes: buf.length } },
      { upsert: true }
    );
    uploadedCount++;
  }

  console.log(`Synced ${uploadedCount} legacy media files to Cloudflare R2.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('R2 media sync failed:', err);
  process.exit(1);
});
