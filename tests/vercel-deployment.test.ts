import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getAppBaseUrl } from '@/lib/env';
import { isMediaWorkerEnabled } from '@/services/media.service';
import { GET as runMaintenanceCron } from '@/app/api/v1/cron/maintenance/route';

describe('Vercel Full-Stack Readiness', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('resolves canonical app base URL across Vercel and local environments', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    expect(getAppBaseUrl()).toBe('http://localhost:3000');
    expect(getAppBaseUrl('https://preview.example.com/')).toBe('https://preview.example.com');

    process.env.VERCEL_URL = 'colibri-git-main.vercel.app';
    expect(getAppBaseUrl()).toBe('https://colibri-git-main.vercel.app');

    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'colibri.example.com';
    expect(getAppBaseUrl()).toBe('https://colibri.example.com');

    process.env.NEXT_PUBLIC_APP_URL = 'https://custom.colibri.com/';
    expect(getAppBaseUrl()).toBe('https://custom.colibri.com');
  });

  it('disables BullMQ media worker by default on Vercel unless explicitly enabled', () => {
    delete process.env.ENABLE_MEDIA_WORKER;
    process.env.VERCEL = '1';
    expect(isMediaWorkerEnabled()).toBe(false);

    process.env.ENABLE_MEDIA_WORKER = 'true';
    expect(isMediaWorkerEnabled()).toBe(true);

    delete process.env.VERCEL;
    delete process.env.ENABLE_MEDIA_WORKER;
    expect(isMediaWorkerEnabled()).toBe(true);
  });

  it('rejects unauthorized requests to the Vercel maintenance cron endpoint', async () => {
    process.env.CRON_SECRET = 'super-secret-cron';
    const req = new NextRequest('https://app.vercel.app/api/v1/cron/maintenance');
    const res = await runMaintenanceCron(req);
    expect(res.status).toBe(401);
  });
});
