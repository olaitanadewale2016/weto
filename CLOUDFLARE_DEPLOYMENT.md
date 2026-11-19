# Cloudflare Deployment Guide — Weto / ColibriPlus

This application is fully prepared for production deployment on **Cloudflare**. You can deploy using either of two battle-tested methods depending on your infrastructure requirements:

1. **Option 1: Serverless Edge (Cloudflare Workers / Pages)** — Global edge execution via the official `@opennextjs/cloudflare` adapter.
2. **Option 2: Cloudflare Tunnel + Docker (VPS / Container)** — Full-stack deployment with background video transcoding (`ffmpeg`), BullMQ workers, and WebSocket services secured by Cloudflare Zero Trust with **zero open inbound ports**.

---

## Architecture Overview

| Component | Cloudflare Integration |
|---|---|
| **Media & Object Storage** | **Cloudflare R2** (S3-compatible, \$0 egress fees) |
| **Edge CDN & Caching** | Static assets (`/_next/static/*`, `/assets/*`, `/pwa/*`) served directly from Cloudflare PoPs via `public/_headers` |
| **Visitor IP & Geo** | Edge headers: `CF-Connecting-IP`, `CF-IPCountry`, `CF-IPCity`, `CF-Region`, `CF-Timezone` |
| **Realtime Messaging** | Dual-stack: Firebase Firestore Realtime custom events (works seamlessly on serverless edge) + optional Socket.IO |
| **Edge Adapter** | `@opennextjs/cloudflare` + `wrangler` |

---

## Option 1: Cloudflare Workers / Pages (OpenNext Edge)

