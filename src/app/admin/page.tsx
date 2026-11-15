'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithPopup, signOut } from 'firebase/auth';
import {
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Film,
  LayoutDashboard,
  Music,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { ADMIN_NAV_ICONS, PortalShell, type PortalNavItem } from '@/components/layout/PortalShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch, uploadFileToR2 } from '@/lib/api-client';
import { formatCurrency } from '@/lib/currency';
import {
  getFirebaseClientAuth,
  googleAuthProvider,
  isFirebaseClientConfigured,
} from '@/lib/firebase/client';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';
import {
  AdminApprovalControl,
  AdminConfigSection,
  AdminOverviewSection,
  AdminSecurityModSection,
  AdminStatusBadge,
  AdminUsersSection,
  type AdminUserRow,
} from '@/components/admin/AdminModules';
import { cn } from '@/lib/utils';

const ADMIN_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'users', label: 'Users' },
  { key: 'posts', label: 'Posts' },
  { key: 'comments', label: 'Comments' },
  { key: 'stories', label: 'Stories' },
  { key: 'marketplace', label: 'Marketplace' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'businesses', label: 'Businesses' },
  { key: 'chats', label: 'Chats' },
  { key: 'ads', label: 'Ads' },
  { key: 'reports', label: 'Reports' },
  { key: 'moderation_history', label: 'Mod History' },
  { key: 'banning', label: 'Banning & Censors' },
  { key: 'authorship', label: 'Authorship' },
  { key: 'verification', label: 'Verification' },
  { key: 'payments', label: 'Payments & Wallets' },
  { key: 'cashouts', label: 'Withdrawals' },
  { key: 'acquiring', label: 'Acquiring' },
  { key: 'categories', label: 'Categories' },
  { key: 'currencies', label: 'Currencies' },
  { key: 'locales', label: 'Locales' },
  { key: 'static_pages', label: 'Static Pages' },
  { key: 'storage', label: 'R2 Storage' },
  { key: 'settings', label: 'Platform Config' },
  { key: 'lab', label: 'Lab & Tools' },
  { key: 'audit_logs', label: 'Audit Logs' },
  { key: 'api_keys', label: 'API Keys' },
];

const ADMIN_TAB_META: Record<
  string,
  { title: string; subtitle: string; filters?: Array<{ key: string; label: string }> }
> = {
  overview: {
    title: 'Admin Overview',
    subtitle: 'Platform health metrics, recent registrations, pending queues, and revenue snapshot.',
  },
  users: {
    title: 'Users Directory',
    subtitle: 'Manage accounts, roles, creator authorship, verified badges, wallets, and restrictions.',
  },
  posts: {
    title: 'Publications',
    subtitle: 'Review, edit, globally pin, or remove published posts and attached media.',
    filters: [
      { key: 'all', label: 'All Posts' },
      { key: 'active', label: 'Active' },
      { key: 'draft', label: 'Draft' },
      { key: 'pinned', label: 'Global Pinned' },
      { key: 'media', label: 'With Media' },
    ],
  },
  comments: {
    title: 'Comments Moderation',
    subtitle: 'Inspect post comments and delete abusive or off-topic replies cleanly.',
  },
  stories: {
    title: 'Stories Frames',
    subtitle: 'Preview active or expired story frames and remove policy-violating uploads.',
    filters: [
      { key: 'all', label: 'All Stories' },
      { key: 'active', label: 'Active' },
      { key: 'expired', label: 'Expired' },
    ],
  },
  marketplace: {
    title: 'Marketplace Products',
    subtitle: 'Approve or reject merchant listings, edit pricing/promotion, and moderate inventory.',
    filters: [
      { key: 'all', label: 'All Products' },
      { key: 'pending', label: 'Pending Review' },
      { key: 'approved', label: 'Approved' },
      { key: 'rejected', label: 'Rejected' },
      { key: 'active', label: 'Active' },
      { key: 'inactive', label: 'Inactive' },
    ],
  },
  jobs: {
    title: 'Job Listings',
    subtitle: 'Moderate employer job openings, review approvals, and adjust urgent or remote flags.',
    filters: [
      { key: 'all', label: 'All Jobs' },
      { key: 'pending', label: 'Pending Review' },
      { key: 'approved', label: 'Approved' },
      { key: 'rejected', label: 'Rejected' },
      { key: 'active', label: 'Active' },
    ],
  },
  businesses: {
    title: 'Business Accounts',
    subtitle: 'Review registered business profiles and grant or revoke official business verification.',
    filters: [
      { key: 'all', label: 'All Businesses' },
      { key: 'pending', label: 'Pending / Unverified' },
      { key: 'verified', label: 'Verified' },
    ],
  },
  chats: {
    title: 'Chats & Groups',
    subtitle: 'Inspect direct conversations and group channels with participant counts and cleanup.',
    filters: [
      { key: 'all', label: 'All Chats' },
      { key: 'group', label: 'Groups' },
      { key: 'direct', label: 'Direct Messages' },
    ],
  },
  ads: {
    title: 'Advertising Campaigns',
    subtitle: 'Approve or reject advertiser creatives, pause running campaigns, and track performance.',
    filters: [
      { key: 'all', label: 'All Ads' },
      { key: 'pending', label: 'Pending Approval' },
      { key: 'approved', label: 'Approved' },
      { key: 'rejected', label: 'Rejected' },
      { key: 'published', label: 'Published' },
      { key: 'paused', label: 'Paused' },
    ],
  },
  reports: {
    title: 'Abuse & Content Reports',
    subtitle: 'Investigate flagged posts, comments, profiles, and products with one-click moderation.',
    filters: [
      { key: 'all', label: 'All Reports' },
      { key: 'pending', label: 'Pending' },
      { key: 'processed', label: 'Processed' },
      { key: 'ignored', label: 'Ignored' },
    ],
  },
  moderation_history: {
    title: 'Moderation History',
    subtitle: 'Chronological ledger of bans, verifications, content removals, and review decisions.',
    filters: [
      { key: 'all', label: 'All Actions' },
      { key: 'ban', label: 'Bans' },
      { key: 'verify', label: 'Verifications' },
      { key: 'approve', label: 'Approvals' },
      { key: 'reject', label: 'Rejections' },
      { key: 'remove_content', label: 'Removals' },
    ],
  },
  banning: {
    title: 'Banning & Censor Rules',
    subtitle: 'Manage IP/email/phone/username blacklists, expiration rules, and word censor filters.',
  },
  authorship: {
    title: 'Authorship Requests',
    subtitle: 'Approve or decline creator authorship applications and attach reviewer notes.',
    filters: [
      { key: 'all', label: 'All Requests' },
      { key: 'pending', label: 'Pending' },
      { key: 'approved', label: 'Approved' },
      { key: 'rejected', label: 'Rejected' },
    ],
  },
  verification: {
    title: 'Identity Verification',
    subtitle: 'Configure verification service rules and manage verified user badges across Weto.',
  },
  payments: {
    title: 'Payments & Wallets',
    subtitle: 'Audit incoming gateway transactions, withdrawal queues, and user wallet balances.',
    filters: [
      { key: 'all', label: 'All Payments' },
      { key: 'completed', label: 'Completed' },
      { key: 'pending', label: 'Pending' },
      { key: 'failed', label: 'Failed' },
    ],
  },
  cashouts: {
    title: 'Withdrawal Requests',
    subtitle: 'Process creator payout requests or reject with atomic wallet refund and notes.',
  },
  acquiring: {
    title: 'Payment Acquiring & Fees',
    subtitle: 'Configure Paystack, Stripe, PayPal, YooKassa, RoboKassa, commissions, and limits.',
  },
  categories: {
    title: 'Categories Management',
    subtitle: 'Organize product and job categories with active states and live listing counts.',
  },
  currencies: {
    title: 'Currencies',
    subtitle: 'Enable currencies, configure formatting, and assign the platform default currency.',
  },
  locales: {
    title: 'Languages & Locales',
    subtitle: 'Manage active interface languages, RTL direction, and default platform locale.',
  },
  static_pages: {
    title: 'Static Pages & Legal Documents',
    subtitle: 'Edit Terms of Use, Privacy Policy, and platform guidelines per locale.',
  },
  storage: {
    title: 'R2 Storage & Media Assets',
    subtitle: 'Monitor media storage quotas across Cloudflare R2 and local fallback assets.',
    filters: [
      { key: 'all', label: 'All Media' },
      { key: 'image', label: 'Images' },
      { key: 'video', label: 'Videos' },
      { key: 'document', label: 'Documents' },
    ],
  },
  settings: {
    title: 'Platform Configuration',
    subtitle: 'Manage site metadata, feature toggles, branding assets, mail, custom code, and cache.',
  },
  lab: {
    title: 'Lab & System Diagnostics',
    subtitle: 'Inspect runtime integrations, send test emails, and broadcast platform announcements.',
  },
  audit_logs: {
    title: 'Administrator Audit Logs',
    subtitle: 'Immutable trace of administrative mutations performed in the control panel.',
  },
  api_keys: {
    title: 'Developer API Keys',
    subtitle: 'Review active developer API keys and revoke compromised credentials.',
  },
};

