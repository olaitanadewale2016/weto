'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  Download,
  FilePlus2,
  Gamepad2,
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
  RotateCcw,
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
import { clearBootstrapCache } from '@/components/providers/AppContext';
import { apiFetch } from '@/lib/api-client';
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
  const {
    user,
    loading,
    bootstrap,
    theme,
    toggleTheme,
    counters,
    logout,
    refreshBootstrap,
    dict,
    isPwaInstalled,
    promptPwaInstall,
  } = useApp();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switchingBack, setSwitchingBack] = useState(false);

  async function handleQuickSwitchBack() {
    if (!bootstrap?.previousAccount || switchingBack) return;
    setSwitchingBack(true);
    try {
      await apiFetch('/api/v1/auth/accounts', {
        method: 'POST',
        json: { action: 'switch_back' },
      });
      clearBootstrapCache();
      await refreshBootstrap();
      window.location.reload();
    } catch {
      setSwitchingBack(false);
      setSwitcherOpen(true);
    }
  }
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [moreMenuPos, setMoreMenuPos] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  }>({ left: 24, bottom: 80, maxHeight: 520 });
  const [mobileCreateOpen, setMobileCreateOpen] = useState(false);
  const [mobileHeaderMenuOpen, setMobileHeaderMenuOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreMenuPanelRef = useRef<HTMLDivElement>(null);

  const features = bootstrap?.config?.features;
  const isAdmin = user?.role === 'root' || user?.role === 'admin' || user?.role === 'moderator';
  const appName = bootstrap?.config?.appName || 'Weto';

  const updateMoreMenuPosition = useCallback(() => {
    if (!moreRef.current || typeof window === 'undefined') return;
    const rect = moreRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const left = Math.max(12, Math.min(rect.left, vw - 272));
    const spaceAbove = rect.top - 12;

    if (spaceAbove >= 480) {
      setMoreMenuPos({
        left,
        bottom: Math.max(12, vh - rect.top + 8),
        maxHeight: Math.max(240, vh - 24),
      });
    } else {
      setMoreMenuPos({
        left,
        bottom: 12,
        maxHeight: Math.max(240, vh - 24),
      });
    }
  }, []);

  // Close More dropdown on outside click & keep viewport-clamped on resize/scroll
  useEffect(() => {
    if (!moreMenuOpen) return;
    updateMoreMenuPosition();
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        moreRef.current &&
        !moreRef.current.contains(target) &&
        (!moreMenuPanelRef.current || !moreMenuPanelRef.current.contains(target))
      ) {
        setMoreMenuOpen(false);
      }
    };
    const onWindowChange = () => updateMoreMenuPosition();
    document.addEventListener('click', onDocClick);
    window.addEventListener('resize', onWindowChange);
    window.addEventListener('scroll', onWindowChange, true);
    return () => {
      document.removeEventListener('click', onDocClick);
      window.removeEventListener('resize', onWindowChange);
      window.removeEventListener('scroll', onWindowChange, true);
    };
  }, [moreMenuOpen, updateMoreMenuPosition]);

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
      href: '/games',
      label: 'Games',
      icon: Gamepad2,
      show: true,
    },
    {
      href: user ? `/@${user.username}` : loading ? '/' : '/auth/login',
      label: user ? dict.nav.profile : 'Sign in',
      icon: user || loading ? UserIcon : LogIn,
      matchPrefix: user ? `/u/${user.username}` : loading ? '/__loading__' : '/auth/login',
      isLoadingAuth: !user && loading,
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
                : pathname.startsWith('/games')
                  ? 'Games'
                  : pathname.startsWith('/wallet')
                    ? dict.nav.wallet
                    : pathname.startsWith('/settings')
                      ? dict.nav.settings
                      : appName;

  const viewportLocked = Boolean(fullWidth && hideDesktopSidebar);

  return (
    <div
      className={cn(
        'bg-bg-pr text-lab-pr',
        viewportLocked ? 'h-[100dvh] flex flex-col overflow-hidden' : 'min-h-screen'
      )}
    >
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

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <Link
                href="/games"
                className={cn(
                  'size-9 rounded-full hover:bg-fill-qt flex items-center justify-center transition-colors',
                  pathname.startsWith('/games')
                    ? 'text-brand-900 bg-brand-900/10'
                    : 'text-lab-pr2'
                )}
                aria-label="Play Games"
                title="Play Tic-Tac-Toe"
              >
                <Gamepad2 className="size-5" />
              </Link>
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
              ) : loading ? (
                <span className="size-9 rounded-full bg-fill-qt animate-pulse" aria-hidden="true" />
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

      {/* Centered Desktop Application Layout (Balanced Left & Right Margins) */}
      <div
        className={cn(
          'w-full flex justify-center',
          !viewportLocked && 'min-h-screen'
        )}
      >
        <div
          className={cn(
            'w-full flex',
            viewportLocked
              ? 'h-full flex-col'
              : 'max-w-[1260px] xl:max-w-[1300px] justify-center'
          )}
        >
          {/* Desktop Sticky Left Sidebar (Centered with Layout) */}
          {!hideDesktopSidebar && (
            <aside className="hidden md:flex sticky top-0 h-screen z-40 w-[240px] xl:w-[275px] shrink-0">
              {/* Main Nav Column */}
              <div className="flex-1 h-full shrink-0 flex flex-col pt-6 px-3 xl:px-5 overflow-y-auto hidden-scroll">
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
                        {item.isLoadingAuth ? (
                          <span className="inline-block h-4 w-20 rounded-md fb-shimmer" aria-hidden="true" />
                        ) : (
                          item.label
                        )}
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
                    ref={moreMenuPanelRef}
                    onClick={() => setMoreMenuOpen(false)}
                    style={{
                      left: moreMenuPos.left,
                      ...(moreMenuPos.top !== undefined
                        ? { top: moreMenuPos.top }
                        : { bottom: moreMenuPos.bottom }),
                      maxHeight: moreMenuPos.maxHeight,
                    }}
                    className="fixed py-2 overflow-y-auto overscroll-contain min-w-60 w-64 divide-y divide-fill-sc rounded-md backdrop-blur-xs bg-bg-pr/95 shadow-2xl border border-bord-tr z-[70]"
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
                        href="/games"
                        className="flex items-center gap-2.5 px-3 py-2 text-par-n text-lab-pr2 hover:bg-fill-qt"
                      >
                        <Gamepad2 className="size-4 text-lab-sc" />
                        <span>Games (Tic-Tac-Toe)</span>
                      </Link>
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
                      {bootstrap?.config?.pwaEnabled !== false && !isPwaInstalled && (
                        <button
                          type="button"
                          onClick={() => void promptPwaInstall()}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-par-n text-brand-900 font-medium hover:bg-fill-qt cursor-pointer"
                        >
                          <Download className="size-4 shrink-0" />
                          <span>Install app</span>
                        </button>
                      )}
                      {user && bootstrap?.previousAccount && (
                        <button
                          type="button"
                          disabled={switchingBack}
                          onClick={handleQuickSwitchBack}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-par-n text-brand-900 font-medium hover:bg-fill-qt cursor-pointer disabled:opacity-60"
                        >
                          <RotateCcw className="size-4 shrink-0" />
                          <span className="truncate">
                            Switch back to @{bootstrap.previousAccount.username}
                          </span>
                        </button>
                      )}
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

          {/* Main Content Wrapper */}
          <div
            className={cn(
              'flex-1 min-w-0',
              viewportLocked && 'min-h-0 flex flex-col overflow-hidden',
              hideDesktopSidebar ? 'md:pb-0' : 'md:pb-6',
              hideMobileChrome
                ? 'pb-0'
                : viewportLocked
                  ? 'pb-[calc(60px+env(safe-area-inset-bottom))] md:pb-0'
                  : 'pb-[calc(5rem+env(safe-area-inset-bottom))]'
            )}
          >
            {fullWidth || hideRightRail ? (
              <main
                className={cn(
                  viewportLocked ? 'flex-1 min-h-0 h-full overflow-hidden' : 'min-h-screen',
                  fullWidth && !hideDesktopSidebar ? 'max-w-[1280px]' : 'w-full'
                )}
              >
                {children}
              </main>
            ) : (
              /* Balanced SidedContentLayout centered with equal left & right margins */
              <div className="w-full flex gap-4 xl:gap-6 justify-center lg:justify-start">
                <main className="w-full max-w-[600px] min-w-0 border-x border-bord-tr min-h-screen shrink-0">
                  {children}
                </main>
                <RightRail />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation matching mobile/components/layout/ApplicationNavbar.vue */}
      {!hideMobileChrome && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-bg-pr border-t border-bord-tr pb-safe pb-safe-standalone px-safe">
          <div className="grid grid-cols-5 h-[60px] px-2 items-center">
            <Link href="/" className="flex items-center justify-center h-full text-lab-pr">
              <Home className={cn('size-[26px]', pathname === '/' ? 'stroke-[2.5]' : 'stroke-[1.75] text-lab-sc')} />
            </Link>
            <Link href="/explore" className="flex items-center justify-center h-full text-lab-pr">
              <Search className={cn('size-[26px]', pathname.startsWith('/explore') ? 'stroke-[2.5]' : 'stroke-[1.75] text-lab-sc')} />
            </Link>
            <button
              type="button"
              onClick={() => setMobileCreateOpen((v) => !v)}
              className="flex items-center justify-center h-full text-lab-pr cursor-pointer"
              aria-label="Create"
            >
              <PlusSquare className="size-[26px] stroke-[1.75]" />
            </button>
            <Link
              href={user ? '/messenger' : '/auth/login'}
              className="relative flex items-center justify-center h-full text-lab-pr"
            >
              <MessageCircle className={cn('size-[26px]', pathname.startsWith('/messenger') ? 'stroke-[2.5]' : 'stroke-[1.75] text-lab-sc')} />
              {counters.unreadMessages > 0 && (
                <span className="absolute top-2 right-[calc(50%-20px)] min-w-[16px] h-4 rounded-full bg-brand-900 text-white text-[10px] font-bold flex items-center justify-center px-1">
                  {counters.unreadMessages > 99 ? '99+' : counters.unreadMessages}
                </span>
              )}
            </Link>
            <Link
              href={user ? `/@${user.username}` : loading ? '/' : '/auth/login'}
              className="flex items-center justify-center h-full"
            >
              {user ? (
                <div className="inline-flex border border-bord-card items-center justify-center size-7 rounded-full overflow-hidden">
                  <Avatar src={user.avatar} alt={user.username} size="xs" className="size-full" />
                </div>
              ) : loading ? (
                <span className="size-7 rounded-full bg-fill-qt animate-pulse" aria-hidden="true" />
              ) : (
                <Compass className="size-[26px] text-lab-sc" />
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
          <ActionSheetItem
            label="Play Tic-Tac-Toe"
            icon={Gamepad2}
            onClick={() => {
              setMobileCreateOpen(false);
              router.push('/games');
            }}
          />
        </ActionSheetGroup>
      </ActionSheet>

      {/* Mobile Full Screen Directory HeaderMenu ActionSheet (HeaderMenu.vue) */}
      <ActionSheet open={mobileHeaderMenuOpen} onClose={() => setMobileHeaderMenuOpen(false)}>
        <div className="space-y-4">
          <ActionSheetGroup>
            <ActionSheetItem
              label="Games (Tic-Tac-Toe)"
              icon={Gamepad2}
              onClick={() => {
                setMobileHeaderMenuOpen(false);
                router.push('/games');
              }}
            />
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
              {bootstrap?.previousAccount && (
                <ActionSheetItem
                  label={`Switch back to @${bootstrap.previousAccount.username}`}
                  icon={RotateCcw}
                  onClick={() => {
                    setMobileHeaderMenuOpen(false);
                    void handleQuickSwitchBack();
                  }}
                />
              )}
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
              {bootstrap?.config?.pwaEnabled !== false && !isPwaInstalled && (
                <ActionSheetItem
                  label="Install app"
                  icon={Download}
                  onClick={() => {
                    setMobileHeaderMenuOpen(false);
                    void promptPwaInstall();
                  }}
                />
              )}
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
          {!user && bootstrap?.config?.pwaEnabled !== false && !isPwaInstalled && (
            <ActionSheetGroup>
              <ActionSheetItem
                label="Install app"
                icon={Download}
                onClick={() => {
                  setMobileHeaderMenuOpen(false);
                  void promptPwaInstall();
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
