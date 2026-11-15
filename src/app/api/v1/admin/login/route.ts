import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { publicEnv } from '@/lib/env';
import { getFirebaseAuth, isFirebaseAdminConfigured } from '@/lib/firebase/admin';
import { User } from '@/models/User';
import { Device } from '@/models/Device';
import {
  ACTIVE_ACCOUNT_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  assertIpNotBlacklisted,
  getClientIp,
} from '@/lib/auth/session';
import {
  apiError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/api-response';
import { UserRole, UserStatus } from '@/types/enums';
import {
  lookupIpLocation,
  normalizeIpAddress,
  parseDeviceUserAgent,
} from '@/services/translation.service';

const adminLoginSchema = z.object({
  login: z.string().min(2).max(120),
  password: z.string().min(1).max(128),
  remember: z.boolean().optional().default(true),
  deviceHash: z.string().optional(),
});

const ADMIN_ROLES = new Set<UserRole>([
  UserRole.ROOT,
  UserRole.ADMIN,
  UserRole.MODERATOR,
]);

export async function POST(req: NextRequest) {
  try {
    if (!isFirebaseAdminConfigured()) {
      throw new ValidationError('Firebase Admin SDK credentials are not configured on the server.');
    }
    const apiKey = publicEnv.firebase.apiKey;
    if (!apiKey) {
      throw new ValidationError('Firebase Web API key (NEXT_PUBLIC_FIREBASE_API_KEY) is not configured.');
    }

    const body = adminLoginSchema.parse(await req.json());
    const ip = await getClientIp(req);
    await assertIpNotBlacklisted(ip);

    const identifier = body.login.trim().replace(/^@/, '').toLowerCase();
    await connectDB();

    const user = await User.findOne({
      $or: [{ email: identifier }, { username: identifier }],
      deletedAt: null,
    });

    if (!user || !ADMIN_ROLES.has(user.role)) {
      throw new UnauthorizedError('Invalid administrator credentials or insufficient privileges.');
    }

    if (user.status === UserStatus.BLOCKED || user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenError('This administrator account is restricted.');
    }

    const fbRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          password: body.password,
          returnSecureToken: true,
        }),
        cache: 'no-store',
      }
    );

    const fbJson = (await fbRes.json().catch(() => ({}))) as {
      idToken?: string;
      error?: { message?: string };
    };

    if (!fbRes.ok || !fbJson.idToken) {
      const code = fbJson.error?.message || '';
      if (code.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) {
        throw new ForbiddenError('Too many failed login attempts. Please try again later.');
      }
      throw new UnauthorizedError('Invalid administrator credentials.');
    }

    const auth = getFirebaseAuth();
    const decoded = await auth.verifyIdToken(fbJson.idToken, true);

    if (!user.firebaseUid || user.firebaseUid !== decoded.uid) {
      user.firebaseUid = decoded.uid;
    }
    if (decoded.email_verified && !user.emailVerifiedAt) {
      user.emailVerifiedAt = new Date();
    }
    if (user.status === UserStatus.ONBOARDING) {
      user.status = UserStatus.ACTIVE;
      user.onboardingStep = null;
    }
    user.lastActive = new Date();
    user.ipAddress = ip;
    await user.save();

    const ua = req.headers.get('user-agent') || 'Unknown';
    const deviceHash =
      body.deviceHash || crypto.createHash('sha256').update(`${user._id}:${ua}`).digest('hex').slice(0, 32);
    const normalizedIp = normalizeIpAddress(ip);
    const geo = await lookupIpLocation(normalizedIp);
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

    const expiresInMs = body.remember ? 14 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const sessionCookie = await auth.createSessionCookie(fbJson.idToken, {
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
          avatar: user.avatar,
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

    return response;
  } catch (err) {
    return apiError(err);
  }
}