const VALID_ADMIN_TAB_KEYS = new Set(ADMIN_TABS.map((t) => t.key));

const SEARCHABLE_TABS = new Set([
  'users',
  'posts',
  'comments',
  'stories',
  'marketplace',
  'jobs',
  'businesses',
  'chats',
  'ads',
  'reports',
  'moderation_history',
  'banning',
  'authorship',
  'verification',
  'payments',
  'cashouts',
  'categories',
  'storage',
]);

type EditState =
  | { kind: 'post'; id: string; title: string; content: string; status: string; globalPinned: boolean }
  | { kind: 'product'; id: string; title: string; price: string; discount: string; currency: string; status: string; approval: string; isPromoted: boolean }
  | { kind: 'job'; id: string; title: string; income: string; currency: string; location: string; status: string; approval: string; isUrgent: boolean; isRemote: boolean }
  | null;

export default function AdminDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-bg-pr text-lab-sc flex items-center justify-center text-par-n">
          Loading Admin Panel...
        </div>
      }
    >
      <AdminDashboardContent />
    </Suspense>
  );
}

function AdminDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading: appLoading, user, bootstrap, refreshBootstrap, locale } = useApp();
  const { error, success } = useToast();
  const urlTab = searchParams.get('tab');
  const activeTab = urlTab && VALID_ADMIN_TAB_KEYS.has(urlTab) ? urlTab : 'overview';
  const [userFilter, setUserFilter] = useState<'all' | 'author' | 'reader' | 'blocked'>('all');
  const [tabFilter, setTabFilter] = useState<string>('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailModal, setDetailModal] = useState<{
    kind: 'ad' | 'story' | 'post' | 'report' | 'chat' | 'payment';
    row: Record<string, unknown>;
  } | null>(null);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    variant?: 'danger' | 'primary';
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const [reviewModal, setReviewModal] = useState<{
    title: string;
    subtitle: string;
    action: string;
    targetId: string;
    payload: Record<string, unknown>;
    variant: 'primary' | 'danger';
    confirmLabel: string;
  } | null>(null);
  const [reviewNoteInput, setReviewNoteInput] = useState('');
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [overview, setOverview] = useState<{
    defaultCurrency?: string;
    metrics: Record<string, number>;
    recentUsers: Array<{ _id: string; username: string; email: string; role: string; status: string }>;
    recentPayments: Array<{ _id: string; amount: number; currency: string; status: string; provider?: string; paymentMethod?: string; userId?: { username: string } }>;
  } | null>(null);
  const [resourceData, setResourceData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [adminLogin, setAdminLogin] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [rememberAdmin, setRememberAdmin] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [editModal, setEditModal] = useState<EditState>(null);

  const isAdmin = user?.role === 'root' || user?.role === 'admin' || user?.role === 'moderator';
  const defaultCurrency = overview?.defaultCurrency || bootstrap?.config?.defaultCurrency || 'NGN';
  const activeMeta = ADMIN_TAB_META[activeTab] || {
    title: 'Weto Admin Control Panel',
    subtitle: 'Complete moderation, CRUD management, financial ledger, media storage, and platform config.',
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = `${activeMeta.title} · Weto Admin`;
    }
  }, [activeMeta.title]);

  async function handleAdminCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!adminLogin.trim() || !adminPassword) {
      error('Enter your administrator email or username and password');
      return;
    }
    setLoggingIn(true);
    try {
      const res = await apiFetch<{ user: { username: string; role: string } }>('/admin/login', {
        method: 'POST',
        json: {
          login: adminLogin.trim(),
          password: adminPassword,
          remember: rememberAdmin,
        },
      });
      if (isFirebaseClientConfigured()) {
        try {
          await signOut(getFirebaseClientAuth());
        } catch {
          // ignore if no Firebase client user active
        }
      }
      try {
        sessionStorage.removeItem('weto_bootstrap_v1');
      } catch {
        // ignore storage errors
      }
      await refreshBootstrap();
      setAdminPassword('');
      success(`Signed in as @${res.user.username} (${res.user.role})`);
    } catch (err) {
      error('Admin login failed', err instanceof Error ? err.message : 'Invalid credentials');
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleAdminGoogleLogin() {
    if (!isFirebaseClientConfigured()) {
      error('Firebase not configured');
      return;
    }
    setLoggingIn(true);
    try {
      const auth = getFirebaseClientAuth();
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      const res = await apiFetch<{ user: { username: string; role: string } }>('/auth/session', {
        method: 'POST',
        json: { idToken, remember: rememberAdmin },
      });
      try {
        sessionStorage.removeItem('weto_bootstrap_v1');
      } catch {
        // ignore
      }
      await refreshBootstrap();
      if (!['root', 'admin', 'moderator'].includes(res.user.role)) {
        error(
          'Administrator privileges required',
          `@${res.user.username} has role "${res.user.role}". Promote via npm run admin:root -- ${res.user.username}`
        );
      } else {
        success(`Welcome to Admin Panel, @${res.user.username}`);
      }
    } catch (err) {
      error('Google sign in failed', err instanceof Error ? err.message : undefined);
    } finally {
      setLoggingIn(false);
    }
  }

  const switchTab = useCallback(
    (tabKey: string) => {
      if (!VALID_ADMIN_TAB_KEYS.has(tabKey)) return;
      setLoading(true);
      setResourceData(null);
      setTabFilter('all');
      setSearchInput('');
      setSearchQuery('');
      router.replace(`/admin?tab=${encodeURIComponent(tabKey)}`, { scroll: false });
    },
    [router]
  );

  const loadTab = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setResourceData(null);
    try {
      if (activeTab === 'overview') {
        const res = await apiFetch('/admin/overview');
        setOverview(res as never);
      } else {
        const qs = new URLSearchParams({ resource: activeTab });
        if (activeTab === 'users' && userFilter !== 'all') {
          qs.set('type', userFilter);
        }
        if (activeTab !== 'users' && tabFilter !== 'all') {
          qs.set('filter', tabFilter);
        }
        if (searchQuery.trim() && SEARCHABLE_TABS.has(activeTab)) {
          qs.set('q', searchQuery.trim());
        }
        const res = await apiFetch(`/admin/manage?${qs.toString()}`);
        setResourceData(res);
      }
    } catch (err) {
      error('Failed to load admin data', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [activeTab, isAdmin, searchQuery, tabFilter, userFilter, error]);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadTab();
    }, 0);
    return () => clearTimeout(id);
  }, [loadTab]);

  async function handleAction(action: string, targetId?: string, payload: Record<string, unknown> = {}) {
    try {
      await apiFetch('/admin/manage', {
        method: 'POST',
        json: { action, targetId, payload },
      });
      if (
        action.startsWith('currency.') ||
        action.startsWith('locale.') ||
        action === 'settings.update' ||
        action === 'cache.reset'
      ) {
        try {
          sessionStorage.removeItem('weto_bootstrap_v1');
        } catch {
          // ignore
        }
        await refreshBootstrap();
      }
      success(action === 'cache.reset' ? 'Platform settings and layout cache cleared' : 'Action completed');
      loadTab();
    } catch (err) {
      error('Admin action failed', err instanceof Error ? err.message : undefined);
    }
  }

  const navItems: PortalNavItem[] = ADMIN_TABS.map((t) => ({
    key: t.key,
    label: t.label,
    icon: ADMIN_NAV_ICONS[t.key] || LayoutDashboard,
    active: activeTab === t.key,
    onClick: () => switchTab(t.key),
    dividerAfter: ['users', 'ads', 'verification', 'acquiring', 'settings'].includes(t.key),
  }));

  if (appLoading && !user) {
    return (
      <div className="min-h-screen bg-bg-pr text-lab-sc flex items-center justify-center text-par-n">
        Loading Admin Panel...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <AuthShell
        heading="Admin Panel"
        subheading="Enter your admin login and password."
      >
        <div className="block">
          {user && (
            <div className="mb-4 rounded-xl bg-fill-fv px-3.5 py-2.5 text-cap-l flex items-center justify-between gap-2">
              <span className="text-lab-sc truncate">
                Signed in as <strong className="text-lab-pr">@{user.username}</strong>
              </span>
              <Badge variant="default" className="uppercase tracking-wide shrink-0">
                {user.role}
              </Badge>
            </div>
          )}

          <form onSubmit={handleAdminCredentialsSubmit} className="block">
            <div className="block mb-4">
              <div className="rounded-xl relative overflow-hidden border-2 border-transparent hover:border-brand-900 focus-within:border-brand-900 smoothing">
                <input
                  type="text"
                  value={adminLogin}
                  onChange={(e) => setAdminLogin(e.target.value)}
                  placeholder="Login or Email"
                  autoComplete="username"
                  required
                  className="block w-full bg-input-pr tracking-normal outline-hidden text-par-m text-lab-pr px-4 h-12"
                />
              </div>
            </div>

            <div className="block mb-6">
              <div className="rounded-xl relative overflow-hidden border-2 border-transparent hover:border-brand-900 focus-within:border-brand-900 smoothing">
                <input
                  type={showAdminPassword ? 'text' : 'password'}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  required
                  className="block w-full bg-input-pr tracking-normal outline-hidden text-par-m text-lab-pr px-4 pr-12 h-12"
                />
                <span className="absolute right-0 top-0 h-full inline-flex items-center justify-center px-4 bg-input-pr">
                  <button
                    type="button"
                    onClick={() => setShowAdminPassword((v) => !v)}
                    className="size-5 cursor-pointer text-lab-sc outline-hidden"
                    aria-label="Toggle password visibility"
                  >
                    {showAdminPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                  </button>
                </span>
              </div>
            </div>

            <div className="flex items-center leading-none mb-6 select-none">
              <label className="inline-flex items-center cursor-pointer leading-none">
                <input
                  type="checkbox"
                  checked={rememberAdmin}
                  onChange={(e) => setRememberAdmin(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="relative w-11 h-6 bg-[#787880]/20 rounded-full peer peer-checked:after:translate-x-[20px] after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:shadow-lg after:rounded-full after:size-5 after:transition-all peer-checked:bg-brand-900" />
                <span className="ml-3 text-lab-sc text-par-s">Remember me</span>
              </label>
            </div>

            <div className="block">
              <button
                type="submit"
                disabled={loggingIn}
                className="w-full h-12 px-6 bg-fill-tr text-brand-900 font-semibold hover:bg-fill-sc smoothing rounded-full cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-2 text-par-n"
              >
                {loggingIn ? 'Signing in...' : 'Login'}
              </button>
            </div>
          </form>

          {isFirebaseClientConfigured() && (
            <div className="mt-4">
              <div className="text-center my-3 text-par-s text-lab-sc">OR</div>
              <button
                type="button"
                onClick={handleAdminGoogleLogin}
                disabled={loggingIn}
                className="w-full rounded-full border border-bord-pr block leading-none cursor-pointer hover:bg-fill-fv smoothing disabled:opacity-60"
              >
                <div className="flex relative h-12 items-center">
                  <div className="absolute left-3 top-3 size-6 block overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="w-full" src="/assets/social-logos/google.png" alt="Google" />
                  </div>
                  <span className="text-center block w-full text-lab-pr2 text-par-n font-medium">
                    Continue with Google
                  </span>
                </div>
              </button>
            </div>
          )}

          <div className="mt-5 text-center">
            <Link href="/" className="text-brand-900 font-medium text-par-s hover:underline">
              Back to Home
            </Link>
          </div>

          {user && (
            <div className="mt-6 pt-4 border-t border-bord-tr text-left">
              <p className="text-cap-s font-semibold text-lab-sc mb-1.5">Developer Root Promotion</p>
              <code className="block w-full rounded-lg bg-fill-qt border border-bord-pr px-3 py-2 text-cap-l text-lab-pr font-mono overflow-x-auto">
                npm run admin:root -- {user.username}
              </code>
            </div>
          )}
        </div>
      </AuthShell>
    );
  }

  const list = Array.isArray(resourceData) ? (resourceData as Array<Record<string, unknown>>) : [];

  const portalHeaderControls = (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => void loadTab()}>
        <RefreshCw className="h-3.5 w-3.5" /> Refresh
      </Button>
      {activeTab === 'settings' && (
        <Button size="sm" variant="secondary" onClick={() => handleAction('cache.reset')}>
          Reset Cache
        </Button>
      )}
    </div>
  );

  return (
    <PortalShell portal="admin" navItems={navItems} headerControls={portalHeaderControls}>
      <div className="space-y-6">
        <div className="pb-4 border-b border-bord-pr flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-cap-s font-semibold uppercase tracking-wide text-lab-tr">
              Weto Admin Panel · {ADMIN_TABS.find((t) => t.key === activeTab)?.label || activeTab}
            </p>
            <h1 className="text-title-2 font-bold text-lab-pr mt-0.5">{activeMeta.title}</h1>
            <p className="text-par-n text-lab-sc mt-1">{activeMeta.subtitle}</p>
          </div>
          {SEARCHABLE_TABS.has(activeTab) && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSearchQuery(searchInput);
              }}
              className="flex items-center gap-2 w-full sm:w-auto"
            >
              <div className="relative flex-1 sm:flex-initial rounded-full border border-bord-card/80 bg-bg-pr">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-lab-sc" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={`Search ${activeMeta.title.toLowerCase()}...`}
                  className="h-9 rounded-full bg-transparent pl-8 pr-3 text-cap-l text-lab-pr2 placeholder:text-lab-tr outline-hidden w-full sm:w-64"
                />
              </div>
              <Button type="submit" size="sm" variant="secondary" className="shrink-0">
                Search
              </Button>
            </form>
          )}
        </div>

        <nav className="md:hidden flex items-center gap-1.5 overflow-x-auto hidden-scroll pb-3 border-b border-bord-pr">
          {ADMIN_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => switchTab(t.key)}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-cap-l font-semibold transition-colors cursor-pointer',
                activeTab === t.key ? 'bg-lab-pr2 text-bg-pr' : 'bg-fill-pr text-lab-sc hover:bg-fill-sc hover:text-lab-pr'
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {activeMeta.filters && activeMeta.filters.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {activeMeta.filters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setTabFilter(f.key)}
                  className={cn(
                    'rounded-full px-3.5 py-1 text-cap-s font-semibold transition-colors cursor-pointer',
                    tabFilter === f.key
                      ? 'bg-lab-pr text-bg-pr'
                      : 'bg-fill-qt text-lab-sc hover:text-lab-pr'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setSearchQuery('');
                }}
                className="text-cap-s font-semibold text-brand-900 hover:underline cursor-pointer"
              >
                Clear search &ldquo;{searchQuery}&rdquo;
              </button>
            )}
          </div>
        )}

        {loading ? (
          <p className="py-12 text-center text-lab-sc">Loading {activeMeta.title.toLowerCase()}...</p>
        ) : activeTab === 'overview' ? (
          <AdminOverviewSection overview={overview} onAction={handleAction} onNavigateTab={switchTab} />
        ) : activeTab === 'users' ? (
          <AdminUsersSection
            rows={list as unknown as AdminUserRow[]}
            defaultCurrency={defaultCurrency}
            userFilter={userFilter}
            onUserFilterChange={(next) => setUserFilter(next as 'all' | 'author' | 'reader' | 'blocked')}
            onAction={handleAction}
          />
        ) : activeTab === 'banning' ? (
          <AdminSecurityModSection resource={activeTab} data={resourceData} onAction={handleAction} />
        ) : ['categories', 'currencies', 'locales', 'static_pages', 'settings', 'acquiring', 'verification', 'cashouts', 'lab'].includes(activeTab) ? (
          <AdminConfigSection resource={activeTab} data={resourceData} onAction={handleAction} onNavigateTab={switchTab} />
        ) : activeTab === 'payments' ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-par-m text-lab-pr">Cashout Requests</h3>
                <Button size="sm" variant="outline" onClick={() => switchTab('cashouts')}>
                  Open Withdrawals Queue
                </Button>
              </div>
              {((resourceData as { cashouts?: Array<Record<string, unknown>> })?.cashouts || []).length === 0 ? (
                <p className="text-cap-l text-lab-sc py-2">No cashout requests.</p>
              ) : (
                ((resourceData as { cashouts?: Array<Record<string, unknown>> })?.cashouts || []).map((c) => (
                  <div key={String(c._id)} className="rounded-2xl border border-bord-card p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-bold text-lab-pr">
                        @{String((c.userId as { username?: string })?.username || 'user')} ·{' '}
                        {formatCurrency(Number(c.amount || 0), String(c.currency || defaultCurrency), bootstrap?.currencies, locale)}
                      </p>
                      <p className="text-cap-l text-lab-sc">{String(c.paymentMethod)} — {String(c.credentials)}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <AdminApprovalControl
                        status={String(c.status || 'pending')}
                        approveLabel="Mark Paid"
                        rejectLabel="Reject"
                        allowOverride={false}
                        onApprove={() => handleAction('cashout.review', String(c._id), { decision: 'paid' })}
                        onReject={() =>
                          setReviewModal({
                            title: `Reject Withdrawal`,
                            subtitle: `Decline payout and refund wallet for @${String((c.userId as { username?: string })?.username || 'user')}`,
                            action: 'cashout.review',
                            targetId: String(c._id),
                            payload: { decision: 'rejected' },
                            variant: 'danger',
                            confirmLabel: 'Reject & Refund',
                          })
                        }
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setConfirmState({
                            title: 'Delete cashout record?',
                            description: 'This permanently deletes this withdrawal request record from the ledger.',
                            confirmLabel: 'Delete Record',
                            variant: 'danger',
                            onConfirm: () => handleAction('cashout.delete', String(c._id)),
                          })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-900" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-par-m text-lab-pr">Payments Ledger</h3>
              {((resourceData as { payments?: Array<Record<string, unknown>> })?.payments || []).length === 0 ? (
                <p className="text-cap-l text-lab-sc py-2">No payment transactions recorded.</p>
              ) : (
                ((resourceData as { payments?: Array<Record<string, unknown>> })?.payments || []).map((p) => (
                  <div key={String(p._id)} className="rounded-2xl border border-bord-pr p-3 flex flex-wrap items-center justify-between gap-2 text-cap-l">
                    <div className="min-w-0">
                      <p className="font-semibold text-lab-pr truncate">
                        @{String((p.userId as { username?: string })?.username || 'user')} · {String(p.paymentMethod || p.provider || 'payment')}
                      </p>
                      {Boolean(p.referenceId) && (
                        <p className="text-cap-s text-lab-sc font-mono truncate">Ref: {String(p.referenceId)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lab-pr">
                        {formatCurrency(Number(p.amount || 0), String(p.currency || defaultCurrency), bootstrap?.currencies, locale)}
                      </span>
                      <AdminStatusBadge status={String(p.status || 'pending')} />
                      <Button size="sm" variant="ghost" onClick={() => setDetailModal({ kind: 'payment', row: p })}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-par-m text-lab-pr">User Wallets</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {((resourceData as { wallets?: Array<Record<string, unknown>> })?.wallets || []).map((w) => (
                  <div key={String(w._id)} className="rounded-2xl border border-bord-pr p-3 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-par-n text-lab-pr">@{String((w.userId as { username?: string })?.username || 'user')}</p>
                      <p className="text-cap-s text-lab-sc font-mono">{String(w.walletNumber || '')}</p>
                    </div>
                    <span className="font-outfit font-bold text-par-m text-lab-pr">
                      {formatCurrency(Number(w.balance || 0), String(w.currency || defaultCurrency), bootstrap?.currencies, locale)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : activeTab === 'storage' ? (
          <div className="space-y-6">
            {((resourceData as { summary?: { totalFiles?: number; totalBytes?: number; providers?: Array<{ provider: string; count: number; bytes: number }> } })?.summary) && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-bord-card p-4 bg-bg-pr">
                  <p className="text-cap-s text-lab-sc">Total Media Files</p>
                  <p className="font-outfit text-title-2 font-bold text-lab-pr mt-1">
                    {Number((resourceData as { summary: { totalFiles?: number } }).summary.totalFiles || 0).toLocaleString()}
                  </p>
                </div>
                <div className="rounded-2xl border border-bord-card p-4 bg-bg-pr">
                  <p className="text-cap-s text-lab-sc">Total Footprint</p>
                  <p className="font-outfit text-title-2 font-bold text-lab-pr mt-1">
                    {(Number((resourceData as { summary: { totalBytes?: number } }).summary.totalBytes || 0) / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
                <div className="rounded-2xl border border-bord-card p-4 bg-bg-pr space-y-1">
                  <p className="text-cap-s text-lab-sc">Providers</p>
                  {((resourceData as { summary: { providers?: Array<{ provider: string; count: number; bytes: number }> } }).summary.providers || []).map((pr) => (
                    <div key={pr.provider} className="flex items-center justify-between text-cap-l">
                      <Badge variant={pr.provider === 'r2' ? 'brand' : 'outline'}>{pr.provider.toUpperCase()}</Badge>
                      <span className="font-semibold text-lab-pr">
                        {pr.count} ({(pr.bytes / (1024 * 1024)).toFixed(2)} MB)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-3">
              <h3 className="font-bold text-par-m text-lab-pr">Media Storage Breakdown</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {((resourceData as { stats?: Array<{ _id: string; mediaType: string; contentSizeBytes: number; contentItems: number }> })?.stats || []).map((s) => (
                  <div key={s._id} className="rounded-2xl border border-bord-card p-4">
                    <p className="text-cap-s text-lab-sc uppercase">{s.mediaType}</p>
                    <p className="font-outfit text-title-3 font-bold text-lab-pr">
                      {(s.contentSizeBytes / (1024 * 1024)).toFixed(2)} MB
                    </p>
                    <p className="text-cap-s text-lab-tr">{s.contentItems || 0} files</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-par-m text-lab-pr">Media Assets</h3>
                <label className="inline-flex items-center gap-1.5 rounded-full border border-bord-pr bg-bg-pr px-3 py-1.5 text-cap-l font-semibold text-lab-pr hover:bg-fill-pr cursor-pointer">
                  <Upload className="h-3.5 w-3.5" />
                  {uploadingAsset ? 'Uploading to R2...' : 'Upload Asset to R2'}
                  <input
                    type="file"
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.zip"
                    className="hidden"
                    disabled={uploadingAsset}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      setUploadingAsset(true);
                      try {
                        await uploadFileToR2(file, 'system', 'system_asset');
                        success('Uploaded asset to Cloudflare R2');
                        loadTab();
                      } catch (err) {
                        error('Asset upload failed', err instanceof Error ? err.message : undefined);
                      } finally {
                        setUploadingAsset(false);
                      }
                    }}
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {((resourceData as { recentMedia?: Array<{ _id: string; type: string; targetType: string; storageProvider: string; sizeBytes: number; url: string; owner?: { username?: string } }> })?.recentMedia || []).map((m) => (
                  <div key={m._id} className="rounded-2xl border border-bord-pr p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-12 w-12 rounded-xl overflow-hidden bg-fill-qt shrink-0 flex items-center justify-center">
                        {m.type === 'video' ? (
                          <Film className="h-5 w-5 text-lab-sc" />
                        ) : m.type === 'audio' ? (
                          <Music className="h-5 w-5 text-lab-sc" />
                        ) : m.type === 'document' ? (
                          <FileText className="h-5 w-5 text-lab-sc" />
                        ) : m.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.url} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <p className="text-cap-l font-semibold text-lab-pr truncate">
                          {m.targetType} · {m.type}
                        </p>
                        <p className="text-cap-s text-lab-sc truncate">
                          @{m.owner?.username || 'system'} · {(m.sizeBytes / 1024).toFixed(1)} KB ({m.storageProvider})
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        setConfirmState({
                          title: 'Delete media asset?',
                          description: `Remove this ${m.type} file permanently from ${m.storageProvider} storage.`,
                          confirmLabel: 'Delete Asset',
                          variant: 'danger',
                          onConfirm: () => handleAction('media.delete', m._id),
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {list.length === 0 ? (
              <p className="text-center text-lab-sc py-8">No records found in {activeMeta.title}.</p>
            ) : (
              list.map((row) => {
                const id = String(row._id);
                const rowMedia = Array.isArray(row.media)
                  ? (row.media as Array<{ url?: string; type?: string }>)
                  : row.media
                    ? [row.media as { url?: string; type?: string }]
                    : [];
                const thumb = rowMedia[0];
                const authorUsername = String(
                  (row.userId as { username?: string })?.username ||
                  (row.reporterId as { username?: string })?.username ||
                  (row.actorId as { username?: string })?.username ||
                  (row.moderatorId as { username?: string })?.username ||
                  ''
                );

                let primaryLine = String(
                  row.title || row.content || row.name || row.action || row.reporterComment || row.reason || row.keyPrefix || id
                );
                let secondaryLine = [
                  authorUsername ? `@${authorUsername}` : '',
                  row.price !== undefined ? formatCurrency(Number(row.price), String(row.currency || defaultCurrency), bootstrap?.currencies, locale) : '',
                  row.income !== undefined && row.income !== null
                    ? formatCurrency(Number(row.income), String(row.currency || defaultCurrency), bootstrap?.currencies, locale)
                    : '',
                  row.location ? String(row.location) : '',
                  row.reportableType ? `Target: ${String(row.reportableType)}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ');

                if (activeTab === 'chats') {
                  const grp = row.group as { name?: string } | undefined;
                  const participants = Array.isArray(row.participants)
                    ? (row.participants as Array<{ userId?: { username?: string } }>)
                      .map((p) => (p.userId?.username ? `@${p.userId.username}` : null))
                      .filter(Boolean)
                    : [];
                  primaryLine = grp?.name || (participants.length > 0 ? participants.join(', ') : String(row.chatUuid || id));
                  secondaryLine = [
                    `Type: ${String(row.type || 'direct')}`,
                    `${Number(row.messagesCount || 0)} messages`,
                    row.lastActivity ? `Active: ${new Date(String(row.lastActivity)).toLocaleString()}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ');
                } else if (activeTab === 'stories') {
                  primaryLine = String(row.content || `Story frame by @${authorUsername || 'user'}`);
                  secondaryLine = [
                    authorUsername ? `@${authorUsername}` : '',
                    thumb?.type ? `Media: ${thumb.type}` : 'Text frame',
                    row.viewsCount !== undefined ? `${Number(row.viewsCount)} views` : '',
                    row.expiresAt ? `Expires: ${new Date(String(row.expiresAt)).toLocaleString()}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ');
                } else if (activeTab === 'comments') {
                  const postHash = (row.postId as { hashId?: string })?.hashId;
                  primaryLine = String(row.content || '(empty comment)');
                  secondaryLine = [
                    authorUsername ? `@${authorUsername}` : '',
                    postHash ? `Post #${postHash}` : '',
                    row.createdAt ? new Date(String(row.createdAt)).toLocaleString() : '',
                  ]
                    .filter(Boolean)
                    .join(' · ');
                } else if (activeTab === 'ads') {
                  primaryLine = String(row.title || row.content || `Campaign ${id}`);
                  secondaryLine = [
                    authorUsername ? `@${authorUsername}` : '',
                    row.totalBudget !== undefined
                      ? `Budget: ${formatCurrency(Number(row.totalBudget), String(row.currency || defaultCurrency), bootstrap?.currencies, locale)}`
                      : '',
                    row.viewsCount !== undefined ? `${Number(row.viewsCount)} views` : '',
                    row.clicksCount !== undefined ? `${Number(row.clicksCount)} clicks` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ');
                } else if (activeTab === 'reports') {
                  const reviewer = (row.reviewerId as { username?: string })?.username;
                  primaryLine = String(row.reporterComment || `Reported ${String(row.reportableType || 'item')}`);
                  secondaryLine = [
                    authorUsername ? `Reporter: @${authorUsername}` : '',
                    row.reportableType ? `Type: ${String(row.reportableType)}` : '',
                    row.targetPreview ? `Preview: "${String(row.targetPreview).slice(0, 60)}"` : '',
                    reviewer ? `Reviewed by @${reviewer}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ');
                } else if (activeTab === 'businesses') {
                  primaryLine = String(row.name || `Business ${id}`);
                  secondaryLine = [
                    authorUsername ? `Owner: @${authorUsername}` : '',
                    [row.city, row.country].filter(Boolean).join(', '),
                    row.businessEmail ? String(row.businessEmail) : '',
                  ]
                    .filter(Boolean)
                    .join(' · ');
                } else if (activeTab === 'authorship') {
                  const reqUser = row.userId as { firstName?: string; lastName?: string; email?: string; type?: string } | undefined;
                  const full = `${reqUser?.firstName || ''} ${reqUser?.lastName || ''}`.trim();
                  primaryLine = full ? `${full} (@${authorUsername || 'user'})` : `@${authorUsername || id}`;
                  secondaryLine = [
                    reqUser?.email || '',
                    reqUser?.type ? `Current Type: ${reqUser.type}` : '',
                    row.reviewerNotes ? `Note: ${String(row.reviewerNotes)}` : '',
                    row.createdAt ? new Date(String(row.createdAt)).toLocaleString() : '',
                  ]
                    .filter(Boolean)
                    .join(' · ');
                } else if (activeTab === 'audit_logs') {
                  primaryLine = String(row.action || id);
                  secondaryLine = [
                    authorUsername ? `@${authorUsername}` : '',
                    row.targetType ? `Target: ${String(row.targetType)}` : '',
                    row.createdAt ? new Date(String(row.createdAt)).toLocaleString() : '',
                  ]
                    .filter(Boolean)
                    .join(' · ');
                } else if (activeTab === 'moderation_history') {
                  const targetUser = (row.targetUserId as { username?: string })?.username;
                  primaryLine = `${String(row.action || 'action').replace(/_/g, ' ')}${row.reason ? ` — ${String(row.reason)}` : ''}`;
                  secondaryLine = [
                    authorUsername ? `Mod: @${authorUsername}` : '',
                    targetUser ? `Target: @${targetUser}` : '',
                    row.targetType ? `Type: ${String(row.targetType)}` : '',
                    row.createdAt ? new Date(String(row.createdAt)).toLocaleString() : '',
                  ]
                    .filter(Boolean)
                    .join(' · ');
                }

                const storyExpired = activeTab === 'stories' && Boolean(row.isExpired);

                return (
                  <div key={id} className="rounded-2xl border border-bord-card bg-bg-pr p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {thumb?.url && (
                        <div className="h-12 w-12 rounded-xl overflow-hidden bg-fill-qt shrink-0 flex items-center justify-center border border-bord-pr">
                          {thumb.type === 'video' ? (
                            <Film className="h-5 w-5 text-lab-sc" />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb.url} alt="" className="h-full w-full object-cover" />
                          )}
                        </div>
                      )}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-par-n font-bold text-lab-pr truncate">{primaryLine}</p>
                          {['posts', 'marketplace', 'jobs', 'ads', 'reports', 'authorship'].includes(activeTab) && Boolean(row.status) && (
                            <AdminStatusBadge status={String(row.status)} />
                          )}
                          {['marketplace', 'jobs', 'ads'].includes(activeTab) && Boolean(row.approval) && (
                            <AdminStatusBadge status={String(row.approval)} />
                          )}
                          {activeTab === 'posts' && Boolean(row.globalPinned) && (
                            <Badge variant="brand">Global Pin</Badge>
                          )}
                          {activeTab === 'stories' && (
                            <AdminStatusBadge status={storyExpired ? 'expired' : 'active'} />
                          )}
                          {activeTab === 'businesses' && (
                            <AdminStatusBadge
                              status={row.verified ? 'verified' : 'pending'}
                              label={row.verified ? 'Verified' : 'Pending Review'}
                            />
                          )}
                          {activeTab === 'moderation_history' && Boolean(row.action) && (
                            <AdminStatusBadge
                              status={
                                String(row.action).includes('approve') || String(row.action).includes('verify')
                                  ? 'approved'
                                  : String(row.action).includes('ban') || String(row.action).includes('reject') || String(row.action).includes('remove') || String(row.action).includes('delete')
                                    ? 'rejected'
                                    : 'processed'
                              }
                              label={String(row.action).replace(/_/g, ' ')}
                            />
                          )}
                          {activeTab === 'api_keys' && (
                            <AdminStatusBadge status={row.isActive ? 'active' : 'inactive'} />
                          )}
                        </div>
                        <p className="text-cap-s text-lab-sc truncate">{secondaryLine || id}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {activeTab === 'posts' && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setDetailModal({ kind: 'post', row })}>
                            <Eye className="h-3.5 w-3.5" /> Inspect
                          </Button>
                          {Boolean(row.hashId) && (
                            <Link href={`/publication/${String(row.hashId)}`} target="_blank">
                              <Button size="sm" variant="ghost">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setEditModal({
                                kind: 'post',
                                id,
                                title: String(row.title || ''),
                                content: String(row.content || ''),
                                status: String(row.status || 'active'),
                                globalPinned: Boolean(row.globalPinned),
                              })
                            }
                          >
                            <Edit3 className="h-3.5 w-3.5" /> Edit
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleAction('post.toggle_global_pin', id)}>
                            {row.globalPinned ? 'Unpin' : 'Pin Global'}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() =>
                              setConfirmState({
                                title: 'Delete publication?',
                                description: 'This removes the post, comments, bookmarks, and attached media permanently.',
                                confirmLabel: 'Delete Post',
                                variant: 'danger',
                                onConfirm: () => handleAction('post.delete', id),
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {activeTab === 'comments' && (
                        <>
                          {Boolean((row.postId as { hashId?: string })?.hashId) && (
                            <Link href={`/publication/${String((row.postId as { hashId?: string })?.hashId)}`} target="_blank">
                              <Button size="sm" variant="ghost" title="Open publication">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                          )}
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() =>
                              setConfirmState({
                                title: 'Delete comment?',
                                description: 'Removes this comment and decrements the parent publication count.',
                                confirmLabel: 'Delete Comment',
                                variant: 'danger',
                                onConfirm: () => handleAction('comment.delete', id),
                              })
                            }
                          >
                            Delete
                          </Button>
                        </>
                      )}
                      {activeTab === 'stories' && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setDetailModal({ kind: 'story', row })}>
                            <Eye className="h-3.5 w-3.5" /> Preview
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() =>
                              setConfirmState({
                                title: 'Delete story frame?',
                                description: 'Removes this story frame and any attached R2 media.',
                                confirmLabel: 'Delete Story',
                                variant: 'danger',
                                onConfirm: () => handleAction('story.delete', id),
                              })
                            }
                          >
                            Delete
                          </Button>
                        </>
                      )}
                      {activeTab === 'chats' && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setDetailModal({ kind: 'chat', row })}>
                            <Eye className="h-3.5 w-3.5" /> Inspect
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() =>
                              setConfirmState({
                                title: 'Delete conversation?',
                                description: 'Deletes the entire chat thread and all stored messages permanently.',
                                confirmLabel: 'Delete Chat',
                                variant: 'danger',
                                onConfirm: () => handleAction('chat.delete', id),
                              })
                            }
                          >
                            Delete Chat
                          </Button>
                        </>
                      )}
                      {activeTab === 'marketplace' && (
                        <>
                          {Boolean(row.hashId) && (
                            <Link href={`/marketplace/product/${String(row.hashId)}`} target="_blank">
                              <Button size="sm" variant="ghost">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setEditModal({
                                kind: 'product',
                                id,
                                title: String(row.title || ''),
                                price: String(row.price ?? 0),
                                discount: String(row.discount ?? 0),
                                currency: String(row.currency || defaultCurrency),
                                status: String(row.status || 'active'),
                                approval: String(row.approval || 'approved'),
                                isPromoted: Boolean(row.isPromoted),
                              })
                            }
                          >
                            <Edit3 className="h-3.5 w-3.5" /> Edit
                          </Button>
                          <AdminApprovalControl
                            status={String(row.approval || 'pending')}
                            onApprove={() => handleAction('product.set_approval', id, { approval: 'approved' })}
                            onReject={() => {
                              setReviewNoteInput('');
                              setReviewModal({
                                title: `Reject Product: ${String(row.title || 'Listing')}`,
                                subtitle: 'Seller will receive a notification with your optional reason.',
                                action: 'product.set_approval',
                                targetId: id,
                                payload: { approval: 'rejected' },
                                variant: 'danger',
                                confirmLabel: 'Reject Product',
                              });
                            }}
                          />
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() =>
                              setConfirmState({
                                title: 'Delete product listing?',
                                description: `Delete "${String(row.title || 'Product')}" and its associated media permanently.`,
                                confirmLabel: 'Delete Product',
                                variant: 'danger',
                                onConfirm: () => handleAction('product.delete', id),
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {activeTab === 'jobs' && (
                        <>
                          {Boolean(row.hashId) && (
                            <Link href={`/jobs/${String(row.hashId)}`} target="_blank">
                              <Button size="sm" variant="ghost">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setEditModal({
                                kind: 'job',
                                id,
                                title: String(row.title || ''),
                                income: String(row.income ?? ''),
                                currency: String(row.currency || defaultCurrency),
                                location: String(row.location || ''),
                                status: String(row.status || 'active'),
                                approval: String(row.approval || 'approved'),
                                isUrgent: Boolean(row.isUrgent),
                                isRemote: Boolean(row.isRemote),
                              })
                            }
                          >
                            <Edit3 className="h-3.5 w-3.5" /> Edit
                          </Button>
                          <AdminApprovalControl
                            status={String(row.approval || 'pending')}
                            onApprove={() => handleAction('job.set_approval', id, { approval: 'approved' })}
                            onReject={() => {
                              setReviewNoteInput('');
                              setReviewModal({
                                title: `Reject Job Listing: ${String(row.title || 'Job')}`,
                                subtitle: 'Employer will be notified of your moderation decision.',
                                action: 'job.set_approval',
                                targetId: id,
                                payload: { approval: 'rejected' },
                                variant: 'danger',
                                confirmLabel: 'Reject Job',
                              });
                            }}
                          />
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() =>
                              setConfirmState({
                                title: 'Delete job listing?',
                                description: 'Deletes this job post and all submitted applications.',
                                confirmLabel: 'Delete Job',
                                variant: 'danger',
                                onConfirm: () => handleAction('job.delete', id),
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {activeTab === 'ads' && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setDetailModal({ kind: 'ad', row })}>
                            <Eye className="h-3.5 w-3.5" /> Inspect
                          </Button>
                          <AdminApprovalControl
                            status={String(row.approval || 'pending')}
                            onApprove={() => handleAction('ad.set_approval', id, { approval: 'approved' })}
                            onReject={() => {
                              setReviewNoteInput('');
                              setReviewModal({
                                title: `Reject Ad Campaign`,
                                subtitle: `Decline "${String(row.title || 'Ad')}" and notify the advertiser.`,
                                action: 'ad.set_approval',
                                targetId: id,
                                payload: { approval: 'rejected' },
                                variant: 'danger',
                                confirmLabel: 'Reject Campaign',
                              });
                            }}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleAction('ad.set_status', id, {
                                status: row.status === 'published' ? 'paused' : 'published',
                              })
                            }
                          >
                            {row.status === 'published' ? 'Pause' : 'Publish'}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() =>
                              setConfirmState({
                                title: 'Delete ad campaign?',
                                description: 'Permanently delete this advertising campaign record.',
                                confirmLabel: 'Delete Ad',
                                variant: 'danger',
                                onConfirm: () => handleAction('ad.delete', id),
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {activeTab === 'businesses' && (
                        <>
                          <AdminApprovalControl
                            status={row.verified ? 'verified' : 'pending'}
                            approvedLabel="Verified"
                            pendingLabel="Unverified"
                            approveLabel="Verify Business"
                            rejectLabel="Revoke"
                            onApprove={() => handleAction('business.review', id, { decision: 'approved' })}
                            onReject={() => {
                              setReviewNoteInput('');
                              setReviewModal({
                                title: `Revoke / Reject Business Verification`,
                                subtitle: `Update verification state for "${String(row.name || 'Business')}" and notify owner.`,
                                action: 'business.review',
                                targetId: id,
                                payload: { decision: 'rejected' },
                                variant: 'danger',
                                confirmLabel: 'Revoke Verification',
                              });
                            }}
                          />
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() =>
                              setConfirmState({
                                title: 'Delete business account?',
                                description: `Remove "${String(row.name || 'Business')}" from the business directory.`,
                                confirmLabel: 'Delete Business',
                                variant: 'danger',
                                onConfirm: () => handleAction('business.delete', id),
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {activeTab === 'reports' && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setDetailModal({ kind: 'report', row })}>
                            <Eye className="h-3.5 w-3.5" /> Inspect
                          </Button>
                          <AdminApprovalControl
                            status={String(row.status || 'pending')}
                            approvedLabel="Processed"
                            rejectedLabel="Ignored"
                            pendingLabel="Pending"
                            approveLabel="Remove Content"
                            rejectLabel="Ignore Report"
                            allowOverride={false}
                            onApprove={() =>
                              setConfirmState({
                                title: 'Remove reported content?',
                                description: `This marks the report processed and deletes or blocks the reported ${String(row.reportableType || 'item')}.`,
                                confirmLabel: 'Remove Content',
                                variant: 'danger',
                                onConfirm: () =>
                                  handleAction('report.resolve', id, { status: 'processed', removeContent: true }),
                              })
                            }
                            onReject={() =>
                              handleAction('report.resolve', id, { status: 'ignored', removeContent: false })
                            }
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setConfirmState({
                                title: 'Delete report record?',
                                description: 'Delete this report entry without modifying reported content.',
                                confirmLabel: 'Delete',
                                variant: 'danger',
                                onConfirm: () => handleAction('report.delete', id),
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-900" />
                          </Button>
                        </>
                      )}
                      {activeTab === 'authorship' && (
                        <AdminApprovalControl
                          status={String(row.status || 'pending')}
                          approveLabel="Approve Author"
                          rejectLabel="Decline"
                          onApprove={() => handleAction('authorship.review', id, { decision: 'approved' })}
                          onReject={() => {
                            setReviewNoteInput('');
                            setReviewModal({
                              title: `Decline Authorship Request`,
                              subtitle: `Send optional feedback to @${authorUsername || 'user'}.`,
                              action: 'authorship.review',
                              targetId: id,
                              payload: { decision: 'rejected' },
                              variant: 'danger',
                              confirmLabel: 'Decline Request',
                            });
                          }}
                        />
                      )}
                      {activeTab === 'api_keys' && (
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={!row.isActive}
                          onClick={() =>
                            setConfirmState({
                              title: 'Revoke API key?',
                              description: 'Clients using this API key will immediately lose access.',
                              confirmLabel: 'Revoke Key',
                              variant: 'danger',
                              onConfirm: () => handleAction('api_key.revoke', id),
                            })
                          }
                        >
                          {row.isActive ? 'Revoke' : 'Revoked'}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Inline CRUD Edit Modal */}
      <Modal
        open={editModal !== null}
        onClose={() => setEditModal(null)}
        title={
          editModal?.kind === 'post'
            ? 'Edit Publication'
            : editModal?.kind === 'product'
              ? 'Edit Product Listing'
              : 'Edit Job Listing'
        }
      >
        {editModal?.kind === 'post' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await handleAction('post.update', editModal.id, {
                title: editModal.title,
                content: editModal.content,
                status: editModal.status,
                globalPinned: editModal.globalPinned,
              });
              setEditModal(null);
            }}
            className="space-y-3"
          >
            <Input label="Title" value={editModal.title} onChange={(e) => setEditModal({ ...editModal, title: e.target.value })} />
            <Textarea label="Content" value={editModal.content} onChange={(e) => setEditModal({ ...editModal, content: e.target.value })} required />
            <Select label="Status" value={editModal.status} onChange={(e) => setEditModal({ ...editModal, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="published">Published</option>
              <option value="inactive">Inactive</option>
            </Select>
            <Switch checked={editModal.globalPinned} onCheckedChange={(v) => setEditModal({ ...editModal, globalPinned: v })} label="Global pinned post" />
            <Button type="submit" variant="primary" className="w-full">
              Save Publication
            </Button>
          </form>
        )}

        {editModal?.kind === 'product' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await handleAction('product.update', editModal.id, {
                title: editModal.title,
                price: Number(editModal.price || 0),
                discount: Number(editModal.discount || 0),
                currency: editModal.currency,
                status: editModal.status,
                approval: editModal.approval,
                isPromoted: editModal.isPromoted,
              });
              setEditModal(null);
            }}
            className="space-y-3"
          >
            <Input label="Title" value={editModal.title} onChange={(e) => setEditModal({ ...editModal, title: e.target.value })} required />
            <div className="grid grid-cols-3 gap-2">
              <Input label="Price" type="number" min="0" value={editModal.price} onChange={(e) => setEditModal({ ...editModal, price: e.target.value })} required />
              <Input label="Discount %" type="number" min="0" max="100" value={editModal.discount} onChange={(e) => setEditModal({ ...editModal, discount: e.target.value })} />
              <Input label="Currency" value={editModal.currency} onChange={(e) => setEditModal({ ...editModal, currency: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select label="Status" value={editModal.status} onChange={(e) => setEditModal({ ...editModal, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="inactive">Inactive</option>
              </Select>
              <Select label="Approval" value={editModal.approval} onChange={(e) => setEditModal({ ...editModal, approval: e.target.value })}>
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
              </Select>
            </div>
            <Switch checked={editModal.isPromoted} onCheckedChange={(v) => setEditModal({ ...editModal, isPromoted: v })} label="Promoted listing" />
            <Button type="submit" variant="primary" className="w-full">
              Save Product
            </Button>
          </form>
        )}

        {editModal?.kind === 'job' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await handleAction('job.update', editModal.id, {
                title: editModal.title,
                income: editModal.income ? Number(editModal.income) : null,
                currency: editModal.currency,
                location: editModal.location,
                status: editModal.status,
                approval: editModal.approval,
                isUrgent: editModal.isUrgent,
                isRemote: editModal.isRemote,
              });
              setEditModal(null);
            }}
            className="space-y-3"
          >
            <Input label="Job Title" value={editModal.title} onChange={(e) => setEditModal({ ...editModal, title: e.target.value })} required />
            <div className="grid grid-cols-3 gap-2">
              <Input label="Compensation" type="number" min="0" value={editModal.income} onChange={(e) => setEditModal({ ...editModal, income: e.target.value })} />
              <Input label="Currency" value={editModal.currency} onChange={(e) => setEditModal({ ...editModal, currency: e.target.value })} />
              <Input label="Location" value={editModal.location} onChange={(e) => setEditModal({ ...editModal, location: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select label="Status" value={editModal.status} onChange={(e) => setEditModal({ ...editModal, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="inactive">Inactive</option>
              </Select>
              <Select label="Approval" value={editModal.approval} onChange={(e) => setEditModal({ ...editModal, approval: e.target.value })}>
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
              </Select>
            </div>
            <Switch checked={editModal.isUrgent} onCheckedChange={(v) => setEditModal({ ...editModal, isUrgent: v })} label="Urgent hiring" />
            <Switch checked={editModal.isRemote} onCheckedChange={(v) => setEditModal({ ...editModal, isRemote: v })} label="Remote friendly" />
            <Button type="submit" variant="primary" className="w-full">
              Save Job Listing
            </Button>
          </form>
        )}
      </Modal>

      <Modal
        open={detailModal !== null}
        onClose={() => setDetailModal(null)}
        title={
          detailModal?.kind === 'ad'
            ? 'Campaign Details'
            : detailModal?.kind === 'story'
              ? 'Story Frame Preview'
              : detailModal?.kind === 'post'
                ? 'Publication Details'
                : detailModal?.kind === 'report'
                  ? 'Abuse Report Inspector'
                  : detailModal?.kind === 'chat'
                    ? 'Conversation Details'
                    : 'Payment Details'
        }
      >
        {detailModal && (
          <div className="space-y-4">
            {Boolean((detailModal.row.media as { url?: string } | null)?.url) && (
              <div className="rounded-2xl overflow-hidden border border-bord-pr bg-fill-qt max-h-72 flex items-center justify-center">
                {(detailModal.row.media as { type?: string })?.type === 'video' ? (
                  <video
                    src={String((detailModal.row.media as { url?: string }).url)}
                    controls
                    className="max-h-72 w-full object-contain"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={String((detailModal.row.media as { url?: string }).url)}
                    alt=""
                    className="max-h-72 w-full object-contain"
                  />
                )}
              </div>
            )}
            <div className="space-y-2 text-cap-l">
              {Boolean(detailModal.row.title) && (
                <p className="font-bold text-par-n text-lab-pr">{String(detailModal.row.title)}</p>
              )}
              {Boolean(detailModal.row.content) && (
                <p className="text-lab-pr whitespace-pre-wrap">{String(detailModal.row.content)}</p>
              )}
              {Boolean((detailModal.row.userId as { username?: string })?.username) && (
                <p className="text-lab-sc">
                  Author: @{String((detailModal.row.userId as { username?: string }).username)}
                </p>
              )}
              {detailModal.kind === 'ad' && (
                <>
                  {Boolean(detailModal.row.targetUrl) && (
                    <p className="text-lab-sc break-all">Target URL: {String(detailModal.row.targetUrl)}</p>
                  )}
                  <p className="text-lab-sc">
                    Views: {Number(detailModal.row.viewsCount || 0)} · Clicks: {Number(detailModal.row.clicksCount || 0)}
                  </p>
                  <p className="text-lab-sc">
                    Budget: {formatCurrency(Number(detailModal.row.totalBudget || 0), String(detailModal.row.currency || defaultCurrency), bootstrap?.currencies, locale)}
                  </p>
                </>
              )}
              {detailModal.kind === 'story' && (
                <p className="text-lab-sc">
                  Views: {Number(detailModal.row.viewsCount || 0)}
                  {detailModal.row.expiresAt ? ` · Expires ${new Date(String(detailModal.row.expiresAt)).toLocaleString()}` : ''}
                </p>
              )}
              {detailModal.kind === 'post' && (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <AdminStatusBadge status={String(detailModal.row.status || 'active')} />
                    {Boolean(detailModal.row.globalPinned) && <Badge variant="brand">Global Pin</Badge>}
                  </div>
                  <p className="text-lab-sc">
                    Comments: {Number(detailModal.row.commentsCount || 0)} · Shares: {Number(detailModal.row.sharesCount || 0)}
                  </p>
                  {Boolean(detailModal.row.location) && (
                    <p className="text-lab-sc">Location: {String(detailModal.row.location)}</p>
                  )}
                </>
              )}
              {detailModal.kind === 'report' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{String(detailModal.row.reportableType || 'item')}</Badge>
                    <AdminStatusBadge status={String(detailModal.row.status || 'pending')} />
                  </div>
                  {Boolean(detailModal.row.reporterComment) && (
                    <div className="rounded-xl border border-bord-pr bg-fill-qt p-3">
                      <p className="text-cap-s font-semibold text-lab-sc mb-1">Reporter Comment</p>
                      <p className="text-lab-pr">{String(detailModal.row.reporterComment)}</p>
                    </div>
                  )}
                  {Boolean(detailModal.row.targetPreview) && (
                    <div className="rounded-xl border border-bord-pr bg-fill-qt p-3">
                      <p className="text-cap-s font-semibold text-lab-sc mb-1">Reported Content Preview</p>
                      <p className="text-lab-pr">{String(detailModal.row.targetPreview)}</p>
                    </div>
                  )}
                  {Boolean(detailModal.row.reviewerNotes) && (
                    <p className="text-lab-sc">Reviewer Note: {String(detailModal.row.reviewerNotes)}</p>
                  )}
                </div>
              )}
              {detailModal.kind === 'chat' && (
                <div className="space-y-2">
                  <p className="text-lab-sc">
                    Type: <span className="font-semibold text-lab-pr capitalize">{String(detailModal.row.type || 'direct')}</span> ·{' '}
                    {Number(detailModal.row.messagesCount || 0)} message(s)
                  </p>
                  {Array.isArray(detailModal.row.participants) && (
                    <div className="flex flex-wrap gap-1.5">
                      {(detailModal.row.participants as Array<{ userId?: { username?: string } }>).map((p, idx) => (
                        <Badge key={idx} variant="outline">
                          @{p.userId?.username || 'user'}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {detailModal.kind === 'payment' && (
                <div className="space-y-1.5 rounded-xl border border-bord-pr bg-fill-qt p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-lab-pr">
                      {formatCurrency(Number(detailModal.row.amount || 0), String(detailModal.row.currency || defaultCurrency), bootstrap?.currencies, locale)}
                    </span>
                    <AdminStatusBadge status={String(detailModal.row.status || 'pending')} />
                  </div>
                  <p className="text-lab-sc">Method: {String(detailModal.row.paymentMethod || detailModal.row.provider || 'gateway')}</p>
                  {Boolean(detailModal.row.referenceId) && (
                    <p className="text-lab-sc font-mono break-all">Reference: {String(detailModal.row.referenceId)}</p>
                  )}
                  {Boolean(detailModal.row.createdAt) && (
                    <p className="text-lab-sc">Date: {new Date(String(detailModal.row.createdAt)).toLocaleString()}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Review Decision With Optional Reviewer Note Modal */}
      <Modal
        open={reviewModal !== null}
        onClose={() => setReviewModal(null)}
        title={reviewModal?.title || 'Moderation Review'}
      >
        {reviewModal && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await handleAction(reviewModal.action, reviewModal.targetId, {
                ...reviewModal.payload,
                notes: reviewNoteInput.trim(),
              });
              setReviewModal(null);
              setReviewNoteInput('');
            }}
            className="space-y-4"
          >
            <p className="text-cap-l text-lab-sc">{reviewModal.subtitle}</p>
            <Textarea
              label="Moderator Note (optional)"
              placeholder="Explain why this decision was made..."
              value={reviewNoteInput}
              onChange={(e) => setReviewNoteInput(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setReviewModal(null)}>
                Cancel
              </Button>
              <Button type="submit" variant={reviewModal.variant}>
                {reviewModal.confirmLabel}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Structured Confirmation Modal matching PHP $store.confirmModal */}
      <Modal
        open={confirmState !== null}
        onClose={() => setConfirmState(null)}
        title={confirmState?.title || 'Confirm Action'}
      >
        {confirmState && (
          <div className="space-y-4">
            <p className="text-par-s text-lab-sc">{confirmState.description}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirmState(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant={confirmState.variant || 'danger'}
                onClick={async () => {
                  const fn = confirmState.onConfirm;
                  setConfirmState(null);
                  await fn();
                }}
              >
                {confirmState.confirmLabel}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </PortalShell>
  );
}
