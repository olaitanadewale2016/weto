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
  if (!resolveUploadMimeType(file).startsWith('image/') || typeof document === 'undefined') return {};
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

const CLIENT_MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
  'image/x-bmp': 'image/bmp',
  'image/x-ms-bmp': 'image/bmp',
  'video/x-m4v': 'video/mp4',
  'audio/mp3': 'audio/mpeg',
  'audio/m4a': 'audio/mp4',
  'audio/x-m4a': 'audio/mp4',
  'application/vnd.rar': 'application/x-rar-compressed',
  'application/x-rar': 'application/x-rar-compressed',
  'application/x-zip': 'application/zip',
  'text/comma-separated-values': 'text/csv',
};

const CLIENT_EXT_TO_MIME: Record<string, string> = {
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

const MAX_SERVER_UPLOAD_BYTES = Math.floor(3.5 * 1024 * 1024);

export function resolveUploadMimeType(file: Pick<File, 'type' | 'name'>): string {
  const raw = (file.type || '').split(';')[0].trim().toLowerCase();
  const aliased = CLIENT_MIME_ALIASES[raw] || raw;
  if (aliased && aliased !== 'application/octet-stream') {
    return aliased;
  }
  const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() || '' : '';
  return CLIENT_EXT_TO_MIME[ext] || aliased || 'application/octet-stream';
}

async function compressImageForUpload(file: File, cleanMime: string): Promise<File | null> {
  if (
    typeof document === 'undefined' ||
    cleanMime === 'image/gif' ||
    cleanMime === 'image/svg+xml' ||
    cleanMime === 'image/x-icon'
  ) {
    return null;
  }
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = async () => {
      try {
        const origW = img.naturalWidth || 1;
        const origH = img.naturalHeight || 1;
        const mimeCandidates =
          cleanMime === 'image/png' ? (['image/webp', 'image/jpeg'] as const) : (['image/jpeg'] as const);
        const base = (file.name || 'upload').replace(/\.[^.]+$/, '') || 'upload';

        for (const outMime of mimeCandidates) {
          const outExt = outMime === 'image/webp' ? 'webp' : 'jpg';
          for (const maxDim of [2048, 1600, 1280, 960]) {
            const scale = Math.min(1, maxDim / Math.max(origW, origH));
            const targetW = Math.max(1, Math.round(origW * scale));
            const targetH = Math.max(1, Math.round(origH * scale));
            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(null);
              return;
            }
            ctx.drawImage(img, 0, 0, targetW, targetH);

            for (const quality of [0.88, 0.76, 0.62, 0.48]) {
              const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, outMime, quality));
              if (!blob) continue;
              // Some WebKit/PWA builds ignore image/webp and emit uncompressed image/png
              if (outMime === 'image/webp' && blob.type && blob.type !== 'image/webp') {
                break;
              }
              if (blob.size <= MAX_SERVER_UPLOAD_BYTES) {
                resolve(new File([blob], `${base}.${outExt}`, { type: outMime }));
                return;
              }
            }
          }
        }
        resolve(null);
      } catch {
        resolve(null);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    img.src = objectUrl;
  });
}

async function uploadViaServerXhr(
  form: FormData,
  onProgress?: (pct: number) => void
): Promise<{
  id?: string;
  url?: string;
  publicUrl?: string;
  lqipBase64?: string | null;
}> {
  if (typeof XMLHttpRequest === 'undefined') {
    return apiFetch('/media/upload', { method: 'POST', body: form });
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/v1/media/upload');
    xhr.withCredentials = true;
    xhr.timeout = 120000;
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        onProgress?.(Math.min(92, 10 + Math.round((ev.loaded / ev.total) * 82)));
      }
    };
    xhr.onload = () => {
      try {
        const payload = JSON.parse(xhr.responseText || '{}') as ApiResponse<{
          id?: string;
          url?: string;
          publicUrl?: string;
          lqipBase64?: string | null;
        }>;
        if (xhr.status >= 200 && xhr.status < 300 && payload.status !== 'error') {
          resolve(payload.data || {});
          return;
        }
        reject(
          new ApiClientError(
            xhr.status || 500,
            payload.error?.code || 'API_ERROR',
            payload.error?.message || `Upload failed (${xhr.status})`,
            payload.error?.details
          )
        );
      } catch {
        reject(
          new ApiClientError(
            xhr.status || 500,
            'HTTP_ERROR',
            xhr.status === 413
              ? 'File is too large for server upload limit. Please use a smaller file.'
              : `Upload failed (${xhr.status})`
          )
        );
      }
    };
    xhr.onerror = () => reject(new Error('Network error uploading media to server'));
    xhr.ontimeout = () => reject(new Error('Upload timed out. Check your connection and try again.'));
    xhr.send(form);
  });
}

