'use client';

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface ApiResponse<T> {
  status: 'success' | 'error';
  data?: T;
  meta?: Record<string, unknown>;
  error?: ApiErrorDetail;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const { json, headers, ...rest } = options;
  const reqHeaders = new Headers(headers);
  if (json !== undefined && !reqHeaders.has('Content-Type')) {
    reqHeaders.set('Content-Type', 'application/json');
  }

  const res = await fetch(path.startsWith('/api') ? path : `/api/v1${path}`, {
    credentials: 'include',
    ...rest,
    headers: reqHeaders,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (!res.ok) {
      throw new ApiClientError(res.status, 'HTTP_ERROR', `Request failed (${res.status})`);
    }
    return {} as T;
  }

  const payload = (await res.json()) as ApiResponse<T>;
  if (!res.ok || payload.status === 'error') {
    throw new ApiClientError(
      res.status,
      payload.error?.code || 'API_ERROR',
      payload.error?.message || `Request failed (${res.status})`,
      payload.error?.details
    );
  }

  return payload.data as T;
}

export async function apiFetchWithMeta<T>(
  path: string,
  options: RequestInit & { json?: unknown } = {}
): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const { json, headers, ...rest } = options;
  const reqHeaders = new Headers(headers);
  if (json !== undefined && !reqHeaders.has('Content-Type')) {
    reqHeaders.set('Content-Type', 'application/json');
  }

  const res = await fetch(path.startsWith('/api') ? path : `/api/v1${path}`, {
    credentials: 'include',
    ...rest,
    headers: reqHeaders,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  const payload = (await res.json()) as ApiResponse<T>;
  if (!res.ok || payload.status === 'error') {
    throw new ApiClientError(
      res.status,
      payload.error?.code || 'API_ERROR',
      payload.error?.message || `Request failed (${res.status})`,
      payload.error?.details
    );
  }

  return { data: payload.data as T, meta: payload.meta };
}

export async function generateImageLqip(file: File): Promise<{
  lqipBase64?: string;
  width?: number;
  height?: number;
}> {
  if (!file.type.startsWith('image/') || typeof document === 'undefined') return {};
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const w = img.naturalWidth || 1;
        const h = img.naturalHeight || 1;
        const canvas = document.createElement('canvas');
        const tw = 24;
        const th = Math.max(1, Math.round((h / w) * tw));
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, tw, th);
          const lqipBase64 = canvas.toDataURL('image/webp', 0.5);
          resolve({ lqipBase64, width: w, height: h });
        } else {
          resolve({ width: w, height: h });
        }
      } catch {
        resolve({});
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({});
    };
    img.src = objectUrl;
  });
}

export interface UploadedMediaResult {
  mediaId: string;
  r2Key: string;
  publicUrl: string;
  mimeType: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  filename?: string;
  durationSeconds?: number;
  lqipBase64?: string;
  width?: number;
  height?: number;
}

export function inferMediaType(mimeType: string, filename = ''): 'image' | 'video' | 'audio' | 'document' {
  const cleanMime = mimeType.split(';')[0].trim().toLowerCase();
  if (cleanMime.startsWith('image/')) return 'image';
  if (cleanMime.startsWith('video/')) return 'video';
  if (cleanMime.startsWith('audio/')) return 'audio';
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext)) return 'audio';
  return 'document';
}

export async function uploadFileToR2(
  file: File,
  namespace:
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
    | 'system' = 'posts',
  targetType:
    | 'post'
    | 'story_frame'
    | 'message'
    | 'product'
    | 'ad'
    | 'user_avatar'
    | 'user_cover'
    | 'business_logo'
    | 'business_cover'
    | 'job_attachment'
    | 'system_asset' = 'post',
  onProgress?: (pct: number) => void,
  extraMeta?: { durationSeconds?: number }
): Promise<UploadedMediaResult> {
  const cleanMime = (file.type || 'application/octet-stream').split(';')[0].trim().toLowerCase();
  const mediaType = inferMediaType(cleanMime, file.name);
  const presign = await apiFetch<{
    mediaId: string;
    uploadUrl: string;
    r2Key: string;
    publicUrl: string;
  }>('/media/presign', {
    method: 'POST',
    json: {
      namespace,
      targetType,
      mediaType,
      mimeType: cleanMime,
      sizeBytes: file.size,
      filename: file.name,
    },
  });

  onProgress?.(20);

  let usedDirectPut = false;
  try {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', presign.uploadUrl);
      xhr.setRequestHeader('Content-Type', cleanMime);
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          onProgress?.(Math.min(90, 20 + Math.round((ev.loaded / ev.total) * 70)));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('Network error uploading media to Cloudflare R2'));
      xhr.send(file);
    });
    usedDirectPut = true;
  } catch (directErr) {
    // Fallback to server-assisted R2 upload for CORS-restricted environments (within serverless body limits)
    if (file.size <= 4 * 1024 * 1024) {
      const form = new FormData();
      form.append('file', file);
      form.append('namespace', namespace);
      form.append('targetType', targetType);
      form.append('mediaType', mediaType);
      form.append('existingMediaId', presign.mediaId);
      if (extraMeta?.durationSeconds !== undefined) {
        form.append('durationSeconds', String(extraMeta.durationSeconds));
      }

      const fallbackData = await apiFetch<{
        id?: string;
        url?: string;
        publicUrl?: string;
        lqipBase64?: string | null;
      }>('/media/upload', {
        method: 'POST',
        body: form,
      });
      const meta = mediaType === 'image' ? await generateImageLqip(file) : {};
      onProgress?.(100);
      return {
        mediaId: fallbackData.id || presign.mediaId,
        r2Key: presign.r2Key,
        publicUrl: fallbackData.publicUrl || fallbackData.url || presign.publicUrl,
        mimeType: cleanMime,
        mediaType,
        filename: file.name,
        durationSeconds: extraMeta?.durationSeconds,
        lqipBase64: fallbackData.lqipBase64 || meta.lqipBase64,
        width: meta.width,
        height: meta.height,
      };
    }
    throw directErr;
  }

  const meta = mediaType === 'image' ? await generateImageLqip(file) : {};

  if (usedDirectPut) {
    await apiFetch('/media/complete', {
      method: 'POST',
      json: {
        mediaId: presign.mediaId,
        ...meta,
        ...(extraMeta?.durationSeconds !== undefined ? { durationSeconds: extraMeta.durationSeconds } : {}),
      },
    });
  }

  onProgress?.(100);

  return {
    mediaId: presign.mediaId,
    r2Key: presign.r2Key,
    publicUrl: presign.publicUrl,
    mimeType: cleanMime,
    mediaType,
    filename: file.name,
    durationSeconds: extraMeta?.durationSeconds,
    ...meta,
  };
}
