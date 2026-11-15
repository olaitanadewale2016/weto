import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { verifyCsrfOrigin } from '@/lib/auth/session';
import { buildR2Key } from '@/lib/r2';
import { ForbiddenError } from '@/lib/api-response';

describe('CSRF Origin Verification & R2 Object Key Security', () => {
  it('allows safe GET requests regardless of Origin', () => {
    const req = new NextRequest('https://app.example.com/api/v1/posts', {
      method: 'GET',
      headers: { host: 'app.example.com', origin: 'https://evil.example.com' },
    });
    expect(() => verifyCsrfOrigin(req)).not.toThrow();
  });

  it('rejects cross-origin cookie-authenticated POST mutations', () => {
    const req = new NextRequest('https://app.example.com/api/v1/posts', {
      method: 'POST',
      headers: { host: 'app.example.com', origin: 'https://attacker.example' },
    });
    expect(() => verifyCsrfOrigin(req)).toThrow(ForbiddenError);
  });

  it('permits matching-origin POST and bearer/API-key mutations', () => {
    const sameOrigin = new NextRequest('https://app.example.com/api/v1/posts', {
      method: 'POST',
      headers: { host: 'app.example.com', origin: 'https://app.example.com' },
    });
    expect(() => verifyCsrfOrigin(sameOrigin)).not.toThrow();

    const apiKeyReq = new NextRequest('https://app.example.com/api/v1/posts', {
      method: 'POST',
      headers: {
        host: 'app.example.com',
        origin: 'https://external-client.example',
        'x-api-key': 'weto_live_1234',
      },
    });
    expect(() => verifyCsrfOrigin(apiKeyReq)).not.toThrow();
  });

  it('sanitizes R2 object keys against directory traversal', () => {
    const key = buildR2Key('posts', 'user_123', '../../../etc/passwd.png');
    expect(key).not.toContain('..');
    expect(key).toMatch(/^posts\/user_123\/\d{4}-\d{2}\//);
    expect(key.endsWith('.png')).toBe(true);
  });
});
