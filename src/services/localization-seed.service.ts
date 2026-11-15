import { connectDB } from '@/lib/db';
import { Currency, Locale, StaticPage } from '@/models/System';
import { getSettingsGroup } from '@/services/settings.service';

const DEFAULT_CURRENCIES = [
  { alpha3Code: 'NGN', name: 'Nigerian Naira', symbol: '₦', symbolNative: '₦', order: 1 },
  { alpha3Code: 'USD', name: 'US Dollar', symbol: '$', symbolNative: '$', order: 2 },
  { alpha3Code: 'EUR', name: 'Euro', symbol: '€', symbolNative: '€', order: 3 },
  { alpha3Code: 'GBP', name: 'British Pound', symbol: '£', symbolNative: '£', order: 4 },
  { alpha3Code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GHS', symbolNative: '₵', order: 5 },
  { alpha3Code: 'KES', name: 'Kenyan Shilling', symbol: 'KES', symbolNative: 'KSh', order: 6 },
  { alpha3Code: 'ZAR', name: 'South African Rand', symbol: 'ZAR', symbolNative: 'R', order: 7 },
];

const DEFAULT_LOCALES = [
  { alpha2Code: 'en', name: 'English', nativeName: 'English', direction: 'ltr' as const, order: 1 },
  { alpha2Code: 'fr', name: 'French', nativeName: 'Français', direction: 'ltr' as const, order: 2 },
  { alpha2Code: 'es', name: 'Spanish', nativeName: 'Español', direction: 'ltr' as const, order: 3 },
  { alpha2Code: 'de', name: 'German', nativeName: 'Deutsch', direction: 'ltr' as const, order: 4 },
  { alpha2Code: 'pt', name: 'Portuguese', nativeName: 'Português', direction: 'ltr' as const, order: 5 },
  { alpha2Code: 'ru', name: 'Russian', nativeName: 'Русский', direction: 'ltr' as const, order: 6 },
  { alpha2Code: 'ar', name: 'Arabic', nativeName: 'العربية', direction: 'rtl' as const, order: 7 },
];

let seeded = false;

export async function ensureDefaultCurrenciesAndLocales(force = false): Promise<void> {
  if (seeded && !force) return;
  await connectDB();

  const [currencyCount, localeCount, appCfg] = await Promise.all([
    Currency.countDocuments({}),
    Locale.countDocuments({}),
    getSettingsGroup('app'),
  ]);

  if (currencyCount === 0) {
    const defCur = (appCfg.defaultCurrency || 'USD').toUpperCase();
    for (const c of DEFAULT_CURRENCIES) {
      await Currency.updateOne(
        { alpha3Code: c.alpha3Code },
        {
          $setOnInsert: {
            ...c,
            status: true,
            isDefault: c.alpha3Code === defCur,
            usageCount: 0,
          },
        },
        { upsert: true }
      );
    }
    const hasDef = await Currency.exists({ isDefault: true });
    if (!hasDef) {
      await Currency.updateOne({ alpha3Code: 'USD' }, { $set: { isDefault: true, status: true } });
    }
  }

  if (localeCount === 0) {
    const defLoc = (appCfg.locale || 'en').toLowerCase();
    for (const l of DEFAULT_LOCALES) {
      await Locale.updateOne(
        { alpha2Code: l.alpha2Code },
        {
          $setOnInsert: {
            ...l,
            status: true,
            isDefault: l.alpha2Code === defLoc,
            usageCount: 0,
          },
        },
        { upsert: true }
      );
    }
    const hasDef = await Locale.exists({ isDefault: true });
    if (!hasDef) {
      await Locale.updateOne({ alpha2Code: 'en' }, { $set: { isDefault: true, status: true } });
    }
  }

  seeded = true;
}

export const DEFAULT_STATIC_PAGES: Array<{
  slug: string;
  title: string;
  content: string;
}> = [
  {
    slug: 'about',
    title: 'About Weto',
    content:
      'Weto is a modern social networking, real-time messaging, marketplace, job board, business portal, and creator platform.\n\nBuilt for fast communication, rich media sharing, transparent creator monetization, and community-driven discovery.',
  },
  {
    slug: 'help-center',
    title: 'Help Center',
    content:
      'Welcome to the Weto Help Center.\n\nFind guidance on managing your account settings, publishing posts and stories, using real-time messaging, topping up and transferring with Weto Wallet, and staying safe on the platform.\n\nFor technical documentation, visit https://docs.weto.app.',
  },
  {
    slug: 'terms-of-use',
    title: 'Terms of Use',
    content:
      'Welcome to Weto. By accessing or using our services, you agree to abide by these Terms of Use and our Community & Verification Rules.\n\nYou retain ownership of content you publish while granting Weto the license necessary to host, display, and deliver it across the platform. Automated scraping, fraud, impersonation, and illegal marketplace activity are strictly prohibited.',
  },
  {
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    content:
      'Weto respects your privacy and gives you granular control over your personal data.\n\nAuthentication is secured using encrypted HTTP-only session cookies and Firebase Authentication, while media uploads are stored securely via configured object storage (Cloudflare R2). You can customize profile visibility, online status, and security preferences anytime in Account Settings.',
  },
  {
    slug: 'cookies-policy',
    title: 'Cookies Policy',
    content:
      'Weto uses strictly necessary HTTP-only cookies (__session and account switch state) to keep you authenticated securely, alongside local storage preferences for your selected Light/Dark theme and interface language.',
  },
  {
    slug: 'verification-rules',
    title: 'Verification & Community Rules',
    content:
      'Treat fellow members with respect. Hate speech, harassment, illegal goods on the Marketplace, spam, and unauthorized financial solicitation are prohibited and subject to moderation.\n\nAccount verification confirms authentic public figures, creators, brands, and authors who maintain complete profiles, two-factor or email verification, and active compliance with platform rules.',
  },
  {
    slug: 'developers-api',
    title: 'Developers REST API',
    content:
      'Authenticate programmatic requests using your weto_live_* API key via the X-API-Key header or Authorization: Bearer weto_live_... header.\n\nGenerate and manage API keys inside Account Settings -> Credentials & API Security, and inspect our OpenAPI 3.1 schema at /api/v1/docs.',
  },
  {
    slug: 'become-author',
    title: 'Become an Author',
    content:
      'Authors on Weto unlock creator publishing tools, marketplace storefronts, job postings, and promotional campaigns.\n\nComplete your profile details, review the verification rules, and submit an authorship request from Account Settings.',
  },
];

let staticPagesSeeded = false;

export async function ensureDefaultStaticPages(force = false): Promise<void> {
  if (staticPagesSeeded && !force) return;
  await connectDB();

  for (const page of DEFAULT_STATIC_PAGES) {
    await StaticPage.updateOne(
      { slug: page.slug },
      {
        $setOnInsert: {
          slug: page.slug,
          title: page.title,
          contentByLocale: { en: page.content },
        },
      },
      { upsert: true }
    );
  }

  staticPagesSeeded = true;
}
