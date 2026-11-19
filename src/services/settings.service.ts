import { connectDB } from '@/lib/db';
import { Setting } from '@/models/System';
import { getAiCapabilities } from './ai.service';

export interface AppSettingsMap {
  app: {
    name: string;
    description: string;
    keywords: string;
    documentationUrl: string;
    timezone: string;
    locale: string;
    defaultCurrency: string;
    pwaEnabled: boolean;
    hideSensitiveData: boolean;
    apiKey?: string;
    mobileAppAndroidLink: string;
    mobileAppIosLink: string;
  };
  features: {
    marketplace: boolean;
    jobs: boolean;
    ads: boolean;
    wallet: boolean;
    api: boolean;
    businessAccounts: boolean;
    darkTheme: boolean;
    linkAccounts: boolean;
    switchAccounts: boolean;
  };
  auth: {
    captchaEnabled: boolean;
    registrationEnabled: boolean;
    loginEnabled: boolean;
    regVerificationEnabled: boolean;
    regVerificationType: 'email' | 'phone';
    switchAccountEnabled: boolean;
    linkAccountsEnabled: boolean;
  };
  brand: {
    darkThemeEnabled: boolean;
    imagesWatermarkEnabled: boolean;
    videosWatermarkEnabled: boolean;
    defaultTheme: 'light' | 'dark';
    logoLightUrl: string;
    logoDarkUrl: string;
    faviconUrl: string;
    watermarkUrl: string;
  };
  wallet: {
    enabled: boolean;
    name: string;
    aboutLink: string;
    walletNumberPrefix: string;
    cashoutMethods: string[];
    defaultBalance: number;
    depositMinAmount: number;
    depositMaxAmount: number;
    transferMinAmount: number;
    transferMaxAmount: number;
    withdrawMinAmount: number;
    withdrawMaxAmount: number;
    commissionDeposit: number;
    commissionTransfer: number;
    commissionWithdraw: number;
  };
  ads: {
    billingModel: 'viewable_cpm' | 'every_impression' | 'cpc' | 'hybrid';
    defaultApproval: boolean;
    pricePerView: number;
    pricePerClick: number;
    minBudget: number;
    defaultBudget: number;
    maxDailySpendPerAd: number;
    refreshIntervalMinutes: number;
    chargeIntervalMinutes: number;
    refundUnspentOnDelete: boolean;
  };
  promotions: {
    enabled: boolean;
    price3d: number;
    price7d: number;
    price14d: number;
  };
  acquiring: {
    paystackStatus: boolean;
    paystackName: string;
    paystackPublicKey: string;
    paystackSecretKey: string;
    paystackCurrency: string;
    stripeStatus: boolean;
    stripeName: string;
    stripePublicKey: string;
    stripeSecretKey: string;
    stripeWebhookSecret: string;
    paypalStatus: boolean;
    paypalName: string;
    paypalMode: 'sandbox' | 'live';
    paypalClientId: string;
    paypalSecretKey: string;
    paypalWebhookId: string;
    ykStatus: boolean;
    ykName: string;
    ykShopId: string;
    ykSecretKey: string;
    ykCurrency: string;
    rkStatus: boolean;
    rkName: string;
    rkMerchantLogin: string;
    rkPassOne: string;
    rkPassTwo: string;
    rkMode: 'test' | 'live';
    rkCurrency: string;
  };
  mail: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
    fromAddress: string;
    fromName: string;
  };
  code: {
    headerCodeEnabled: boolean;
    headerCode: string;
    footerCodeEnabled: boolean;
    footerCode: string;
  };
  verification: {
    serviceUrl: string;
  };
}

