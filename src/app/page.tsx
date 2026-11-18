'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Bookmark, ChevronDown, Flame, Globe, Home, Moon, Sun, Users } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { StoriesBar } from '@/components/feed/StoriesBar';
import { FeedList } from '@/components/feed/FeedList';
import { AccountSwitcherModal } from '@/components/modals/AccountSwitcherModal';
import { useApp } from '@/components/providers/AppContext';

export default function HomePage() {
  const { user, loading, theme, toggleTheme } = useApp();
  const [tab, setTab] = useState<'feed' | 'trending'>('feed');
  const [menuOpen, setMenuOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const pageTitle = user
    ? `Hello, ${user.firstName || user.username}!`
    : tab === 'trending'
      ? 'Trending'
      : 'Home';

  return (
    <AppShell>
      {/* Exact PageHeader.vue + HomeHeader.vue (Desktop sticky top header while scrolling) */}
      <div className="hidden md:flex sticky top-0 z-30 bg-bg-pr/95 backdrop-blur-md border-b border-bord-pr gap-2 items-center justify-between leading-none px-4 py-3.5">
        <div className="shrink-0">
          <h1 className="text-title-3 2xl:text-title-2 font-bold text-lab-pr2 leading-tight">
            {!user && loading && tab !== 'trending' ? (
              <span className="inline-block h-6 w-36 rounded-lg fb-shimmer align-middle" aria-label="Loading" />
            ) : (
              pageTitle
            )}
          </h1>
        </div>
        <div className="flex-1 flex justify-end items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="opacity-80 hover:opacity-100 p-1 rounded-full hover:bg-fill-qt text-lab-sc cursor-pointer"
              aria-label="Feed options"
            >
              <ChevronDown className="size-5" />
            </button>

            {menuOpen && (
              <div
                onMouseLeave={() => setMenuOpen(false)}
                className="absolute top-full right-0 mt-1 w-72 z-50 rounded-2xl border border-bord-pr bg-bg-pr/95 backdrop-blur-xs shadow-2xl divide-y divide-bord-tr overflow-hidden"
              >
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setTab('feed');
                      setMenuOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-fill-qt cursor-pointer ${
                      tab === 'feed' ? 'bg-fill-fv font-semibold text-lab-pr' : 'text-lab-pr2'
                    }`}
                  >
                    <Home className="size-4 text-lab-pr2" />
                    <div>
                      <p className="text-par-n font-medium">Following / Latest Feed</p>
                      <p className="text-cap-s text-lab-sc">Posts from people you follow</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTab('trending');
                      setMenuOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-fill-qt cursor-pointer ${
                      tab === 'trending' ? 'bg-fill-fv font-semibold text-lab-pr' : 'text-lab-pr2'
                    }`}
                  >
                    <Flame className="size-4 text-lab-pr2" />
                    <div>
                      <p className="text-par-n font-medium">Trending</p>
                      <p className="text-cap-s text-lab-sc">Popular publications right now</p>
                    </div>
                  </button>
                </div>

                <div className="py-1">
                  {user && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setSwitcherOpen(true);
                      }}
                      className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-fill-qt text-lab-pr2 cursor-pointer"
                    >
                      <Users className="size-4 text-lab-sc" />
                      <div>
                        <p className="text-par-n font-medium">Switch account</p>
                        <p className="text-cap-s text-lab-sc">Manage linked accounts</p>
                      </div>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      toggleTheme();
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-fill-qt text-lab-pr2 cursor-pointer"
                  >
                    {theme === 'dark' ? (
                      <Sun className="size-4 text-lab-sc" />
                    ) : (
                      <Moon className="size-4 text-lab-sc" />
                    )}
                    <div>
                      <p className="text-par-n font-medium">Theme</p>
                      <p className="text-cap-s text-lab-sc">
                        Switch to {theme === 'dark' ? 'light' : 'dark'} appearance
                      </p>
                    </div>
                  </button>
                  {user && (
                    <Link
                      href="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="px-4 py-2.5 flex items-center gap-3 hover:bg-fill-qt text-lab-pr2"
                    >
                      <Globe className="size-4 text-lab-sc" />
                      <div>
                        <p className="text-par-n font-medium">Language</p>
                        <p className="text-cap-s text-lab-sc">Change interface language</p>
                      </div>
                    </Link>
                  )}
                  {user && (
                    <Link
                      href="/bookmarks"
                      onClick={() => setMenuOpen(false)}
                      className="px-4 py-2.5 flex items-center gap-3 hover:bg-fill-qt text-lab-pr2"
                    >
                      <Bookmark className="size-4 text-lab-sc" />
                      <div>
                        <p className="text-par-n font-medium">Bookmarks</p>
                        <p className="text-cap-s text-lab-sc">Saved publications</p>
                      </div>
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="pt-1 pb-2">
        <StoriesBar />
      </div>
      <div className="h-2 bg-fill-fv/40 border-y border-bord-tr/60" />
      <FeedList mode={tab} composerEnabled={Boolean(user)} />

      <AccountSwitcherModal open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
    </AppShell>
  );
}
