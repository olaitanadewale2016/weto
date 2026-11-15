import { NextResponse } from 'next/server';

export async function GET() {
  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'Weto Next.js REST API',
      version: '2.1.0',
      description:
        'Full-stack social media platform API powered by Next.js App Router, MongoDB Atlas, Firebase Auth, Cloudflare R2, FCM, and Socket.IO.',
    },
    servers: [{ url: '/api/v1' }],
    components: {
      securitySchemes: {
        FirebaseSession: { type: 'apiKey', in: 'cookie', name: '__session' },
        FirebaseBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        DeveloperApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
    },
    security: [{ FirebaseSession: [] }, { FirebaseBearer: [] }, { DeveloperApiKey: [] }],
    paths: {
      '/bootstrap': { get: { summary: 'Bootstrap config, currencies, locales, user, unread counters' } },
      '/auth/session': {
        get: { summary: 'Get authenticated session user' },
        post: { summary: 'Exchange Firebase ID token for __session cookie' },
        delete: { summary: 'Clear session cookie' },
      },
      '/posts': {
        get: { summary: 'Fetch paginated feed / trending / bookmarks / user posts' },
        post: { summary: 'Create publication with text, media, poll, link preview, or quote' },
      },
      '/posts/{id}': {
        get: { summary: 'Get single publication' },
        patch: { summary: 'Edit or pin publication' },
        delete: { summary: 'Delete publication' },
      },
      '/posts/{id}/comments': {
        get: { summary: 'List nested comments' },
        post: { summary: 'Create comment or reply' },
      },
      '/posts/{id}/react': { post: { summary: 'Toggle reaction, bookmark, or cast poll vote' } },
      '/stories': {
        get: { summary: 'List active stories feed' },
        post: { summary: 'Publish story frame (24h TTL)' },
      },
      '/chats': {
        get: { summary: 'List user direct and group conversations' },
        post: { summary: 'Create or open chat' },
      },
      '/marketplace': {
        get: { summary: 'Search and filter marketplace products' },
        post: { summary: 'Create marketplace product listing' },
      },
      '/jobs': {
        get: { summary: 'Search and filter job listings' },
        post: { summary: 'Create job listing' },
      },
      '/wallet': {
        get: { summary: 'Fetch server-authoritative wallet balance, transactions, cashouts' },
        post: { summary: 'Initiate deposit, request cashout, or transfer funds' },
      },
      '/ads': {
        get: { summary: 'List advertiser campaigns or active feed ad' },
        post: { summary: 'Create advertisement campaign (debiting wallet via MongoDB transaction)' },
      },
      '/notifications': {
        get: { summary: 'List notifications' },
        patch: { summary: 'Mark notifications as read' },
      },
      '/media/presign': { post: { summary: 'Create presigned Cloudflare R2 upload URL' } },
      '/media/complete': { post: { summary: 'Verify R2 upload and finalize Media record' } },
    },
  };

  return NextResponse.json(spec);
}