### 1. Prerequisites
- A [Cloudflare Account](https://dash.cloudflare.com/)
- A remote MongoDB database (e.g. [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)) with a replica set connection string (`mongodb+srv://...`)
- (Optional) A remote Redis instance (e.g. [Upstash Redis](https://upstash.com/))
- A Cloudflare R2 bucket (`weto-media`)

### 2. Configure Cloudflare R2
1. Go to **Cloudflare Dashboard** → **R2** → **Create bucket**.
2. Name it `weto-media` (or your preferred bucket name).
3. Under **Settings**, enable **Public Access** or connect a custom domain (e.g. `media.yourdomain.com`).
4. Under **Settings** → **CORS Policy**, add the following policy to enable direct browser presigned uploads:
   ```json
   [
     {
       "AllowedOrigins": [
         "https://yourdomain.com",
         "https://*.workers.dev",
         "http://localhost:3000"
       ],
       "AllowedMethods": [
         "GET",
         "PUT",
         "HEAD"
       ],
       "AllowedHeaders": [
         "*"
       ],
       "ExposeHeaders": [
         "ETag"
       ],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
5. Under **Manage R2 API Tokens**, create an API token with **Object Read & Write** permissions. Note down:
   - Account ID
   - Access Key ID
   - Secret Access Key

### 3. Twitter-Like Media Architecture (Built-In)
The platform is pre-configured with a 5-pillar high-performance media delivery architecture:
1. **Direct Presigned Uploads**: Users upload media files directly from their browsers to Cloudflare R2 via presigned URLs, bypassing Worker CPU/memory limits and bandwidth costs. If direct PUT fails or CORS is not configured, it gracefully falls back to same-origin server upload.
2. **Automatic Client-Side Pre-Compression & LQIP**: Huge photos (up to 48MP) are automatically downscaled to 2048px WebP/JPEG in the browser before transfer, generating an instant base64 micro-thumbnail (LQIP) for instant blur-up placeholder rendering.
3. **Lazy Loading for Images & Videos**: All feed images load with native `loading="lazy"`. Videos use `SmartVideoPlayer` with `IntersectionObserver` so offscreen videos consume zero bandwidth or buffer memory until scrolled into view.
4. **Video Transcoding & Progressive Streaming**: Videos are encoded with `-movflags +faststart` for instant playback initiation, supporting HTTP byte-range requests and adaptive HLS streaming (`.m3u8`).
5. **Global CDN Edge Caching**: Proxied assets emit `Cache-Control: public, max-age=31536000, s-maxage=31536000, immutable` and `Cloudflare-CDN-Cache-Control` headers, instructing Cloudflare edge PoPs worldwide to cache media and eliminate repeat origin requests.

### 4. Local Preview
Test the Cloudflare build locally using Wrangler:
```bash
# Build the OpenNext worker bundle
npm run preview
```
This builds your Next.js application, prepares static assets in `.open-next/assets`, packages the server worker in `.open-next/worker.js`, and boots a local Wrangler development server simulating the Cloudflare edge runtime.

### 5. Deploy to Cloudflare
Authenticate and deploy directly from your terminal:
```bash
# Login to your Cloudflare account (first time only)
npx wrangler login

# Build and deploy to Cloudflare Workers
npm run deploy
```

Alternatively, you can connect your GitHub repository to **Cloudflare Pages** or **Cloudflare Workers Builds**:
- **Build command**: `npx opennextjs-cloudflare build`
- **Build output directory**: `.open-next/assets`
- **Node.js compatibility flag**: `nodejs_compat`

### 6. Set Environment Variables
In the **Cloudflare Dashboard** (Workers & Pages → Your Project → **Settings** → **Variables and Secrets**), configure:

```ini
NODE_ENV=production
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/colibriplus?retryWrites=true&w=majority
APP_SECRET=your-random-production-secret-32-chars-long
HASHIDS_SALT=your-random-hashids-salt

# Cloudflare R2
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=weto-media
NEXT_PUBLIC_R2_PUBLIC_URL=https://media.yourdomain.com

# Firebase Client & Admin (for Auth & Realtime Chat events)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef

# Public App URL
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

---

## Option 2: Cloudflare Tunnel + Docker (Full-Stack VPS)

If your platform uses background video transcoding (`ffmpeg`) or high-volume WebSockets via `realtime/server.ts`, deploy the containerized stack on any VPS (Hetzner, AWS EC2, DigitalOcean, Coolify) behind **Cloudflare Tunnel (`cloudflared`)**.

### Advantages of Cloudflare Tunnel
- **Zero Open Ports**: No need to open ports `80`, `443`, or `3000` on your server firewall.
- **Full DDoS Protection & WAF**: All traffic is filtered by Cloudflare before hitting your server.
- **Automatic SSL**: Free end-to-end HTTPS certificates managed by Cloudflare.
- **WebSocket Support**: Full support for real-time WebSockets and long-lived connections.

### Setup Steps

1. In the **Cloudflare Dashboard**, navigate to **Zero Trust** → **Networks** → **Tunnels** → **Create Tunnel**.
2. Select **Cloudflared**, give the tunnel a name (e.g. `weto-production`), and copy the **Tunnel Token**.
3. In `Public Hostnames`, map your domain:
   - Subdomain/Domain: `yourdomain.com`
   - Service: `HTTP` → `web:3000` (or `localhost:3000`)
4. On your server, create `.env.production` with your credentials and add:
   ```ini
   CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoi...your_token_here...
   ```
5. Launch the stack:
   ```bash
   docker compose --profile cloudflare up -d
   ```

---

## Cloudflare Dashboard Best Practices

### 1. SSL/TLS Settings
- Navigate to **SSL/TLS** → **Overview**.
- Set encryption mode to **Full (Strict)**.

### 2. Network & WebSockets
- Navigate to **Network**.
- Verify **WebSockets** is toggled **ON** (enabled by default).
- Verify **gRPC** and **HTTP/3 (with QUIC)** are toggled **ON**.

### 3. Caching Rules
The application includes `public/_headers` which automatically configures Cloudflare edge caching for immutable assets:
- `/_next/static/*` → `Cache-Control: public, max-age=31536000, immutable`
- `/assets/*` → `Cache-Control: public, max-age=31536000, immutable`
- `/pwa/icons/*` → `Cache-Control: public, max-age=31536000, immutable`
- Service workers (`/pwa/service-worker.js`, `/firebase-messaging-sw.js`) → `no-cache, no-store, must-revalidate`

---

## Verification Checklist

- [x] `@opennextjs/cloudflare` adapter and `wrangler` installed in `package.json`
- [x] `wrangler.jsonc` created with `nodejs_compat` flag and static asset bindings
- [x] `open-next.config.ts` configured for Cloudflare runtime
- [x] `public/_headers` created for edge caching and security policies
- [x] `src/lib/auth/session.ts` updated to prioritize `CF-Connecting-IP`
- [x] `src/services/translation.service.ts` updated to parse Cloudflare geo headers (`cf-ipcountry`, `cf-ipcity`, `cf-region`, `cf-timezone`)
- [x] `src/lib/env.ts` updated to support `CF_PAGES_URL` and `NEXT_PUBLIC_CF_PAGES_URL`
- [x] `docker-compose.yml` updated with `cloudflared` tunnel profile
