'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  BadgeCheck,
  Bell,
  Briefcase,
  Building2,
  Coins,
  CreditCard,
  Crown,
  Database,
  FileText,
  Flag,
  FolderTree,
  Globe,
  HardDrive,
  HelpCircle,
  Home,
  KeyRound,
  Layers,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  Moon,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Sun,
  Users,
  Video,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { useApp } from '@/components/providers/AppContext';
import { cn } from '@/lib/utils';

export interface PortalNavItem {
  key: string;
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  onClick?: () => void;
  external?: boolean;
  dividerBefore?: boolean;
  dividerAfter?: boolean;
}

const BUSINESS_LINKS: PortalNavItem[] = [
  { key: 'overview', href: '/business', label: 'Overview', icon: LayoutDashboard },
  { key: 'ads', href: '/business/ads', label: 'Ad campaigns', icon: Megaphone },
  { key: 'market', href: '/business/market', label: 'Marketplace', icon: ShoppingBag },
  { key: 'jobs', href: '/business/jobs', label: 'Jobs', icon: Briefcase },
  { key: 'monetization', href: '/business/monetization', label: 'Monetization', icon: Coins },
  { key: 'wallet', href: '/business/wallet', label: 'Wallet', icon: Wallet, dividerBefore: true },
  { key: 'notifications', href: '/business/notifications', label: 'Alerts', icon: Bell },
  { key: 'settings', href: '/business/settings', label: 'Account settings', icon: Settings },
  { key: 'help', href: '/document/help-center', label: 'Help center', icon: HelpCircle, dividerBefore: true },
];

export const ADMIN_NAV_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  overview: LayoutDashboard,
  lab: Wrench,
  users: Users,
  posts: FileText,
  comments: MessageSquare,
  stories: Video,
  marketplace: ShoppingBag,
  jobs: Briefcase,
  businesses: Building2,
  chats: MessageSquare,
  ads: Megaphone,
  reports: Flag,
  moderation_history: ShieldCheck,
  banning: ShieldAlert,
  authorship: Crown,
  verification: BadgeCheck,
  payments: CreditCard,
  cashouts: ArrowUpRight,
  acquiring: Wallet,
  categories: FolderTree,
  currencies: Database,
  locales: Globe,
  static_pages: Layers,
  settings: Settings,
  storage: HardDrive,
  audit_logs: FileText,
  api_keys: KeyRound,
};

interface PortalShellProps {
  portal: 'business' | 'admin';
  navItems?: PortalNavItem[];
  headerControls?: React.ReactNode;
  activeHeading?: string;
  children: React.ReactNode;
}