export const DEFAULT_SETTINGS: AppSettingsMap = {
  app: {
    name: process.env.NEXT_PUBLIC_APP_NAME || 'Weto',
    description: 'Modern social media sharing platform',
    keywords: 'social, community, marketplace, jobs',
    documentationUrl: 'https://docs.weto.app',
    timezone: 'UTC',
    locale: process.env.NEXT_PUBLIC_DEFAULT_LOCALE || 'en',
    defaultCurrency: process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || 'NGN',
    pwaEnabled: true,
    hideSensitiveData: true,
    apiKey: process.env.SYSTEM_API_KEY || '',
    mobileAppAndroidLink: '',
    mobileAppIosLink: '',
  },
  features: {
    marketplace: true,
    jobs: true,
    ads: true,
    wallet: true,
    api: true,
    businessAccounts: true,
    darkTheme: true,
    linkAccounts: true,
    switchAccounts: true,
  },
  auth: {
    captchaEnabled: false,
    registrationEnabled: true,
    loginEnabled: true,
    regVerificationEnabled: true,
    regVerificationType: 'email',
    switchAccountEnabled: true,
    linkAccountsEnabled: true,
  },
  brand: {
    darkThemeEnabled: true,
    imagesWatermarkEnabled: true,
    videosWatermarkEnabled: true,
    defaultTheme: 'light',
    logoLightUrl: '/assets/logos/light.png',
    logoDarkUrl: '/assets/logos/dark.png',
    faviconUrl: '/assets/logos/favicon.png',
    watermarkUrl: '/assets/watermarks/default.png',
  },
  wallet: {
    enabled: true,
    name: 'Weto Wallet',
    aboutLink: '/document/help-center',
    walletNumberPrefix: 'W',
    cashoutMethods: ['PayPal', 'Bank Transfer', 'Stripe'],
    defaultBalance: 0,
    depositMinAmount: 2000,
    depositMaxAmount: 1000000,
    transferMinAmount: 1000,
    transferMaxAmount: 500000,
    withdrawMinAmount: 10000,
    withdrawMaxAmount: 500000,
    commissionDeposit: 0,
    commissionTransfer: 1.5,
    commissionWithdraw: 2.5,
  },
  ads: {
    billingModel: 'viewable_cpm',
    defaultApproval: false,
    pricePerView: 25,
    pricePerClick: 75,
    minBudget: 5000,
    defaultBudget: 25000,
    maxDailySpendPerAd: 0,
    refreshIntervalMinutes: 5,
    chargeIntervalMinutes: 10,
    refundUnspentOnDelete: true,
  },
  promotions: {
    enabled: true,
    price3d: 2500,
    price7d: 5000,
    price14d: 8500,
  },
  acquiring: {
    paystackStatus: Boolean(process.env.PAYSTACK_SECRET_KEY),
    paystackName: 'Paystack',
    paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    paystackSecretKey: process.env.PAYSTACK_SECRET_KEY || '',
    paystackCurrency: process.env.PAYSTACK_CURRENCY || 'NGN',
    stripeStatus: Boolean(process.env.STRIPE_SECRET_KEY),
    stripeName: 'Stripe',
    stripePublicKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    paypalStatus: Boolean(process.env.PAYPAL_CLIENT_ID),
    paypalName: 'PayPal',
    paypalMode: (process.env.PAYPAL_MODE as 'sandbox' | 'live') || 'sandbox',
    paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
    paypalSecretKey: process.env.PAYPAL_CLIENT_SECRET || '',
    paypalWebhookId: process.env.PAYPAL_WEBHOOK_ID || '',
    ykStatus: Boolean(process.env.YOOKASSA_SHOP_ID),
    ykName: 'YooKassa',
    ykShopId: process.env.YOOKASSA_SHOP_ID || '',
    ykSecretKey: process.env.YOOKASSA_SECRET_KEY || '',
    ykCurrency: 'RUB',
    rkStatus: Boolean(process.env.ROBOKASSA_MERCHANT_LOGIN),
    rkName: 'RoboKassa',
    rkMerchantLogin: process.env.ROBOKASSA_MERCHANT_LOGIN || '',
    rkPassOne: process.env.ROBOKASSA_PASS_ONE || '',
    rkPassTwo: process.env.ROBOKASSA_PASS_TWO || '',
    rkMode: process.env.ROBOKASSA_TEST_MODE === 'false' ? 'live' : 'test',
    rkCurrency: 'RUB',
  },
  mail: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    username: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASS || '',
    fromAddress: process.env.SMTP_FROM_ADDRESS || 'noreply@example.com',
    fromName: process.env.SMTP_FROM_NAME || 'Weto',
  },
  code: {
    headerCodeEnabled: false,
    headerCode: '',
    footerCodeEnabled: false,
    footerCode: '',
  },
  verification: {
    serviceUrl: process.env.VERIFICATION_SERVICE_URL || 'https://docs.sumsub.com/docs/user-verification',
  },
};

const SETTINGS_CACHE_TTL_MS = 300_000;

declare global {
  var __wetoSettingsCache:
    | Map<string, { value: unknown; expiresAt: number }>
    | undefined;
}

function getSettingsCache() {
  if (!global.__wetoSettingsCache) {
    global.__wetoSettingsCache = new Map();
  }
  return global.__wetoSettingsCache;
}

export function clearSettingsCache(): void {
  getSettingsCache().clear();
}

