# Firebase Auth, FCM & Cloudflare R2 Configuration

## Firebase Authentication & Cloud Messaging
1. Create a Firebase Project and enable **Email/Password** and **Google** Sign-in providers.
2. Generate a Web App configuration and set `NEXT_PUBLIC_FIREBASE_*` and `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.
3. Update `public/firebase-messaging-sw.js` with your public Firebase config for background PWA push notifications.
4. Generate a Service Account private key and configure `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` on the server only. Never expose these in `NEXT_PUBLIC_*` variables.

## Cloudflare R2 Storage
1. Create an R2 bucket in Cloudflare Dashboard and generate an S3 API Token (`Access Key ID` + `Secret Access Key`).
2. Configure `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, and `NEXT_PUBLIC_R2_PUBLIC_URL`.
3. Configure R2 CORS policy to allow `PUT` and `GET` requests from your application origin so direct browser presigned uploads succeed.
4. If `NEXT_PUBLIC_R2_PUBLIC_URL` is omitted during development, `/api/v1/media/proxy?key=...` automatically generates short-lived signed download redirects.
