import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, ConflictError } from '@/lib/api-response';
import { User } from '@/models/User';
import { UserStatus } from '@/types/enums';

const onboardingSchema = z.object({
  step: z.enum(['profile', 'country', 'city', 'username']),
  firstName: z.string().min(2).max(32).optional(),
  lastName: z.string().max(32).optional(),
  bio: z.string().max(240).optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  avatar: z.string().max(1000).optional(),
  country: z.string().max(10).optional(),
  city: z.string().max(80).optional(),
  username: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-zA-Z0-9._]+$/, 'Username may only contain letters, numbers, dots, and underscores.')
    .optional(),
  skip: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req, { allowOnboarding: true });
    const body = onboardingSchema.parse(await req.json());

    if (body.step === 'profile') {
      if (body.firstName) user.firstName = body.firstName.trim();
      if (body.lastName !== undefined) user.lastName = body.lastName.trim();
      if (body.bio !== undefined) user.bio = body.bio.trim();
      if (body.gender) user.gender = body.gender;
      if (body.avatar) user.avatar = body.avatar.trim();
      user.onboardingStep = 'country';
    } else if (body.step === 'country') {
      if (!body.skip && body.country) user.country = body.country;
      user.onboardingStep = 'city';
    } else if (body.step === 'city') {
      if (!body.skip && body.city) user.city = body.city.trim();
      user.onboardingStep = 'username';
    } else if (body.step === 'username') {
      if (body.username) {
        const normalized = body.username.toLowerCase().trim();
        const taken = await User.exists({ username: normalized, _id: { $ne: user._id } });
        if (taken) throw new ConflictError('That username is already taken.');
        user.username = normalized;
      }
      user.onboardingStep = null;
      user.status = UserStatus.ACTIVE;
    }

    await user.save();

    return apiSuccess({
      status: user.status,
      onboardingStep: user.onboardingStep,
      username: user.username,
    });
  } catch (err) {
    return apiError(err);
  }
}
