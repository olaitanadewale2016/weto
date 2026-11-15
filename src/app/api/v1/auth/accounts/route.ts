import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ACTIVE_ACCOUNT_COOKIE_NAME, getClientIp, requireAuth } from '@/lib/auth/session';
import {
  apiError,
  apiSuccess,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/api-response';
import { publicEnv } from '@/lib/env';
import { User } from '@/models/User';
import { DeletionFeedback } from '@/models/SocialGraph';
import { Post } from '@/models/Post';
import { getFirebaseAuth, isFirebaseAdminConfigured } from '@/lib/firebase/admin';
import { UserStatus, UserType } from '@/types/enums';
import { ensureWallet } from '@/services/wallet.service';
import { getSettingsGroup } from '@/services/settings.service';
import { dispatchNotification } from '@/services/notification.service';

const MAX_LINKED_ACCOUNTS = 5;

function setActiveAccountCookie(res: NextResponse, accountId: string) {
  res.cookies.set(ACTIVE_ACCOUNT_COOKIE_NAME, accountId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
}

function maskEmail(email?: string | null): string | null {
  if (!email || !email.includes('@')) return null;
  const [local, domain] = email.split('@');
  if (!local || !domain) return null;
  const visible = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

export async function GET(req: NextRequest) {
  try {
    const [{ user }, featuresCfg, authCfg] = await Promise.all([
      requireAuth(req),
      getSettingsGroup('features'),
      getSettingsGroup('auth'),
    ]);
    const masterId = user.ownerAccountId || user._id;
    const isMasterSession = !user.ownerAccountId;

    const accounts = await User.find({
      deletedAt: null,
      $or: [{ _id: masterId }, { ownerAccountId: masterId }],
    })
      .select(
        'username firstName lastName avatar bio website verified role status type ownerAccountId'
      )
      .sort({ ownerAccountId: 1, createdAt: 1 })
      .lean();

    const switchEnabled =
      featuresCfg.switchAccounts !== false && authCfg.switchAccountEnabled !== false;
    const linkEnabled =
      featuresCfg.linkAccounts !== false && authCfg.linkAccountsEnabled !== false;

    const linkedCount = accounts.filter((a) => Boolean(a.ownerAccountId)).length;

    return apiSuccess({
      activeAccountId: String(user._id),
      masterAccountId: String(masterId),
      isMasterSession,
      switchEnabled,
      linkEnabled,
      maxLinkedAccounts: MAX_LINKED_ACCOUNTS,
      canAddMore: isMasterSession && linkEnabled && linkedCount < MAX_LINKED_ACCOUNTS,
      accounts: accounts.map((a) => {
        const fullName = `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.username;
        const isMaster = !a.ownerAccountId;
        const isBlocked =
          a.status === UserStatus.BLOCKED || a.status === UserStatus.SUSPENDED;
        return {
          id: String(a._id),
          username: a.username,
          firstName: a.firstName,
          lastName: a.lastName,
          fullName,
          avatar: a.avatar,
          bio: a.bio || '',
          website: a.website || '',
          caption: a.bio ? a.bio : `@${a.username}`,
          verified: Boolean(a.verified),
          status: a.status,
          type: a.type,
          isActive: String(a._id) === String(user._id),
          isMaster,
          canSwitch: switchEnabled && !isBlocked,
          canUnlink: isMasterSession && !isMaster,
        };
      }),
    });
  } catch (err) {
    return apiError(err);
  }
}

const accountsActionSchema = z.object({
  action: z.enum(['create', 'switch', 'lookup', 'link_existing', 'unlink', 'delete_account']),
  targetAccountId: z.string().optional(),
  accountId: z.string().optional(),
  login: z.string().min(2).max(160).optional(),
  password: z.string().min(4).max(160).optional(),
  switchImmediately: z.boolean().optional(),
  firstName: z.string().min(2).max(32).optional(),
  lastName: z.string().max(32).optional(),
  username: z.string().min(2).max(32).regex(/^[a-zA-Z0-9._]+$/).optional(),
  feedbackMessage: z.string().max(1000).optional(),
});

async function assertSwitchAndLinkFeatures() {
  const [featuresCfg, authCfg] = await Promise.all([
    getSettingsGroup('features'),
    getSettingsGroup('auth'),
  ]);
  return {
    switchEnabled:
      featuresCfg.switchAccounts !== false && authCfg.switchAccountEnabled !== false,
    linkEnabled:
      featuresCfg.linkAccounts !== false && authCfg.linkAccountsEnabled !== false,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const body = accountsActionSchema.parse(await req.json());
    const masterId = user.ownerAccountId || user._id;
    const isMasterSession = !user.ownerAccountId;
    const requestedTargetId = body.targetAccountId || body.accountId;

    if (body.action === 'create') {
      const { linkEnabled } = await assertSwitchAndLinkFeatures();
      if (!linkEnabled) {
        throw new ForbiddenError('Account linking and sub-account creation is currently disabled.');
      }

      const count = await User.countDocuments({ ownerAccountId: masterId, deletedAt: null });
      if (count >= MAX_LINKED_ACCOUNTS) {
        throw new ForbiddenError(
          `Maximum linked accounts limit (${MAX_LINKED_ACCOUNTS}) reached.`
        );
      }

      let username = body.username ? body.username.toLowerCase() : '';
      if (username) {
        const exists = await User.exists({ username });
        if (exists) throw new ConflictError('Username is already taken.');
      } else {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const candidate = `${user.username}_${crypto.randomInt(100, 9999)}`.toLowerCase();
          if (!(await User.exists({ username: candidate }))) {
            username = candidate;
            break;
          }
        }
        if (!username) {
          username = `${user.username}_${Date.now().toString(36).slice(-4)}`.toLowerCase();
        }
      }

      const linked = await User.create({
        ownerAccountId: masterId,
        firstName: body.firstName || user.firstName,
        lastName: body.lastName || '',
        username,
        email: `${username}+linked@users.colibriplus.local`,
        status: UserStatus.ACTIVE,
        type: UserType.READER,
        language: user.language,
        theme: user.theme,
        avatar: '/assets/avatars/default-avatar.png',
        onboardingStep: null,
      });
      await ensureWallet(linked._id);

      const res = NextResponse.json(
        {
          status: 'success',
          data: {
            accountId: String(linked._id),
            activeAccountId: String(linked._id),
            username: linked.username,
          },
        },
        { status: 201 }
      );
      setActiveAccountCookie(res, String(linked._id));
      return res;
    }

    if (body.action === 'switch') {
      const { switchEnabled } = await assertSwitchAndLinkFeatures();
      if (!switchEnabled) {
        throw new ForbiddenError('Account switching is currently disabled.');
      }
      if (!requestedTargetId) {
        throw new ValidationError('Target account ID is required.');
      }

      const target = await User.findOne({
        _id: requestedTargetId,
        deletedAt: null,
        $or: [{ _id: masterId }, { ownerAccountId: masterId }],
      });
      if (!target) throw new NotFoundError('Linked account not found.');
      if (target.status === UserStatus.BLOCKED || target.status === UserStatus.SUSPENDED) {
        throw new ForbiddenError('Cannot switch to a restricted account.');
      }

      const res = NextResponse.json({
        status: 'success',
        data: { activeAccountId: String(target._id), username: target.username },
      });
      setActiveAccountCookie(res, String(target._id));
      return res;
    }

      if (body.action === 'lookup') {
        const { linkEnabled } = await assertSwitchAndLinkFeatures();
        if (!linkEnabled) {
          throw new ForbiddenError('Account linking is currently disabled.');
        }
        if (!isMasterSession) {
          throw new ForbiddenError('Switch back to your master account before linking another account.');
        }
        if (!body.login?.trim()) {
          throw new ValidationError('Username or email address is required.');
        }

        const identifier = body.login.trim().replace(/^@/, '').toLowerCase();
        const target = await User.findOne({
          deletedAt: null,
          $or: [{ username: identifier }, { email: identifier }],
        })
          .select('username firstName lastName avatar verified bio email status ownerAccountId')
          .lean();

        if (!target) {
          throw new NotFoundError('No account found with that username or email.');
        }
        if (String(target._id) === String(masterId)) {
          throw new ValidationError('You cannot link your master account to itself.');
        }
        if (target.ownerAccountId && String(target.ownerAccountId) === String(masterId)) {
          throw new ConflictError('This account is already linked to your account.');
        }
        if (target.ownerAccountId) {
          throw new ForbiddenError('This account is already linked to another master account.');
        }
        const targetOwnsChildren = await User.exists({
          ownerAccountId: target._id,
          deletedAt: null,
        });
        if (targetOwnsChildren) {
          throw new ForbiddenError('Accounts that already manage linked profiles cannot be linked.');
        }
        if (target.status === UserStatus.BLOCKED || target.status === UserStatus.SUSPENDED) {
          throw new ForbiddenError('Restricted accounts cannot be linked.');
        }
        if (!target.email || target.email.endsWith('@users.colibriplus.local')) {
          throw new ForbiddenError('Sub-profiles without standalone login credentials cannot be linked.');
        }

        return apiSuccess({
          account: {
            id: String(target._id),
            username: target.username,
            firstName: target.firstName,
            lastName: target.lastName,
            fullName: `${target.firstName || ''} ${target.lastName || ''}`.trim() || target.username,
            avatar: target.avatar,
            verified: Boolean(target.verified),
            bio: target.bio || '',
            emailHint: maskEmail(target.email),
          },
        });
      }

      if (body.action === 'link_existing') {
        const { linkEnabled } = await assertSwitchAndLinkFeatures();
        if (!linkEnabled) {
          throw new ForbiddenError('Account linking is currently disabled.');
        }
        if (!isMasterSession) {
          throw new ForbiddenError('Switch back to your master account before linking another account.');
        }
        if (!body.login?.trim() || !body.password) {
          throw new ValidationError('Account username/email and password are required.');
        }

        const linkedCount = await User.countDocuments({
          ownerAccountId: masterId,
          deletedAt: null,
        });
        if (linkedCount >= MAX_LINKED_ACCOUNTS) {
          throw new ForbiddenError(
            `Maximum linked accounts limit (${MAX_LINKED_ACCOUNTS}) reached.`
          );
        }

        const identifier = body.login.trim().replace(/^@/, '').toLowerCase();
        const target = await User.findOne({
          deletedAt: null,
          $or: [{ username: identifier }, { email: identifier }],
        });

        if (!target) {
          throw new NotFoundError('Account not found.');
        }
        if (String(target._id) === String(masterId)) {
          throw new ValidationError('You cannot link your master account to itself.');
        }
        if (target.ownerAccountId && String(target.ownerAccountId) === String(masterId)) {
          throw new ConflictError('This account is already linked.');
        }
        if (target.ownerAccountId) {
          throw new ForbiddenError('This account is already linked to another master account.');
        }
        const targetOwnsChildren = await User.exists({
          ownerAccountId: target._id,
          deletedAt: null,
        });
        if (targetOwnsChildren) {
          throw new ForbiddenError('Accounts that already manage linked profiles cannot be linked.');
        }
        if (target.status === UserStatus.BLOCKED || target.status === UserStatus.SUSPENDED) {
          throw new ForbiddenError('Restricted accounts cannot be linked.');
        }
        if (!target.email || target.email.endsWith('@users.colibriplus.local')) {
          throw new ForbiddenError('This profile does not have standalone password credentials.');
        }

        const apiKey = publicEnv.firebase.apiKey;
        if (!apiKey) {
          throw new ValidationError('Credential verification service is not configured.');
        }

        const fbRes = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: target.email,
              password: body.password,
              returnSecureToken: false,
            }),
          }
        );

        if (!fbRes.ok) {
          throw new UnauthorizedError('Invalid password for the target account.');
        }

        target.ownerAccountId = masterId;
        await target.save();
        await ensureWallet(target._id);

        await dispatchNotification({
          recipientId: target._id,
          actorId: masterId,
          type: 'ACCOUNT_LINKED',
          category: 'important',
          title: 'Account linked',
          message: `linked this account with @${user.username} for quick switching.`,
          entityType: 'user',
          entityId: String(masterId),
          actionUrl: '/settings',
        });

        const res = NextResponse.json({
          status: 'success',
          data: {
            linked: true,
            accountId: String(target._id),
            username: target.username,
            switched: Boolean(body.switchImmediately),
          },
        });
        if (body.switchImmediately) {
          setActiveAccountCookie(res, String(target._id));
        }
        return res;
      }

      if (body.action === 'unlink') {
        if (!isMasterSession) {
          throw new ForbiddenError('Switch back to your master account before unlinking profiles.');
        }
        if (!requestedTargetId) {
          throw new ValidationError('Target account ID is required.');
        }

        const target = await User.findOne({
          _id: requestedTargetId,
          ownerAccountId: masterId,
          deletedAt: null,
        });
        if (!target) {
          throw new NotFoundError('Linked account not found.');
        }

        target.ownerAccountId = null;
        await target.save();

        return apiSuccess({
          unlinked: true,
          accountId: String(target._id),
          username: target.username,
        });
      }

      if (body.action === 'delete_account') {
        const ip = await getClientIp(req);
        await DeletionFeedback.create({
          feedbackMessage: body.feedbackMessage || '',
          username: user.username,
          fullName: `${user.firstName} ${user.lastName}`.trim(),
          email: user.email,
          phone: user.phone,
          registeredAt: user.createdAt,
          publications: user.publicationsCount,
          followers: user.followersCount,
          following: user.followingCount,
          ipAddress: ip,
          userAgent: req.headers.get('user-agent') || '',
          deletedAt: new Date(),
        });

        user.deletedAt = new Date();
        user.status = UserStatus.SUSPENDED;
        await user.save();
        await Post.deleteMany({ userId: user._id });

        if (user.firebaseUid && !user.ownerAccountId && isFirebaseAdminConfigured()) {
          await getFirebaseAuth().deleteUser(user.firebaseUid).catch(() => { });
        }

        const res = apiSuccess({ deleted: true });
        res.cookies.delete('__session');
        res.cookies.delete(ACTIVE_ACCOUNT_COOKIE_NAME);
        return res;
      }

      return apiSuccess({});
    } catch (err) {
      return apiError(err);
    }
  }
