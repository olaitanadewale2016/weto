'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithPopup, signOut } from 'firebase/auth';
import {
  BadgeCheck,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Film,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Music,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { AvatarPresetPicker } from '@/components/profile/AvatarPresetPicker';
import { AuthShell } from '@/components/auth/AuthShell';
import { ADMIN_NAV_ICONS, PortalShell, type PortalNavItem } from '@/components/layout/PortalShell';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch, apiFetchWithMeta, uploadFileToR2 } from '@/lib/api-client';
import { formatCurrency } from '@/lib/currency';
import { resolveMediaUrl } from '@/lib/media-url';
import {
  getFirebaseClientAuth,
  googleAuthProvider,
  isFirebaseClientConfigured,
} from '@/lib/firebase/client';
import { clearBootstrapCache, useApp } from '@/components/providers/AppContext';
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
    subtitle: 'Inspect direct conversations, create community groups, configure auto-join/pin/roles, and broadcast updates.',
    filters: [
      { key: 'all', label: 'All Chats' },
      { key: 'group', label: 'Groups' },
      { key: 'pinned', label: 'Pinned Groups' },
      { key: 'auto_join', label: 'Auto-Join' },
      { key: 'suspended', label: 'Suspended' },
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
      { key: 'completed', label: 'Completed' },
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
  | { kind: 'ad'; id: string; title: string; pricePerView: string; totalBudget: string; spentBudget: number; resetDailyCap: boolean }
  | null;

type AdBillingDraft = {
  billingModel: 'viewable_cpm' | 'every_impression' | 'cpc' | 'hybrid';
  pricePerView: string;
  pricePerClick: string;
  chargeIntervalMinutes: string;
  maxDailySpendPerAd: string;
  minBudget: string;
  defaultBudget: string;
  refreshIntervalMinutes: string;
  defaultApproval: boolean;
  refundUnspentOnDelete: boolean;
};

function toAdBillingDraft(cfg?: Record<string, unknown> | null): AdBillingDraft {
  const modelRaw = String(cfg?.billingModel || 'viewable_cpm');
  const billingModel =
    modelRaw === 'every_impression' || modelRaw === 'cpc' || modelRaw === 'hybrid'
      ? modelRaw
      : 'viewable_cpm';
  return {
    billingModel,
    pricePerView: String(cfg?.pricePerView ?? 25),
    pricePerClick: String(cfg?.pricePerClick ?? 75),
    chargeIntervalMinutes: String(cfg?.chargeIntervalMinutes ?? 10),
    maxDailySpendPerAd: String(cfg?.maxDailySpendPerAd ?? 0),
    minBudget: String(cfg?.minBudget ?? 5000),
    defaultBudget: String(cfg?.defaultBudget ?? 25000),
    refreshIntervalMinutes: String(cfg?.refreshIntervalMinutes ?? 5),
    defaultApproval: Boolean(cfg?.defaultApproval ?? false),
    refundUnspentOnDelete: cfg?.refundUnspentOnDelete !== false,
  };
}

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
  const { loading: appLoading, user, bootstrap, refreshBootstrap, locale, socket } = useApp();
  const { error, success } = useToast();
  const urlTab = searchParams.get('tab');
  const activeTab = urlTab && VALID_ADMIN_TAB_KEYS.has(urlTab) ? urlTab : 'overview';
  const [userFilter, setUserFilter] = useState<'all' | 'author' | 'reader' | 'blocked'>('all');
  const [tabFilter, setTabFilter] = useState<string>('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [liveSync, setLiveSync] = useState(true);
  const [detailModal, setDetailModal] = useState<{
    kind: 'ad' | 'story' | 'post' | 'report' | 'chat' | 'payment';
    row: Record<string, unknown>;
  } | null>(null);
  const [chatInspectState, setChatInspectState] = useState<{
    loading: boolean;
    chatId: string;
    chat: Record<string, unknown> | null;
    messages: Array<{
      _id: string;
      type: string;
      content?: string | null;
      isDeleted?: boolean;
      deletedAt?: string | null;
      createdAt?: string;
      sender?: {
        _id?: string;
        username?: string;
        firstName?: string;
        lastName?: string;
        avatar?: string;
        verified?: boolean;
      } | null;
      media?: { url?: string; publicUrl?: string; type?: string } | null;
    }>;
    hasMore: boolean;
    limit: number;
    deletingMessageId?: string | null;
  } | null>(null);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    variant?: 'danger' | 'primary';
    onConfirm: () => Promise<unknown> | void;
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
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState({
    name: '',
    description: '',
    category: 'General',
    avatar: '/assets/avatars/presets/avatar-h2mjRO.png',
    isPinned: false,
    autoJoin: false,
    verified: true,
    unleavable: false,
    postingMode: 'everyone' as 'everyone' | 'admins_only',
    requiresApproval: false,
    password: '',
    welcomeMessage: '',
    isPaid: false,
    entryPrice: 500,
    monetizationNote: '',
  });
  const [broadcastGroupModalOpen, setBroadcastGroupModalOpen] = useState(false);
  const [broadcastGroupText, setBroadcastGroupText] = useState('');
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [overview, setOverview] = useState<{
    defaultCurrency?: string;
    metrics: Record<string, number>;
    recentUsers: Array<{ _id: string; username: string; email: string; role: string; status: string }>;
    recentPayments: Array<{ _id: string; amount: number; currency: string; status: string; provider?: string; paymentMethod?: string; userId?: { username: string } }>;
  } | null>(null);
  const [resourceData, setResourceData] = useState<unknown>(null);
  const [resourceMeta, setResourceMeta] = useState<Record<string, unknown> | null>(null);
  const [adBillingControlsOpen, setAdBillingControlsOpen] = useState(false);
  const [adBillingDraft, setAdBillingDraft] = useState<AdBillingDraft>(() => toAdBillingDraft());
  const [adBillingDirty, setAdBillingDirty] = useState(false);
  const adBillingDirtyRef = useRef(false);
  const [savingAdBilling, setSavingAdBilling] = useState(false);
  const [resourceLoadedAt, setResourceLoadedAt] = useState(0);
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
      clearBootstrapCache();
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
      clearBootstrapCache();
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
      adBillingDirtyRef.current = false;
      setAdBillingDirty(false);
      setLoading(true);
      setResourceData(null);
      setTabFilter('all');
      setSearchInput('');
      setSearchQuery('');
      router.replace(`/admin?tab=${encodeURIComponent(tabKey)}`, { scroll: false });
    },
    [router]
  );

  const updateAdBillingField = useCallback(
    <K extends keyof AdBillingDraft>(key: K, value: AdBillingDraft[K]) => {
      adBillingDirtyRef.current = true;
      setAdBillingDirty(true);
      setAdBillingDraft((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const loadTab = useCallback(async (options?: { silent?: boolean; forceDraftSync?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (!isAdmin) {
      if (!silent) setLoading(false);
      return;
    }
    if (!silent) {
      setLoading(true);
      setResourceData(null);
    }
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
        const res = await apiFetchWithMeta(`/admin/manage?${qs.toString()}`);
        setResourceLoadedAt(Date.now());
        setResourceData(res.data);
        setResourceMeta(res.meta || null);
        if (
          activeTab === 'ads' &&
          res.meta?.adBillingConfig &&
          (options?.forceDraftSync || !adBillingDirtyRef.current)
        ) {
          adBillingDirtyRef.current = false;
          setAdBillingDirty(false);
          setAdBillingDraft(toAdBillingDraft(res.meta.adBillingConfig as Record<string, unknown>));
        }
      }
    } catch (err) {
      if (!silent) {
        error('Failed to load admin data', err instanceof Error ? err.message : undefined);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [activeTab, isAdmin, searchQuery, tabFilter, userFilter, error]);

  const openChatInspect = useCallback(
    async (chatId: string, initialRow?: Record<string, unknown>, limit = 60) => {
      setChatInspectState((prev) => ({
        loading: true,
        chatId,
        chat: prev && prev.chatId === chatId ? prev.chat : initialRow || null,
        messages: prev && prev.chatId === chatId ? prev.messages : [],
        hasMore: prev && prev.chatId === chatId ? prev.hasMore : false,
        limit,
        deletingMessageId: null,
      }));
      try {
        const res = await apiFetch<{
          chat: Record<string, unknown>;
          messages: NonNullable<typeof chatInspectState>['messages'];
          hasMore: boolean;
        }>(`/admin/manage?resource=chat_messages&chatId=${encodeURIComponent(chatId)}&limit=${limit}`);
        setChatInspectState({
          loading: false,
          chatId,
          chat: res.chat,
          messages: Array.isArray(res.messages) ? res.messages : [],
          hasMore: Boolean(res.hasMore),
          limit,
          deletingMessageId: null,
        });
      } catch (err) {
        error('Failed to inspect conversation', err instanceof Error ? err.message : undefined);
        setChatInspectState(null);
      }
    },
    [error]
  );

  useEffect(() => {
    const id = setTimeout(() => {
      void loadTab();
    }, 0);
    return () => clearTimeout(id);
  }, [loadTab]);

  // Real-time Socket.IO & silent background polling sync for admin panel
  useEffect(() => {
    if (!isAdmin || !liveSync) return;

    const refreshCurrent = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void loadTab({ silent: true });
      if (chatInspectState?.chatId) {
        void openChatInspect(chatInspectState.chatId, chatInspectState.chat || undefined, chatInspectState.limit);
      }
    };

    const onSocketAdminUpdate = () => {
      refreshCurrent();
    };

    socket?.on('admin:updated', onSocketAdminUpdate);
    socket?.on('notification:new', onSocketAdminUpdate);

    // Avoid polling while typing inside platform settings / forms to prevent unsaved flicker
    const intervalMs =
      activeTab === 'settings' ||
      activeTab === 'acquiring' ||
      (activeTab === 'ads' && adBillingControlsOpen)
        ? 30000
        : 10000;
    const intervalId = setInterval(refreshCurrent, intervalMs);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshCurrent();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', refreshCurrent);

    return () => {
      socket?.off('admin:updated', onSocketAdminUpdate);
      socket?.off('notification:new', onSocketAdminUpdate);
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', refreshCurrent);
    };
  }, [isAdmin, liveSync, activeTab, adBillingControlsOpen, socket, loadTab, chatInspectState?.chatId, chatInspectState?.chat, chatInspectState?.limit, openChatInspect]);

  async function handleAction(action: string, targetId?: string, payload: Record<string, unknown> = {}): Promise<boolean> {
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
        clearBootstrapCache();
        await refreshBootstrap();
      }
      success(action === 'cache.reset' ? 'Platform settings and layout cache cleared' : 'Action completed');
      if (action === 'chat.delete' && chatInspectState?.chatId === targetId) {
        setChatInspectState(null);
      } else if (action === 'chat.delete_message' && chatInspectState?.chatId) {
        await openChatInspect(chatInspectState.chatId, chatInspectState.chat || undefined, chatInspectState.limit);
      }
      await loadTab({
        silent: true,
        forceDraftSync: action === 'settings.update' && payload.group === 'ads',
      });
      return true;
    } catch (err) {
      error('Admin action failed', err instanceof Error ? err.message : undefined);
      return false;
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
      <button
        type="button"
        onClick={() => setLiveSync((v) => !v)}
        title={liveSync ? 'Real-time auto-sync active (click to pause)' : 'Real-time auto-sync paused (click to enable)'}
        className={cn(
          'hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-cap-s font-semibold border transition-colors cursor-pointer',
          liveSync
            ? 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400'
            : 'border-bord-pr bg-fill-qt text-lab-sc'
        )}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', liveSync ? 'bg-green-500 animate-pulse' : 'bg-lab-tr')} />
        {liveSync ? 'Live' : 'Paused'}
      </button>
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
    <PortalShell
      portal="admin"
      navItems={navItems}
      headerControls={portalHeaderControls}
      activeHeading={activeMeta.title}
    >
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
          <AdminConfigSection key={activeTab} resource={activeTab} data={resourceData} onAction={handleAction} onNavigateTab={switchTab} />
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
                          <img
                            src={m.url}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
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
            {activeTab === 'chats' && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-bord-pr bg-fill-qt/40 p-3">
                <div className="text-cap-l text-lab-sc">
                  Manage community rooms, pin featured groups, toggle auto-join for new users, or broadcast announcements.
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setBroadcastGroupText('');
                      setBroadcastGroupModalOpen(true);
                    }}
                  >
                    <Megaphone className="h-3.5 w-3.5" /> Broadcast to Groups
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setEditingGroupId(null);
                      setGroupForm({
                        name: '',
                        description: '',
                        category: 'General',
                        avatar: '/assets/avatars/presets/avatar-h2mjRO.png',
                        isPinned: false,
                        autoJoin: false,
                        verified: true,
                        unleavable: false,
                        postingMode: 'everyone',
                        requiresApproval: false,
                        password: '',
                        welcomeMessage: '',
                        isPaid: false,
                        entryPrice: 500,
                        monetizationNote: '',
                      });
                      setGroupModalOpen(true);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Create Community Group
                  </Button>
                </div>
              </div>
            )}
            {activeTab === 'ads' && Boolean(resourceMeta?.adSummary || resourceMeta?.adBillingConfig) && (() => {
              const summary = (resourceMeta?.adSummary || {}) as {
                total?: number;
                published?: number;
                pending?: number;
                paused?: number;
                completed?: number;
                totalBudget?: number;
                totalSpent?: number;
                totalViews?: number;
                totalClicks?: number;
              };
              const totalViews = Number(summary.totalViews || 0);
              const totalClicks = Number(summary.totalClicks || 0);
              const avgCtr = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(2) : '0.00';
              const savedCfg = (resourceMeta?.adBillingConfig || {}) as Record<string, unknown>;
              return (
                <div className="mb-4 space-y-3">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-2xl border border-bord-pr bg-fill-qt/40 p-3">
                      <p className="text-cap-s text-lab-sc">Campaigns</p>
                      <p className="text-par-l font-bold text-lab-pr">{Number(summary.total || 0)}</p>
                      <p className="text-cap-s text-lab-sc">
                        {Number(summary.published || 0)} live · {Number(summary.pending || 0)} pending · {Number(summary.completed || 0)} done
                      </p>
                    </div>
                    <div className="rounded-2xl border border-bord-pr bg-fill-qt/40 p-3">
                      <p className="text-cap-s text-lab-sc">Credits Spent / Escrow</p>
                      <p className="text-par-l font-bold text-brand-900">
                        {formatCurrency(Number(summary.totalSpent || 0), defaultCurrency, bootstrap?.currencies, locale)}
                      </p>
                      <p className="text-cap-s text-lab-sc">
                        of {formatCurrency(Number(summary.totalBudget || 0), defaultCurrency, bootstrap?.currencies, locale)} budget
                      </p>
                    </div>
                    <div className="rounded-2xl border border-bord-pr bg-fill-qt/40 p-3">
                      <p className="text-cap-s text-lab-sc">Delivery & CTR</p>
                      <p className="text-par-l font-bold text-lab-pr">
                        {totalViews.toLocaleString()} views · {totalClicks.toLocaleString()} clicks
                      </p>
                      <p className="text-cap-s text-lab-sc">Platform CTR: {avgCtr}%</p>
                    </div>
                    <div className="rounded-2xl border border-bord-pr bg-fill-qt/40 p-3 flex flex-col justify-between gap-2">
                      <div>
                        <p className="text-cap-s text-lab-sc">Deduction Rule</p>
                        <p className="text-par-s font-bold text-lab-pr">
                          {String(savedCfg.billingModel || 'viewable_cpm').toUpperCase()}
                        </p>
                        <p className="text-cap-l text-lab-sc space-y-0.5">
                          <span className="block">{formatCurrency(Number(savedCfg.pricePerView ?? 25), defaultCurrency, bootstrap?.currencies, locale)}/view · {formatCurrency(Number(savedCfg.pricePerClick ?? 75), defaultCurrency, bootstrap?.currencies, locale)}/click</span>
                          <span className="block">Cooldown: {Number(savedCfg.chargeIntervalMinutes ?? 10)}min · Daily cap: {Number(savedCfg.maxDailySpendPerAd ?? 0) > 0 ? formatCurrency(Number(savedCfg.maxDailySpendPerAd), defaultCurrency, bootstrap?.currencies, locale) : 'unlimited'}</span>
                          <span className="block">Refund on delete: {savedCfg.refundUnspentOnDelete !== false ? 'Yes' : 'No'} · Auto-approve: {savedCfg.defaultApproval ? 'Yes' : 'No'}</span>
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setAdBillingControlsOpen((v) => !v)}
                      >
                        {adBillingControlsOpen ? 'Hide Deduction Controls' : 'Control Credit Rules'}
                      </Button>
                    </div>
                  </div>

                  {adBillingControlsOpen && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const parseField = (raw: string, label: string, min: number): number | null => {
                          const trimmed = raw.trim();
                          if (!trimmed) {
                            error('Invalid ad billing setting', `${label} is required.`);
                            return null;
                          }
                          const num = Number(trimmed);
                          if (!Number.isFinite(num) || num < min) {
                            error('Invalid ad billing setting', `${label} must be at least ${min}.`);
                            return null;
                          }
                          return Number(num.toFixed(2));
                        };

                        const pricePerView = parseField(adBillingDraft.pricePerView, 'Charge per view', 0.01);
                        if (pricePerView === null) return;
                        const pricePerClick = parseField(adBillingDraft.pricePerClick, 'Charge per click', 0);
                        if (pricePerClick === null) return;
                        const chargeIntervalMinutes = parseField(adBillingDraft.chargeIntervalMinutes, 'Charge cooldown (minutes)', 0);
                        if (chargeIntervalMinutes === null) return;
                        const maxDailySpendPerAd = parseField(adBillingDraft.maxDailySpendPerAd, 'Daily spend cap / ad', 0);
                        if (maxDailySpendPerAd === null) return;
                        const minBudget = parseField(adBillingDraft.minBudget, 'Minimum budget', 1);
                        if (minBudget === null) return;
                        const defaultBudget = parseField(adBillingDraft.defaultBudget, 'Default budget pre-fill', 1);
                        if (defaultBudget === null) return;
                        const refreshIntervalMinutes = parseField(adBillingDraft.refreshIntervalMinutes, 'Ad refresh interval (minutes)', 1);
                        if (refreshIntervalMinutes === null) return;

                        if (defaultBudget < minBudget) {
                          error('Invalid ad billing setting', 'Default budget pre-fill cannot be lower than minimum budget.');
                          return;
                        }

                        setSavingAdBilling(true);
                        try {
                          const ok = await handleAction('settings.update', undefined, {
                            group: 'ads',
                            values: {
                              billingModel: adBillingDraft.billingModel,
                              pricePerView,
                              pricePerClick,
                              chargeIntervalMinutes,
                              maxDailySpendPerAd,
                              minBudget,
                              defaultBudget,
                              refreshIntervalMinutes,
                              defaultApproval: adBillingDraft.defaultApproval,
                              refundUnspentOnDelete: adBillingDraft.refundUnspentOnDelete,
                            },
                          });
                          if (ok) {
                            adBillingDirtyRef.current = false;
                            setAdBillingDirty(false);
                          }
                        } finally {
                          setSavingAdBilling(false);
                        }
                      }}
                      className="rounded-2xl border border-bord-pr bg-bg-pr p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-par-n font-bold text-lab-pr">Ad Credit Deduction & Delivery Controls</h3>
                            {adBillingDirty && (
                              <Badge variant="brand">Unsaved changes</Badge>
                            )}
                          </div>
                          <p className="text-cap-l text-lab-sc">
                            Control how advertiser wallet credits are charged across impressions, clicks, and daily spend caps.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {adBillingDirty && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={savingAdBilling}
                              onClick={() => {
                                adBillingDirtyRef.current = false;
                                setAdBillingDirty(false);
                                setAdBillingDraft(toAdBillingDraft(savedCfg));
                              }}
                            >
                              Reset
                            </Button>
                          )}
                          <Button type="submit" size="sm" variant="primary" disabled={savingAdBilling}>
                            {savingAdBilling ? 'Saving...' : 'Save Deduction Rules'}
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <Select
                          label="Credit Deduction Model"
                          value={adBillingDraft.billingModel}
                          onChange={(e) =>
                            updateAdBillingField(
                              'billingModel',
                              e.target.value as AdBillingDraft['billingModel']
                            )
                          }
                        >
                          <option value="viewable_cpm">Viewable CPM (charge per view + cooldown)</option>
                          <option value="every_impression">Every Viewable Impression (no cooldown)</option>
                          <option value="cpc">CPC Only (deduct only on click)</option>
                          <option value="hybrid">Hybrid (deduct per view + per click)</option>
                        </Select>
                        <Input
                          label={`Charge Per View (${defaultCurrency})`}
                          type="number"
                          min="0.01"
                          step="any"
                          required
                          value={adBillingDraft.pricePerView}
                          onChange={(e) => updateAdBillingField('pricePerView', e.target.value)}
                        />
                        <Input
                          label={`Charge Per Click (${defaultCurrency})`}
                          type="number"
                          min="0"
                          step="any"
                          required
                          value={adBillingDraft.pricePerClick}
                          onChange={(e) => updateAdBillingField('pricePerClick', e.target.value)}
                        />
                        <Input
                          label="Charge Cooldown (minutes)"
                          type="number"
                          min="0"
                          step="any"
                          required
                          value={adBillingDraft.chargeIntervalMinutes}
                          onChange={(e) => updateAdBillingField('chargeIntervalMinutes', e.target.value)}
                        />
                        <Input
                          label={`Daily Spend Cap / Ad (${defaultCurrency}, 0 = unlimited)`}
                          type="number"
                          min="0"
                          step="any"
                          required
                          value={adBillingDraft.maxDailySpendPerAd}
                          onChange={(e) => updateAdBillingField('maxDailySpendPerAd', e.target.value)}
                        />
                        <Input
                          label={`Minimum Budget (${defaultCurrency})`}
                          type="number"
                          min="1"
                          step="any"
                          required
                          value={adBillingDraft.minBudget}
                          onChange={(e) => updateAdBillingField('minBudget', e.target.value)}
                        />
                        <Input
                          label={`Default Budget Pre-fill (${defaultCurrency})`}
                          type="number"
                          min="1"
                          step="any"
                          required
                          value={adBillingDraft.defaultBudget}
                          onChange={(e) => updateAdBillingField('defaultBudget', e.target.value)}
                        />
                        <Input
                          label="Ad Refresh Interval (minutes)"
                          type="number"
                          min="1"
                          step="any"
                          required
                          value={adBillingDraft.refreshIntervalMinutes}
                          onChange={(e) => updateAdBillingField('refreshIntervalMinutes', e.target.value)}
                        />
                      </div>
                      <div className="flex flex-wrap gap-5 pt-1">
                        <Switch
                          label="Auto-approve new ad campaigns"
                          checked={adBillingDraft.defaultApproval}
                          onCheckedChange={(v) => updateAdBillingField('defaultApproval', v)}
                        />
                        <Switch
                          label="Refund unspent wallet credits when deleted"
                          checked={adBillingDraft.refundUnspentOnDelete}
                          onCheckedChange={(v) => updateAdBillingField('refundUnspentOnDelete', v)}
                        />
                      </div>
                    </form>
                  )}
                </div>
              );
            })()}
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
                  row.approval ? `Approval: ${String(row.approval)}` : '',
                  row.status ? `Status: ${String(row.status)}` : '',
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
                  const adBudget = Number(row.totalBudget || 0);
                  const adSpent = Number(row.spentBudget || 0);
                  const adRemaining = Math.max(0, adBudget - adSpent);
                  const adViews = Number(row.viewsCount || 0);
                  const adClicks = Number(row.clicksCount || 0);
                  const ctrPct = adViews > 0 ? ((adClicks / adViews) * 100).toFixed(1) : '0.0';
                  primaryLine = String(row.title || row.content || `Campaign ${id}`);
                  secondaryLine = [
                    authorUsername ? `@${authorUsername}` : '',
                    `Spent: ${formatCurrency(adSpent, String(row.currency || defaultCurrency), bootstrap?.currencies, locale)} / ${formatCurrency(adBudget, String(row.currency || defaultCurrency), bootstrap?.currencies, locale)}`,
                    `Rem: ${formatCurrency(adRemaining, String(row.currency || defaultCurrency), bootstrap?.currencies, locale)}`,
                    `${adViews} views · ${adClicks} clicks (${ctrPct}% CTR)`,
                    row.pricePerView !== undefined
                      ? `${formatCurrency(Number(row.pricePerView), String(row.currency || defaultCurrency), bootstrap?.currencies, locale)}/view`
                      : '',
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

                const storyExpired =
                  activeTab === 'stories' && row.expiresAt && resourceLoadedAt > 0
                    ? new Date(String(row.expiresAt)).getTime() <= resourceLoadedAt
                    : false;

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
                          {activeTab === 'chats' && row.type === 'group' && (() => {
                            const gMeta = row.group as Record<string, unknown> | undefined;
                            return (
                              <>
                                {Boolean(gMeta?.verified) && <Badge variant="brand">Verified</Badge>}
                                {Boolean(gMeta?.isPinned) && <Badge variant="brand">Pinned</Badge>}
                                {Boolean(gMeta?.autoJoin) && <Badge variant="default">Auto-Join</Badge>}
                                {gMeta?.postingMode === 'admins_only' && <Badge variant="default">Admins Only</Badge>}
                                {gMeta?.status === 'suspended' && <AdminStatusBadge status="suspended" />}
                              </>
                            );
                          })()}
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
                      {activeTab === 'chats' && (() => {
                        const isGrp = row.type === 'group';
                        const gMeta = (row.group as Record<string, unknown> | undefined) || {};
                        const isSuspended = gMeta.status === 'suspended';
                        return (
                          <>
                            {isGrp && (
                              <>
                                <Button
                                  size="sm"
                                  variant={gMeta.isPinned ? 'brand' : 'outline'}
                                  onClick={() =>
                                    handleAction('chat.update_group', id, {
                                      isPinned: !gMeta.isPinned,
                                    })
                                  }
                                >
                                  <Pin className="h-3.5 w-3.5" />
                                  {gMeta.isPinned ? 'Unpin' : 'Pin'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant={gMeta.autoJoin ? 'brand' : 'outline'}
                                  onClick={() =>
                                    handleAction('chat.update_group', id, {
                                      autoJoin: !gMeta.autoJoin,
                                    })
                                  }
                                >
                                  {gMeta.autoJoin ? 'Auto-Join: On' : 'Auto-Join'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant={gMeta.verified ? 'brand' : 'outline'}
                                  onClick={() =>
                                    handleAction('chat.update_group', id, {
                                      verified: !gMeta.verified,
                                    })
                                  }
                                >
                                  <BadgeCheck className="h-3.5 w-3.5" />
                                  {gMeta.verified ? 'Verified' : 'Verify'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingGroupId(id);
                                    setGroupForm({
                                      name: String(gMeta.name || ''),
                                      description: String(gMeta.description || ''),
                                      category: String(gMeta.category || 'General'),
                                      avatar: String(gMeta.avatar || '/assets/avatars/presets/avatar-h2mjRO.png'),
                                      isPinned: Boolean(gMeta.isPinned),
                                      autoJoin: Boolean(gMeta.autoJoin),
                                      verified: Boolean(gMeta.verified),
                                      unleavable: Boolean(gMeta.unleavable),
                                      postingMode:
                                        gMeta.postingMode === 'admins_only' ? 'admins_only' : 'everyone',
                                      requiresApproval: Boolean(gMeta.requiresApproval),
                                      password: '',
                                      welcomeMessage: '',
                                      isPaid: Boolean(gMeta.isPaid && Number(gMeta.entryPrice || 0) > 0),
                                      entryPrice: Number(gMeta.entryPrice || 500),
                                      monetizationNote: String(gMeta.monetizationNote || ''),
                                    });
                                    setGroupModalOpen(true);
                                  }}
                                >
                                  <Edit3 className="h-3.5 w-3.5" /> Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleAction('chat.update_group', id, {
                                      status: isSuspended ? 'active' : 'suspended',
                                    })
                                  }
                                >
                                  {isSuspended ? 'Activate' : 'Suspend'}
                                </Button>
                              </>
                            )}
                            <Button size="sm" variant="outline" onClick={() => void openChatInspect(id, row)}>
                              <MessageSquare className="h-3.5 w-3.5" /> Inspect
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
                        );
                      })()}
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
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setEditModal({
                                kind: 'ad',
                                id,
                                title: String(row.title || 'Campaign'),
                                pricePerView: String(row.pricePerView ?? 25),
                                totalBudget: String(row.totalBudget ?? 5000),
                                spentBudget: Number(row.spentBudget || 0),
                                resetDailyCap: false,
                              })
                            }
                          >
                            <Edit3 className="h-3.5 w-3.5" /> Billing
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
              : editModal?.kind === 'ad'
                ? 'Adjust Campaign Credit Billing'
                : 'Edit Job Listing'
        }
      >
        {editModal?.kind === 'ad' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await handleAction('ad.adjust_billing', editModal.id, {
                pricePerView: Number(editModal.pricePerView || 25),
                totalBudget: Number(editModal.totalBudget || 5000),
                resetDailyCap: editModal.resetDailyCap,
              });
              setEditModal(null);
            }}
            className="space-y-3"
          >
            <p className="text-par-n font-semibold text-lab-pr">{editModal.title}</p>
            <p className="text-cap-l text-lab-sc">
              Spent so far: {formatCurrency(editModal.spentBudget, defaultCurrency, bootstrap?.currencies, locale)}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Input
                label={`Rate / View (${defaultCurrency})`}
                type="number"
                min="0.01"
                step="any"
                value={editModal.pricePerView}
                onChange={(e) => setEditModal({ ...editModal, pricePerView: e.target.value })}
                required
              />
              <Input
                label={`Total Budget (${defaultCurrency})`}
                type="number"
                min={editModal.spentBudget}
                step="any"
                value={editModal.totalBudget}
                onChange={(e) => setEditModal({ ...editModal, totalBudget: e.target.value })}
                required
              />
            </div>
            <Switch
              checked={editModal.resetDailyCap}
              onCheckedChange={(v) => setEditModal({ ...editModal, resetDailyCap: v })}
              label="Reset daily spend cap & charge cooldown"
            />
            <Button type="submit" variant="primary" className="w-full">
              Save Campaign Billing
            </Button>
          </form>
        )}
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

      {/* PHP-Parity + Full Message Thread Chat Inspector Modal */}
      <Modal
        open={chatInspectState !== null}
        onClose={() => setChatInspectState(null)}
        maxWidthClass="max-w-3xl"
        title={
          chatInspectState?.chat
            ? (chatInspectState.chat.group as { name?: string } | undefined)?.name ||
            `Inspect ${String(chatInspectState.chat.type || 'direct').toUpperCase()} Chat`
            : 'Inspect Conversation'
        }
      >
        {chatInspectState && (() => {
          const c = chatInspectState.chat || {};
          const grp = c.group as { name?: string; description?: string; avatar?: string } | undefined;
          const participants = Array.isArray(c.participants)
            ? (c.participants as Array<{
              userId?: {
                _id?: string;
                username?: string;
                firstName?: string;
                lastName?: string;
                email?: string;
                avatar?: string;
                status?: string;
                role?: string;
                verified?: boolean;
              };
            }>)
            : [];
          const chatType = String(c.type || 'direct');

          return (
            <div className="space-y-4">
              {/* Overview & PHP Metadata Grid */}
              <div className="rounded-2xl border border-bord-pr bg-fill-qt/50 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={chatType === 'group' ? 'brand' : 'outline'} className="capitalize">
                      {chatType}
                    </Badge>
                    <Badge variant="default">
                      {Number(c.participantsCount ?? participants.length)} participant(s)
                    </Badge>
                    <Badge variant="default">
                      {Number(c.messagesCount ?? chatInspectState.messages.length)} message(s)
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void openChatInspect(chatInspectState.chatId, c, chatInspectState.limit)}
                      disabled={chatInspectState.loading}
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', chatInspectState.loading && 'animate-spin')} /> Sync
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        setConfirmState({
                          title: 'Delete entire conversation?',
                          description: 'Deletes the entire chat thread, attachments, and all stored messages permanently.',
                          confirmLabel: 'Delete Chat',
                          variant: 'danger',
                          onConfirm: () => handleAction('chat.delete', chatInspectState.chatId),
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete Chat
                    </Button>
                  </div>
                </div>

                {chatType === 'group' && grp && (
                  <div className="flex items-center gap-3 pt-1 border-t border-bord-pr/70">
                    <Avatar src={grp.avatar} alt={grp.name || 'Group'} fallback={grp.name} size="md" />
                    <div className="min-w-0">
                      <p className="font-bold text-par-n text-lab-pr truncate">{grp.name || 'Group Chat'}</p>
                      {grp.description && <p className="text-cap-l text-lab-sc line-clamp-2">{grp.description}</p>}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-cap-s text-lab-sc pt-1 border-t border-bord-pr/70">
                  <p className="truncate font-mono">
                    #ID: <span className="text-lab-pr">{chatInspectState.chatId}</span>
                  </p>
                  {Boolean(c.chatUuid) && (
                    <p className="truncate font-mono">
                      #HASH: <span className="text-lab-pr">{String(c.chatUuid)}</span>
                    </p>
                  )}
                  {Boolean(c.createdAt) && (
                    <p>Created: {new Date(String(c.createdAt)).toLocaleString()}</p>
                  )}
                  {Boolean(c.lastActivity) && (
                    <p>Last activity: {new Date(String(c.lastActivity)).toLocaleString()}</p>
                  )}
                </div>
              </div>

              {/* Participants */}
              <div className="space-y-2">
                <p className="text-cap-s font-semibold uppercase tracking-wide text-lab-tr">
                  Participants ({participants.length})
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {participants.map((p, idx) => {
                    const pu = p.userId;
                    const displayName =
                      `${pu?.firstName || ''} ${pu?.lastName || ''}`.trim() || pu?.username || 'User';
                    return (
                      <div
                        key={pu?._id || idx}
                        className="rounded-xl border border-bord-pr bg-bg-pr p-2.5 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar src={pu?.avatar} alt={displayName} fallback={pu?.username} size="sm" />
                          <div className="min-w-0">
                            <p className="text-cap-l font-semibold text-lab-pr truncate">{displayName}</p>
                            <p className="text-cap-s text-lab-sc truncate">
                              @{pu?.username || 'user'}
                              {pu?.email ? ` · ${pu.email}` : ''}
                            </p>
                          </div>
                        </div>
                        {pu?.username && (
                          <Link href={`/u/${pu.username}`} target="_blank" title="Open user profile">
                            <Button size="sm" variant="ghost">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Live Message & Attachment Thread */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-cap-s font-semibold uppercase tracking-wide text-lab-tr">
                    Conversation Messages
                  </p>
                  {chatInspectState.hasMore && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={chatInspectState.loading}
                      onClick={() =>
                        void openChatInspect(
                          chatInspectState.chatId,
                          c,
                          Math.min(100, chatInspectState.limit + 40)
                        )
                      }
                    >
                      Load older messages
                    </Button>
                  )}
                </div>

                <div className="rounded-2xl border border-bord-pr bg-fill-qt/30 max-h-[360px] overflow-y-auto p-3 space-y-2.5">
                  {chatInspectState.loading && chatInspectState.messages.length === 0 ? (
                    <p className="text-center text-cap-l text-lab-sc py-8">Loading messages...</p>
                  ) : chatInspectState.messages.length === 0 ? (
                    <p className="text-center text-cap-l text-lab-sc py-8">
                      No messages in this conversation yet.
                    </p>
                  ) : (
                    chatInspectState.messages.map((msg) => {
                      const senderName =
                        `${msg.sender?.firstName || ''} ${msg.sender?.lastName || ''}`.trim() ||
                        (msg.sender?.username ? `@${msg.sender.username}` : 'User');
                      const rawMediaUrl = msg.media?.publicUrl || msg.media?.url || '';
                      const mediaUrl = rawMediaUrl ? resolveMediaUrl(rawMediaUrl) || rawMediaUrl : '';

                      return (
                        <div
                          key={msg._id}
                          className={cn(
                            'rounded-xl border border-bord-pr bg-bg-pr p-3 space-y-2',
                            msg.isDeleted && 'opacity-65'
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar
                                src={msg.sender?.avatar}
                                alt={senderName}
                                fallback={msg.sender?.username}
                                size="xs"
                              />
                              <div className="min-w-0">
                                <p className="text-cap-l font-semibold text-lab-pr truncate">
                                  {senderName}
                                  {msg.sender?.username && (
                                    <span className="font-normal text-lab-sc"> @{msg.sender.username}</span>
                                  )}
                                </p>
                                {msg.createdAt && (
                                  <p className="text-cap-s text-lab-tr">
                                    {new Date(msg.createdAt).toLocaleString()}
                                  </p>
                                )}
                              </div>
                            </div>

                            {!msg.isDeleted ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setConfirmState({
                                    title: 'Delete message?',
                                    description: 'Redacts this message and removes any attached media for moderation.',
                                    confirmLabel: 'Remove Message',
                                    variant: 'danger',
                                    onConfirm: () => handleAction('chat.delete_message', msg._id),
                                  })
                                }
                                title="Remove message"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-red-900" />
                              </Button>
                            ) : (
                              <Badge variant="outline">Removed</Badge>
                            )}
                          </div>

                          {msg.content && (
                            <p className="text-par-s text-lab-pr whitespace-pre-wrap break-words">
                              {msg.content}
                            </p>
                          )}

                          {mediaUrl && !msg.isDeleted && (
                            <div className="rounded-xl overflow-hidden border border-bord-pr bg-fill-qt max-w-sm">
                              {msg.media?.type === 'video' || msg.media?.type === 'video_circle' ? (
                                <video src={mediaUrl} controls className="max-h-56 w-full object-contain" />
                              ) : msg.media?.type === 'audio' ? (
                                <audio src={mediaUrl} controls className="w-full p-2" />
                              ) : msg.media?.type === 'document' ? (
                                <a
                                  href={mediaUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 p-2.5 text-cap-l text-brand-900 hover:underline"
                                >
                                  <FileText className="h-4 w-4" /> Open attached file
                                </a>
                              ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={mediaUrl} alt="Chat attachment" className="max-h-56 w-full object-contain" />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          );
        })()}
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

      {/* Admin Create / Edit Community Group Modal */}
      <Modal
        open={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        title={editingGroupId ? 'Edit Community Group' : 'Create Community Group'}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (editingGroupId) {
              await handleAction('chat.update_group', editingGroupId, groupForm);
            } else {
              await handleAction('chat.create_group', '', groupForm);
            }
            setGroupModalOpen(false);
          }}
          className="space-y-4 max-h-[75dvh] overflow-y-auto pr-1"
        >
          <Input
            label="Group Name"
            placeholder="e.g. Verified Creators Lounge"
            value={groupForm.name}
            onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <Textarea
            label="Description"
            placeholder="Describe this room's topic and rules..."
            rows={3}
            value={groupForm.description}
            onChange={(e) => setGroupForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Category"
              value={groupForm.category}
              onChange={(e) => setGroupForm((f) => ({ ...f, category: e.target.value }))}
            >
              {['General', 'Tech & Creators', 'Marketplace', 'Gaming', 'Music & Culture', 'Support'].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Select
              label="Posting Mode"
              value={groupForm.postingMode}
              onChange={(e) =>
                setGroupForm((f) => ({
                  ...f,
                  postingMode: e.target.value as 'everyone' | 'admins_only',
                }))
              }
            >
              <option value="everyone">All Members</option>
              <option value="admins_only">Admins Only</option>
            </Select>
          </div>
          <Input
            label={editingGroupId ? 'New Password (optional)' : 'Room Password (optional)'}
            type="password"
            placeholder="Leave empty for open entry"
            value={groupForm.password}
            onChange={(e) => setGroupForm((f) => ({ ...f, password: e.target.value }))}
          />
          {!editingGroupId && (
            <Input
              label="Welcome Message (optional)"
              placeholder="First pinned welcome post inside the room"
              value={groupForm.welcomeMessage}
              onChange={(e) => setGroupForm((f) => ({ ...f, welcomeMessage: e.target.value }))}
            />
          )}
          <div className="grid grid-cols-2 gap-2 text-cap-l">
            <label className="flex items-center justify-between rounded-xl border border-bord-pr px-3 py-2 cursor-pointer">
              <span>Pin to top</span>
              <Switch
                checked={groupForm.isPinned}
                onCheckedChange={(v) => setGroupForm((f) => ({ ...f, isPinned: v }))}
              />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-bord-pr px-3 py-2 cursor-pointer">
              <span>Auto-Join users</span>
              <Switch
                checked={groupForm.autoJoin}
                onCheckedChange={(v) => setGroupForm((f) => ({ ...f, autoJoin: v }))}
              />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-bord-pr px-3 py-2 cursor-pointer">
              <span>Verified badge</span>
              <Switch
                checked={groupForm.verified}
                onCheckedChange={(v) => setGroupForm((f) => ({ ...f, verified: v }))}
              />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-bord-pr px-3 py-2 cursor-pointer">
              <span>Unleavable room</span>
              <Switch
                checked={groupForm.unleavable}
                onCheckedChange={(v) => setGroupForm((f) => ({ ...f, unleavable: v }))}
              />
            </label>
          </div>
          <div className="rounded-xl border border-bord-pr bg-fill-qt/40 p-3 space-y-2.5">
            <label className="flex items-center justify-between cursor-pointer text-cap-l font-semibold text-lab-pr">
              <span>Monetize Group (Paid Entry Fee)</span>
              <Switch
                checked={groupForm.isPaid}
                onCheckedChange={(v) => setGroupForm((f) => ({ ...f, isPaid: v }))}
              />
            </label>
            {groupForm.isPaid && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <Input
                  label="Entry Fee (NGN)"
                  type="number"
                  min={50}
                  step={50}
                  value={String(groupForm.entryPrice)}
                  onChange={(e) => setGroupForm((f) => ({ ...f, entryPrice: Number(e.target.value || 0) }))}
                />
                <Input
                  label="Perks Note (optional)"
                  placeholder="VIP room benefits..."
                  value={groupForm.monetizationNote}
                  onChange={(e) => setGroupForm((f) => ({ ...f, monetizationNote: e.target.value }))}
                />
              </div>
            )}
          </div>
          <AvatarPresetPicker
            selectedUrl={groupForm.avatar}
            onSelect={(url) => setGroupForm((f) => ({ ...f, avatar: url }))}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setGroupModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {editingGroupId ? 'Save Changes' : 'Create Group'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Admin Broadcast to Active Groups Modal */}
      <Modal
        open={broadcastGroupModalOpen}
        onClose={() => setBroadcastGroupModalOpen(false)}
        title="Broadcast Message to Active Groups"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!broadcastGroupText.trim()) return;
            await handleAction('chat.broadcast_groups', '', {
              message: broadcastGroupText.trim(),
            });
            setBroadcastGroupModalOpen(false);
            setBroadcastGroupText('');
          }}
          className="space-y-4"
        >
          <Textarea
            label="Announcement Message"
            placeholder="Write an announcement to post across all active community groups..."
            rows={4}
            value={broadcastGroupText}
            onChange={(e) => setBroadcastGroupText(e.target.value)}
            required
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setBroadcastGroupModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Send Broadcast
            </Button>
          </div>
        </form>
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
