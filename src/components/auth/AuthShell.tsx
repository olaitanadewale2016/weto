'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Globe } from 'lucide-react';
import { useApp } from '@/components/providers/AppContext';
import { SUPPORTED_LOCALES } from '@/lib/i18n';

export function AuthShell({
  children,
  heading,
  subheading,
}: {
  children: React.ReactNode;
  heading?: string;
  subheading?: string;
}) {
  const { user, bootstrap, theme, setTheme, locale, setLocale } = useApp();
  const [langOpen, setLangOpen] = useState(false);

  const logoSrc =
    theme === 'dark'
      ? bootstrap?.config?.logos?.dark || '/assets/logos/dark.png'
      : bootstrap?.config?.logos?.light || '/assets/logos/light.png';

  const appName = bootstrap?.config?.appName || 'Weto';
  const availableLocales = (
    bootstrap?.locales && bootstrap.locales.length > 0
      ? bootstrap.locales.map((l) => ({
          code: (l.code || l.alpha2Code || 'en').toLowerCase(),
          name: l.nativeName || l.name,
        }))
      : SUPPORTED_LOCALES.map((l) => ({ code: l.code, name: l.nativeName }))
  );
  const currentLangName =
    availableLocales.find((l) => l.code === locale)?.name || 'English';

  return (
    <div className="min-h-[100dvh] bg-bg-pr flex flex-col justify-between" style={{ minWidth: 320 }}>
      {/* Exact PHP MPA Auth Fixed Top Header */}
      <header className="fixed top-0 left-0 right-0 z-30 pt-safe px-safe bg-bg-pr/90 backdrop-blur-xs border-b border-bord-tr/40">
        <div className="h-14 flex justify-between px-4 md:px-8 items-center relative">
          <div className="text-lab-pr text-par-m font-medium hidden md:block">
            {user ? `Hi, ${user.firstName}!` : 'Hi there! 👋'}
          </div>

          <Link href="/" className="absolute left-1/2 -translate-x-1/2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} alt={appName} className="h-7 w-auto object-contain" />
          </Link>

          <div className="inline-flex gap-5 text-lab-pr font-medium items-center ml-auto relative">
            <button
              type="button"
              onClick={() => setLangOpen((o) => !o)}
              className="block leading-none cursor-pointer"
            >
              <span className="items-center gap-1 hidden md:flex">
                <span className="text-par-m">{currentLangName}</span>
                <ChevronDown className="size-4 shrink-0" />
              </span>
              <span className="inline-block md:hidden">
                <Globe className="size-[18px]" />
              </span>
            </button>

            {langOpen && (
              <div
                onMouseLeave={() => setLangOpen(false)}
                className="absolute top-full right-0 mt-2 rounded-md overflow-hidden min-w-60 shadow-md z-40 bg-bg-pr/85 backdrop-blur-xs divide-y divide-fill-tr border border-bord-tr"
              >
                {availableLocales.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => {
                      setLocale(lang.code);
                      setLangOpen(false);
                    }}
                    className={`w-full text-left block px-4 py-2 hover:bg-fill-qt transition-colors text-lab-pr2 text-par-s cursor-pointer ${
                      lang.code === locale ? 'bg-fill-qt font-medium' : ''
                    }`}
                  >
                    {lang.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Centered Auth Content (400px max, fits view height on desktop & mobile) */}
      <main className="flex-1 flex flex-col justify-center items-center pt-16 pb-4 px-4 overflow-y-auto">
        <div className="auth-content w-full max-w-[400px] my-auto">
          {(heading || subheading) && (
            <div className="mb-4 sm:mb-5 text-center">
              {heading && (
                <h1 className="text-title-2 text-lab-pr2 font-semibold">{heading}</h1>
              )}
              {subheading && <p className="text-par-m text-lab-sc mt-0.5">{subheading}</p>}
            </div>
          )}
          {children}
        </div>
      </main>

      {/* Compact Auth Footer (Fits within single viewport) */}
      <footer className="shrink-0 py-3 sm:py-4 px-4 md:px-8 border-t border-bord-tr/40 bg-bg-pr/80" style={{ minWidth: 320 }}>
        <div className="app-container mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <nav className="flex flex-wrap justify-center sm:justify-start gap-x-3.5 gap-y-1">
            <Link href="/document/about" className="text-cap-s sm:text-par-s text-lab-pr2 hover:text-brand-900 smoothing">
              About project
            </Link>
            <Link href="/document/help-center" className="text-cap-s sm:text-par-s text-lab-pr2 hover:text-brand-900 smoothing">
              Help center
            </Link>
            <Link href="/document/terms-of-use" className="text-cap-s sm:text-par-s text-lab-pr2 hover:text-brand-900 smoothing">
              Terms of use
            </Link>
            <Link href="/document/privacy-policy" className="text-cap-s sm:text-par-s text-lab-pr2 hover:text-brand-900 smoothing">
              Privacy policy
            </Link>
            <Link href="/document/cookies-policy" className="text-cap-s sm:text-par-s text-lab-pr2 hover:text-brand-900 smoothing">
              Cookies policy
            </Link>
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="text-cap-s sm:text-par-s text-lab-pr2 hover:text-brand-900 smoothing cursor-pointer"
            >
              {theme === 'dark' ? 'Light theme' : 'Dark theme'}
            </button>
          </nav>
          <span className="text-cap-s text-lab-sc shrink-0">
            &copy; {new Date().getFullYear()} {appName}
          </span>
        </div>
      </footer>
    </div>
  );
}
