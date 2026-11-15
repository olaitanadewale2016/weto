import { cookies, headers } from 'next/headers';
import { NextRequest } from 'next/server';
import { getFirebaseAuth } from '@/lib/firebase/admin';
import { connectDB } from '@/lib/db';
import { User, IUserDocument } from '@/models/User';
import { Blacklist } from '@/models/Moderation';
import { ApiKey } from '@/models/System';
import { ForbiddenError, UnauthorizedError } from '@/lib/api-response';
import { BlacklistType, UserRole, UserStatus } from '@/types/enums';
import crypto from 'crypto';

export const SESSION_COOKIE_NAME = '__session';
export const ACTIVE_ACCOUNT_COOKIE_NAME = 'cp_active_account';

export interface AuthContext {
  user: IUserDocument;
  firebaseUid: string;
  authMethod: 'session' | 'bearer' | 'api_key';
  apiKeyScopes?: string[];
}

export async function getClientIp(req?: NextRequest): Promise<string> {
  if (req) {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.headers.get('x-real-ip') || '0.0.0.0';
  }
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return h.get('x-real-ip') || '0.0.0.0';
}

export async function assertIpNotBlacklisted(ip: string): Promise<void> {
  if (!ip || ip === '0.0.0.0') return;
  await connectDB();
  const banned = await Blacklist.findOne({
    type: BlacklistType.IP,
    blacklistable: ip,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  }).lean();

  if (banned) {
    throw new ForbiddenError('Access denied from this IP address.');
  }
}

export function verifyCsrfOrigin(req: NextRequest): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
  // Bearer & API Key requests are immune to browser CSRF
  if (req.headers.get('authorization') || req.headers.get('x-api-key')) return;

  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!origin || !host) return;

  try {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      throw new ForbiddenError('Invalid request origin.');
    }
  } catch {
    throw new ForbiddenError('Invalid request origin header.');
  }
}

/**
 * Resolves the currently authenticated user (or null if guest) without throwing.
 */
export async function getOptionalAuth(req?: NextRequest): Promise<AuthContext | null> {
  try {
    return await requireAuth(req, { allowOnboarding: true });
  } catch {
    return null;
  }
}

/**
 * Verifies Firebase session cookie / Bearer ID token / Developer API Key,
 * resolves the MongoDB User (and linked sub-account if switched), and checks status.
 */
export async function requireAuth(
  req?: NextRequest,
  options: { allowOnboarding?: boolean; requiredRoles?: UserRole[] } = {}
): Promise<AuthContext> {
  await connectDB();
  const ip = await getClientIp(req);
  await assertIpNotBlacklisted(ip);

  const authHeader = req ? req.headers.get('authorization') : (await headers()).get('authorization');
  const apiKeyHeader = req ? req.headers.get('x-api-key') : (await headers()).get('x-api-key');

  // 1. Developer API Key authentication (/api/v1/*)
  if (
    apiKeyHeader ||
    (authHeader && (authHeader.startsWith('Bearer weto_') || authHeader.startsWith('Bearer colibri_')))
  ) {
    const rawKey = apiKeyHeader || authHeader!.replace(/^Bearer\s+/i, '').trim();
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyRecord = await ApiKey.findOne({
      keyHash,
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });

    if (!keyRecord) {
      throw new UnauthorizedError('Invalid or expired API key.');
    }

    const user = await User.findById(keyRecord.userId);
    if (!user || user.deletedAt) {
      throw new UnauthorizedError('API key owner account not found.');
    }

    enforceUserStatus(user, options.allowOnboarding);
    enforceRoles(user, options.requiredRoles);

    await ApiKey.updateOne({ _id: keyRecord._id }, { $set: { lastUsedAt: new Date() } });
    return {
      user,
      firebaseUid: user.firebaseUid || '',
      authMethod: 'api_key',
      apiKeyScopes: keyRecord.scopes,
    };
  }

  // 2. Firebase Bearer Token or __session Cookie
  let firebaseUid: string | null = null;
  let authMethod: 'session' | 'bearer' = 'session';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.slice(7).trim();
    const decoded = await getFirebaseAuth().verifyIdToken(idToken, true);
    firebaseUid = decoded.uid;
    authMethod = 'bearer';
  } else {
    const cookieStore = req ? req.cookies : await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      throw new UnauthorizedError('Missing authentication session.');
    }
    const decoded = await getFirebaseAuth().verifySessionCookie(sessionCookie, true);
    firebaseUid = decoded.uid;
    authMethod = 'session';
  }

  let user = await User.findOne({ firebaseUid, deletedAt: null });
  if (!user) {
    throw new UnauthorizedError('User profile not provisioned.');
  }

  // Multi-account linked switching: verify switched target is owned by the same master account
  const cookieStore = req ? req.cookies : await cookies();
  const activeAccountId = cookieStore.get(ACTIVE_ACCOUNT_COOKIE_NAME)?.value;
  if (activeAccountId && activeAccountId !== String(user._id)) {
    const accountScopeFilter = user.ownerAccountId
      ? { $or: [{ _id: user.ownerAccountId }, { ownerAccountId: user.ownerAccountId }] }
      : { ownerAccountId: user._id };
    const linked = await User.findOne({
      _id: activeAccountId,
      deletedAt: null,
      status: { $nin: [UserStatus.BLOCKED, UserStatus.SUSPENDED] },
      ...accountScopeFilter,
    });
    if (linked) {
      user = linked;
    }
  }

  enforceUserStatus(user, options.allowOnboarding);
  enforceRoles(user, options.requiredRoles);

  // Update lastActive throttling (at most once per minute)
  const now = new Date();
  if (!user.lastActive || now.getTime() - user.lastActive.getTime() > 60_000) {
    await User.updateOne(
      { _id: user._id },
      { $set: { lastActive: now, ipAddress: ip } }
    );
  }

  return { user, firebaseUid: firebaseUid ?? '', authMethod };
}

function enforceUserStatus(user: IUserDocument, allowOnboarding?: boolean): void {
  if (user.status === UserStatus.BLOCKED) {
    throw new ForbiddenError('Your account has been blocked.');
  }
  if (user.status === UserStatus.SUSPENDED) {
    throw new ForbiddenError('Your account has been suspended.');
  }
  if (user.status === UserStatus.ONBOARDING && !allowOnboarding) {
    throw new ForbiddenError('Please complete onboarding first.');
  }
}

function enforceRoles(user: IUserDocument, requiredRoles?: UserRole[]): void {
  if (!requiredRoles || requiredRoles.length === 0) return;
  if (user.role === UserRole.ROOT) return;
  if (!requiredRoles.includes(user.role)) {
    throw new ForbiddenError('Insufficient permissions for this resource.');
  }
}

export function requireAdminAuth(req?: NextRequest) {
  return requireAuth(req, {
    requiredRoles: [UserRole.ROOT, UserRole.ADMIN, UserRole.MODERATOR],
  });
}
