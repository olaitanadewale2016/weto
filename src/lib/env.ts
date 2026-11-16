import { z } from 'zod';

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MONGODB_URI: z.string().min(1).optional(),
  MONGODB_DB_NAME: z.string().default('colibriplus'),
  REDIS_URL: z.string().optional(),
  HASHIDS_SALT: z.string().default('colibriplus-default-salt-change-me'),
  APP_SECRET: z.string().default('colibriplus-dev-secret-change-me'),
  SYSTEM_API_KEY: z.string().optional(),
  AUTO_FOLLOW_LIST: z.string().default(''),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().default('weto-media'),
  R2_ENDPOINT: z.string().optional(),
  NEXT_PUBLIC_R2_PUBLIC_URL: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_CURRENCY: z.string().default('NGN'),
  PAYPAL_MODE: z.enum(['sandbox', 'live']).default('sandbox'),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
  YOOKASSA_SHOP_ID: z.string().optional(),
  YOOKASSA_SECRET_KEY: z.string().optional(),
  ROBOKASSA_MERCHANT_LOGIN: z.string().optional(),
  ROBOKASSA_PASS_ONE: z.string().optional(),
  ROBOKASSA_PASS_TWO: z.string().optional(),
  ROBOKASSA_TEST_MODE: z.string().default('true'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.string().default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM_ADDRESS: z.string().default('noreply@example.com'),
  SMTP_FROM_NAME: z.string().default('Weto'),
  ADMIN_ALERT_EMAIL: z.string().optional(),
  GIPHY_API_KEY: z.string().optional(),
  IPINFO_TOKEN: z.string().optional(),
  TRANSLATION_SERVICE: z.enum(['libretranslate', 'disabled']).default('libretranslate'),
  TRANSLATION_SERVICE_API_URL: z.string().default('http://localhost:5000'),
  TRANSLATION_SERVICE_API_KEY: z.string().optional(),
  SMS_DRIVER: z.enum(['log', 'vonage', 'smsaero']).default('log'),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  VERIFICATION_SERVICE_URL: z.string().default('https://docs.sumsub.com/docs/user-verification'),
  ENABLE_MEDIA_WORKER: z.enum(['true', 'false']).optional(),
  CRON_SECRET: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (!cachedEnv) {
    cachedEnv = serverEnvSchema.parse(process.env);
  }
  return cachedEnv;
}

/**
 * Resolves the canonical application base URL across local dev, Vercel Preview,
 * Vercel Production, and custom domains.
 */
export function getAppBaseUrl(fallbackOrigin?: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProd) return `https://${vercelProd.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;

  if (fallbackOrigin) return fallbackOrigin.replace(/\/+$/, '');
  return 'http://localhost:3000';
}

const defaultAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  || (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : '')
  || 'http://localhost:3000';

const defaultRealtimeUrl = process.env.NEXT_PUBLIC_REALTIME_URL?.trim()
  || (process.env.NODE_ENV === 'development' ? 'http://localhost:4000' : '');

export const publicEnv = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || 'Weto',
  appUrl: defaultAppUrl.replace(/\/+$/, ''),
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION || '2.1.0',
  defaultLocale: process.env.NEXT_PUBLIC_DEFAULT_LOCALE || 'en',
  defaultCurrency: process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || 'NGN',
  hideAuthorAttribution: process.env.NEXT_PUBLIC_HIDE_AUTHOR_ATTRIBUTION === 'true',
  realtimeUrl: defaultRealtimeUrl,
  r2PublicUrl: process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '',
  giphyApiKey: process.env.NEXT_PUBLIC_GIPHY_API_KEY || '',
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '',
  },
};
