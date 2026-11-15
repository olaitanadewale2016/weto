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
  children: React.ReactNode;
}

export function PortalShell({
  portal,
  navItems,
  headerControls,
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

  async function handleLogout() {
    await logout();
    router.push('/auth/login');
  }

  function renderNavContent(onSelect?: () => void) {
    return (
      <div className="pl-6 pr-8 h-full overflow-y-auto hidden-scroll">
        <div className="flex flex-col min-h-full py-6">
          {/* Logo & Portal Label matching Source/resources/views/layouts/mpa/apps/{business,admin}/parts/sidebar.blade.php */}
          <div className="mb-10 flex items-center justify-between">
            <Link href={homeHref} className="flex items-center gap-2" onClick={onSelect}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="h-5 w-auto object-contain" src={logoSrc} alt="Weto" />
              <span className="font-bold text-lab-pr text-par-l">{portalTitle}</span>
            </Link>
            {mobileMenuOpen && (
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="md:hidden h-8 w-8 rounded-full flex items-center justify-center text-lab-sc hover:bg-fill-pr"
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

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
          <aside className="relative z-10 w-72 max-w-[85vw] h-full bg-bg-pr border-r border-bord-pr">
            {renderNavContent(() => setMobileMenuOpen(false))}
          </aside>
        </div>
      )}

      {/* Fixed top header bar matching Source/resources/views/components/header.blade.php */}
      <header className="fixed top-0 right-0 left-0 md:left-72 z-30 bg-bg-pr border-b border-bord-tr">
        <div className="flex items-center justify-between px-4 md:px-8 h-16">
          <div className="flex items-center gap-3 md:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="h-9 w-9 rounded-full bg-fill-tr flex items-center justify-center text-lab-pr cursor-pointer"
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <Link href={homeHref} className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="h-5 w-auto object-contain" src={logoSrc} alt="Weto" />
              <span className="font-bold text-lab-pr text-par-s">{portalTitle}</span>
            </Link>
          </div>

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

      {/* Main container matching Source/resources/views/components/container.blade.php */}
      <main className={cn('pt-20 px-4 md:ml-72 md:pr-8 md:pl-8', portal === 'admin' ? 'pb-14' : 'pb-12')}>
        {children}
      </main>

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
