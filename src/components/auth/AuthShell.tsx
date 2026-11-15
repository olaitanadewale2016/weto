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
    <div className="min-h-screen bg-bg-pr pt-14 flex flex-col" style={{ minWidth: 320 }}>
      {/* Exact PHP MPA Auth Fixed Top Header */}
      <header className="fixed top-0 left-0 right-0 z-30 bg-bg-pr/80 backdrop-blur-xs">
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

      {/* Main Centered Auth Content (400px max on small viewports, borderless matching PHP auth.css) */}
      <div className="flex-col flex flex-1">
        <div className="flex justify-center py-12 md:py-24 px-4 flex-1">
          <div className="auth-content w-full max-w-[400px]">
            {(heading || subheading) && (
              <div className="mb-6 text-center">
                {heading && (
                  <h1 className="text-title-2 text-lab-pr2 font-semibold">{heading}</h1>
                )}
                {subheading && <p className="text-par-m text-lab-sc mt-1">{subheading}</p>}
              </div>
            )}
            {children}
          </div>
        </div>

        {/* Exact PHP MPA Footer */}
        <footer className="pb-4 pt-6 flex" style={{ minWidth: 320 }}>
          <div className="app-container mx-auto flex-1 px-4 md:px-8">
            <nav className="flex flex-wrap gap-2 md:gap-4">
              <Link href="/document/about" className="text-par-s text-lab-pr2 hover:text-brand-900 smoothing">
                About project
              </Link>
              <Link href="/document/help-center" className="text-par-s text-lab-pr2 hover:text-brand-900 smoothing">
                Help center
              </Link>
              <Link href="/document/terms-of-use" className="text-par-s text-lab-pr2 hover:text-brand-900 smoothing">
                Terms of use
              </Link>
              <Link href="/document/privacy-policy" className="text-par-s text-lab-pr2 hover:text-brand-900 smoothing">
                Privacy policy
              </Link>
              <Link href="/document/cookies-policy" className="text-par-s text-lab-pr2 hover:text-brand-900 smoothing">
                Cookies policy
              </Link>
              <Link href="/document/developers-api" className="text-par-s text-lab-pr2 hover:text-brand-900 smoothing">
                Developers
              </Link>
              <button
                type="button"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="text-par-s text-lab-pr2 hover:text-brand-900 smoothing cursor-pointer"
              >
                {theme === 'dark' ? 'Light theme' : 'Dark theme'}
              </button>
            </nav>
            <div className="h-px bg-fill-pr my-4" />
            <div className="block md:flex flex-wrap gap-4">
              <span className="text-par-s text-lab-pr2">
                Copyright &copy; {new Date().getFullYear()} {appName}
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