export function PortalShell({
  portal,
  navItems,
  headerControls,
  activeHeading,
  children,
}: PortalShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, bootstrap, theme, setTheme, logout } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const logoSrc =
    theme === 'dark'
      ? bootstrap?.config?.logos?.dark || '/assets/logos/dark.png'
      : bootstrap?.config?.logos?.light || '/assets/logos/light.png';
  const portalTitle = portal === 'admin' ? 'Admin panel' : 'Business account';
  const homeHref = portal === 'admin' ? '/admin' : '/business';

  const items: PortalNavItem[] =
    navItems ||
    BUSINESS_LINKS.map((item) => ({
      ...item,
      active: pathname === item.href,
    }));
  const resolvedHeading = activeHeading || items.find((i) => i.active)?.label;

  async function handleLogout() {
    await logout();
    router.push('/auth/login');
  }

  function renderNavContent(onSelect?: () => void) {
    return (
      <div className="flex flex-col h-full">
        {/* Pinned top-left Logo & Portal Label — always sticky/anchored when scrolling nav items */}
        <div className="shrink-0 bg-bg-pr/95 backdrop-blur-sm pl-6 pr-6 pt-5 pb-4 border-b border-bord-tr/60 flex items-center justify-between">
          <Link href={homeHref} className="flex items-center gap-2 min-w-0" onClick={onSelect}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="h-5 w-auto object-contain shrink-0" src={logoSrc} alt="Weto" />
            <span className="font-bold text-lab-pr text-par-l truncate">{portalTitle}</span>
          </Link>
          {mobileMenuOpen && (
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden h-8 w-8 rounded-full flex items-center justify-center text-lab-sc hover:bg-fill-pr shrink-0"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden hidden-scroll flex flex-col pl-6 pr-8 pt-4 pb-6">

          {/* Nav list */}
          <div className="flex flex-col gap-4 mb-4">
            <Link
              href="/"
              onClick={onSelect}
              className="flex overflow-hidden cursor-pointer items-center sidenav-inactive"
            >
              <span className="size-6 flex items-center justify-center shrink-0">
                <Home className="size-5" />
              </span>
              <span className="text-par-m ml-3 font-medium flex-1">Home</span>
              <span className="shrink-0 text-lab-sc">
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </Link>

            <div className="ml-8">
              <div className="h-px bg-bord-pr" />
            </div>

            {items.map((item) => {
              const Icon = item.icon;
              const rowClass = cn(
                'flex overflow-hidden cursor-pointer items-center w-full text-left',
                item.active ? 'sidenav-active' : 'sidenav-inactive'
              );
              const inner = (
                <>
                  <span className="size-6 flex items-center justify-center shrink-0">
                    <Icon className="size-5" />
                  </span>
                  <span className="text-par-m ml-3 font-medium flex-1 truncate">{item.label}</span>
                </>
              );

              return (
                <React.Fragment key={item.key}>
                  {item.dividerBefore && (
                    <div className="ml-8">
                      <div className="h-px bg-bord-pr" />
                    </div>
                  )}

                  {item.href ? (
                    <Link href={item.href} onClick={onSelect} className={rowClass}>
                      {inner}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        item.onClick?.();
                        onSelect?.();
                      }}
                      className={rowClass}
                    >
                      {inner}
                    </button>
                  )}

                  {item.dividerAfter && (
                    <div className="ml-8">
                      <div className="h-px bg-bord-pr" />
                    </div>
                  )}
                </React.Fragment>
              );
            })}

            <div className="ml-8">
              <div className="h-px bg-bord-pr" />
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="flex overflow-hidden cursor-pointer items-center w-full text-left sidenav-inactive"
            >
              <span className="size-6 flex items-center justify-center shrink-0">
                <LogOut className="size-5" />
              </span>
              <span className="text-par-m ml-3 font-medium flex-1">Logout</span>
            </button>
          </div>

          {/* Sidebar footer matching PHP sidebar/link */}
          <div className="mt-auto pt-4">
            <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-cap-l text-lab-sc">
              <button
                type="button"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="hover:underline cursor-pointer"
              >
                {theme === 'dark' ? 'Light theme' : 'Dark theme'}
              </button>
              <Link href="/document/privacy-policy" className="hover:underline">
                Privacy Policy
              </Link>
              <Link href="/document/terms-of-use" className="hover:underline">
                Terms of Use
              </Link>
            </div>
            <p className="text-cap-s text-lab-tr mt-2">&copy; {new Date().getFullYear()} Weto</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-pr text-lab-pr">
      {/* Desktop fixed left sidebar (288px = w-72 matching Source/resources/views/components/sidebar/container.blade.php) */}
      <aside className="hidden md:block fixed top-0 bottom-0 left-0 h-screen w-72 border-r border-bord-pr bg-bg-pr/70 backdrop-blur-sm z-40">
        {renderNavContent()}
      </aside>

      {/* Mobile slide-over drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 popup-background-pr" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative z-10 w-72 max-w-[85vw] h-full bg-bg-pr border-r border-bord-pr pt-safe pb-safe">
            {renderNavContent(() => setMobileMenuOpen(false))}
          </aside>
        </div>
      )}

      {/* Fixed top header bar matching Source/resources/views/components/header.blade.php */}
      <header className="fixed top-0 right-0 left-0 md:left-72 z-30 bg-bg-pr border-b border-bord-tr pt-safe px-safe">
        <div className="flex items-center justify-between px-4 md:px-8 h-16">
          <div className="flex items-center gap-3 md:hidden min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="h-9 w-9 rounded-full bg-fill-tr flex items-center justify-center text-lab-pr cursor-pointer shrink-0"
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <Link href={homeHref} className="flex items-center gap-2 min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="h-5 w-auto object-contain shrink-0" src={logoSrc} alt="Weto" />
              <span className="font-bold text-lab-pr text-par-s truncate">
                {resolvedHeading || portalTitle}
              </span>
            </Link>
          </div>

          {resolvedHeading && (
            <div className="hidden md:flex items-center min-w-0 pr-4">
              <span className="text-par-n font-semibold text-lab-pr2 truncate">{resolvedHeading}</span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-3 leading-none">
            {headerControls}

            {user && (
              <Link
                href={`/u/${user.username}`}
                className="inline-flex items-center justify-center rounded-full"
                title={`${user.firstName} ${user.lastName}`.trim() || user.username}
              >
                <Avatar
                  src={user.avatar}
                  alt={`${user.firstName} ${user.lastName}`.trim() || user.username}
                  fallback={user.username}
                  size="sm"
                />
              </Link>
            )}

            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="h-9 w-9 rounded-full bg-fill-tr hover:bg-fill-sc flex items-center justify-center text-lab-pr transition-colors cursor-pointer"
              aria-label="Toggle color theme"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main container matching Source/resources/views/components/container.blade.php (ml-72 pl-8 pr-8 pb-12) */}
      <main
        className={cn(
          'pt-[calc(5rem+env(safe-area-inset-top))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] md:ml-72 md:pl-8 md:pr-8 md:pb-12',
          portal === 'admin'
            ? 'pb-[calc(3.5rem+env(safe-area-inset-bottom))]'
            : 'pb-[calc(5.25rem+env(safe-area-inset-bottom))]'
        )}
      >
        <div className="mx-auto w-full min-w-0">{children}</div>
      </main>

      {portal === 'business' && (
        <nav
          aria-label="Business portal mobile navigation"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-bg-pr/95 backdrop-blur-md border-t border-bord-tr pb-safe pb-safe-standalone"
        >
          <div className="grid grid-cols-5 h-14 px-1">
            {[
              { href: '/business', label: 'Overview', icon: LayoutDashboard },
              { href: '/business/ads', label: 'Ads', icon: Megaphone },
              { href: '/business/market', label: 'Market', icon: ShoppingBag },
              { href: '/business/jobs', label: 'Jobs', icon: Briefcase },
              { href: '/business/wallet', label: 'Wallet', icon: Wallet },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
                    isActive ? 'text-brand-900 font-semibold' : 'text-lab-sc hover:text-lab-pr'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="truncate max-w-full px-1">{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      {portal === 'admin' && (
        <div className="hidden md:flex fixed bg-bg-pr border-t border-bord-tr bottom-0 right-0 left-72 px-8 h-6 items-center z-20">
          <span className="block text-lab-sc text-cap-s">
            You are viewing the Weto administrator control panel.
          </span>
        </div>
      )}
    </div>
  );
}