export function inferMediaType(mimeType: string, filename = ''): 'image' | 'video' | 'audio' | 'document' {
  const cleanMime = mimeType.split(';')[0].trim().toLowerCase();
  if (cleanMime.startsWith('image/')) return 'image';
  if (cleanMime.startsWith('video/')) return 'video';
  if (cleanMime.startsWith('audio/')) return 'audio';
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'jfif', 'png', 'webp', 'gif', 'heic', 'heif', 'avif', 'bmp', 'svg', 'ico'].includes(ext)) return 'image';
  if (['mp4', 'm4v', 'webm', 'mov', 'mkv', '3gp'].includes(ext)) return 'video';
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
  const rawMime = resolveUploadMimeType(file);
  const mediaType = inferMediaType(rawMime, file.name);
  const defaultExt = rawMime.split('/')[1]?.replace(/[^a-z0-9]/g, '') || 'bin';
  const safeFilename = file.name?.trim() || `upload-${Date.now()}.${defaultExt}`;

  // Prepare upload candidate: for large images (> 3.5 MB), compress client-side to keep
  // same-origin serverless uploads fast and reliable without relying on cross-origin R2 CORS.
  let sameOriginFile: File | null = file.size <= MAX_SERVER_UPLOAD_BYTES ? file : null;
  if (!sameOriginFile && mediaType === 'image') {
    sameOriginFile = await compressImageForUpload(file, rawMime);
  }

  // Prefer same-origin upload whenever file fits comfortably within serverless body limits:
  // avoids browser CORS blocks against *.r2.cloudflarestorage.com on any domain.
  if (sameOriginFile && sameOriginFile.size <= MAX_SERVER_UPLOAD_BYTES) {
    const uploadMime = resolveUploadMimeType(sameOriginFile);
    const form = new FormData();
    form.append('file', sameOriginFile, safeFilename);
    form.append('namespace', namespace);
    form.append('targetType', targetType);
    form.append('mediaType', mediaType);
    if (extraMeta?.durationSeconds !== undefined) {
      form.append('durationSeconds', String(extraMeta.durationSeconds));
    }

    onProgress?.(10);
    const data = await uploadViaServerXhr(form, onProgress);
    const meta = mediaType === 'image' ? await generateImageLqip(sameOriginFile) : {};
    onProgress?.(100);
    return {
      mediaId: data.id || '',
      r2Key: '',
      publicUrl: data.publicUrl || data.url || '',
      mimeType: uploadMime,
      mediaType,
      filename: sameOriginFile.name || safeFilename,
      durationSeconds: extraMeta?.durationSeconds,
      lqipBase64: data.lqipBase64 || meta.lqipBase64,
      width: meta.width,
      height: meta.height,
    };
  }

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
      mimeType: rawMime,
      sizeBytes: file.size,
      filename: safeFilename,
    },
  });

  onProgress?.(20);

  let usedDirectPut = false;
  try {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', presign.uploadUrl);
      xhr.setRequestHeader('Content-Type', rawMime);
      xhr.timeout = 120000;
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
      xhr.ontimeout = () => reject(new Error('Upload timed out while uploading to Cloudflare R2'));
      xhr.send(file);
    });
    usedDirectPut = true;
  } catch (directErr) {
    // Fallback to server-assisted R2 upload when CORS blocks direct PUT (e.g. non-localhost origins)
    const fallbackCandidate = file.size <= 4 * 1024 * 1024 ? file : sameOriginFile;
    if (fallbackCandidate && fallbackCandidate.size <= 4 * 1024 * 1024) {
      const form = new FormData();
      form.append('file', fallbackCandidate, safeFilename);
      form.append('namespace', namespace);
      form.append('targetType', targetType);
      form.append('mediaType', mediaType);
      form.append('existingMediaId', presign.mediaId);
      if (extraMeta?.durationSeconds !== undefined) {
        form.append('durationSeconds', String(extraMeta.durationSeconds));
      }

      const fallbackData = await uploadViaServerXhr(form, onProgress);
      const meta = mediaType === 'image' ? await generateImageLqip(fallbackCandidate) : {};
      onProgress?.(100);
      return {
        mediaId: fallbackData.id || presign.mediaId,
        r2Key: presign.r2Key,
        publicUrl: fallbackData.publicUrl || fallbackData.url || presign.publicUrl,
        mimeType: resolveUploadMimeType(fallbackCandidate),
        mediaType,
        filename: fallbackCandidate.name || safeFilename,
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
    mimeType: rawMime,
    mediaType,
    filename: safeFilename,
    durationSeconds: extraMeta?.durationSeconds,
    ...meta,
  };
}
