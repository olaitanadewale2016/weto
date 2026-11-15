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
  AdminConfigSection,
  AdminDecisionButtons,
  AdminOverviewSection,
  AdminSecurityModSection,
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
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailModal, setDetailModal] = useState<{ kind: 'ad' | 'story'; row: Record<string, unknown> } | null>(null);
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
  }, [activeTab, isAdmin, searchQuery, userFilter, error]);

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

  return (
    <PortalShell portal="admin" navItems={navItems}>
      <div className="space-y-6">
        <div className="pb-4 border-b border-bord-pr flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-title-2 font-bold text-lab-pr">Weto Admin Control Panel</h1>
            <p className="text-par-n text-lab-sc mt-1">
              Complete moderation, CRUD management, financial ledger, media storage, and platform config.
            </p>
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
                  placeholder={`Search ${activeTab}...`}
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

        {loading ? (
          <p className="py-12 text-center text-lab-sc">Loading {activeTab}...</p>
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
              <h3 className="font-bold text-par-m text-lab-pr">Cashout Requests</h3>
              {((resourceData as { cashouts?: Array<Record<string, unknown>> })?.cashouts || []).length === 0 ? (
                <p className="text-cap-l text-lab-sc py-2">No cashout requests.</p>
              ) : (
                ((resourceData as { cashouts?: Array<Record<string, unknown>> })?.cashouts || []).map((c) => (
                  <div key={String(c._id)} className="rounded-2xl border border-bord-card p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-lab-pr">
                        @{String((c.userId as { username?: string })?.username || 'user')} · {String(c.currency)} {Number(c.amount || 0).toLocaleString()}
                      </p>
                      <p className="text-cap-l text-lab-sc">{String(c.paymentMethod)} — {String(c.credentials)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="brand">{String(c.status)}</Badge>
                      {c.status === 'pending' && (
                        <AdminDecisionButtons
                          approveLabel="Mark Paid"
                          rejectLabel="Reject"
                          onApprove={() => handleAction('cashout.review', String(c._id), { decision: 'paid' })}
                          onReject={() => handleAction('cashout.review', String(c._id), { decision: 'rejected' })}
                        />
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleAction('cashout.delete', String(c._id))}>
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
                  <div key={String(p._id)} className="rounded-2xl border border-bord-pr p-3 flex items-center justify-between gap-2 text-cap-l">
                    <span>@{String((p.userId as { username?: string })?.username || 'user')} · {String(p.paymentMethod || p.provider || 'payment')}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{String(p.currency)} {Number(p.amount || 0).toLocaleString()}</span>
                      <Badge variant="outline">{String(p.status)}</Badge>
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
                    <Button size="sm" variant="danger" onClick={() => handleAction('media.delete', m._id)}>
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
              <p className="text-center text-lab-sc py-8">No records found in {activeTab}.</p>
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
                  row.approval ? `Approval: ${String(row.approval)}` : '',
                  row.status ? `Status: ${String(row.status)}` : '',
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
                    row.approval ? `Approval: ${String(row.approval)}` : '',
                    row.status ? `Status: ${String(row.status)}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ');
                } else if (activeTab === 'reports') {
                  const reviewer = (row.reviewerId as { username?: string })?.username;
                  primaryLine = String(row.reporterComment || `Reported ${String(row.reportableType || 'item')}`);
                  secondaryLine = [
                    authorUsername ? `Reporter: @${authorUsername}` : '',
                    row.reportableType ? `Type: ${String(row.reportableType)}` : '',
                    row.status ? `Status: ${String(row.status)}` : '',
                    reviewer ? `Reviewed by @${reviewer}` : '',
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
                  primaryLine = `${String(row.action || 'action')}${row.reason ? ` — ${String(row.reason)}` : ''}`;
                  secondaryLine = [
                    authorUsername ? `Mod: @${authorUsername}` : '',
                    targetUser ? `Target: @${targetUser}` : '',
                    row.targetType ? `Type: ${String(row.targetType)}` : '',
                    row.createdAt ? new Date(String(row.createdAt)).toLocaleString() : '',
                  ]
                    .filter(Boolean)
                    .join(' · ');
                }

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
                        <p className="text-par-n font-bold text-lab-pr truncate">{primaryLine}</p>
                        <p className="text-cap-s text-lab-sc truncate">{secondaryLine || id}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {activeTab === 'posts' && (
                        <>
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
                          <Button size="sm" variant="danger" onClick={() => handleAction('post.delete', id)}>
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
                          <Button size="sm" variant="danger" onClick={() => handleAction('comment.delete', id)}>
                            Delete
                          </Button>
                        </>
                      )}
                      {activeTab === 'stories' && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setDetailModal({ kind: 'story', row })}>
                            <Eye className="h-3.5 w-3.5" /> Preview
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => handleAction('story.delete', id)}>
                            Delete
                          </Button>
                        </>
                      )}
                      {activeTab === 'chats' && (
                        <Button size="sm" variant="danger" onClick={() => handleAction('chat.delete', id)}>
                          Delete Chat
                        </Button>
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
                          <AdminDecisionButtons
                            onApprove={() => handleAction('product.set_approval', id, { approval: 'approved' })}
                            onReject={() => handleAction('product.set_approval', id, { approval: 'rejected' })}
                          />
                          <Button size="sm" variant="danger" onClick={() => handleAction('product.delete', id)}>
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
                          <AdminDecisionButtons
                            onApprove={() => handleAction('job.set_approval', id, { approval: 'approved' })}
                            onReject={() => handleAction('job.set_approval', id, { approval: 'rejected' })}
                          />
                          <Button size="sm" variant="danger" onClick={() => handleAction('job.delete', id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {activeTab === 'ads' && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setDetailModal({ kind: 'ad', row })}>
                            <Eye className="h-3.5 w-3.5" /> Inspect
                          </Button>
                          <AdminDecisionButtons
                            onApprove={() => handleAction('ad.set_approval', id, { approval: 'approved' })}
                            onReject={() => handleAction('ad.set_approval', id, { approval: 'rejected' })}
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
                          <Button size="sm" variant="danger" onClick={() => handleAction('ad.delete', id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {activeTab === 'businesses' && (
                        <>
                          <Button size="sm" variant="primary" onClick={() => handleAction('business.toggle_verify', id)}>
                            {row.verified ? 'Unverify' : 'Verify Business'}
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => handleAction('business.delete', id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {activeTab === 'reports' && (
                        <>
                          {row.status === 'pending' ? (
                            <AdminDecisionButtons
                              approveLabel="Remove Content"
                              rejectLabel="Ignore"
                              onApprove={() => handleAction('report.resolve', id, { status: 'processed', removeContent: true })}
                              onReject={() => handleAction('report.resolve', id, { status: 'ignored', removeContent: false })}
                            />
                          ) : (
                            <Badge variant={row.status === 'processed' ? 'success' : 'outline'}>
                              {String(row.status)}
                            </Badge>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => handleAction('report.delete', id)}>
                            <Trash2 className="h-3.5 w-3.5 text-red-900" />
                          </Button>
                        </>
                      )}
                      {activeTab === 'authorship' && (
                        <AdminDecisionButtons
                          onApprove={() => handleAction('authorship.review', id, { decision: 'approved' })}
                          onReject={() => handleAction('authorship.review', id, { decision: 'rejected' })}
                        />
                      )}
                      {activeTab === 'api_keys' && (
                        <Button size="sm" variant="danger" onClick={() => handleAction('api_key.revoke', id)}>
                          Revoke
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
        title={detailModal?.kind === 'ad' ? 'Campaign Details' : 'Story Frame Preview'}
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
            <div className="space-y-1.5 text-cap-l">
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
            </div>
          </div>
        )}
      </Modal>
    </PortalShell>
  );
}
