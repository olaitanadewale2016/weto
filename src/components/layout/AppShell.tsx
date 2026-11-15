'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  Bookmark,
  Briefcase,
  Building2,
  ChevronDown,
  CirclePlus,
  Compass,
  FilePlus2,
  Hash,
  Home,
  Keyboard,
  LogIn,
  LogOut,
  MessageCircle,
  Moon,
  MoreHorizontal,
  PlusSquare,
  Radio,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sun,
  User as UserIcon,
  Users,
  Wallet,
} from 'lucide-react';
import { useApp } from '@/components/providers/AppContext';
import { Avatar } from '@/components/ui/avatar';
import { ActionSheet, ActionSheetGroup, ActionSheetItem } from '@/components/mobile/ActionSheet';
import { RightRail } from './RightRail';
import { Soundbar } from './Soundbar';
import { AccountSwitcherModal } from '@/components/modals/AccountSwitcherModal';
import { HotkeysModal } from '@/components/modals/HotkeysModal';
import { DeviceSwitcherOverlay } from './DeviceSwitcherOverlay';
import { cn } from '@/lib/utils';

export function AppShell({
  children,
  hideRightRail = false,
  fullWidth = false,
  hideMobileChrome = false,
  hideDesktopSidebar = false,
}: {
  children: React.ReactNode;
  hideRightRail?: boolean;
  fullWidth?: boolean;
  hideMobileChrome?: boolean;
  hideDesktopSidebar?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, bootstrap, theme, toggleTheme, counters, logout, dict } = useApp();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [mobileCreateOpen, setMobileCreateOpen] = useState(false);
  const [mobileHeaderMenuOpen, setMobileHeaderMenuOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const features = bootstrap?.config?.features;
  const isAdmin = user?.role === 'root' || user?.role === 'admin' || user?.role === 'moderator';
  const appName = bootstrap?.config?.appName || 'Weto';

  // Close More dropdown on outside click
  useEffect(() => {
    if (!moreMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [moreMenuOpen]);

  // Global keyboard shortcuts matching ColibriPlus hotkeys
  useEffect(() => {
    let waitingForG = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        setHotkeysOpen(true);
        return;
      }

      if (e.key.toLowerCase() === 'g') {
        waitingForG = true;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          waitingForG = false;
        }, 900);
        return;
      }

      if (waitingForG) {
        waitingForG = false;
        const k = e.key.toLowerCase();
        if (k === 'h') router.push('/');
        else if (k === 'e') router.push('/explore');
        else if (k === 'm') router.push('/messenger');
        else if (k === 'n') router.push('/notifications');
        else if (k === 'b') router.push('/bookmarks');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (timer) clearTimeout(timer);
    };
  }, [router]);

  // Exact ApplicationNavbar.vue order & items
  const navItems = [
    { href: '/', label: dict.nav.home, icon: Home, show: true },
    { href: '/explore', label: dict.nav.explore, icon: Hash, show: true },
    {
      href: '/notifications',
      label: dict.nav.notifications,
      icon: Bell,
      badge: counters.unreadNotifications,
      show: Boolean(user),
    },
    {
      href: '/messenger',
      label: dict.nav.messenger,
      icon: MessageCircle,
      badge: counters.unreadMessages,
      show: Boolean(user),
    },
    {
      href: '/marketplace',
      label: dict.nav.marketplace,
      icon: ShoppingBag,
      show: features?.marketplace !== false,
    },
    {
      href: '/jobs',
      label: dict.nav.jobs,
      icon: Briefcase,
      show: features?.jobs !== false,
    },
    {
      href: user ? `/@${user.username}` : '/auth/login',
      label: user ? dict.nav.profile : 'Sign in',
      icon: user ? UserIcon : LogIn,
      matchPrefix: user ? `/u/${user.username}` : '/auth/login',
      show: true,
    },
  ].filter((item) => item.show);

  const logoSrc =
    theme === 'dark'
      ? bootstrap?.config?.logos?.dark || '/assets/logos/dark.png'
      : bootstrap?.config?.logos?.light || '/assets/logos/light.png';

  const mobileTitle =
    pathname === '/'
      ? dict.nav.home
      : pathname.startsWith('/explore')
        ? dict.nav.explore
        : pathname.startsWith('/messenger')
          ? dict.nav.messenger
          : pathname.startsWith('/notifications')
            ? dict.nav.notifications
            : pathname.startsWith('/marketplace')
              ? dict.nav.marketplace
              : pathname.startsWith('/jobs')
                ? dict.nav.jobs
                : pathname.startsWith('/wallet')
                  ? dict.nav.wallet
                  : pathname.startsWith('/settings')
                    ? dict.nav.settings
                    : appName;

  return (
    <div className="min-h-screen bg-bg-pr text-lab-pr">
      {/* Mobile Sticky Top Header matching mobile/components/layout/ApplicationHeader.vue */}
      {!hideMobileChrome && (
        <header className="md:hidden sticky top-0 z-40 pt-safe px-safe bg-bg-pr/95 backdrop-blur-xs border-b border-bord-tr">
          <div className="min-h-14 px-4 sm:px-5 py-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setMobileHeaderMenuOpen(true)}
              className="flex items-center gap-2 min-w-0 cursor-pointer"
              aria-label="Open navigation menu"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoSrc} alt={appName} className="h-6 w-auto object-contain shrink-0" />
              <h4 className="text-title-3 font-medium text-lab-pr truncate">{mobileTitle}</h4>
              <ChevronDown className="size-4 text-lab-pr3 shrink-0" />
            </button>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={toggleTheme}
                className="size-9 rounded-full hover:bg-fill-qt flex items-center justify-center text-lab-pr2 cursor-pointer"
                aria-label="Toggle color theme"
              >
                {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
              </button>
              {user ? (
                <Link
                  href="/notifications"
                  className="relative size-9 rounded-full hover:bg-fill-qt flex items-center justify-center text-lab-pr2"
                  aria-label="Notifications"
                >
                  <Bell className="size-5" />
                  {counters.unreadNotifications > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-brand-900 text-white text-[10px] font-bold flex items-center justify-center px-1">
                      {counters.unreadNotifications > 99 ? '99+' : counters.unreadNotifications}
                    </span>
                  )}
                </Link>
              ) : (
                <Link
                  href="/auth/login"
                  className="text-par-s font-semibold leading-none bg-lab-pr2 text-bg-pr px-4 py-2 rounded-full smoothing hover:opacity-90"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </header>
      )}

      {/* Desktop Fixed Left Sidebar matching ApplicationSidebar.vue (340px w-page-offset, NO right border) */}
      {!hideDesktopSidebar && (
        <aside className="hidden md:flex fixed left-0 top-0 bottom-0 z-40 w-[260px] xl:w-[340px]">
          {/* Left ActionBar gutter (ApplicationActionBar.vue) */}
          <div className="hidden xl:flex pl-6 shrink-0">
            <div className="flex w-[56px] flex-col h-full justify-end items-center pb-6" />
          </div>

          {/* Main Nav Column */}
          <div className="flex-1 h-full shrink-0 flex flex-col pt-6 px-6 overflow-y-auto hidden-scroll">
            {/* Logo Header — exact ApplicationSidebar.vue */}
            <div className="mb-4">
              <Link href="/" className="inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoSrc} alt={appName} className="h-7 w-auto object-contain" />
              </Link>
            </div>

            {/* Primary Navigation — exact ApplicationNavbar.vue (22px icons, text-[19px], gap-3) */}
            <nav className="flex flex-col gap-3">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.matchPrefix
                  ? pathname.startsWith(item.matchPrefix)
                  : item.href === '/'
                    ? pathname === '/'
                    : pathname.startsWith(item.href);

                return (
                  <Link key={item.href} href={item.href} className="block">
                    <div
                      className={cn(
                        'flex items-center py-0.5 transition-opacity',
                        isActive ? 'sidenav-active' : 'sidenav-inactive hover:opacity-100 opacity-85'
                      )}
                    >
                      <span className="size-[22px] shrink-0 text-lab-pr">
                        <Icon
                          className={cn('size-[22px]', isActive ? 'text-lab-pr stroke-[2.25]' : 'text-lab-pr2 stroke-[1.75]')}
                        />
                      </span>
                      <span className="ml-3 text-[20px] leading-6 inline-flex items-center gap-2 truncate">
                        {item.label}
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-brand-900 text-white text-cap-s font-semibold px-1.5 leading-none">
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        )}
                      </span>
                    </div>
                  </Link>
                );
              })}

              {/* Hairline Divider matching ApplicationNavbar.vue */}
              <div className="block pl-[22px] pr-6 py-1">
                <span className="block bg-bord-sc h-px mx-3" />
              </div>

              {/* More Dropdown matching NavbarDropdown.vue */}
              <div ref={moreRef} className="relative leading-none">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMoreMenuOpen((o) => !o);
                  }}
                  className="flex items-center opacity-55 hover:opacity-100 text-lab-pr2 cursor-pointer transition-opacity"
                >
                  <span className="size-[22px] shrink-0">
                    <MoreHorizontal className="size-[22px]" />
                  </span>
                  <span className="text-[20px] leading-6 ml-3">More</span>
                </button>

                {moreMenuOpen && (
                  <div
                    onClick={() => setMoreMenuOpen(false)}
                    className="absolute bottom-full mb-2 left-0 py-2 overflow-hidden min-w-60 divide-y divide-fill-sc rounded-md backdrop-blur-xs bg-bg-pr/95 shadow-2xl border border-bord-tr z-50"
                  >
                    {isAdmin && (
                      <div className="py-1">
                        <Link
                          href="/admin"
                          className="flex items-center gap-2.5 px-3 py-2 text-par-n text-lab-pr2 hover:bg-fill-qt"
                        >
                          <ShieldCheck className="size-4 text-lab-sc" />
                          <span>{dict.nav.admin}</span>
                        </Link>
                      </div>
                    )}

                    <div className="py-1">
                      {user && (
                        <>
                          <Link
                            href="/settings"
                            className="flex items-center gap-2.5 px-3 py-2 text-par-n text-lab-pr2 hover:bg-fill-qt"
                          >
                            <Settings className="size-4 text-lab-sc" />
                            <span>Account settings</span>
                          </Link>
                          {features?.wallet !== false && (
                            <Link
                              href="/wallet"
                              className="flex items-center gap-2.5 px-3 py-2 text-par-n text-lab-pr2 hover:bg-fill-qt"
                            >
                              <Wallet className="size-4 text-lab-sc" />
                              <span>{dict.nav.wallet}</span>
                            </Link>
                          )}
                          {features?.businessAccounts !== false && (
                            <Link
                              href="/business"
                              className="flex items-center gap-2.5 px-3 py-2 text-par-n text-lab-pr2 hover:bg-fill-qt"
                            >
                              <Building2 className="size-4 text-lab-sc" />
                              <span>{dict.nav.business}</span>
                            </Link>
                          )}
                          <Link
                            href="/bookmarks"
                            className="flex items-center gap-2.5 px-3 py-2 text-par-n text-lab-pr2 hover:bg-fill-qt"
                          >
                            <Bookmark className="size-4 text-lab-sc" />
                            <span>{dict.nav.bookmarks}</span>
                          </Link>
                          <Link
                            href="/new/story"
                            className="flex items-center gap-2.5 px-3 py-2 text-par-n text-lab-pr2 hover:bg-fill-qt"
                          >
                            <PlusSquare className="size-4 text-lab-sc" />
                            <span>Create story</span>
                          </Link>
                        </>
                      )}
                      <Link
                        href="/live-stream"
                        className="flex items-center gap-2.5 px-3 py-2 text-par-n text-lab-pr2 hover:bg-fill-qt"
                      >
                        <Radio className="size-4 text-lab-sc" />
                        <span>Live streams</span>
                      </Link>
                    </div>

                    <div className="py-1">
                      <button
                        type="button"
                        onClick={toggleTheme}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-par-n text-lab-pr2 hover:bg-fill-qt cursor-pointer"
                      >
                        {theme === 'dark' ? (
                          <Sun className="size-4 text-lab-sc" />
                        ) : (
                          <Moon className="size-4 text-lab-sc" />
                        )}
                        <span>{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setHotkeysOpen(true)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-par-n text-lab-pr2 hover:bg-fill-qt cursor-pointer"
                      >
                        <Keyboard className="size-4 text-lab-sc" />
                        <span>Keyboard shortcuts</span>
                      </button>
                      {user && (
                        <button
                          type="button"
                          onClick={() => setSwitcherOpen(true)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-par-n text-lab-pr2 hover:bg-fill-qt cursor-pointer"
                        >
                          <Users className="size-4 text-lab-sc" />
                          <span>Switch account</span>
                        </button>
                      )}
                    </div>

                    {user && (
                      <div className="py-1">
                        <button
                          type="button"
                          onClick={logout}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-par-n text-red-900 hover:bg-fill-qt cursor-pointer"
                        >
                          <LogOut className="size-4" />
                          <span>Log out</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </nav>

            {/* Exact ApplicationFooter.vue at bottom of sidebar */}
            <div className="mt-auto mb-4 pt-6">
              <div className="flex flex-wrap mb-2 leading-5">
                {features?.businessAccounts !== false && (
                  <Link href="/business" className="hover:underline text-cap-s text-lab-sc mr-2">
                    Business account
                  </Link>
                )}
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="hover:underline text-cap-s text-lab-sc mr-2 cursor-pointer"
                >
                  Theme
                </button>
                {features?.jobs !== false && (
                  <Link href="/jobs" className="hover:underline text-cap-s text-lab-sc mr-2">
                    Jobs
                  </Link>
                )}
                <Link href="/document/help-center" className="hover:underline text-cap-s text-lab-sc mr-2">
                  Help center
                </Link>
                <Link href="/api/v1/docs" target="_blank" className="hover:underline text-cap-s text-lab-sc mr-2">
                  API
                </Link>
                <Link href="/document/privacy-policy" className="hover:underline text-cap-s text-lab-sc mr-2">
                  Privacy policy
                </Link>
                <Link href="/document/cookies-policy" className="hover:underline text-cap-s text-lab-sc mr-2">
                  Cookies policy
                </Link>
                <Link href="/document/terms-of-use" className="hover:underline text-cap-s text-lab-sc mr-2">
                  Terms
                </Link>
                {user && (
                  <Link href="/settings" className="hover:underline text-cap-s text-lab-sc mr-2">
                    Language
                  </Link>
                )}
              </div>
              <div className="leading-5">
                <span className="text-cap-s text-lab-sc">
                  {appName} &copy; {new Date().getFullYear()}
                </span>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* Main Content Wrapper matching ApplicationMainLayout (ml-page-offset) */}
      <div
        className={cn(
          'flex-1 min-w-0',
          !hideDesktopSidebar && 'md:ml-[260px] xl:ml-[340px]',
          hideDesktopSidebar ? 'md:pb-0' : 'md:pb-6',
          hideMobileChrome ? 'pb-0' : 'pb-[calc(5rem+env(safe-area-inset-bottom))]'
        )}
      >
        {fullWidth || hideRightRail ? (
          <main className={cn('min-h-screen', fullWidth && !hideDesktopSidebar ? 'max-w-[1280px]' : 'w-full')}>
            {children}
          </main>
        ) : (
          /* Exact SidedContentLayout (w-sided-content = 960px, flex gap-6, w-content = 600px border-x border-bord-tr + sticky sidebar) */
          <div className="w-full max-w-[984px] flex gap-6">
            <main className="w-full max-w-[600px] min-w-0 border-x border-bord-tr min-h-screen">
              {children}
            </main>
            <RightRail />
          </div>
        )}
      </div>

      {/* Mobile Bottom Navigation matching mobile/components/layout/ApplicationNavbar.vue */}
      {!hideMobileChrome && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-bg-pr border-t border-bord-tr pb-safe pb-safe-standalone px-safe">
          <div className="grid grid-cols-5 h-14 px-2 items-center">
            <Link href="/" className="flex items-center justify-center text-lab-pr">
              <Home className={cn('size-5', pathname === '/' ? 'stroke-[2.5]' : 'stroke-[1.75] text-lab-sc')} />
            </Link>
            <Link href="/explore" className="flex items-center justify-center text-lab-pr">
              <Search className={cn('size-5', pathname.startsWith('/explore') ? 'stroke-[2.5]' : 'stroke-[1.75] text-lab-sc')} />
            </Link>
            <button
              type="button"
              onClick={() => setMobileCreateOpen((v) => !v)}
              className="flex items-center justify-center text-lab-pr cursor-pointer"
              aria-label="Create"
            >
              <PlusSquare className="size-5 stroke-[1.75]" />
            </button>
            <Link
              href={user ? '/messenger' : '/auth/login'}
              className="relative flex items-center justify-center text-lab-pr"
            >
              <MessageCircle className={cn('size-5', pathname.startsWith('/messenger') ? 'stroke-[2.5]' : 'stroke-[1.75] text-lab-sc')} />
              {counters.unreadMessages > 0 && (
                <span className="absolute top-2 right-5 min-w-[16px] h-4 rounded-full bg-brand-900 text-white text-[10px] font-bold flex items-center justify-center px-1">
                  {counters.unreadMessages > 99 ? '99+' : counters.unreadMessages}
                </span>
              )}
            </Link>
            <Link
              href={user ? `/@${user.username}` : '/auth/login'}
              className="flex items-center justify-center"
            >
              {user ? (
                <div className="inline-flex border border-bord-card items-center justify-center size-6 rounded-full overflow-hidden">
                  <Avatar src={user.avatar} alt={user.username} size="xs" className="size-full" />
                </div>
              ) : (
                <Compass className="size-5 text-lab-sc" />
              )}
            </Link>
          </div>
        </nav>
      )}

      {/* Mobile Create ActionSheet (ApplicationNavbar.vue) */}
      <ActionSheet open={mobileCreateOpen} onClose={() => setMobileCreateOpen(false)}>
        <ActionSheetGroup>
          <ActionSheetItem
            label="New Publication"
            icon={FilePlus2}
            onClick={() => {
              setMobileCreateOpen(false);
              router.push('/new/post');
            }}
          />
          <ActionSheetItem
            label="New Story"
            icon={CirclePlus}
            onClick={() => {
              setMobileCreateOpen(false);
              router.push('/new/story');
            }}
          />
        </ActionSheetGroup>
      </ActionSheet>

      {/* Mobile Full Screen Directory HeaderMenu ActionSheet (HeaderMenu.vue) */}
      <ActionSheet open={mobileHeaderMenuOpen} onClose={() => setMobileHeaderMenuOpen(false)}>
        <div className="space-y-4">
          <ActionSheetGroup>
            {features?.marketplace !== false && (
              <ActionSheetItem
                label={dict.nav.marketplace}
                icon={ShoppingBag}
                onClick={() => {
                  setMobileHeaderMenuOpen(false);
                  router.push('/marketplace');
                }}
              />
            )}
            {features?.jobs !== false && (
              <ActionSheetItem
                label={dict.nav.jobs}
                icon={Briefcase}
                onClick={() => {
                  setMobileHeaderMenuOpen(false);
                  router.push('/jobs');
                }}
              />
            )}
            <ActionSheetItem
              label={dict.nav.bookmarks}
              icon={Bookmark}
              onClick={() => {
                setMobileHeaderMenuOpen(false);
                router.push('/bookmarks');
              }}
            />
            {user && features?.wallet !== false && (
              <ActionSheetItem
                label={dict.nav.wallet}
                icon={Wallet}
                onClick={() => {
                  setMobileHeaderMenuOpen(false);
                  router.push('/wallet');
                }}
              />
            )}
          </ActionSheetGroup>

          {user && (
            <ActionSheetGroup>
              {features?.businessAccounts !== false && (
                <ActionSheetItem
                  label="Business account"
                  icon={Building2}
                  onClick={() => {
                    setMobileHeaderMenuOpen(false);
                    router.push('/business');
                  }}
                />
              )}
              {isAdmin && (
                <ActionSheetItem
                  label="Admin control panel"
                  icon={ShieldCheck}
                  onClick={() => {
                    setMobileHeaderMenuOpen(false);
                    router.push('/admin');
                  }}
                />
              )}
              <ActionSheetItem
                label={dict.nav.settings}
                icon={Settings}
                onClick={() => {
                  setMobileHeaderMenuOpen(false);
                  router.push('/settings');
                }}
              />
              <ActionSheetItem
                label="Switch account"
                icon={Users}
                onClick={() => {
                  setMobileHeaderMenuOpen(false);
                  setSwitcherOpen(true);
                }}
              />
              <ActionSheetItem
                label={theme === 'dark' ? 'Light theme' : 'Dark theme'}
                icon={theme === 'dark' ? Sun : Moon}
                onClick={() => {
                  toggleTheme();
                  setMobileHeaderMenuOpen(false);
                }}
              />
              <ActionSheetItem
                label={dict.nav.logout}
                icon={LogOut}
                danger
                onClick={() => {
                  setMobileHeaderMenuOpen(false);
                  logout();
                }}
              />
            </ActionSheetGroup>
          )}
        </div>
      </ActionSheet>

      <Soundbar />
      <DeviceSwitcherOverlay />
      <AccountSwitcherModal open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
      <HotkeysModal open={hotkeysOpen} onClose={() => setHotkeysOpen(false)} />
    </div>
  );
}
