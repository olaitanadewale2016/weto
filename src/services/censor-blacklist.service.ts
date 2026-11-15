import { connectDB } from '@/lib/db';
import { Blacklist, Censor } from '@/models/Moderation';
import { User } from '@/models/User';
import { BlacklistType, CensorLevel, UserStatus } from '@/types/enums';
import { ForbiddenError } from '@/lib/api-response';
import { writeAuditLog } from '@/lib/audit';

export interface CensorEvaluation {
  cleanText: string;
  triggeredBanned: string[];
  triggeredWarnings: string[];
}

export async function evaluateTextCensors(text: string): Promise<CensorEvaluation> {
  if (!text.trim()) {
    return { cleanText: text, triggeredBanned: [], triggeredWarnings: [] };
  }

  await connectDB();
  const rules = await Censor.find({}).lean();
  if (rules.length === 0) {
    return { cleanText: text, triggeredBanned: [], triggeredWarnings: [] };
  }

  let cleanText = text;
  const triggeredBanned: string[] = [];
  const triggeredWarnings: string[] = [];

  for (const rule of rules) {
    const escaped = rule.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    if (regex.test(cleanText)) {
      if (rule.level === CensorLevel.BANNED) {
        triggeredBanned.push(rule.word);
      } else if (rule.level === CensorLevel.WARNING) {
        triggeredWarnings.push(rule.word);
      } else if (rule.level === CensorLevel.REPLACED) {
        cleanText = cleanText.replace(regex, '*'.repeat(rule.word.length));
      }
    }
  }

  return { cleanText, triggeredBanned, triggeredWarnings };
}

export async function enforceCensorForUser(params: {
  text: string;
  userId: string;
  email: string;
  ipAddress: string;
}): Promise<CensorEvaluation> {
  const evaluation = await evaluateTextCensors(params.text);

  if (evaluation.triggeredBanned.length > 0) {
    // Mirrors ColibriPlus CensorService: auto-blacklist IP + email and ban user
    await Promise.all([
      User.updateOne({ _id: params.userId }, { $set: { status: UserStatus.BLOCKED } }),
      Blacklist.updateOne(
        { blacklistable: params.email },
        {
          $setOnInsert: {
            type: BlacklistType.EMAIL,
            blacklistable: params.email,
            reason: `Auto-banned via censor words: ${evaluation.triggeredBanned.join(', ')}`,
            addedAt: new Date(),
          },
        },
        { upsert: true }
      ),
      params.ipAddress && params.ipAddress !== '0.0.0.0'
        ? Blacklist.updateOne(
            { blacklistable: params.ipAddress },
            {
              $setOnInsert: {
                type: BlacklistType.IP,
                blacklistable: params.ipAddress,
                reason: `Auto-banned via censor words: ${evaluation.triggeredBanned.join(', ')}`,
                addedAt: new Date(),
              },
            },
            { upsert: true }
          )
        : Promise.resolve(),
      writeAuditLog({
        actorId: params.userId,
        action: 'censor.auto_ban',
        targetType: 'user',
        targetId: params.userId,
        ipAddress: params.ipAddress,
        metadata: { words: evaluation.triggeredBanned },
      }),
    ]);

    throw new ForbiddenError('Content violated community safety rules; account has been restricted.');
  }

  return evaluation;
}

export async function isEmailOrUsernameBlacklisted(email: string, username?: string): Promise<boolean> {
  await connectDB();
  const candidates = [email.toLowerCase().trim()];
  if (username) candidates.push(username.toLowerCase().trim());

  const hit = await Blacklist.findOne({
    blacklistable: { $in: candidates },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  }).lean();

  return Boolean(hit);
}
