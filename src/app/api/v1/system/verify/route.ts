import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { apiError, apiSuccess, ForbiddenError, NotFoundError } from '@/lib/api-response';
import { User } from '@/models/User';
import { getSettingsGroup } from '@/services/settings.service';
import { writeAuditLog } from '@/lib/audit';

const verifyUserSchema = z.object({
  userId: z.string().optional(),
  username: z.string().optional(),
  verified: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  try {
    const providedKey = req.headers.get('x-api-key');
    const appCfg = await getSettingsGroup('app');
    const expected = appCfg.apiKey || process.env.SYSTEM_API_KEY;

    if (!expected || providedKey !== expected) {
      throw new ForbiddenError('Invalid system API key.');
    }

    await connectDB();
    const body = verifyUserSchema.parse(await req.json());
    const user = await User.findOne(
      body.userId ? { _id: body.userId } : { username: body.username?.toLowerCase() }
    );
    if (!user) throw new NotFoundError('User not found.');

    user.verified = body.verified;
    user.verifiedAt = body.verified ? new Date() : null;
    await user.save();

    await writeAuditLog({
      actorId: user._id,
      action: 'system.verify_user',
      targetType: 'user',
      targetId: String(user._id),
      metadata: { verified: body.verified },
    });

    return apiSuccess({ id: String(user._id), verified: user.verified });
  } catch (err) {
    return apiError(err);
  }
}