export async function getSettingsGroup<K extends keyof AppSettingsMap>(
  group: K
): Promise<AppSettingsMap[K]> {
  const cache = getSettingsCache();
  const cached = cache.get(group);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as AppSettingsMap[K];
  }
  try {
    await connectDB();
    const doc = await Setting.findOne({ group }).lean();
    const merged = doc
      ? { ...DEFAULT_SETTINGS[group], ...(doc.payload as Partial<AppSettingsMap[K]>) }
      : DEFAULT_SETTINGS[group];
    if (group === 'app') {
      const appPayload = merged as AppSettingsMap['app'];
      if (appPayload.documentationUrl === 'https://docs.colibriplus.app') {
        appPayload.documentationUrl = 'https://docs.weto.app';
      }
    }
    cache.set(group, { value: merged, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS });
    return merged;
  } catch {
    return DEFAULT_SETTINGS[group];
  }
}

export async function updateSettingsGroup<K extends keyof AppSettingsMap>(
  group: K,
  patch: Partial<AppSettingsMap[K]>
): Promise<AppSettingsMap[K]> {
  await connectDB();
  getSettingsCache().delete(group);
  const current = await getSettingsGroup(group);
  const nextPayload = { ...current, ...patch };
  await Setting.updateOne(
    { group },
    { $set: { group, payload: nextPayload } },
    { upsert: true }
  );
  getSettingsCache().set(group, { value: nextPayload, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS });
  return nextPayload;
}

export async function getPublicBootstrapConfig() {
  const [app, features, auth, brand, wallet, ads, promotions, verification] = await Promise.all([
    getSettingsGroup('app'),
    getSettingsGroup('features'),
    getSettingsGroup('auth'),
    getSettingsGroup('brand'),
    getSettingsGroup('wallet'),
    getSettingsGroup('ads'),
    getSettingsGroup('promotions'),
    getSettingsGroup('verification'),
  ]);

  const giphyEnabled = Boolean(
    process.env.GIPHY_API_KEY?.trim() || process.env.NEXT_PUBLIC_GIPHY_API_KEY?.trim()
  );
  const translationEnabled = process.env.TRANSLATION_SERVICE !== 'disabled';
  const ipGeoEnabled = Boolean(process.env.IPINFO_TOKEN?.trim());

  return {
    appName: app.name,
    appDescription: app.description,
    defaultCurrency: app.defaultCurrency,
    defaultLocale: app.locale,
    defaultTheme: brand.defaultTheme,
    pwaEnabled: app.pwaEnabled,
    logos: {
      light: brand.logoLightUrl,
      dark: brand.logoDarkUrl,
      favicon: brand.faviconUrl,
      watermark: brand.watermarkUrl,
    },
    giphyEnabled,
    translationEnabled,
    ipGeoEnabled,
    app: {
      name: app.name,
      description: app.description,
      version: process.env.NEXT_PUBLIC_APP_VERSION || '2.1.0',
      defaultCurrency: app.defaultCurrency,
      defaultLocale: app.locale,
      pwaEnabled: app.pwaEnabled,
      hideSensitiveData: app.hideSensitiveData,
      mobileAppAndroidLink: app.mobileAppAndroidLink,
      mobileAppIosLink: app.mobileAppIosLink,
    },
    features: {
      ...features,
      stories: true,
      aiTranslation: translationEnabled,
      aiComposeEnabled: getAiCapabilities().enabled,
    },
    auth: {
      registrationEnabled: auth.registrationEnabled,
      loginEnabled: auth.loginEnabled,
      captchaEnabled: auth.captchaEnabled,
      switchAccountEnabled: auth.switchAccountEnabled,
      linkAccountsEnabled: auth.linkAccountsEnabled,
    },
    brand,
    verification: {
      serviceUrl: verification.serviceUrl,
    },
    wallet: {
      enabled: wallet.enabled,
      name: wallet.name,
      depositMinAmount: wallet.depositMinAmount,
      depositMaxAmount: wallet.depositMaxAmount,
      transferMinAmount: wallet.transferMinAmount,
      transferMaxAmount: wallet.transferMaxAmount,
      withdrawMinAmount: wallet.withdrawMinAmount,
      withdrawMaxAmount: wallet.withdrawMaxAmount,
      commissionTransfer: wallet.commissionTransfer,
      commissionWithdraw: wallet.commissionWithdraw,
      cashoutMethods: wallet.cashoutMethods,
    },
    ads: {
      billingModel: ads.billingModel,
      pricePerView: ads.pricePerView,
      pricePerClick: ads.pricePerClick,
      minBudget: ads.minBudget,
      defaultBudget: ads.defaultBudget,
      refreshIntervalMinutes: ads.refreshIntervalMinutes,
    },
    promotions: {
      enabled: promotions.enabled,
      price3d: promotions.price3d,
      price7d: promotions.price7d,
      price14d: promotions.price14d,
    },
  };
}
