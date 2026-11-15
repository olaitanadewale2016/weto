import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, ConflictError, ValidationError } from '@/lib/api-response';
import { User } from '@/models/User';
import { AuthorshipRequest } from '@/models/SocialGraph';
import { ApiKey } from '@/models/System';
import { ASRStatus, UserType } from '@/types/enums';

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const [authorship, apiKeys] = await Promise.all([
      AuthorshipRequest.findOne({ userId: user._id }).sort({ createdAt: -1 }).lean(),
      ApiKey.find({ userId: user._id, isActive: true })
        .select('name keyPrefix scopes rateLimitPerMinute lastUsedAt createdAt')
        .lean(),
    ]);

    return apiSuccess({
      profile: {
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        bio: user.bio,
        caption: user.caption,
        category: user.category,
        website: user.website,
        country: user.country,
        city: user.city,
        gender: user.gender,
        birthDay: user.birthDay,
        birthMonth: user.birthMonth,
        birthYear: user.birthYear,
        phone: user.phone,
        email: user.email,
        language: user.language,
        theme: user.theme,
        avatar: user.avatar,
        cover: user.cover,
        type: user.type,
      },
      privacySettings: user.privacySettings,
      permitSettings: user.permitSettings,
      notificationSettings: user.notificationSettings,
      securitySettings: user.securitySettings,
      socialLinks: user.socialLinks,
      authorshipRequest: authorship,
      apiKeys,
    });
  } catch (err) {
    return apiError(err);
  }
}

const settingsPatchSchema = z.object({
  section: z.enum([
    'account',
    'privacy',
    'permits',
    'notifications',
    'security',
    'social_links',
    'theme',
    'language',
    'avatar',
    'cover',
    'request_authorship',
    'create_api_key',
    'revoke_api_key',
  ]),
  data: z.record(z.unknown()).default({}),
});

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const { section, data } = settingsPatchSchema.parse(await req.json());

    if (section === 'account') {
      if (typeof data.username === 'string') {
        const clean = data.username.toLowerCase().trim();
        if (!/^[a-zA-Z0-9._]{2,32}$/.test(clean)) {
          throw new ValidationError('Invalid username format.');
        }
        const exists = await User.exists({ username: clean, _id: { $ne: user._id } });
        if (exists) throw new ConflictError('Username is already taken.');
        user.username = clean;
      }
      if (typeof data.firstName === 'string') user.firstName = data.firstName.trim();
      if (typeof data.lastName === 'string') user.lastName = data.lastName.trim();
      if (typeof data.bio === 'string') user.bio = data.bio.trim();
      if (typeof data.caption === 'string') user.caption = data.caption.trim();
      if (typeof data.category === 'string' || data.category === null)
        user.category = data.category as string | null;
      if (typeof data.website === 'string') user.website = data.website.trim();
      if (typeof data.country === 'string') user.country = data.country;
      if (typeof data.city === 'string') user.city = data.city.trim();
      if (typeof data.gender === 'string') user.gender = data.gender;
      if (typeof data.phone === 'string') user.phone = data.phone.trim();
      if (typeof data.birthDay === 'string') user.birthDay = data.birthDay;
      if (typeof data.birthMonth === 'string') user.birthMonth = data.birthMonth;
      if (typeof data.birthYear === 'string') user.birthYear = data.birthYear;
      await user.save();
    } else if (section === 'privacy') {
      user.privacySettings = { ...user.privacySettings, ...(data as typeof user.privacySettings) };
      await user.save();
    } else if (section === 'permits') {
      user.permitSettings = { ...user.permitSettings, ...(data as typeof user.permitSettings) };
      await user.save();
    } else if (section === 'notifications') {
      const d = data as { email?: Record<string, boolean>; push?: Record<string, boolean> };
      if (d.email) user.notificationSettings.email = { ...user.notificationSettings.email, ...d.email };
      if (d.push) user.notificationSettings.push = { ...user.notificationSettings.push, ...d.push };
      await user.save();
    } else if (section === 'security') {
      user.securitySettings = { ...user.securitySettings, ...(data as typeof user.securitySettings) };
      await user.save();
    } else if (section === 'social_links' && Array.isArray(data.links)) {
      user.socialLinks = data.links as typeof user.socialLinks;
      await user.save();
    } else if (section === 'theme' && (data.theme === 'light' || data.theme === 'dark')) {
      user.theme = data.theme;
      await user.save();
    } else if (section === 'language' && typeof data.language === 'string') {
      user.language = data.language.toLowerCase().slice(0, 5);
      await user.save();
    } else if (section === 'avatar' && typeof data.url === 'string') {
      user.avatar = data.url;
      await user.save();
    } else if (section === 'cover' && typeof data.url === 'string') {
      user.cover = data.url;
      await user.save();
    } else if (section === 'request_authorship') {
      if (user.type === UserType.AUTHOR) {
        throw new ConflictError('You are already an approved author.');
      }
      const pending = await AuthorshipRequest.exists({ userId: user._id, status: ASRStatus.PENDING });
      if (pending) throw new ConflictError('Authorship request is already pending review.');
      await AuthorshipRequest.create({ userId: user._id, status: ASRStatus.PENDING });
    } else if (section === 'create_api_key') {
      const name = String(data.name || 'Default API Key').trim();
      const rawKey = `weto_live_${crypto.randomBytes(24).toString('hex')}`;
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
      const created = await ApiKey.create({
        userId: user._id,
        name,
        keyPrefix: rawKey.slice(0, 18),
        keyHash,
        scopes: Array.isArray(data.scopes) ? (data.scopes as string[]) : ['read', 'write'],
      });
      return apiSuccess({
        id: String(created._id),
        name: created.name,
        keyPrefix: created.keyPrefix,
        secretKeyOnce: rawKey,
      });
    } else if (section === 'revoke_api_key' && typeof data.keyId === 'string') {
      await ApiKey.updateOne(
        { _id: data.keyId, userId: user._id },
        { $set: { isActive: false } }
      );
    }

    return apiSuccess({ updated: true });
  } catch (err) {
    return apiError(err);
  }
}
