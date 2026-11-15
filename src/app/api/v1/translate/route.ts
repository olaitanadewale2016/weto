import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, ValidationError } from '@/lib/api-response';
import { translateText } from '@/services/translation.service';

const translateSchema = z.object({
  text: z.string().min(1).max(5000),
  targetLang: z.string().min(2).max(10).default('en'),
  sourceLang: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = translateSchema.parse(await req.json());
    try {
      const result = await translateText(body);
      return apiSuccess(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'TRANSLATION_DISABLED') {
        throw new ValidationError('Translation service is currently disabled.');
      }
      throw new ValidationError(
        'Translation service (LibreTranslate) is currently unavailable or not configured.'
      );
    }
  } catch (err) {
    return apiError(err);
  }
}
