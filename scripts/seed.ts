import './load-env';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { connectDB } from '../src/lib/db';
import { encodeId } from '../src/lib/hashids';
import { Category, Currency, Locale, Setting, StaticPage } from '../src/models';
import { BusinessAccount, JobListing, Product, Store } from '../src/models/Commerce';
import { Ad, Wallet } from '../src/models/Finance';
import { DataStat, Media, MediaTargetType } from '../src/models/Media';
import { Comment, Post } from '../src/models/Post';
import { Follow } from '../src/models/SocialGraph';
import { StoryFrame } from '../src/models/Story';
import { User } from '../src/models/User';
import { generateLqipBase64 } from '../src/services/media.service';
import {
  AdApproval,
  AdStatus,
  CategoryStatus,
  CategoryType,
  FollowStatus,
  JobApproval,
  JobStatus,
  JobType,
  MediaStatus,
  MediaType,
  MediaVisibility,
  PostStatus,
  PostType,
  ProductApproval,
  ProductCondition,
  ProductStatus,
  ProductType,
  StoreStatus,
  StoryPrivacy,
  StoryStatus,
  StoryType,
  UserRole,
  UserStatus,
  UserType,
} from '../src/types/enums';

const DEFAULT_CURRENCIES = [
  { alpha3Code: 'USD', name: 'US Dollar', symbol: '$', symbolNative: '$', isDefault: true, order: 1 },
  { alpha3Code: 'EUR', name: 'Euro', symbol: '€', symbolNative: '€', isDefault: false, order: 2 },
  { alpha3Code: 'GBP', name: 'British Pound', symbol: '£', symbolNative: '£', isDefault: false, order: 3 },
  { alpha3Code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', symbolNative: '$', isDefault: false, order: 4 },
  { alpha3Code: 'AUD', name: 'Australian Dollar', symbol: 'A$', symbolNative: '$', isDefault: false, order: 5 },
  { alpha3Code: 'TRY', name: 'Turkish Lira', symbol: '₺', symbolNative: '₺', isDefault: false, order: 6 },
  { alpha3Code: 'AED', name: 'UAE Dirham', symbol: 'AED', symbolNative: 'د.إ', isDefault: false, order: 7 },
  { alpha3Code: 'RUB', name: 'Russian Ruble', symbol: '₽', symbolNative: '₽', isDefault: false, order: 8 },
  { alpha3Code: 'INR', name: 'Indian Rupee', symbol: '₹', symbolNative: '₹', isDefault: false, order: 9 },
  { alpha3Code: 'JPY', name: 'Japanese Yen', symbol: '¥', symbolNative: '￥', isDefault: false, order: 10 },
  { alpha3Code: 'NGN', name: 'Nigerian Naira', symbol: '₦', symbolNative: '₦', isDefault: false, order: 11 },
];

const DEFAULT_LOCALES = [
  { alpha2Code: 'en', name: 'English', nativeName: 'English', direction: 'ltr', isDefault: true, order: 1 },
  { alpha2Code: 'es', name: 'Spanish', nativeName: 'Español', direction: 'ltr', isDefault: false, order: 2 },
  { alpha2Code: 'fr', name: 'French', nativeName: 'Français', direction: 'ltr', isDefault: false, order: 3 },
  { alpha2Code: 'de', name: 'German', nativeName: 'Deutsch', direction: 'ltr', isDefault: false, order: 4 },
  { alpha2Code: 'tr', name: 'Turkish', nativeName: 'Türkçe', direction: 'ltr', isDefault: false, order: 5 },
  { alpha2Code: 'ar', name: 'Arabic', nativeName: 'العربية', direction: 'rtl', isDefault: false, order: 6 },
  { alpha2Code: 'ru', name: 'Russian', nativeName: 'Русский', direction: 'ltr', isDefault: false, order: 7 },
];

const PRODUCT_CATEGORIES = [
  'Electronics & Gadgets',
  'Fashion & Apparel',
  'Home & Living',
  'Digital Downloads & Templates',
  'Audio & Music Gear',
  'Vehicles & Parts',
  'Sports & Outdoors',
  'Collectibles & Art',
];

const JOB_CATEGORIES = [
  'Software Engineering',
  'Product & Design',
  'Marketing & Growth',
  'Video & Content Creation',
  'Sales & Business Development',
  'Customer Support',
  'Finance & Operations',
];

const STATIC_PAGES = [
  {
    slug: 'terms',
    title: 'Terms of Service',
    contentByLocale: {
      en: 'By accessing Weto, you agree to comply with applicable laws, community safety standards, and fair-use policies across publications, marketplace listings, job boards, and wallet transfers.',
    },
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    contentByLocale: {
      en: 'Weto authenticates sessions securely using Firebase Authentication and stores uploaded media in Cloudflare R2. You can export, edit, or delete your account anytime in Settings.',
    },
  },
  {
    slug: 'cookies',
    title: 'Cookie Policy',
    contentByLocale: {
      en: 'Weto uses essential HTTP-only authentication cookies (__session, cp_active_account) and local theme preferences to provide a fast and secure experience.',
    },
  },
  {
    slug: 'rules',
    title: 'Community Rules',
    contentByLocale: {
      en: 'Be respectful. Hate speech, harassment, illegal goods, unauthorized spam, and impersonation are strictly prohibited.',
    },
  },
  {
    slug: 'about',
    title: 'About Weto',
    contentByLocale: {
      en: 'Weto is a full-stack creator social platform featuring publications, 24h stories, messaging, Marketplace, Jobs Board, Business Portal, and monetized advertising.',
    },
  },
  {
    slug: 'developers-api',
    title: 'Developers API',
    contentByLocale: {
      en: 'Authenticate API requests using X-API-Key: weto_live_... or Firebase Bearer JWT tokens against /api/v1 endpoints.',
    },
  },
];

async function main() {
  await connectDB();

  for (const c of DEFAULT_CURRENCIES) {
    await Currency.updateOne(
      { alpha3Code: c.alpha3Code },
      { $setOnInsert: { ...c, status: true } },
      { upsert: true }
    );
  }

  for (const l of DEFAULT_LOCALES) {
    await Locale.updateOne(
      { alpha2Code: l.alpha2Code },
      { $setOnInsert: { ...l, status: true } },
      { upsert: true }
    );
  }

  for (const name of PRODUCT_CATEGORIES) {
    await Category.updateOne(
      { categorizableType: CategoryType.PRODUCT, 'localization.en': name },
      {
        $setOnInsert: {
          categorizableType: CategoryType.PRODUCT,
          localization: { en: name },
          status: CategoryStatus.ACTIVE,
        },
      },
      { upsert: true }
    );
  }

  for (const name of JOB_CATEGORIES) {
    await Category.updateOne(
      { categorizableType: CategoryType.JOB, 'localization.en': name },
      {
        $setOnInsert: {
          categorizableType: CategoryType.JOB,
          localization: { en: name },
          status: CategoryStatus.ACTIVE,
        },
      },
      { upsert: true }
    );
  }

  for (const p of STATIC_PAGES) {
    await StaticPage.updateOne({ slug: p.slug }, { $setOnInsert: p }, { upsert: true });
  }

  await Setting.updateOne(
    { group: 'app' },
    { $setOnInsert: { group: 'app', payload: { name: 'Weto', defaultCurrency: 'NGN' } } },
    { upsert: true }
  );

  const ngStats = await seedNigerianEcosystem();

  console.log(
    `Weto seed completed cleanly. Seeded NG community -> users: ${ngStats.users}, posts: ${ngStats.posts}, products: ${ngStats.products}, jobs: ${ngStats.jobs}, media: ${ngStats.media}, stories: ${ngStats.stories}, ads: ${ngStats.ads}.`
  );
  process.exit(0);
}

interface SeedMediaInput {
  ownerId: string;
  targetType: MediaTargetType;
  targetId: string;
  publicPath: string;
  mediaType: MediaType;
  mime: string;
  order?: number;
  posterPath?: string;
}

async function upsertSeedMedia(input: SeedMediaInput) {
  const relPath = input.publicPath.replace(/^\//, '');
  const absPath = path.join(process.cwd(), 'public', relPath);
  const stat = fs.existsSync(absPath) ? fs.statSync(absPath) : null;
  const sizeBytes = stat?.size ?? 0;
  const extension = path.extname(relPath).replace(/^\./, '').toLowerCase();

  let lqipBase64 = '';
  const lqipSourcePath =
    input.mediaType === MediaType.IMAGE
      ? absPath
      : input.posterPath
        ? path.join(process.cwd(), 'public', input.posterPath.replace(/^\//, ''))
        : '';

  if (lqipSourcePath && fs.existsSync(lqipSourcePath)) {
    const buf = fs.readFileSync(lqipSourcePath);
    lqipBase64 = await generateLqipBase64(buf);
  }

  const targetOid = new mongoose.Types.ObjectId(input.targetId);
  const ownerOid = new mongoose.Types.ObjectId(input.ownerId);

  await Media.updateOne(
    {
      targetType: input.targetType,
      targetId: targetOid,
      externalUrl: input.publicPath,
    },
    {
      $set: {
        ownerId: ownerOid,
        targetType: input.targetType,
        targetId: targetOid,
        externalUrl: input.publicPath,
        lqipBase64,
        type: input.mediaType,
        status: MediaStatus.PROCESSED,
        visibility: MediaVisibility.VISIBLE,
        storageProvider: 'external',
        extension,
        mime: input.mime,
        sizeBytes,
        order: input.order ?? 0,
        metadata: {
          seedAsset: true,
          filename: path.basename(relPath),
          ...(input.posterPath ? { thumbnailUrl: input.posterPath } : {}),
        },
      },
    },
    { upsert: true }
  );

  const doc = await Media.findOne({
    targetType: input.targetType,
    targetId: targetOid,
    externalUrl: input.publicPath,
  })
    .select('_id')
    .lean();

  return doc?._id ?? null;
}

interface SeedNgUser {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  caption: string;
  category: string;
  bio: string;
  city: string;
  type: UserType;
  verified: boolean;
  walletBalance: number;
}

const NIGERIAN_USERS: SeedNgUser[] = [
  {
    username: 'tunde_yaba',
    email: 'tunde.adebayo@colibriplus.ng',
    firstName: 'Tunde',
    lastName: 'Adebayo',
    caption: 'Software Engineer & Product Builder',
    category: 'Technology',
    bio: 'Building fast FinTech rails, TypeScript APIs & creator tools out of Yaba, Lagos.',
    city: 'Yaba, Lagos',
    type: UserType.AUTHOR,
    verified: true,
    walletBalance: 245000,
  },
  {
    username: 'amaka_creative',
    email: 'amaka.okafor@colibriplus.ng',
    firstName: 'Amaka',
    lastName: 'Okafor',
    caption: 'UI/UX & Brand Systems Designer',
    category: 'Design',
    bio: 'Designing clean interfaces for African startups from Lekki Phase 1. Mentor & coffee enthusiast.',
    city: 'Lekki, Lagos',
    type: UserType.AUTHOR,
    verified: true,
    walletBalance: 180000,
  },
  {
    username: 'ibrahim_abuja',
    email: 'ibrahim.danjuma@colibriplus.ng',
    firstName: 'Ibrahim',
    lastName: 'Danjuma',
    caption: 'Cloud & Distributed Systems Architect',
    category: 'Engineering',
    bio: 'Resilient cloud infrastructure, edge caching & civic tech in Wuse II, Abuja.',
    city: 'Wuse II, Abuja',
    type: UserType.AUTHOR,
    verified: true,
    walletBalance: 310000,
  },
  {
    username: 'chidi_gadgetshub',
    email: 'sales@chidigadgets.ng',
    firstName: 'Chidi',
    lastName: 'Nwosu',
    caption: 'MacBooks, Starlink & Solar Inverters • Ikeja',
    category: 'Commerce',
    bio: 'Trusted gadgets, power backups & workstation hardware in Computer Village, Ikeja. Nationwide delivery.',
    city: 'Ikeja, Lagos',
    type: UserType.AUTHOR,
    verified: true,
    walletBalance: 920000,
  },
  {
    username: 'kemi_adire',
    email: 'hello@kemiadire.ng',
    firstName: 'Kemi',
    lastName: 'Ogunlesi',
    caption: 'Handcrafted Indigo Adire & Leather Atelier',
    category: 'Fashion',
    bio: 'Contemporary hand-dyed silk Adire and Ankara laptop sleeves crafted in Ibadan & Abeokuta.',
    city: 'Ibadan, Oyo',
    type: UserType.AUTHOR,
    verified: true,
    walletBalance: 415000,
  },
  {
    username: 'zainab_kano',
    email: 'zainab.bello@colibriplus.ng',
    firstName: 'Zainab',
    lastName: 'Bello',
    caption: 'Northern Cuisine & Spice Curator',
    category: 'Food & Culture',
    bio: 'Documenting authentic Kano kilishi, dambun nama, zobo blends & northern Nigerian hospitality.',
    city: 'Nassarawa, Kano',
    type: UserType.READER,
    verified: false,
    walletBalance: 95000,
  },
  {
    username: 'efe_ph',
    email: 'efe.ovie@colibriplus.ng',
    firstName: 'Efe',
    lastName: 'Ovie',
    caption: 'Remote DevOps & Energy Tech',
    category: 'Technology',
    bio: 'Keeping remote servers green from GRA Port Harcourt. Starlink + LiFePO4 solar setup notes.',
    city: 'Port Harcourt, Rivers',
    type: UserType.READER,
    verified: true,
    walletBalance: 165000,
  },
  {
    username: 'nneka_hr',
    email: 'talent@nnekahr.ng',
    firstName: 'Nneka',
    lastName: 'Eze',
    caption: 'Nigeria Tech Talent & Startup Hiring',
    category: 'Careers',
    bio: 'Connecting Nigerian engineers, designers, and operators with funded local and remote teams.',
    city: 'Enugu',
    type: UserType.AUTHOR,
    verified: true,
    walletBalance: 275000,
  },
];

async function seedNigerianEcosystem() {
  const userByUsername = new Map<string, string>();

  // Clean up any partial wallets inserted without a walletNumber
  await Wallet.deleteMany({ $or: [{ walletNumber: null }, { walletNumber: { $exists: false } }] });

  for (let idx = 0; idx < NIGERIAN_USERS.length; idx++) {
    const u = NIGERIAN_USERS[idx];
    const seedAvatar = `/assets/seed/avatars/${u.username}.png`;
    const seedCover = `/assets/seed/covers/${u.username}.jpg`;

    await User.updateOne(
      { username: u.username },
      {
        $setOnInsert: {
          firebaseUid: `seed-ng-${u.username}`,
          username: u.username,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          caption: u.caption,
          category: u.category,
          bio: u.bio,
          country: 'Nigeria',
          city: u.city,
          avatar: seedAvatar,
          cover: seedCover,
          verified: u.verified,
          status: UserStatus.ACTIVE,
          role: UserRole.USER,
          type: u.type,
          language: 'en',
          theme: 'light',
          tips: { onboarding_completed: true },
        },
      },
      { upsert: true }
    );

    // Upgrade previously seeded users that still carry placeholder avatar/cover
    await User.updateOne(
      {
        username: u.username,
        $or: [
          { avatar: '/assets/avatars/default-avatar.png' },
          { avatar: null },
          { avatar: '' },
        ],
      },
      { $set: { avatar: seedAvatar } }
    );
    await User.updateOne(
      {
        username: u.username,
        $or: [
          { cover: '/assets/covers/default-cover.png' },
          { cover: null },
          { cover: '' },
        ],
      },
      { $set: { cover: seedCover } }
    );

    const doc = await User.findOne({ username: u.username }).select('_id').lean();
    if (doc) {
      const uid = String(doc._id);
      userByUsername.set(u.username, uid);

      await Wallet.updateOne(
        { userId: doc._id },
        {
          $setOnInsert: {
            userId: doc._id,
            walletNumber: `CPNG-${100100 + idx}`,
            balance: u.walletBalance,
            currency: 'NGN',
          },
        },
        { upsert: true }
      );
    }
  }

  // Build social follow graph between seeded Nigerian creators
  const followPairs: Array<[string, string]> = [
    ['tunde_yaba', 'amaka_creative'],
    ['tunde_yaba', 'ibrahim_abuja'],
    ['tunde_yaba', 'chidi_gadgetshub'],
    ['tunde_yaba', 'efe_ph'],
    ['amaka_creative', 'tunde_yaba'],
    ['amaka_creative', 'kemi_adire'],
    ['amaka_creative', 'nneka_hr'],
    ['ibrahim_abuja', 'tunde_yaba'],
    ['ibrahim_abuja', 'efe_ph'],
    ['chidi_gadgetshub', 'tunde_yaba'],
    ['kemi_adire', 'amaka_creative'],
    ['kemi_adire', 'zainab_kano'],
    ['zainab_kano', 'kemi_adire'],
    ['zainab_kano', 'amaka_creative'],
    ['efe_ph', 'tunde_yaba'],
    ['efe_ph', 'ibrahim_abuja'],
    ['nneka_hr', 'tunde_yaba'],
    ['nneka_hr', 'amaka_creative'],
    ['nneka_hr', 'ibrahim_abuja'],
  ];

  for (const [followerName, followingName] of followPairs) {
    const followerId = userByUsername.get(followerName);
    const followingId = userByUsername.get(followingName);
    if (!followerId || !followingId) continue;

    await Follow.updateOne(
      { followerId, followingId },
      { $setOnInsert: { followerId, followingId, status: FollowStatus.FOLLOWING } },
      { upsert: true }
    );
  }

  // Upsert Nigerian Business Stores
  const storeDefs = [
    {
      slug: 'chidi-gadgets-ikeja',
      ownerUsername: 'chidi_gadgetshub',
      name: 'Chidi Gadgets & Solar Hub',
      tagline: 'Laptops, Starlink Kits & Portable Power in Ikeja',
      description: 'Verified workstation gear, EcoFlow inverters, and same-day Lagos dispatch from Computer Village.',
      country: 'Nigeria',
      city: 'Ikeja, Lagos',
      email: 'sales@chidigadgets.ng',
      phone: '+234 803 555 0142',
    },
    {
      slug: 'kemi-adire-studio',
      ownerUsername: 'kemi_adire',
      name: 'Kemi Adire & Craft Studio',
      tagline: 'Modern Indigo Textiles & Heritage Accessories',
      description: 'Small-batch hand-dyed silk Adire kaftans and Ankara tech sleeves crafted in Ibadan.',
      country: 'Nigeria',
      city: 'Ibadan, Oyo',
      email: 'hello@kemiadire.ng',
      phone: '+234 809 555 0188',
    },
  ];

  const storeBySlug = new Map<string, string>();
  for (const s of storeDefs) {
    const ownerId = userByUsername.get(s.ownerUsername);
    if (!ownerId) continue;
    const storeLogo = `/assets/seed/avatars/${s.ownerUsername}.png`;
    const storeCover = `/assets/seed/covers/${s.ownerUsername}.jpg`;

    await Store.updateOne(
      { userId: ownerId, name: s.name },
      {
        $setOnInsert: {
          userId: ownerId,
          name: s.name,
          caption: s.tagline,
          description: s.description,
          address: `${s.city}, ${s.country}`,
          email: s.email,
          phone: s.phone,
          logo: storeLogo,
          status: StoreStatus.ACTIVE,
        },
      },
      { upsert: true }
    );
    await Store.updateOne(
      { userId: ownerId, name: s.name, logo: '/assets/avatars/default-avatar.png' },
      { $set: { logo: storeLogo } }
    );

    await BusinessAccount.updateOne(
      { userId: ownerId },
      {
        $setOnInsert: {
          userId: ownerId,
          name: s.name,
          logo: storeLogo,
          cover: storeCover,
          description: s.description,
          businessEmail: s.email,
          businessPhone: s.phone,
          city: s.city,
          country: s.country,
          verified: true,
          isReviewed: true,
        },
      },
      { upsert: true }
    );

    const storeDoc = await Store.findOne({ userId: ownerId, name: s.name }).select('_id').lean();
    if (storeDoc) storeBySlug.set(s.slug, String(storeDoc._id));
  }

  // Resolve Category IDs by English name
  const allCategories = await Category.find({ status: CategoryStatus.ACTIVE }).lean();
  const productCatMap = new Map<string, string>();
  const jobCatMap = new Map<string, string>();
  for (const cat of allCategories) {
    const label = cat.localization?.en;
    if (!label) continue;
    if (cat.categorizableType === CategoryType.PRODUCT) productCatMap.set(label, String(cat._id));
    if (cat.categorizableType === CategoryType.JOB) jobCatMap.set(label, String(cat._id));
  }

  // Seed Nigerian Posts
  const now = Date.now();
  const postsToSeed = [
    {
      hashId: encodeId(900101),
      author: 'tunde_yaba',
      title: 'Building Real-Time Payments from Yaba, Lagos',
      content:
        'Shipped our new Naira checkout & instant settlement pipeline today from Yaba. Seeing sub-second transfers hold steady during peak Friday traffic in Lagos feels surreal. Big shoutout to Nigerian builders pushing infrastructure forward! #NaijaTech #Yaba #BuildInNigeria',
      hashtags: ['NaijaTech', 'Yaba', 'BuildInNigeria'],
      location: 'Yaba, Lagos',
      type: PostType.TEXT,
      globalPinned: true,
      likesCount: 42,
      repostsCount: 11,
      viewsCount: 640,
      offsetHours: 2,
    },
    {
      hashId: encodeId(900102),
      author: 'amaka_creative',
      content:
        'Minimal typography + high-contrast monochrome buttons win every single time on Nigerian 4G networks. Users in Lekki and Abuja do not want heavy bloat — they want clarity, crisp icons, and zero visual noise. #DesignNigeria #UIUX #LagosTech',
      hashtags: ['DesignNigeria', 'UIUX', 'LagosTech'],
      location: 'Lekki Phase 1, Lagos',
      type: PostType.TEXT,
      globalPinned: false,
      likesCount: 31,
      repostsCount: 6,
      viewsCount: 410,
      offsetHours: 4,
    },
    {
      hashId: encodeId(900103),
      author: 'zainab_kano',
      title: 'Weekend Food Crown Debate',
      content:
        'Friday evening food check-in across Nigeria! If you could only pick one plate for the weekend right now, which city wins your vote? #NaijaFood #Jollof #Kano #Lagos',
      hashtags: ['NaijaFood', 'Jollof', 'Kano', 'Lagos'],
      location: 'Kano, Nigeria',
      type: PostType.POLL,
      poll: {
        choices: [
          { id: 'c_0', text: 'Lagos Smokey Party Jollof & Dodo', votesCount: 28 },
          { id: 'c_1', text: 'Kano Royal Kilishi & Masa', votesCount: 19 },
          { id: 'c_2', text: 'Ibadan Amala Sky & Abula', votesCount: 22 },
          { id: 'c_3', text: 'Port Harcourt Bole & Roasted Fish', votesCount: 24 },
        ],
        voterIds: [],
        votesByUser: {},
        isAnonymous: false,
        isCancellable: true,
        expiresAt: new Date(now + 72 * 3600_000),
      },
      globalPinned: false,
      likesCount: 57,
      repostsCount: 14,
      viewsCount: 890,
      offsetHours: 6,
    },
    {
      hashId: encodeId(900104),
      author: 'ibrahim_abuja',
      content:
        'Just wrapped up the Abuja Cloud & AI Builders meetup in Wuse II. Key takeaway: edge caching media assets and sizing payloads carefully cuts mobile bounce rates across Nigeria by nearly 35%. #AbujaTech #CloudNigeria #Engineering',
      hashtags: ['AbujaTech', 'CloudNigeria', 'Engineering'],
      location: 'Wuse II, Abuja',
      type: PostType.TEXT,
      globalPinned: false,
      likesCount: 24,
      repostsCount: 5,
      viewsCount: 325,
      offsetHours: 9,
    },
    {
      hashId: encodeId(900105),
      author: 'efe_ph',
      content:
        'Remote DevOps setup check from GRA Port Harcourt: Starlink Gen 3 paired with a 2kVA EcoFlow LiFePO4 station gives 100% uptime through thunderstorms. Drop your remote workstation tips below! #PortHarcourt #RemoteNigeria #DevOps',
      hashtags: ['PortHarcourt', 'RemoteNigeria', 'DevOps'],
      location: 'Port Harcourt, Rivers',
      type: PostType.TEXT,
      globalPinned: false,
      likesCount: 29,
      repostsCount: 4,
      viewsCount: 380,
      offsetHours: 12,
    },
    {
      hashId: encodeId(900106),
      author: 'chidi_gadgetshub',
      content:
        'Fresh workstation drop at Computer Village Ikeja! EcoFlow River 2 Pro solar kits, Gen 3 Starlink hardware, and clean M3 MacBook Pros are now live on Weto Marketplace with Naira (₦) pricing and Lagos same-day dispatch. #Ikeja #LagosBusiness #MarketplaceNG',
      hashtags: ['Ikeja', 'LagosBusiness', 'MarketplaceNG'],
      location: 'Ikeja, Lagos',
      type: PostType.TEXT,
      globalPinned: false,
      likesCount: 19,
      repostsCount: 7,
      viewsCount: 295,
      offsetHours: 15,
    },
    {
      hashId: encodeId(900107),
      author: 'kemi_adire',
      content:
        'Morning at the indigo dye pit in Ibadan. Every silk Adire piece and Ankara laptop sleeve in our storefront celebrates centuries of Yoruba textile heritage tailored for modern creators. #MadeInNigeria #Adire #Ibadan',
      hashtags: ['MadeInNigeria', 'Adire', 'Ibadan'],
      location: 'Ibadan, Oyo',
      type: PostType.TEXT,
      globalPinned: false,
      likesCount: 36,
      repostsCount: 9,
      viewsCount: 470,
      offsetHours: 18,
    },
    {
      hashId: encodeId(900108),
      author: 'nneka_hr',
      content:
        'Hiring Alert for Nigerian Tech Talent: 6 verified NGN-salaried openings just went live on Weto Jobs — Senior Next.js Engineer in Yaba, Product Designer in Abuja, Cloud Engineer on VI, and remote Growth roles! #NaijaJobs #TechCareersNG #HiringNigeria',
      hashtags: ['NaijaJobs', 'TechCareersNG', 'HiringNigeria'],
      location: 'Enugu, Nigeria',
      type: PostType.TEXT,
      globalPinned: false,
      likesCount: 48,
      repostsCount: 21,
      viewsCount: 720,
      offsetHours: 22,
    },
    {
      hashId: encodeId(900109),
      author: 'tunde_yaba',
      title: 'Inside Our Yaba Solar-Backed Engineering Sprint [Video]',
      content:
        'Quick 5-second motion clip from today’s checkout & webhook load-testing sprint in Yaba — solar inverter steady, 0ms dropped frames. #YabaTech #FinTechNG #VideoUpdate',
      hashtags: ['YabaTech', 'FinTechNG', 'VideoUpdate'],
      location: 'Yaba, Lagos',
      type: PostType.VIDEO,
      globalPinned: false,
      likesCount: 39,
      repostsCount: 8,
      viewsCount: 540,
      offsetHours: 1,
    },
    {
      hashId: encodeId(900110),
      author: 'kemi_adire',
      title: 'Abeokuta Indigo Vat-Dye Process Reel [Video]',
      content:
        'Watch how our hand-dyed silk Adire takes shape in the Ibadan courtyard before heading straight to Weto Marketplace. #Adire #MadeInNigeria #ArtisanVideo',
      hashtags: ['Adire', 'MadeInNigeria', 'ArtisanVideo'],
      location: 'Ibadan, Oyo',
      type: PostType.VIDEO,
      globalPinned: false,
      likesCount: 44,
      repostsCount: 12,
      viewsCount: 615,
      offsetHours: 3,
    },
  ];

  const postMediaAttachments: Record<
    string,
    {
      postType?: PostType;
      items: Array<{ publicPath: string; mediaType: MediaType; mime: string; posterPath?: string }>;
    }
  > = {
    [encodeId(900101)]: {
      postType: PostType.IMAGE,
      items: [{ publicPath: '/assets/seed/posts/yaba-fintech-hub.jpg', mediaType: MediaType.IMAGE, mime: 'image/jpeg' }],
    },
    [encodeId(900102)]: {
      postType: PostType.IMAGE,
      items: [{ publicPath: '/assets/seed/products/fintech-ui-kit.jpg', mediaType: MediaType.IMAGE, mime: 'image/jpeg' }],
    },
    [encodeId(900103)]: {
      items: [{ publicPath: '/assets/seed/posts/lagos-jollof-feast.jpg', mediaType: MediaType.IMAGE, mime: 'image/jpeg' }],
    },
    [encodeId(900104)]: {
      postType: PostType.IMAGE,
      items: [{ publicPath: '/assets/seed/posts/abuja-cloud-meetup.jpg', mediaType: MediaType.IMAGE, mime: 'image/jpeg' }],
    },
    [encodeId(900106)]: {
      postType: PostType.IMAGE,
      items: [
        { publicPath: '/assets/seed/products/ecoflow-solar.jpg', mediaType: MediaType.IMAGE, mime: 'image/jpeg' },
        { publicPath: '/assets/seed/products/macbook-pro-m3.jpg', mediaType: MediaType.IMAGE, mime: 'image/jpeg' },
      ],
    },
    [encodeId(900107)]: {
      postType: PostType.IMAGE,
      items: [{ publicPath: '/assets/seed/posts/ibadan-adire-pit.jpg', mediaType: MediaType.IMAGE, mime: 'image/jpeg' }],
    },
    [encodeId(900109)]: {
      postType: PostType.VIDEO,
      items: [
        {
          publicPath: '/assets/seed/videos/yaba-fintech-tour.mp4',
          mediaType: MediaType.VIDEO,
          mime: 'video/mp4',
          posterPath: '/assets/seed/videos/yaba-fintech-tour.jpg',
        },
      ],
    },
    [encodeId(900110)]: {
      postType: PostType.VIDEO,
      items: [
        {
          publicPath: '/assets/seed/videos/adire-craft-story.mp4',
          mediaType: MediaType.VIDEO,
          mime: 'video/mp4',
          posterPath: '/assets/seed/videos/adire-craft-story.jpg',
        },
      ],
    },
  };

  let mediaSeedCount = 0;
  const postIdByHash = new Map<string, string>();
  for (const p of postsToSeed) {
    const uid = userByUsername.get(p.author);
    if (!uid) continue;

    const attachmentSpec = postMediaAttachments[p.hashId];
    const effectiveType = attachmentSpec?.postType ?? p.type;

    await Post.updateOne(
      { hashId: p.hashId },
      {
        $setOnInsert: {
          hashId: p.hashId,
          userId: uid,
          title: p.title || '',
          content: p.content,
          hashtags: p.hashtags.map((h) => h.toLowerCase()),
          mentions: [],
          location: p.location,
          status: PostStatus.ACTIVE,
          type: effectiveType,
          textLanguage: 'en',
          poll: p.poll ?? null,
          globalPinned: p.globalPinned,
          reactionSummary:
            p.likesCount > 0 ? [{ unifiedId: '2764-fe0f', nativeSymbol: '❤️', count: p.likesCount }] : [],
          sharesCount: p.repostsCount,
          viewsCount: p.viewsCount,
          commentsCount: 0,
          bookmarksCount: 0,
          createdAt: new Date(now - p.offsetHours * 3600_000),
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

    const postDoc = await Post.findOne({ hashId: p.hashId }).select('_id type').lean();
    if (postDoc) {
      const pid = String(postDoc._id);
      postIdByHash.set(p.hashId, pid);

      if (attachmentSpec) {
        if (postDoc.type === PostType.TEXT && attachmentSpec.postType) {
          await Post.updateOne({ _id: postDoc._id }, { $set: { type: attachmentSpec.postType } });
        }
        for (let mIdx = 0; mIdx < attachmentSpec.items.length; mIdx++) {
          const item = attachmentSpec.items[mIdx];
          await upsertSeedMedia({
            ownerId: uid,
            targetType: 'post',
            targetId: pid,
            publicPath: item.publicPath,
            mediaType: item.mediaType,
            mime: item.mime,
            order: mIdx,
            posterPath: item.posterPath,
          });
          mediaSeedCount++;
        }
      }
    }
  }

  // Seed authentic Comments on flagship posts (deterministic by postId + userId + content)
  const commentsToSeed = [
    {
      postHash: encodeId(900101),
      author: 'amaka_creative',
      content: 'Congrats Tunde! Latency on mobile checkout makes all the difference for Lagos merchants.',
    },
    {
      postHash: encodeId(900101),
      author: 'ibrahim_abuja',
      content: 'Solid engineering. Would love to test webhook retries across Abuja POS nodes next week.',
    },
    {
      postHash: encodeId(900103),
      author: 'efe_ph',
      content: 'Port Harcourt Bole & roasted yam with pepper sauce wins hands down every Friday!',
    },
    {
      postHash: encodeId(900106),
      author: 'efe_ph',
      content: 'Can vouch for Chidi Gadgets — my Starlink unit arrived in Port Harcourt within 24 hours.',
    },
    {
      postHash: encodeId(900108),
      author: 'tunde_yaba',
      content: 'Sharing the Yaba Senior Next.js role with our React Lagos community right now.',
    },
  ];

  for (const c of commentsToSeed) {
    const postId = postIdByHash.get(c.postHash);
    const uid = userByUsername.get(c.author);
    if (!postId || !uid) continue;

    await Comment.updateOne(
      { postId, userId: uid, content: c.content },
      {
        $setOnInsert: {
          postId,
          userId: uid,
          content: c.content,
          repliesCount: 0,
          reactionSummary: [{ unifiedId: '2764-fe0f', nativeSymbol: '❤️', count: 3 }],
        },
      },
      { upsert: true }
    );
  }

  for (const postId of postIdByHash.values()) {
    const commentCount = await Comment.countDocuments({ postId });
    await Post.updateOne({ _id: postId }, { $set: { commentsCount: commentCount } });
  }

  // Seed Nigerian Marketplace Products priced in NGN (₦)
  const productsToSeed = [
    {
      hashId: encodeId(910101),
      seller: 'chidi_gadgetshub',
      storeSlug: 'chidi-gadgets-ikeja',
      categoryName: 'Electronics & Gadgets',
      title: 'EcoFlow River 2 Pro (768Wh) + 220W Solar Panel Kit',
      description:
        'Clean silent backup power for remote work, routers, laptops, and studio lights. Charges 0-100% in 70 minutes on NEPA/gen or solar. 12-month Nigeria warranty included.',
      condition: ProductCondition.NEW,
      type: ProductType.PHYSICAL,
      price: 685000,
      discount: 10,
      stockQuantity: 12,
      address: 'Kodesoh Street, Ikeja, Lagos',
      isPromoted: true,
    },
    {
      hashId: encodeId(910102),
      seller: 'chidi_gadgetshub',
      storeSlug: 'chidi-gadgets-ikeja',
      categoryName: 'Electronics & Gadgets',
      title: 'Starlink Standard Gen 3 High-Speed Kit (Nigeria Ready)',
      description:
        'Brand new sealed Starlink Gen 3 router + dish hardware ready for instant activation across Lagos, Abuja, Port Harcourt, and nationwide.',
      condition: ProductCondition.NEW,
      type: ProductType.PHYSICAL,
      price: 590000,
      discount: 0,
      stockQuantity: 9,
      address: 'Lekki Phase 1 / Ikeja, Lagos',
      isPromoted: false,
    },
    {
      hashId: encodeId(910103),
      seller: 'chidi_gadgetshub',
      storeSlug: 'chidi-gadgets-ikeja',
      categoryName: 'Electronics & Gadgets',
      title: 'Apple MacBook Pro 14" M3 (16GB RAM / 512GB SSD)',
      description:
        'Mint UK-used workstation checked and stress-tested at Computer Village Ikeja. Low battery cycle count, original MagSafe 3 charger included.',
      condition: ProductCondition.REFURBISHED,
      type: ProductType.PHYSICAL,
      price: 1850000,
      discount: 5,
      stockQuantity: 4,
      address: 'Computer Village, Ikeja, Lagos',
      isPromoted: false,
    },
    {
      hashId: encodeId(910104),
      seller: 'kemi_adire',
      storeSlug: 'kemi-adire-studio',
      categoryName: 'Fashion & Apparel',
      title: 'Hand-Dyed Abeokuta Indigo Silk Adire Two-Piece Set',
      description:
        'Breathable 100% hand-dyed Kampala silk shirt & tailored trousers crafted by Ibadan and Abeokuta textile artisans. Colourfast indigo finish.',
      condition: ProductCondition.NEW,
      type: ProductType.PHYSICAL,
      price: 75000,
      discount: 0,
      stockQuantity: 18,
      address: 'Bodija, Ibadan, Oyo State',
      isPromoted: true,
    },
    {
      hashId: encodeId(910105),
      seller: 'kemi_adire',
      storeSlug: 'kemi-adire-studio',
      categoryName: 'Fashion & Apparel',
      title: 'Handcrafted Ankara & Full-Grain Leather Laptop Sleeve (14"-16")',
      description:
        'Padded microfiber interior wrapped in water-resistant genuine leather and vibrant woven Ankara fabric. Fits MacBook Pro 14" & 16".',
      condition: ProductCondition.NEW,
      type: ProductType.PHYSICAL,
      price: 32500,
      discount: 0,
      stockQuantity: 25,
      address: 'Wuse II, Abuja',
      isPromoted: false,
    },
    {
      hashId: encodeId(910106),
      seller: 'chidi_gadgetshub',
      storeSlug: 'chidi-gadgets-ikeja',
      categoryName: 'Audio & Music Gear',
      title: 'Oraimo SpaceBuds Pro Hybrid ANC Wireless Earbuds',
      description:
        '50dB active noise cancellation tuned for noisy Lagos commutes and clear Zoom standups. Up to 32 hours battery life with fast Type-C charge.',
      condition: ProductCondition.NEW,
      type: ProductType.PHYSICAL,
      price: 54000,
      discount: 8,
      stockQuantity: 30,
      address: 'Surulere, Lagos',
      isPromoted: false,
    },
    {
      hashId: encodeId(910107),
      seller: 'zainab_kano',
      storeSlug: null,
      categoryName: 'Home & Living',
      title: 'Kano Royal Kilishi, Dambun Nama & Spiced Zobo Gift Box',
      description:
        'Freshly spiced sun-dried beef kilishi paired with homemade hibiscus ginger mix and yaji spice jar. Vacuum-sealed for inter-state waybill.',
      condition: ProductCondition.NEW,
      type: ProductType.PHYSICAL,
      price: 28000,
      discount: 0,
      stockQuantity: 40,
      address: 'Nassarawa GRA, Kano',
      isPromoted: false,
    },
    {
      hashId: encodeId(910108),
      seller: 'amaka_creative',
      storeSlug: null,
      categoryName: 'Digital Downloads & Templates',
      title: 'Naija Fintech & Commerce UI System (Figma + Tailwind Tokens)',
      description:
        '140+ production screens built for Naira wallets, USSD/transfer flows, BVN/NIN onboarding, and mobile-first African startups.',
      condition: ProductCondition.NEW,
      type: ProductType.DIGITAL,
      price: 45000,
      discount: 15,
      stockQuantity: 999,
      address: 'Lekki Phase 1, Lagos (Instant Download)',
      isPromoted: false,
    },
  ];

  const productMediaAttachments: Record<string, string[]> = {
    [encodeId(910101)]: ['/assets/seed/products/ecoflow-solar.jpg'],
    [encodeId(910102)]: ['/assets/seed/products/starlink-kit.jpg'],
    [encodeId(910103)]: ['/assets/seed/products/macbook-pro-m3.jpg'],
    [encodeId(910104)]: [
      '/assets/seed/products/indigo-adire-set.jpg',
      '/assets/seed/posts/ibadan-adire-pit.jpg',
    ],
    [encodeId(910105)]: ['/assets/seed/products/ankara-laptop-sleeve.jpg'],
    [encodeId(910106)]: ['/assets/seed/products/oraimo-earbuds.jpg'],
    [encodeId(910107)]: ['/assets/seed/products/kilishi-zobo-box.jpg'],
    [encodeId(910108)]: ['/assets/seed/products/fintech-ui-kit.jpg'],
  };

  for (const prod of productsToSeed) {
    const sellerId = userByUsername.get(prod.seller);
    if (!sellerId) continue;

    await Product.updateOne(
      { hashId: prod.hashId },
      {
        $setOnInsert: {
          hashId: prod.hashId,
          userId: sellerId,
          storeId: prod.storeSlug ? (storeBySlug.get(prod.storeSlug) ?? null) : null,
          categoryId: productCatMap.get(prod.categoryName) ?? null,
          title: prod.title,
          description: prod.description,
          approval: ProductApproval.APPROVED,
          status: ProductStatus.ACTIVE,
          condition: prod.condition,
          type: prod.type,
          currency: 'NGN',
          stockQuantity: prod.stockQuantity,
          price: prod.price,
          discount: prod.discount,
          address: prod.address,
          isPromoted: prod.isPromoted,
          viewsCount: 85,
        },
      },
      { upsert: true }
    );

    const productDoc = await Product.findOne({ hashId: prod.hashId }).select('_id').lean();
    const imgPaths = productMediaAttachments[prod.hashId] || [];
    if (productDoc && imgPaths.length > 0) {
      for (let imgIdx = 0; imgIdx < imgPaths.length; imgIdx++) {
        await upsertSeedMedia({
          ownerId: sellerId,
          targetType: 'product',
          targetId: String(productDoc._id),
          publicPath: imgPaths[imgIdx],
          mediaType: MediaType.IMAGE,
          mime: 'image/jpeg',
          order: imgIdx,
        });
        mediaSeedCount++;
      }
    }
  }

  // Seed Nigerian Job Listings priced in NGN (₦)
  const jobsToSeed = [
    {
      hashId: encodeId(920101),
      poster: 'tunde_yaba',
      categoryName: 'Software Engineering',
      title: 'Senior Next.js & TypeScript Engineer',
      overview: 'Build high-throughput web apps and real-time merchant dashboards in Yaba.',
      description:
        'Join our core product team in Yaba, Lagos (Hybrid 3 days/week). You will architect Next.js App Router surfaces, MongoDB aggregation pipelines, and low-latency payment webhooks. Competitive Naira salary + HMO + power/internet stipend.',
      type: JobType.FULL_TIME,
      income: 850000,
      isStartIncome: true,
      location: 'Yaba, Lagos (Hybrid)',
      isRemote: false,
      isUrgent: true,
      isPromoted: true,
    },
    {
      hashId: encodeId(920102),
      poster: 'amaka_creative',
      categoryName: 'Product & Design',
      title: 'Lead Product & UI/UX Designer',
      overview: 'Own end-to-end mobile web design systems for Nigerian creators and SMEs.',
      description:
        'Collaborate with engineers in Lagos and Abuja to ship accessible, responsive UI components, user research flows, and crisp design tokens. Remote within Nigeria with quarterly offsites in Abuja.',
      type: JobType.FULL_TIME,
      income: 600000,
      isStartIncome: false,
      location: 'Wuse II, Abuja (Remote)',
      isRemote: true,
      isUrgent: false,
      isPromoted: false,
    },
    {
      hashId: encodeId(920103),
      poster: 'ibrahim_abuja',
      categoryName: 'Software Engineering',
      title: 'Cloud Infrastructure & DevOps Engineer',
      overview: 'Scale multi-region Node/Next.js workloads, R2 object storage, and CI/CD.',
      description:
        'Manage Kubernetes clusters, Cloudflare R2 media pipelines, MongoDB Atlas observability, and automated security audits for enterprise clients across Victoria Island and Abuja.',
      type: JobType.FULL_TIME,
      income: 1100000,
      isStartIncome: true,
      location: 'Victoria Island, Lagos',
      isRemote: false,
      isUrgent: true,
      isPromoted: false,
    },
    {
      hashId: encodeId(920104),
      poster: 'nneka_hr',
      categoryName: 'Marketing & Growth',
      title: 'Growth & Creator Community Lead',
      overview: 'Drive merchant onboarding and creator campaigns across Lagos, PH, and Abuja.',
      description:
        'Lead grassroots campus activations, creator partnerships, and Marketplace seller retention campaigns across Nigeria. Includes performance bonus and remote flexibility.',
      type: JobType.FULL_TIME,
      income: 420000,
      isStartIncome: false,
      location: 'GRA Phase 2, Port Harcourt (Remote)',
      isRemote: true,
      isUrgent: false,
      isPromoted: false,
    },
    {
      hashId: encodeId(920105),
      poster: 'kemi_adire',
      categoryName: 'Finance & Operations',
      title: 'E-Commerce Store & Logistics Manager',
      overview: 'Coordinate nationwide dispatch riders, inventory, and vendor reconciliation.',
      description:
        'Oversee daily order fulfillment from Ibadan to Lagos, Abuja, and Enugu, negotiate GIGL/DHL Nigeria rates, and maintain accurate inventory & NGN payout reconciliations.',
      type: JobType.FULL_TIME,
      income: 320000,
      isStartIncome: false,
      location: 'Bodija, Ibadan, Oyo',
      isRemote: false,
      isUrgent: false,
      isPromoted: false,
    },
    {
      hashId: encodeId(920106),
      poster: 'nneka_hr',
      categoryName: 'Video & Content Creation',
      title: 'Short-Form Video Storyteller & Brand Creator',
      overview: 'Produce crisp Reels, product spotlights, and Nigerian founder stories.',
      description:
        '3-month extendable contract shooting and editing product spotlights and founder documentaries across Enugu and Lagos. Laptop and editing suite allowance provided.',
      type: JobType.CONTRACT,
      income: 350000,
      isStartIncome: false,
      location: 'Enugu / Lagos (Remote)',
      isRemote: true,
      isUrgent: false,
      isPromoted: false,
    },
  ];

  for (const job of jobsToSeed) {
    const posterId = userByUsername.get(job.poster);
    if (!posterId) continue;

    await JobListing.updateOne(
      { hashId: job.hashId },
      {
        $setOnInsert: {
          hashId: job.hashId,
          userId: posterId,
          categoryId: jobCatMap.get(job.categoryName) ?? null,
          title: job.title,
          overview: job.overview,
          description: job.description,
          status: JobStatus.ACTIVE,
          approval: JobApproval.APPROVED,
          type: job.type,
          income: job.income,
          isStartIncome: job.isStartIncome,
          currency: 'NGN',
          location: job.location,
          isRemote: job.isRemote,
          isUrgent: job.isUrgent,
          isPromoted: job.isPromoted,
          viewsCount: 64,
        },
      },
      { upsert: true }
    );
  }

  // Seed 24h Highlight Stories (Image & Video)
  const storyDefs = [
    {
      storyUuid: 'seed-ng-story-tunde',
      author: 'tunde_yaba',
      type: StoryType.IMAGE,
      content: 'Live Naira payments sprint at Yaba FinTech Hub 🚀',
      mediaPath: '/assets/seed/posts/yaba-fintech-hub.jpg',
      mediaType: MediaType.IMAGE,
      mime: 'image/jpeg',
      durationSeconds: 6,
      viewsCount: 118,
    },
    {
      storyUuid: 'seed-ng-story-kemi',
      author: 'kemi_adire',
      type: StoryType.VIDEO,
      content: 'Abeokuta indigo dye vat reel from Ibadan atelier 🎨',
      mediaPath: '/assets/seed/videos/adire-craft-story.mp4',
      posterPath: '/assets/seed/videos/adire-craft-story.jpg',
      mediaType: MediaType.VIDEO,
      mime: 'video/mp4',
      durationSeconds: 5,
      viewsCount: 94,
    },
    {
      storyUuid: 'seed-ng-story-zainab',
      author: 'zainab_kano',
      type: StoryType.IMAGE,
      content: 'Friday smokey Jollof & Kano Kilishi platter 🔥',
      mediaPath: '/assets/seed/posts/lagos-jollof-feast.jpg',
      mediaType: MediaType.IMAGE,
      mime: 'image/jpeg',
      durationSeconds: 5,
      viewsCount: 82,
    },
  ];

  let storiesSeedCount = 0;
  for (const st of storyDefs) {
    const uid = userByUsername.get(st.author);
    if (!uid) continue;

    await StoryFrame.updateOne(
      { storyUuid: st.storyUuid },
      {
        $setOnInsert: {
          storyUuid: st.storyUuid,
          userId: uid,
          content: st.content,
          status: StoryStatus.ACTIVE,
          type: st.type,
          privacy: StoryPrivacy.ALL,
          allowedUserIds: [],
          viewsCount: st.viewsCount,
          isHighlight: true,
          durationSeconds: st.durationSeconds,
          expiresAt: new Date(now + 72 * 3600_000),
        },
      },
      { upsert: true }
    );

    const frameDoc = await StoryFrame.findOne({ storyUuid: st.storyUuid }).select('_id mediaId').lean();
    if (frameDoc) {
      storiesSeedCount++;
      const mediaId = await upsertSeedMedia({
        ownerId: uid,
        targetType: 'story_frame',
        targetId: String(frameDoc._id),
        publicPath: st.mediaPath,
        mediaType: st.mediaType,
        mime: st.mime,
        posterPath: st.posterPath,
      });
      if (mediaId && (!frameDoc.mediaId || String(frameDoc.mediaId) !== String(mediaId))) {
        await StoryFrame.updateOne({ _id: frameDoc._id }, { $set: { mediaId } });
      }
      mediaSeedCount++;
    }
  }

  // Seed Nigerian Sponsored Ads (1 approved active + 1 pending admin moderation)
  const adDefs = [
    {
      author: 'chidi_gadgetshub',
      title: 'Power Every Remote Workday — EcoFlow River 2 Pro + Solar',
      content:
        'Save 10% on EcoFlow LiFePO4 backup power & Gen 3 Starlink kits with same-day dispatch across Lagos & Abuja.',
      ctaText: 'Shop Ikeja Hub',
      targetUrl: '/marketplace',
      status: AdStatus.PUBLISHED,
      approval: AdApproval.APPROVED,
      totalBudget: 150000,
      spentBudget: 18500,
      pricePerView: 25,
      viewsCount: 740,
      mediaPath: '/assets/seed/ads/ecoflow-promo.jpg',
    },
    {
      author: 'kemi_adire',
      title: 'Kemi Adire Artisan Silk Drop — Limited Ibadan Edition',
      content:
        'Hand-dyed Abeokuta indigo silk sets and leather Ankara laptop sleeves crafted in Ibadan.',
      ctaText: 'Explore Studio',
      targetUrl: '/marketplace',
      status: AdStatus.PUBLISHED,
      approval: AdApproval.PENDING,
      totalBudget: 85000,
      spentBudget: 0,
      pricePerView: 20,
      viewsCount: 0,
      mediaPath: '/assets/seed/products/indigo-adire-set.jpg',
    },
  ];

  let adsSeedCount = 0;
  for (const ad of adDefs) {
    const uid = userByUsername.get(ad.author);
    if (!uid) continue;

    await Ad.updateOne(
      { userId: uid, title: ad.title },
      {
        $setOnInsert: {
          userId: uid,
          title: ad.title,
          content: ad.content,
          ctaText: ad.ctaText,
          targetUrl: ad.targetUrl,
          type: 'feed',
          status: ad.status,
          approval: ad.approval,
          totalBudget: ad.totalBudget,
          spentBudget: ad.spentBudget,
          pricePerView: ad.pricePerView,
          viewsCount: ad.viewsCount,
          startsAt: new Date(now - 24 * 3600_000),
          endsAt: new Date(now + 30 * 24 * 3600_000),
        },
      },
      { upsert: true }
    );

    const adDoc = await Ad.findOne({ userId: uid, title: ad.title }).select('_id mediaId').lean();
    if (adDoc) {
      adsSeedCount++;
      const mediaId = await upsertSeedMedia({
        ownerId: uid,
        targetType: 'ad',
        targetId: String(adDoc._id),
        publicPath: ad.mediaPath,
        mediaType: MediaType.IMAGE,
        mime: 'image/jpeg',
      });
      if (mediaId && (!adDoc.mediaId || String(adDoc.mediaId) !== String(mediaId))) {
        await Ad.updateOne({ _id: adDoc._id }, { $set: { mediaId } });
      }
      mediaSeedCount++;
    }
  }

  // Recompute accurate DataStat storage aggregates from Media collection
  const mediaBuckets = await Media.aggregate([
    {
      $group: {
        _id: { type: '$type', storageProvider: '$storageProvider' },
        contentSizeBytes: { $sum: { $add: ['$sizeBytes', { $ifNull: ['$thumbnailSizeBytes', 0] }] } },
        contentItems: { $sum: 1 },
      },
    },
  ]);

  for (const bucket of mediaBuckets) {
    await DataStat.updateOne(
      {
        mediaType: bucket._id.type,
        storageProvider: bucket._id.storageProvider || 'r2',
      },
      {
        $set: {
          contentSizeBytes: bucket.contentSizeBytes,
          contentItems: bucket.contentItems,
        },
      },
      { upsert: true }
    );
  }

  // Recompute accurate social & publication counts for all seeded Nigerian users
  for (const uid of userByUsername.values()) {
    const [publicationsCount, followersCount, followingCount] = await Promise.all([
      Post.countDocuments({ userId: uid, status: { $in: [PostStatus.ACTIVE, PostStatus.PUBLISHED] } }),
      Follow.countDocuments({ followingId: uid, status: FollowStatus.FOLLOWING }),
      Follow.countDocuments({ followerId: uid, status: FollowStatus.FOLLOWING }),
    ]);

    await User.updateOne(
      { _id: uid },
      { $set: { publicationsCount, followersCount, followingCount } }
    );
  }

  return {
    users: userByUsername.size,
    posts: postIdByHash.size,
    products: productsToSeed.length,
    jobs: jobsToSeed.length,
    media: mediaSeedCount,
    stories: storiesSeedCount,
    ads: adsSeedCount,
  };
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
