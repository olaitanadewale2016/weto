# Weto — Modern Social Networking & Creator Platform

Full-stack **Next.js 16 (App Router)** social networking, real-time messaging, stories, marketplace, job board, creator wallet, and administration platform powered by **MongoDB Atlas**, **Firebase Authentication & Firestore**, **Cloudflare R2**, and **Socket.IO / BullMQ**.

## Architecture Stack

- **Web App & REST API:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4
- **Database:** MongoDB Atlas / Mongoose 8 with ACID transactions for Wallet, Transfers, Ads, and Cashouts
- **Authentication & Sessions:** Firebase Authentication (Email/Password + Google OAuth), Firebase Admin HTTP-only `__session` cookies, Admin credentials login, and `weto_live_*` Developer API keys
- **Real-Time Messaging, Typing & Notifications:** Firebase Firestore (`chats_realtime` / `users_realtime`) + Firebase Cloud Messaging (`firebase-messaging-sw.js`) with optional standalone Socket.IO (`realtime/server.ts`) & Redis Pub/Sub adapter
- **Media Storage & Processing:** Cloudflare R2 presigned uploads (`image`, `video`, `audio`/voice notes, `document`, `system_asset`) + optional BullMQ / FFmpeg transcode worker (`worker/index.ts`)
- **Payments & Wallet:** Paystack, Stripe, PayPal, YooKassa, and RoboKassa (all configurable from Admin Acquiring settings)
- **Localization, Geo & Integrations:** Admin-managed Currencies & Locales (including RTL support), Editable Multi-Locale Static Pages (`/document/*`), IPInfo + Vercel Edge GeoIP detection during onboarding & security sessions, Giphy picker, and LibreTranslate / OpenAI / Gemini translation
- **PWA Support:** Web App Manifest (`/pwa/manifest.json`) & Service Worker (`/pwa/service-worker.js`) controlled via Admin `pwaEnabled` setting

## Quick Start

```bash
cp .env.example .env.local    # Configure MongoDB, Firebase, Cloudflare R2, and optional integrations
npm install
npm run seed                  # Seed default currencies, locales, categories, and static pages
npm run dev                   # Starts Next.js development server on http://localhost:3000
```

For full multi-process local development (with optional Socket.IO + BullMQ worker):

```bash
docker compose up -d          # Starts local MongoDB replica set (rs0) + Redis
npm run dev:all               # Runs Next.js (3000), Socket.IO (4000), and worker
```

### Useful Scripts

- `npm run dev` — Next.js development server
- `npm run build` / `npm run start` — Production build and server
- `npm run typecheck` — TypeScript check (`tsc --noEmit`)
- `npm run lint` — ESLint check
- `npm run test` — Run Vitest test suite (`vitest run`)
- `npm run seed` — Seed currencies, locales, categories, and default static pages
- `npm run admin:root` — Promote or provision root admin account

## Deploying to Vercel

1. Push the repository to GitHub and import the project in **Vercel** (`vercel.json` is preconfigured with scheduled cron jobs under `/api/v1/cron/*`).
2. Add environment variables from `.env.example` in **Vercel Project Settings → Environment Variables** (`MONGODB_URI`, `FIREBASE_*`, `NEXT_PUBLIC_FIREBASE_*`, `R2_*`, `NEXT_PUBLIC_R2_PUBLIC_URL`, `PAYSTACK_*` / `STRIPE_*`, `IPINFO_TOKEN`, `GIPHY_API_KEY`, `CRON_SECRET`, etc.).
3. Leave `ENABLE_MEDIA_WORKER=false` on serverless Vercel deployments so media uploads finalize cleanly through Cloudflare R2 presigned URLs.

## Documentation

See the `docs/` directory for detailed operational guides:

- [docs/SETUP.md](docs/SETUP.md) — Local environment & initial setup
- [docs/DATABASE.md](docs/DATABASE.md) — MongoDB collections, indexes & transactions
- [docs/FIREBASE_R2.md](docs/FIREBASE_R2.md) — Firebase Auth, Firestore, FCM & Cloudflare R2 CORS/buckets
- [docs/PAYMENTS.md](docs/PAYMENTS.md) — Paystack, Stripe, PayPal, YooKassa & RoboKassa webhooks
- [docs/API.md](docs/API.md) — REST API & OpenAPI `/api/v1/docs` reference
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Vercel & production deployment checklist
- [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) — Admin panel controls, currencies, locales & moderation
