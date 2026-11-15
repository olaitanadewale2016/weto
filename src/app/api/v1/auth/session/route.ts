import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { getFirebaseAuth, isFirebaseAdminConfigured } from '@/lib/firebase/admin';
import { User } from '@/models/User';
import { Device } from '@/models/Device';
import {
  ACTIVE_ACCOUNT_COOKIE_NAME,
  PREVIOUS_ACCOUNT_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  assertIpNotBlacklisted,
  getClientIp,
  requireAuth,
} from '@/lib/auth/session';
import { apiError, apiSuccess, ForbiddenError, ValidationError } from '@/lib/api-response';
import { UserRole, UserStatus, UserType } from '@/types/enums';
import { isEmailOrUsernameBlacklisted } from '@/services/censor-blacklist.service';
import { ensureWallet } from '@/services/wallet.service';
import {
  lookupIpLocationWithHeaders,
  normalizeIpAddress,
  parseDeviceUserAgent,
} from '@/services/translation.service';
import { getSettingsGroup } from '@/services/settings.service';
import { toggleFollow } from '@/services/relations.service';
import { resolveMediaUrl } from '@/lib/media-url';
import crypto from 'crypto';

const sessionSchema = z.object({
  idToken: z.string().min(10),
  deviceHash: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    if (!isFirebaseAdminConfigured()) {
      throw new ValidationError('Firebase Admin SDK credentials are not configured on the server.');
    }

    const body = sessionSchema.parse(await req.json());
    const ip = await getClientIp(req);
    await assertIpNotBlacklisted(ip);

    const auth = getFirebaseAuth();
    const decoded = await auth.verifyIdToken(body.idToken, true);
    const email = (decoded.email || '').toLowerCase();

    if (email && (await isEmailOrUsernameBlacklisted(email))) {
      throw new ForbiddenError('This email address is blacklisted.');
    }

    await connectDB();
    let user = await User.findOne({ firebaseUid: decoded.uid, deletedAt: null });

    if (!user && email) {
      // Check if migrated user exists by email without firebaseUid yet
      user = await User.findOne({ email, deletedAt: null });
      if (user) {
        user.firebaseUid = decoded.uid;
        if (decoded.email_verified && !user.emailVerifiedAt) {
          user.emailVerifiedAt = new Date();
        }
        await user.save();
      }
    }

    const [authCfg, appCfg] = await Promise.all([
      getSettingsGroup('auth'),
      getSettingsGroup('app'),
    ]);

    const normalizedIp = normalizeIpAddress(ip);
    const geo = await lookupIpLocationWithHeaders(normalizedIp, req.headers);

    if (!user) {
      if (!authCfg.registrationEnabled) {
        throw new ForbiddenError('New user registrations are currently disabled.');
      }

      const rawName = (decoded.name || email.split('@')[0] || 'user').trim();
      const [firstName, ...rest] = rawName.split(/\s+/);
      const lastName = rest.join(' ');
      const baseUsername = (email.split('@')[0] || 'user')
        .replace(/[^a-zA-Z0-9._]/g, '')
        .toLowerCase()
        .slice(0, 20) || 'user';
      const uniqueUsername = `${baseUsername}_${crypto.randomInt(1000, 9999)}`;

      const isRootFirstUser = (await User.countDocuments({})) === 0;

      user = await User.create({
        firebaseUid: decoded.uid,
        firstName: firstName || 'User',
        lastName,
        username: uniqueUsername,
        email: email || `${decoded.uid}@users.colibriplus.local`,
        avatar: decoded.picture || '/assets/avatars/default-avatar.png',
        language: appCfg.locale || 'en',
        country: geo.country || null,
        city: geo.city || null,
        status: isRootFirstUser ? UserStatus.ACTIVE : UserStatus.ONBOARDING,
        role: isRootFirstUser ? UserRole.ROOT : UserRole.USER,
        type: isRootFirstUser ? UserType.AUTHOR : UserType.READER,
        emailVerifiedAt: decoded.email_verified ? new Date() : null,
        ipAddress: ip,
      });

      await ensureWallet(user._id);

      // Process AUTO_FOLLOW_LIST
      const autoFollowRaw = process.env.AUTO_FOLLOW_LIST || '';
      const autoFollowUsernames = autoFollowRaw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      if (autoFollowUsernames.length > 0) {
        const targets = await User.find({
          username: { $in: autoFollowUsernames },
          status: UserStatus.ACTIVE,
        }).select('_id');
        for (const t of targets) {
          await toggleFollow(String(user._id), String(t._id)).catch(() => {});
        }
      }
    } else {
      if (user.status === UserStatus.BLOCKED || user.status === UserStatus.SUSPENDED) {
        throw new ForbiddenError('Your account is restricted.');
      }
    }

    // Track GeoIP device session
    const ua = req.headers.get('user-agent') || 'Unknown';
    const deviceHash =
      body.deviceHash || crypto.createHash('sha256').update(`${user._id}:${ua}`).digest('hex').slice(0, 32);
    const uaInfo = parseDeviceUserAgent(ua);

    await Device.updateOne(
      { userId: user._id, deviceHash },
      {
        $set: {
          ipAddress: normalizedIp,
          userAgent: ua,
          platform: uaInfo.platform,
          browser: uaInfo.browser,
          platformType: uaInfo.platformType,
          country: geo.country,
          region: geo.region,
          city: geo.city,
          timezone: geo.timezone,
          isLocationUnknown: geo.unknown,
          lastOnline: new Date(),
          isTerminated: false,
        },
      },
      { upsert: true }
    );

    const expiresInMs = 14 * 24 * 60 * 60 * 1000; // 14 days
    const sessionCookie = await auth.createSessionCookie(body.idToken, {
      expiresIn: expiresInMs,
    });

    const response = NextResponse.json({
      status: 'success',
      data: {
        user: {
          id: String(user._id),
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          avatar: resolveMediaUrl(user.avatar) || '/assets/avatars/default-avatar.png',
          role: user.role,
          status: user.status,
          type: user.type,
          theme: user.theme,
          language: user.language,
          onboardingStep: user.onboardingStep,
        },
      },
    });

    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(expiresInMs / 1000),
    });
    response.cookies.delete(ACTIVE_ACCOUNT_COOKIE_NAME);
    response.cookies.delete(PREVIOUS_ACCOUNT_COOKIE_NAME);

    return response;
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE() {
  const response = apiSuccess({ loggedOut: true });
  response.cookies.delete(SESSION_COOKIE_NAME);
  response.cookies.delete(ACTIVE_ACCOUNT_COOKIE_NAME);
  response.cookies.delete(PREVIOUS_ACCOUNT_COOKIE_NAME);
  return response;
}

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req, { allowOnboarding: true });
    return apiSuccess({
      id: String(user._id),
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      bio: user.bio,
      caption: user.caption,
      avatar: resolveMediaUrl(user.avatar) || '/assets/avatars/default-avatar.png',
      cover: resolveMediaUrl(user.cover) || '/assets/covers/default-cover.png',
      verified: user.verified,
      role: user.role,
      status: user.status,
      type: user.type,
      theme: user.theme,
      language: user.language,
      onboardingStep: user.onboardingStep,
      publicationsCount: user.publicationsCount,
      followersCount: user.followersCount,
      followingCount: user.followingCount,
      tips: user.tips,
    });
  } catch (err) {
    return apiError(err);
  }
}
