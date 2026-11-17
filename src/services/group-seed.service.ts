import crypto from 'crypto';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db';
import { Chat, Message } from '@/models/Messaging';
import { Setting } from '@/models/System';
import { User } from '@/models/User';
import {
  ChatType,
  GroupPrivacy,
  GroupStatus,
  GroupVisibility,
  MessageType,
  UserRole,
  UserStatus,
} from '@/types/enums';

export const GROUP_CATEGORIES = [
  'General',
  'Tech & Creators',
  'Marketplace',
  'Gaming',
  'Music & Culture',
  'Support',
] as const;

export const DEFAULT_COMMUNITY_GROUPS = [
  {
    slug: 'general-lounge',
    inviteCode: 'WETO-GENERAL',
    name: 'General Lounge',
    description:
      'Welcome to the official Weto community room. Introduce yourself, meet creators, and start live audio/video hangouts.',
    category: 'General',
    avatar: '/assets/avatars/presets/avatar-h2mjRO.png',
    isPinned: true,
    autoJoin: true,
    verified: true,
    welcomeMessage:
      'Welcome to General Lounge! Say hello, drop a sticker or poll, or tap the phone/video icon above to start a group call.',
  },
  {
    slug: 'creators-tech',
    inviteCode: 'WETO-TECH',
    name: 'Creators & Tech',
    description:
      'Share builds, AI workflows, product launches, and collaborate with developers and digital creators.',
    category: 'Tech & Creators',
    avatar: '/assets/avatars/presets/avatar-4yKopU.png',
    isPinned: true,
    autoJoin: true,
    verified: true,
    welcomeMessage:
      'Welcome to Creators & Tech! Share what you are building or start a screen-share session to collaborate.',
  },
  {
    slug: 'marketplace-deals',
    inviteCode: 'WETO-MARKET',
    name: 'Marketplace & Deals',
    description:
      'Discover trending listings, verified sellers, freelance gigs, and community recommendations.',
    category: 'Marketplace',
    avatar: '/assets/avatars/presets/avatar-9aSEvy.png',
    isPinned: false,
    autoJoin: false,
    verified: true,
    welcomeMessage:
      'Welcome to Marketplace & Deals! Ask about products, share listings, and connect with trusted sellers.',
  },
  {
    slug: 'games-hangout',
    inviteCode: 'WETO-GAMES',
    name: 'Games & Hangout',
    description:
      'Find Tic-Tac-Toe challengers, organize tournaments, and relax in voice/video chat rooms.',
    category: 'Gaming',
    avatar: '/assets/avatars/presets/avatar-eTjc37.png',
    isPinned: false,
    autoJoin: false,
    verified: true,
    welcomeMessage:
      'Ready to play? Challenge members to Tic-Tac-Toe or kick off a group voice room!',
  },
] as const;

export function sanitizeGroupForClient<T extends Record<string, unknown> | null | undefined>(
  group: T
): T {
  if (!group) return group;
  const copy = { ...group };
  delete copy.passwordHash;
  return copy as T;
}

export function generateGroupInviteCode(seed?: string): string {
  const prefix = (seed || 'GRP')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 6);
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix || 'GRP'}-${rand}`;
}

export function hashGroupPassword(password: string): string {
  const salt = crypto.randomBytes(12).toString('hex');
  const derived = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyGroupPassword(password: string, storedHash?: string | null): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, hex] = storedHash.split(':');
  if (!salt || !hex) return false;
  const derived = crypto.scryptSync(password, salt, 32);
  const expected = Buffer.from(hex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

let seededMemoryDone = false;

export async function ensureDefaultCommunityGroups(force = false): Promise<void> {
  if (seededMemoryDone && !force) return;
  await connectDB();

  const existingFlag = await Setting.findOne({ group: 'system_seed_groups' }).lean();
  if (existingFlag && !force) {
    seededMemoryDone = true;
    return;
  }

  // Pick earliest root/admin user, or fallback to earliest active user as room owner
  const owner =
    (await User.findOne({
      role: { $in: [UserRole.ROOT, UserRole.ADMIN] },
      deletedAt: null,
    })
      .sort({ createdAt: 1 })
      .select('_id')
      .lean()) ||
    (await User.findOne({ deletedAt: null, status: UserStatus.ACTIVE })
      .sort({ createdAt: 1 })
      .select('_id')
      .lean());

  if (!owner) {
    return;
  }

  const now = new Date();
  for (const def of DEFAULT_COMMUNITY_GROUPS) {
    const exists = await Chat.exists({ type: ChatType.GROUP, 'group.slug': def.slug });
    if (exists) continue;

    const chat = await Chat.create({
      chatUuid: crypto.randomUUID(),
      type: ChatType.GROUP,
      participants: [{ userId: owner._id, role: 'owner', joinedAt: now }],
      group: {
        ownerId: owner._id,
        name: def.name,
        description: def.description,
        avatar: def.avatar,
        category: def.category,
        slug: def.slug,
        inviteCode: def.inviteCode,
        visibility: GroupVisibility.PUBLIC,
        privacy: GroupPrivacy.OPEN,
        status: GroupStatus.ACTIVE,
        verified: def.verified,
        verifiedAt: def.verified ? now : null,
        isDefault: true,
        isPinned: def.isPinned,
        autoJoin: def.autoJoin,
        unleavable: false,
        postingMode: 'everyone',
        requiresApproval: false,
        isPasswordProtected: false,
      },
      lastMessagePreview: def.welcomeMessage.slice(0, 120),
      lastActivity: now,
    });

    const welcomeMsg = await Message.create({
      chatId: chat._id,
      chatUuid: chat.chatUuid,
      senderId: owner._id,
      type: MessageType.TEXT,
      content: def.welcomeMessage,
      deliveredTo: [owner._id],
      readBy: [owner._id],
    });
    chat.lastMessageId = welcomeMsg._id;
    await chat.save();
  }

  await Setting.updateOne(
    { group: 'system_seed_groups' },
    { $set: { group: 'system_seed_groups', payload: { seeded: true, version: 1 } } },
    { upsert: true }
  );
  seededMemoryDone = true;
}

export async function syncAutoJoinGroupsForUser(userId: string | Types.ObjectId): Promise<void> {
  if (!userId) return;
  await ensureDefaultCommunityGroups();
  const uid = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;

  const autoGroups = await Chat.find({
    type: ChatType.GROUP,
    'group.status': GroupStatus.ACTIVE,
    'group.autoJoin': true,
    'participants.userId': { $ne: uid },
    'group.bannedUserIds': { $ne: uid },
  })
    .select('_id')
    .lean();

  if (autoGroups.length === 0) return;

  await Promise.all(
    autoGroups.map((g) =>
      Chat.updateOne(
        {
          _id: g._id,
          'participants.userId': { $ne: uid },
          'group.bannedUserIds': { $ne: uid },
        },
        {
          $push: {
            participants: {
              userId: uid,
              role: 'member',
              isArchived: false,
              isHidden: false,
              joinedAt: new Date(),
            },
          },
        }
      )
    )
  );
}
