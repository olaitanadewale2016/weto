import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Code2, FileText } from 'lucide-react';
import { connectDB } from '@/lib/db';
import { getOptionalAuth } from '@/lib/auth/session';
import { StaticPage } from '@/models/System';
import {
  DEFAULT_STATIC_PAGES,
  ensureDefaultStaticPages,
} from '@/services/localization-seed.service';
import { AppShell } from '@/components/layout/AppShell';

const SLUG_ALIASES: Record<string, string> = {
  terms: 'terms-of-use',
  privacy: 'privacy-policy',
  cookies: 'cookies-policy',
  help: 'help-center',
  developers: 'developers-api',
  rules: 'verification-rules',
};

const FALLBACK_BY_SLUG = new Map(DEFAULT_STATIC_PAGES.map((p) => [p.slug, p]));

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const rawSlug = slug.toLowerCase();
  const canonicalSlug = SLUG_ALIASES[rawSlug] || rawSlug;
  let dbPage: { title: string; content: string } | null = null;

  try {
    await connectDB();
    await ensureDefaultStaticPages();
    const [authCtx, exactDoc, canonicalDoc] = await Promise.all([
      getOptionalAuth(),
      StaticPage.findOne({ slug: rawSlug }).lean(),
      canonicalSlug !== rawSlug ? StaticPage.findOne({ slug: canonicalSlug }).lean() : Promise.resolve(null),
    ]);
    const doc = exactDoc || canonicalDoc;
    if (doc) {
      const userLang = authCtx?.user?.language?.toLowerCase();
      const map = doc.contentByLocale || {};
      const localized =
        (userLang && map[userLang]?.trim() ? map[userLang] : null) ||
        map.en ||
        Object.values(map).find((v) => Boolean(v?.trim())) ||
        '';
      dbPage = {
        title: doc.title,
        content: localized,
      };
    }
  } catch {
    // Fallback when DB not configured
  }

  const fallbackPage = FALLBACK_BY_SLUG.get(canonicalSlug) || FALLBACK_BY_SLUG.get(rawSlug);
  const pageData = dbPage || (fallbackPage ? { title: fallbackPage.title, content: fallbackPage.content } : {
    title: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    content: 'This documentation page can be customized inside Admin Panel -> Static Pages.',
  });

  return (
    <AppShell hideMobileHeader>
      <div className="sticky top-0 z-20 pt-safe px-safe bg-bg-pr/95 backdrop-blur-md border-b border-bord-pr">
        <div className="px-4 py-3 flex items-center gap-2">
          <Link href="/" className="md:hidden p-1.5 -ml-1.5 rounded-full text-lab-pr hover:bg-fill-tr shrink-0" aria-label="Back to home">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2">
            {canonicalSlug === 'developers-api' ? (
              <Code2 className="h-5 w-5 text-lab-pr2" />
            ) : (
              <FileText className="h-5 w-5 text-lab-pr2" />
            )}
            <h1 className="text-title-3 font-bold text-lab-pr">{pageData.title}</h1>
          </div>
        </div>
      </div>

      <article className="p-6 space-y-5">
        <div className="prose prose-sm max-w-none text-lab-pr whitespace-pre-wrap leading-relaxed">
          {pageData.content}
        </div>

        {canonicalSlug === 'developers-api' && (
          <div className="rounded-2xl border border-bord-pr bg-fill-pr p-4 space-y-3">
            <h2 className="font-bold text-par-m text-lab-pr">OpenAPI 3.1 Specification</h2>
            <p className="text-par-n text-lab-sc">
              Inspect the machine-readable OpenAPI JSON schema at{' '}
              <a href="/api/v1/docs" target="_blank" className="text-brand-900 underline font-mono">
                /api/v1/docs
              </a>
              .
            </p>
            <pre className="rounded-xl bg-bg-pr border border-bord-pr p-3 text-cap-s font-mono overflow-x-auto">
              {`curl -H "X-API-Key: weto_live_YOUR_KEY" \\
  ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/v1/posts?mode=trending`}
            </pre>
          </div>
        )}
      </article>
    </AppShell>
  );
}
