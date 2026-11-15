import { getServerEnv } from '@/lib/env';

export type AiProvider = 'openai' | 'gemini' | 'fallback';

export function getAiCapabilities() {
  const env = getServerEnv();
  const openai = Boolean(env.OPENAI_API_KEY?.trim());
  const gemini = Boolean(env.GEMINI_API_KEY?.trim());
  return {
    openai,
    gemini,
    enabled: openai || gemini,
  };
}

async function callOpenAi(params: {
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: params.systemPrompt },
        { role: 'user', content: params.userPrompt },
      ],
      max_tokens: params.maxTokens ?? 300,
      temperature: params.temperature ?? 0.7,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI returned ${res.status}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('OpenAI returned empty response');
  }
  return content;
}

async function callGemini(params: {
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: params.systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: params.userPrompt }],
        },
      ],
      generationConfig: {
        temperature: params.temperature ?? 0.7,
        maxOutputTokens: params.maxTokens ?? 300,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini returned ${res.status}`);
  }
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim();
  if (!text) {
    throw new Error('Gemini returned empty response');
  }
  return text;
}

export async function generateAiText(params: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<{ text: string; provider: 'openai' | 'gemini' }> {
  const env = getServerEnv();
  const openaiKey = env.OPENAI_API_KEY?.trim();
  const geminiKey = env.GEMINI_API_KEY?.trim();

  if (openaiKey) {
    try {
      const text = await callOpenAi({
        apiKey: openaiKey,
        systemPrompt: params.systemPrompt,
        userPrompt: params.userPrompt,
        maxTokens: params.maxTokens,
        temperature: params.temperature,
      });
      return { text, provider: 'openai' };
    } catch {
      // Fall through to Gemini if configured
    }
  }

  if (geminiKey) {
    const text = await callGemini({
      apiKey: geminiKey,
      systemPrompt: params.systemPrompt,
      userPrompt: params.userPrompt,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
    });
    return { text, provider: 'gemini' };
  }

  throw new Error('AI_NOT_CONFIGURED');
}

const greetingCache = new Map<string, { message: string; provider: AiProvider; expiresAt: number }>();

const LOCAL_GREETINGS: Record<string, string[]> = {
  en: [
    'Welcome back! Share something inspiring with your community today.',
    'Great to see you here today — your community is waiting for your next update!',
  ],
  fr: ['Ravi de vous revoir ! Partagez quelque chose d\'inspirant aujourd\'hui.'],
  es: ['¡Qué alegría verte de nuevo! Comparte algo inspirador hoy.'],
  de: ['Schön, dass du wieder da bist! Teile heute etwas Inspirierendes.'],
  pt: ['Que bom ter você de volta! Compartilhe algo inspirador hoje.'],
  ru: ['Рады видеть вас снова! Поделитесь чем-нибудь вдохновляющим сегодня.'],
  ar: ['مرحباً بعودتك! شارك مجتمعك شيئاً ملهماً اليوم.'],
};

/**
 * Mirrors PHP GreetingAgent ("You are a very kind user greeting agent.")
 */
export async function generateGreetingMessage(params: {
  userId: string;
  firstName: string;
  username: string;
  locale?: string;
}): Promise<{ message: string; provider: AiProvider; aiConfigured: boolean }> {
  const { enabled } = getAiCapabilities();
  const lang = (params.locale || 'en').toLowerCase().slice(0, 2);
  const hourBucket = Math.floor(new Date().getUTCHours() / 6);
  const cacheKey = `${params.userId}:${lang}:${hourBucket}`;
  const cached = greetingCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { message: cached.message, provider: cached.provider, aiConfigured: enabled };
  }

  const name = params.firstName || params.username;
  if (enabled) {
    try {
      const res = await generateAiText({
        systemPrompt:
          'You are a very kind user greeting agent on the Weto social platform. Reply with ONE warm, friendly greeting sentence (max 22 words, no quotes, in the requested language).',
        userPrompt: `Greet user "${name}" warmly in language code "${lang}". Mention they can share a post or connect with friends.`,
        maxTokens: 70,
        temperature: 0.85,
      });
      const clean = res.text.replace(/^["']|["']$/g, '').trim();
      greetingCache.set(cacheKey, {
        message: clean,
        provider: res.provider,
        expiresAt: Date.now() + 60 * 60 * 1000,
      });
      return { message: clean, provider: res.provider, aiConfigured: true };
    } catch {
      // Fallback gracefully
    }
  }

  const pool = LOCAL_GREETINGS[lang] || LOCAL_GREETINGS.en;
  const fallbackMsg = `${pool[0].replace('Welcome back', `Welcome back, ${name}`)}`;
  return { message: fallbackMsg, provider: 'fallback', aiConfigured: enabled };
}

export async function generatePostAssist(params: {
  mode: 'draft' | 'improve' | 'hashtags' | 'summary';
  prompt: string;
  locale?: string;
}): Promise<{ content: string; provider: 'openai' | 'gemini' }> {
  const lang = (params.locale || 'en').toLowerCase().slice(0, 2);
  const modeInstructions: Record<typeof params.mode, string> = {
    draft: `Write a crisp, engaging social media post in language "${lang}" based on the user's topic. Keep it natural and concise (max 120 words). Include 2-4 relevant hashtags at the end.`,
    improve: `Polish and improve the user's social post draft in language "${lang}" so it reads clearly and engagingly while keeping their authentic voice. Return only the improved post text.`,
    hashtags: `Return the user's text followed by a blank line and 4-6 relevant trending hashtags (e.g. #Community #Tech). Language "${lang}".`,
    summary: `Summarize the user's text into a punchy 1-2 sentence social post in language "${lang}". Return only the summary.`,
  };

  const res = await generateAiText({
    systemPrompt: `You are an AI writing assistant inside Weto's publication composer. ${modeInstructions[params.mode]} Never wrap your answer in quotes or markdown code fences.`,
    userPrompt: params.prompt,
    maxTokens: 350,
    temperature: 0.7,
  });

  return { content: res.text, provider: res.provider };
}

export async function translateWithAi(params: {
  text: string;
  targetLang: string;
  sourceLang?: string;
}): Promise<{ translatedText: string; detectedLanguage?: string }> {
  const res = await generateAiText({
    systemPrompt: `You are a precise translator. Translate the user's text faithfully into language code "${params.targetLang}". Output ONLY the translated text without commentary or quotes.`,
    userPrompt: params.text,
    maxTokens: 1200,
    temperature: 0.2,
  });
  return {
    translatedText: res.text,
    detectedLanguage: params.sourceLang || undefined,
  };
}
