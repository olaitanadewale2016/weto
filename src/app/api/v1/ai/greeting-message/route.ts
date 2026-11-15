import { NextRequest } from 'next/server';
import { getOptionalAuth } from '@/lib/auth/session';
import { apiError, apiSuccess } from '@/lib/api-response';
import { generateGreetingMessage } from '@/services/ai.service';

export async function GET(req: NextRequest) {
  try {
    const authCtx = await getOptionalAuth(req);
    const { searchParams } = new URL(req.url);
    const reqLocale = searchParams.get('locale') || authCtx?.user?.language || 'en';

    if (!authCtx?.user) {
      return apiSuccess({
        message: 'Welcome to Weto — discover stories, conversations, and local listings.',
        provider: 'fallback',
        aiConfigured: false,
      });
    }

    const res = await generateGreetingMessage({
      userId: String(authCtx.user._id),
      firstName: authCtx.user.firstName,
      username: authCtx.user.username,
      locale: reqLocale,
    });

    return apiSuccess(res);
  } catch (err) {
    return apiError(err);
  }
}
