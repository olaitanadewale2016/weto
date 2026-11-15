import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockRequireAuth, mockCompleteMediaUpload } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockCompleteMediaUpload: vi.fn(),
}));

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return {
    ...actual,
    requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  };
});

vi.mock('@/services/media.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/media.service')>();
  return {
    ...actual,
    completeMediaUpload: (...args: unknown[]) => mockCompleteMediaUpload(...args),
  };
});

describe('POST /api/v1/media/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows onboarding users by calling requireAuth with allowOnboarding: true', async () => {
    mockRequireAuth.mockResolvedValue({
      user: { _id: 'user-onb-1', role: 'user', status: 'onboarding' },
    });
    mockCompleteMediaUpload.mockResolvedValue({
      id: 'media-1',
      type: 'image',
      url: '/api/v1/media/proxy?key=avatars%2Fuser-onb-1%2Fpic.png',
      publicUrl: '/api/v1/media/proxy?key=avatars%2Fuser-onb-1%2Fpic.png',
    });

    const { POST } = await import('@/app/api/v1/media/complete/route');
    const req = new NextRequest('https://app.example.com/api/v1/media/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mediaId: 'media-1' }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockRequireAuth).toHaveBeenCalledWith(req, { allowOnboarding: true });
    expect(mockCompleteMediaUpload).toHaveBeenCalledWith({
      mediaId: 'media-1',
      ownerId: 'user-onb-1',
    });
    expect(json.data.publicUrl).toBe('/api/v1/media/proxy?key=avatars%2Fuser-onb-1%2Fpic.png');
  }, 15000);
});
