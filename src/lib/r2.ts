import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getServerEnv } from './env';
import { resolveMediaUrl } from './media-url';
import crypto from 'crypto';

let r2Client: S3Client | null = null;

export function isR2Configured(): boolean {
  const env = getServerEnv();
  return Boolean(
    env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      (env.R2_ENDPOINT || env.R2_ACCOUNT_ID)
  );
}

export function getR2Client(): S3Client {
  if (r2Client) return r2Client;

  const env = getServerEnv();
  const endpoint =
    env.R2_ENDPOINT ||
    (env.R2_ACCOUNT_ID
      ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
      : '');

  if (!endpoint || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error('Cloudflare R2 credentials (R2_ENDPOINT/R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) are missing.');
  }

  r2Client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  return r2Client;
}

export type MediaNamespace =
  | 'avatars'
  | 'covers'
  | 'posts'
  | 'stories'
  | 'chats'
  | 'marketplace'
  | 'business'
  | 'jobs'
  | 'ads'
  | 'documents'
  | 'migrated'
  | 'system';

export function buildR2Key(
  namespace: MediaNamespace,
  ownerId: string,
  extensionOrFilename: string
): string {
  const cleanOwner = ownerId.replace(/[^a-zA-Z0-9_-]/g, '') || 'anon';
  const baseName = extensionOrFilename.split(/[\\/]/).pop() || '';
  const rawExt = baseName.includes('.') ? baseName.split('.').pop() || '' : baseName;
  const cleanExt = rawExt.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'bin';
  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const uuid = crypto.randomUUID();
  return `${namespace}/${cleanOwner}/${ym}/${uuid}.${cleanExt}`;
}

export async function createPresignedUploadUrl(params: {
  key: string;
  contentType: string;
  contentLength?: number;
  expiresInSeconds?: number;
}): Promise<{ uploadUrl: string; key: string; bucket: string }> {
  const env = getServerEnv();
  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: params.key,
    ContentType: params.contentType,
    ...(params.contentLength ? { ContentLength: params.contentLength } : {}),
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: params.expiresInSeconds ?? 300,
  });

  return {
    uploadUrl,
    key: params.key,
    bucket: env.R2_BUCKET_NAME,
  };
}

export async function createPresignedDownloadUrl(
  key: string,
  expiresInSeconds = 900,
  downloadFilename?: string
): Promise<string> {
  const env = getServerEnv();
  const client = getR2Client();
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    ...(downloadFilename
      ? { ResponseContentDisposition: `attachment; filename="${downloadFilename.replace(/"/g, '')}"` }
      : {}),
  });

  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

export async function headR2Object(key: string) {
  const env = getServerEnv();
  const client = getR2Client();
  return client.send(
    new HeadObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
    })
  );
}

export async function getR2Object(key: string, range?: string) {
  const env = getServerEnv();
  const client = getR2Client();
  return client.send(
    new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      ...(range ? { Range: range } : {}),
    })
  );
}

export async function putR2Buffer(params: {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  cacheControl?: string;
}) {
  const env = getServerEnv();
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      CacheControl: params.cacheControl ?? 'public, max-age=31536000, immutable',
    })
  );
  return {
    key: params.key,
    bucket: env.R2_BUCKET_NAME,
    url: getPublicR2Url(params.key),
  };
}

export async function deleteR2Object(key: string) {
  if (!key || key.startsWith('http://') || key.startsWith('https://')) return;
  const env = getServerEnv();
  const client = getR2Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
    })
  );
}

export function getPublicR2Url(key?: string | null): string {
  return resolveMediaUrl(key);
}
