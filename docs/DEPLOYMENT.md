# Production Deployment Guide (Vercel Full-Stack)

ColibriPlus runs cleanly as a full-stack Next.js App Router deployment on **Vercel** backed by **MongoDB Atlas**, **Firebase Auth & Cloud Messaging**, and **Cloudflare R2**, with optional external real-time and transcoding services.

## 1. Vercel Full-Stack Deployment (Recommended Baseline)

Vercel hosts the Next.js frontend, all `/api/v1/*` REST API routes, and scheduled maintenance via Vercel Cron:

1. **Import Project in Vercel**
   - Set the Root Directory to `colibriplus-next`.
   - Framework Preset: **Next.js** (Build Command: `npm run build`).
2. **Required Environment Variables in Vercel**
   - **App & Security:** `NEXT_PUBLIC_APP_URL` (your production `https://...` URL), `HASHIDS_SALT`, `APP_SECRET`, `SYSTEM_API_KEY`, `CRON_SECRET`
   - **Database:** `MONGODB_URI` (MongoDB Atlas connection string — replica set required for ACID wallet/ad transactions), `MONGODB_DB_NAME`
   - **Firebase Client:** `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_FIREBASE_VAPID_KEY`
   - **Firebase Admin:** `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (keep `\n` escaped in a single-line value)
   - **Cloudflare R2:** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT`, and optionally `NEXT_PUBLIC_R2_PUBLIC_URL`
   - **Note on `NEXT_PUBLIC_REALTIME_URL`:** Leave it **unset** on pure Vercel deployments. The app automatically falls back to polling for chat messages and notification counters instead of connecting to `localhost`.
   - **Note on `ENABLE_MEDIA_WORKER`:** Leave it **unset** (or `false`) on pure Vercel deployments so audio/video uploads finalize immediately instead of waiting on a BullMQ worker.
3. **Firebase & R2 Domain Configuration**
   - In **Firebase Console → Authentication → Settings → Authorized domains**, add your Vercel production domain (and preview domains if needed).
   - In **Cloudflare R2 → Bucket Settings → CORS Policy**, allow `PUT` and `GET` from your Vercel domain (`https://your-domain.com`).
4. **Database Seed & Admin Setup**
   - Run `npm run seed` locally pointing at your production `MONGODB_URI`, or sign up as the first user (the first registered user is automatically promoted to `root` admin).
5. **Automated Cleanup (Vercel Cron)**
   - [`vercel.json`](../vercel.json) schedules `/api/v1/cron/maintenance` daily at `03:00 UTC` (compatible with both Vercel Hobby and Pro plans) to clean up expired non-highlight stories and chat invites using `CRON_SECRET`.
6. **Health Check**
   - Verify live deployment and MongoDB connectivity at `GET /api/v1/health`.

## 2. Optional Companion Services (When Scaling Beyond Serverless)

Vercel Serverless Functions cannot host long-lived WebSocket servers or FFmpeg workers. When you want instant Socket.IO presence/typing or background FFmpeg video transcoding:

1. **Redis** (e.g. Upstash Redis or managed Redis): set `REDIS_URL` in Vercel and both companion services.
2. **Persistent Real-Time Socket.IO (`npm run start:realtime`)**
   - Deploy `realtime/server.ts` on Railway, Fly.io, Render, or a VPS/container (`Dockerfile` included).
   - Set `REALTIME_PORT` (default `4000`), `REALTIME_CORS_ORIGIN` (`https://your-vercel-domain.com`), `REDIS_URL`, `MONGODB_URI`, and `FIREBASE_*`.
   - Set `NEXT_PUBLIC_REALTIME_URL` in Vercel to the Socket.IO service's `https://` URL and redeploy.
3. **Background Media & FFmpeg Worker (`npm run start:worker`)**
   - Deploy `worker/index.ts` alongside FFmpeg on a persistent worker host with `REDIS_URL`, `MONGODB_URI`, and `R2_*`.
   - Set `ENABLE_MEDIA_WORKER=true` in Vercel so video/audio uploads are queued for transcoding.
