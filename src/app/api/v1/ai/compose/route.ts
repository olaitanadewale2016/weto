import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, ValidationError } from '@/lib/api-response';
import { generatePostAssist, getAiCapabilities } from '@/services/ai.service';

const composeSchema = z.object({
  mode: z.enum(['draft', 'improve', 'hashtags', 'summary']).default('draft'),
  prompt: z.string().min(2).max(4000),
  locale: z.string().max(10).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const body = composeSchema.parse(await req.json());
    const caps = getAiCapabilities();
    if (!caps.enabled) {
      throw new ValidationError(
        'AI writing assistant requires OPENAI_API_KEY or GEMINI_API_KEY in environment configuration.'
      );
    }

    const result = await generatePostAssist({
      mode: body.mode,
      prompt: body.prompt.trim(),
      locale: body.locale || user.language || 'en',
    });

    return apiSuccess(result);
  } catch (err) {
    return apiError(err);
  }
}
