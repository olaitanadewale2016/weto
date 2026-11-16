'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  BadgeCheck,
  Check,
  CheckCircle2,
  Clock,
  Edit3,
  ExternalLink,
  Eye,
  Megaphone,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
  UserPlus,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch, uploadFileToR2 } from '@/lib/api-client';
import { formatCurrency } from '@/lib/currency';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';

export type AdminActionFn = (action: string, targetId?: string, payload?: Record<string, unknown>) => Promise<void>;

export function AdminOverviewSection({
  overview,
  onAction,
  onNavigateTab,
}: {
  overview: {
    defaultCurrency?: string;
    metrics: Record<string, number>;
    recentUsers: Array<{ _id: string; username: string; email: string; role: string; status: string }>;
    recentPayments: Array<{ _id: string; amount: number; currency: string; status: string; provider?: string; paymentMethod?: string; userId?: { username: string } }>;
  } | null;
  onAction: AdminActionFn;
  onNavigateTab?: (tab: string) => void;
}) {
  const { bootstrap, locale } = useApp();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [clearingCache, setClearingCache] = useState(false);

  if (!overview) return null;
  const m = overview.metrics;
  const currency = overview.defaultCurrency || 'NGN';

  const cards: Array<{ label: string; value: string | number; tab?: string }> = [
    { label: 'Total Users', value: m.usersCount, tab: 'users' },
    { label: 'Publications', value: m.postsCount, tab: 'posts' },
    { label: 'Active Stories', value: m.storiesCount, tab: 'stories' },
    { label: 'Products', value: m.productsCount, tab: 'marketplace' },
    { label: 'Job Listings', value: m.jobsCount, tab: 'jobs' },
    { label: 'Businesses', value: m.businessesCount, tab: 'businesses' },
    { label: 'Pending Reports', value: m.pendingReports, tab: 'reports' },
    { label: 'Pending Cashouts', value: m.pendingCashouts, tab: 'cashouts' },
    {
      label: 'Total Revenue',
      value: formatCurrency(m.totalRevenue || 0, currency, bootstrap?.currencies, locale),
      tab: 'payments',
    },
    { label: 'Media Storage', value: `${((m.totalStorageBytes || 0) / (1024 * 1024)).toFixed(2)} MB`, tab: 'storage' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-cap-l text-lab-sc">Live platform counters and operational controls</p>
        <div className="flex items-center gap-2">
          {onNavigateTab && (
            <Button size="sm" variant="outline" onClick={() => onNavigateTab('lab')}>
              <Wrench className="h-3.5 w-3.5" /> System Lab
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={clearingCache}
            onClick={async () => {
              setClearingCache(true);
              try {
                await onAction('cache.reset');
              } finally {
                setClearingCache(false);
              }
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${clearingCache ? 'animate-spin' : ''}`} />
            Clear Platform Cache
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map((c) => {
          const clickable = Boolean(onNavigateTab && c.tab);
          return (
            <button
              key={c.label}
              type="button"
              disabled={!clickable}
              onClick={() => c.tab && onNavigateTab?.(c.tab)}
              className={`text-left rounded-2xl border border-bord-card bg-bg-pr p-4 transition-colors ${clickable ? 'hover:border-lab-pr2/50 hover:bg-fill-pr/30 cursor-pointer' : 'cursor-default'
                }`}
            >
              <p className="text-cap-s text-lab-sc">{c.label}</p>
              <p className="font-outfit text-title-2 font-bold text-lab-pr mt-1">{c.value}</p>
            </button>
          );
        })}
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await onAction('announcement.broadcast', undefined, { title, message });
          setTitle('');
          setMessage('');
        }}
        className="rounded-3xl border border-bord-card bg-fill-pr/40 p-5 space-y-3"
      >
        <h3 className="font-bold text-par-m text-lab-pr flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-lab-pr2" /> Broadcast Platform Announcement (Push + In-App)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input placeholder="Announcement title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <div className="md:col-span-2 flex gap-2">
            <Input placeholder="Message to all active users..." value={message} onChange={(e) => setMessage(e.target.value)} required />
            <Button type="submit" variant="primary" className="shrink-0">
              <Send className="h-4 w-4" /> Send
            </Button>
          </div>
        </div>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-3xl border border-bord-card p-4 space-y-2">
          <h3 className="font-bold text-par-m text-lab-pr">Recent Signups</h3>
          {overview.recentUsers.map((u) => (
            <div key={u._id} className="flex items-center justify-between py-1.5 border-b border-bord-pr last:border-none text-cap-l">
              <span>@{u.username} ({u.email})</span>
              <Badge variant="brand">{u.status}</Badge>
            </div>
          ))}
        </div>
        <div className="rounded-3xl border border-bord-card p-4 space-y-2">
          <h3 className="font-bold text-par-m text-lab-pr">Recent Payments</h3>
          {overview.recentPayments.length === 0 ? (
            <p className="text-cap-l text-lab-sc py-2">No payment records yet.</p>
          ) : (
            overview.recentPayments.map((p) => (
              <div key={p._id} className="flex items-center justify-between py-1.5 border-b border-bord-pr last:border-none text-cap-l">
                <span>@{p.userId?.username || 'user'} · {p.paymentMethod || p.provider || 'payment'}</span>
                <span className="font-bold">
                  {formatCurrency(p.amount, p.currency, bootstrap?.currencies, locale)} ({p.status})
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export interface AdminUserRow {
  _id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string;
  caption?: string;
  bio?: string;
  country?: string;
  countryCode?: string;
  city?: string;
  ipAddress?: string;
  lastActive?: string;
  createdAt?: string;
  publicationsCount?: number;
  followersCount?: number;
  followingCount?: number;
  role: string;
  status: string;
  type: string;
  verified: boolean;
}

export function AdminUsersSection({
  rows,
  defaultCurrency = 'NGN',
  userFilter = 'all',
  onUserFilterChange,
  onAction,
}: {
  rows: AdminUserRow[];
  defaultCurrency?: string;
  userFilter?: string;
  onUserFilterChange?: (next: string) => void;
  onAction: AdminActionFn;
}) {
  const [creditAmounts, setCreditAmounts] = useState<Record<string, string>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUserRow | null>(null);
  const [inspectUser, setInspectUser] = useState<AdminUserRow | null>(null);
  const [banningUser, setBanningUser] = useState<AdminUserRow | null>(null);
  const [banReasonText, setBanReasonText] = useState('');
  const [setBalanceValue, setSetBalanceValue] = useState('');

  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    firstName: '',
    lastName: '',
    city: 'Lagos',
    country: 'Nigeria',
    type: 'author',
    role: 'user',
    verified: false,
    initialBalance: '0',
  });

  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    caption: '',
    bio: '',
    city: '',
    country: '',
    type: 'author',
  });

  function startEdit(u: AdminUserRow) {
    setEditingUser(u);
    setEditForm({
      firstName: u.firstName || '',
      lastName: u.lastName || '',
      caption: u.caption || '',
      bio: u.bio || '',
      city: u.city || '',
      country: u.country || '',
      type: u.type || 'author',
    });
  }

  const userFilterTabs = [
    { key: 'all', label: 'All Users' },
    { key: 'author', label: 'Authors' },
    { key: 'reader', label: 'Readers' },
    { key: 'blocked', label: 'Blocked' },
  ];

  const visibleRows = onUserFilterChange
    ? rows
    : rows.filter((u) => {
      if (userFilter === 'author') return u.type === 'author';
      if (userFilter === 'reader') return u.type === 'reader';
      if (userFilter === 'blocked') return u.status === 'blocked' || u.status === 'suspended';
      return true;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {userFilterTabs.map((ft) => (
            <button
              key={ft.key}
              type="button"
              onClick={() => onUserFilterChange?.(ft.key)}
              className={`rounded-full px-3 py-1 text-cap-s font-medium transition-colors cursor-pointer ${userFilter === ft.key
                ? 'bg-lab-pr text-bg-pr'
                : 'bg-fill-qt text-lab-sc hover:text-lab-pr'
                }`}
            >
              {ft.label}
            </button>
          ))}
          <span className="ml-1 text-cap-s text-lab-sc">({visibleRows.length})</span>
        </div>
        <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
          <UserPlus className="h-3.5 w-3.5" /> Create User
        </Button>
      </div>

      <div className="space-y-3">
        {visibleRows.length === 0 ? (
          <div className="rounded-2xl border border-bord-card bg-bg-pr p-6 text-center text-par-n text-lab-sc">
            No user accounts match this filter.
          </div>
        ) : (
          visibleRows.map((u) => (
            <div key={u._id} className="rounded-2xl border border-bord-card bg-bg-pr p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar src={u.avatar} alt={u.username} verified={u.verified} size="md" />
                <div className="min-w-0">
                  <p className="font-bold text-par-n text-lab-pr truncate">
                    {u.firstName} {u.lastName} <span className="font-normal text-lab-sc">(@{u.username})</span>
                  </p>
                  <p className="text-cap-s text-lab-sc truncate">
                    {u.email}{u.city || u.country ? ` · ${[u.city, u.country].filter(Boolean).join(', ')}` : ''}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <Badge variant="brand">{u.role}</Badge>
                    <Badge variant="outline">{u.type}</Badge>
                    <Badge variant={u.status === 'active' ? 'success' : 'danger'}>{u.status}</Badge>
                    {u.verified && <Badge variant="brand">Verified</Badge>}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Button size="sm" variant="ghost" title="Inspect user details" onClick={() => setInspectUser(u)}>
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                <Link href={`/@${u.username}`} target="_blank">
                  <Button size="sm" variant="ghost" title="View public profile">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </Link>
                <Button size="sm" variant="outline" onClick={() => startEdit(u)}>
                  <Edit3 className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button size="sm" variant="outline" onClick={() => onAction('user.toggle_verify', u._id)}>
                  <ShieldCheck className="h-3.5 w-3.5" /> {u.verified ? 'Unverify' : 'Verify'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => onAction('user.toggle_author', u._id)}>
                  {u.type === 'author' ? 'Set Reader' : 'Make Author'}
                </Button>
                {u.status !== 'blocked' ? (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      setBanningUser(u);
                      setBanReasonText('');
                    }}
                  >
                    Ban
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => onAction('user.set_status', u._id, { status: 'active' })}>
                    Activate
                  </Button>
                )}
                <Select
                  value={u.role}
                  onChange={(e) => onAction('user.set_role', u._id, { role: e.target.value })}
                  className="h-8 w-28 text-cap-s"
                >
                  <option value="user">user</option>
                  <option value="moderator">moderator</option>
                  <option value="admin">admin</option>
                  <option value="root">root</option>
                </Select>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    placeholder={`+${defaultCurrency}`}
                    value={creditAmounts[u._id] || ''}
                    onChange={(e) => setCreditAmounts({ ...creditAmounts, [u._id]: e.target.value })}
                    className="h-8 w-24 rounded-xl border border-bord-pr bg-input-pr px-2 text-cap-s"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onAction('user.adjust_wallet', u._id, { amount: Number(creditAmounts[u._id] || 0), currency: defaultCurrency })}
                  >
                    Credit
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    if (confirm(`Delete @${u.username}?`)) {
                      onAction('user.delete', u._id);
                    }
                  }}
                  title="Delete user"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )))}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create User Account">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onAction('user.create', undefined, {
              ...newUser,
              initialBalance: Number(newUser.initialBalance || 0),
              currency: defaultCurrency,
            });
            setCreateOpen(false);
            setNewUser({
              username: '',
              email: '',
              firstName: '',
              lastName: '',
              city: 'Lagos',
              country: 'Nigeria',
              type: 'author',
              role: 'user',
              verified: false,
              initialBalance: '0',
            });
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <Input label="First Name" value={newUser.firstName} onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })} required />
            <Input label="Last Name" value={newUser.lastName} onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Username" placeholder="ade_lagos" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} required />
            <Input label="Email" type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="City" value={newUser.city} onChange={(e) => setNewUser({ ...newUser, city: e.target.value })} />
            <Input label="Country" value={newUser.country} onChange={(e) => setNewUser({ ...newUser, country: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Select label="Account Type" value={newUser.type} onChange={(e) => setNewUser({ ...newUser, type: e.target.value })}>
              <option value="author">Author</option>
              <option value="reader">Reader</option>
            </Select>
            <Select label="Role" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
              <option value="user">User</option>
              <option value="moderator">Moderator</option>
              <option value="admin">Admin</option>
            </Select>
            <Input
              label={`Balance (${defaultCurrency})`}
              type="number"
              min="0"
              value={newUser.initialBalance}
              onChange={(e) => setNewUser({ ...newUser, initialBalance: e.target.value })}
            />
          </div>
          <Switch checked={newUser.verified} onCheckedChange={(v) => setNewUser({ ...newUser, verified: v })} label="Verified badge" />
          <Button type="submit" variant="primary" className="w-full">
            Create User
          </Button>
        </form>
      </Modal>

      <Modal open={Boolean(editingUser)} onClose={() => setEditingUser(null)} title={`Edit @${editingUser?.username || ''}`}>
        {editingUser && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await onAction('user.update', editingUser._id, editForm);
              setEditingUser(null);
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <Input label="First Name" value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} required />
              <Input label="Last Name" value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} />
            </div>
            <Input label="Caption / Headline" value={editForm.caption} onChange={(e) => setEditForm({ ...editForm, caption: e.target.value })} />
            <Textarea label="Bio" value={editForm.bio} onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <Input label="City" value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} />
              <Input label="Country" value={editForm.country} onChange={(e) => setEditForm({ ...editForm, country: e.target.value })} />
              <Select label="Account Type" value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}>
                <option value="author">Author</option>
                <option value="reader">Reader</option>
              </Select>
            </div>
            <Button type="submit" variant="primary" className="w-full">
              Save User Changes
            </Button>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(inspectUser)} onClose={() => setInspectUser(null)} title={inspectUser ? `@${inspectUser.username} Details` : 'User Details'}>
        {inspectUser && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar src={inspectUser.avatar} alt={inspectUser.username} verified={inspectUser.verified} size="lg" />
              <div className="min-w-0">
                <p className="font-bold text-par-l text-lab-pr">
                  {inspectUser.firstName} {inspectUser.lastName}
                </p>
                <p className="text-cap-l text-lab-sc">@{inspectUser.username} · {inspectUser.email}</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <Badge variant="brand">{inspectUser.role}</Badge>
                  <Badge variant="outline">{inspectUser.type}</Badge>
                  <Badge variant={inspectUser.status === 'active' ? 'success' : 'danger'}>{inspectUser.status}</Badge>
                  {inspectUser.verified && <Badge variant="brand">Verified</Badge>}
                </div>
              </div>
            </div>

            {inspectUser.bio && (
              <div className="rounded-2xl bg-fill-qt/60 p-3 text-cap-l text-lab-pr">{inspectUser.bio}</div>
            )}

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-bord-pr p-2.5">
                <p className="font-bold text-par-m text-lab-pr">{inspectUser.publicationsCount ?? 0}</p>
                <p className="text-cap-s text-lab-sc">Posts</p>
              </div>
              <div className="rounded-xl border border-bord-pr p-2.5">
                <p className="font-bold text-par-m text-lab-pr">{inspectUser.followersCount ?? 0}</p>
                <p className="text-cap-s text-lab-sc">Followers</p>
              </div>
              <div className="rounded-xl border border-bord-pr p-2.5">
                <p className="font-bold text-par-m text-lab-pr">{inspectUser.followingCount ?? 0}</p>
                <p className="text-cap-s text-lab-sc">Following</p>
              </div>
            </div>

            <div className="space-y-1.5 rounded-2xl border border-bord-pr p-3 text-cap-l">
              <p><span className="text-lab-sc">Location:</span> {[inspectUser.city, inspectUser.country].filter(Boolean).join(', ') || '—'}</p>
              <p><span className="text-lab-sc">Last IP:</span> {inspectUser.ipAddress || '—'}</p>
              <p><span className="text-lab-sc">Last Active:</span> {inspectUser.lastActive ? new Date(inspectUser.lastActive).toLocaleString() : '—'}</p>
              <p><span className="text-lab-sc">Joined:</span> {inspectUser.createdAt ? new Date(inspectUser.createdAt).toLocaleString() : '—'}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await onAction('user.toggle_author', inspectUser._id);
                  setInspectUser(null);
                }}
              >
                {inspectUser.type === 'author' ? 'Revoke Authorship' : 'Grant Authorship'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await onAction('user.toggle_verify', inspectUser._id);
                  setInspectUser(null);
                }}
              >
                {inspectUser.verified ? 'Remove Verification' : 'Verify Account'}
              </Button>
            </div>

            <div className="rounded-2xl border border-bord-pr bg-fill-qt/40 p-3 space-y-2">
              <p className="text-cap-l font-bold text-lab-pr">Set User Wallet Balance</p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder={`New balance (${defaultCurrency})`}
                  value={setBalanceValue}
                  onChange={(e) => setSetBalanceValue(e.target.value)}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={setBalanceValue.trim() === '' || Number(setBalanceValue) < 0}
                  onClick={async () => {
                    await onAction('user.set_wallet_balance', inspectUser._id, {
                      balance: Number(setBalanceValue),
                      currency: defaultCurrency,
                    });
                    setSetBalanceValue('');
                    setInspectUser(null);
                  }}
                >
                  Apply Balance
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(banningUser)} onClose={() => setBanningUser(null)} title={`Ban @${banningUser?.username || ''}`}>
        {banningUser && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await onAction('user.set_status', banningUser._id, {
                status: 'blocked',
                reason: banReasonText.trim() || 'Admin ban',
              });
              setBanningUser(null);
              setBanReasonText('');
            }}
            className="space-y-3"
          >
            <Textarea
              label="Moderation Reason"
              placeholder="Optional reason logged to moderation audit history..."
              value={banReasonText}
              onChange={(e) => setBanReasonText(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setBanningUser(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="danger">
                Confirm Ban
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

export function AdminSecurityModSection({
  resource,
  data,
  onAction,
}: {
  resource: string;
  data: unknown;
  onAction: AdminActionFn;
}) {
  const [banValue, setBanValue] = useState('');
  const [banType, setBanType] = useState('ip_address');
  const [banReason, setBanReason] = useState('');
  const [banExpiryDays, setBanExpiryDays] = useState('0');
  const [censorWord, setCensorWord] = useState('');
  const [censorLevel, setCensorLevel] = useState('replaced');
  const [editingCensorId, setEditingCensorId] = useState<string | null>(null);

  if (resource === 'banning') {
    const d = (data || { blacklists: [], censors: [] }) as {
      blacklists: Array<{
        _id: string;
        type: string;
        blacklistable: string;
        reason?: string;
        expiresAt?: string | null;
        addedAt?: string;
        adminId?: { username?: string };
      }>;
      censors: Array<{ _id: string; word: string; level: string }>;
    };
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-cap-l text-amber-800 dark:text-amber-300">
            <span className="font-bold">Security Cache &amp; Enforcement:</span> Blacklisted IPs, emails, phones, and censored words are enforced immediately on registration, auth, and publishing. Reset cache after batch updates.
          </div>
          <Button size="sm" variant="secondary" onClick={() => onAction('cache.reset')}>
            <RefreshCw className="h-3.5 w-3.5" /> Reset Security Cache
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-3xl border border-bord-card p-5 space-y-4">
            <h3 className="font-bold text-par-m text-lab-pr flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-lab-pr2" /> Blacklist (IP / Email / Phone / Username)
            </h3>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Select value={banType} onChange={(e) => setBanType(e.target.value)} className="w-36">
                  <option value="ip_address">IP Address</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="username">Username</option>
                </Select>
                <Input
                  placeholder="Value to block (e.g. 192.168.1.1)"
                  value={banValue}
                  onChange={(e) => setBanValue(e.target.value)}
                  className="flex-1 min-w-[160px]"
                />
                <Select value={banExpiryDays} onChange={(e) => setBanExpiryDays(e.target.value)} className="w-36">
                  <option value="0">Permanent</option>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                </Select>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Reason (optional)"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="danger"
                  disabled={!banValue.trim()}
                  onClick={async () => {
                    await onAction('blacklist.add', undefined, {
                      type: banType,
                      value: banValue.trim(),
                      reason: banReason.trim(),
                      expiresInDays: Number(banExpiryDays || 0),
                    });
                    setBanValue('');
                    setBanReason('');
                    setBanExpiryDays('0');
                  }}
                >
                  Block
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              {(d.blacklists || []).length === 0 ? (
                <p className="text-cap-l text-lab-sc">No blacklisted entries.</p>
              ) : (
                (d.blacklists || []).map((b) => (
                  <div key={b._id} className="flex items-center justify-between gap-2 rounded-xl border border-bord-pr px-3 py-2 text-cap-l">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge>{b.type}</Badge>
                        <span className="font-medium text-lab-pr break-all">{b.blacklistable}</span>
                        {b.expiresAt ? (
                          <Badge variant="warning">Expires {new Date(b.expiresAt).toLocaleDateString()}</Badge>
                        ) : (
                          <Badge variant="danger">Permanent</Badge>
                        )}
                      </div>
                      {(b.reason || b.adminId?.username) && (
                        <p className="text-cap-s text-lab-sc mt-0.5">
                          {b.reason ? b.reason : ''}{b.reason && b.adminId?.username ? ' · ' : ''}
                          {b.adminId?.username ? `by @${b.adminId.username}` : ''}
                        </p>
                      )}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => onAction('blacklist.delete', b._id)}>
                      <Trash2 className="h-4 w-4 text-red-900" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-bord-card p-5 space-y-4">
            <h3 className="font-bold text-par-m text-lab-pr">Censor Word Filter</h3>
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Word or phrase to filter"
                value={censorWord}
                onChange={(e) => setCensorWord(e.target.value)}
                className="flex-1 min-w-[160px]"
              />
              <Select value={censorLevel} onChange={(e) => setCensorLevel(e.target.value)} className="w-36">
                <option value="replaced">Mask (***)</option>
                <option value="warning">Warning / Flag</option>
                <option value="banned">Banned Word</option>
              </Select>
              <Button
                variant="primary"
                disabled={!censorWord.trim()}
                onClick={async () => {
                  await onAction(
                    editingCensorId ? 'censor.update' : 'censor.add',
                    editingCensorId || undefined,
                    { word: censorWord.trim(), level: censorLevel }
                  );
                  setCensorWord('');
                  setEditingCensorId(null);
                }}
              >
                {editingCensorId ? 'Update' : 'Add'}
              </Button>
              {editingCensorId && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditingCensorId(null);
                    setCensorWord('');
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {(d.censors || []).length === 0 ? (
                <p className="text-cap-l text-lab-sc">No censored words configured.</p>
              ) : (
                (d.censors || []).map((c) => (
                  <div key={c._id} className="flex items-center justify-between rounded-xl border border-bord-pr px-3 py-2 text-cap-l">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-lab-pr">{c.word}</span>
                      <Badge variant={c.level === 'banned' ? 'danger' : c.level === 'warning' ? 'warning' : 'brand'}>
                        {c.level}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingCensorId(c._id);
                          setCensorWord(c.word);
                          setCensorLevel(c.level);
                        }}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onAction('censor.delete', c._id)}>
                        <Trash2 className="h-4 w-4 text-red-900" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export function AdminConfigSection({
  resource,
  data,
  onAction,
  onNavigateTab,
}: {
  resource: string;
  data: unknown;
  onAction: AdminActionFn;
  onNavigateTab?: (tab: string) => void;
}) {
  const { bootstrap, locale } = useApp();
  const defaultCurrency = bootstrap?.config?.defaultCurrency || 'NGN';
  const { success, error } = useToast();
  const [catName, setCatName] = useState('');
  const [catType, setCatType] = useState('product');
  const [catStatus, setCatStatus] = useState('active');
  const [catFilter, setCatFilter] = useState<'all' | 'product' | 'job'>('all');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [verificationFilter, setVerificationFilter] = useState<'all' | 'verified' | 'unverified'>('all');
  const [cashoutDecisionModal, setCashoutDecisionModal] = useState<{
    id: string;
    decision: 'paid' | 'rejected';
    username: string;
    amountLabel: string;
  } | null>(null);
  const [cashoutNote, setCashoutNote] = useState('');
  const [curCode, setCurCode] = useState('NGN');
  const [curName, setCurName] = useState('Nigerian Naira');
  const [curSymbol, setCurSymbol] = useState('₦');
  const [curSymbolNative, setCurSymbolNative] = useState('₦');
  const [curOrder, setCurOrder] = useState(1);
  const [locCode, setLocCode] = useState('fr');
  const [locName, setLocName] = useState('French');
  const [locNativeName, setLocNativeName] = useState('Français');
  const [locDirection, setLocDirection] = useState<'ltr' | 'rtl'>('ltr');
  const [locOrder, setLocOrder] = useState(2);
  const [pageSlug, setPageSlug] = useState('terms-of-use');
  const [pageTitle, setPageTitle] = useState('Terms of Use');
  const [pageLocale, setPageLocale] = useState('en');
  const [pageContent, setPageContent] = useState('');
  const [pageContentMap, setPageContentMap] = useState<Record<string, string>>({});
  const [testEmail, setTestEmail] = useState('');
  const [draftGroups, setDraftGroups] = useState<Record<string, Record<string, unknown>>>({});
  const [settingsSubTab, setSettingsSubTab] = useState<string>('app');
  const [cashoutFilter, setCashoutFilter] = useState<string>('all');
  const [clearingCache, setClearingCache] = useState(false);
  const [uploadingBrandKey, setUploadingBrandKey] = useState<string | null>(null);

  if (resource === 'categories') {
    const list = (Array.isArray(data) ? data : []) as Array<{
      _id: string;
      categorizableType: string;
      status?: string;
      usageCount?: number;
      localization?: Record<string, string>;
    }>;
    const filteredCats = list.filter((c) => catFilter === 'all' || c.categorizableType === catFilter);
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {(['all', 'product', 'job'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setCatFilter(t)}
                className={`rounded-full px-3 py-1 text-cap-s font-medium capitalize transition-colors cursor-pointer ${catFilter === t ? 'bg-lab-pr text-bg-pr' : 'bg-fill-qt text-lab-sc hover:text-lab-pr'
                  }`}
              >
                {t === 'all' ? 'All Categories' : `${t}s`}
              </button>
            ))}
          </div>
          <span className="text-cap-s text-lab-sc">{filteredCats.length} category item(s)</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={catType} onChange={(e) => setCatType(e.target.value)} className="w-36">
            <option value="product">Product</option>
            <option value="job">Job</option>
          </Select>
          <Select value={catStatus} onChange={(e) => setCatStatus(e.target.value)} className="w-32">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
          <Input
            placeholder="Category name (EN)"
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            className="flex-1 min-w-[200px]"
          />
          <Button
            variant="primary"
            disabled={!catName.trim()}
            onClick={async () => {
              await onAction('category.upsert', editingCatId || undefined, {
                name: catName.trim(),
                type: catType,
                status: catStatus,
              });
              setCatName('');
              setCatStatus('active');
              setEditingCatId(null);
            }}
          >
            <Plus className="h-4 w-4" /> {editingCatId ? 'Update' : 'Add'}
          </Button>
          {editingCatId && (
            <Button
              variant="secondary"
              onClick={() => {
                setEditingCatId(null);
                setCatName('');
                setCatStatus('active');
              }}
            >
              Cancel
            </Button>
          )}
        </div>
        <div className="space-y-2">
          {filteredCats.map((c) => {
            const nameEn = c.localization?.en || Object.values(c.localization || {})[0] || 'Category';
            const status = c.status || 'active';
            return (
              <div
                key={c._id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-bord-pr p-3"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-par-s text-lab-pr">{nameEn}</span>
                  <Badge variant="brand">{c.categorizableType}</Badge>
                  <AdminStatusBadge status={status} />
                  <Badge variant="outline">{c.usageCount ?? 0} listing(s)</Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingCatId(c._id);
                      setCatName(nameEn);
                      setCatType(c.categorizableType);
                      setCatStatus(status);
                    }}
                  >
                    <Edit3 className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onAction('category.delete', c._id)}>
                    <Trash2 className="h-4 w-4 text-red-900" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (resource === 'currencies') {
    const list = (Array.isArray(data) ? data : []) as Array<{
      _id: string;
      alpha3Code: string;
      name: string;
      symbol: string;
      symbolNative?: string;
      order?: number;
      usageCount?: number;
      status: boolean;
      isDefault?: boolean;
    }>;
    const CURRENCY_PRESETS = [
      { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
      { code: 'USD', name: 'US Dollar', symbol: '$' },
      { code: 'EUR', name: 'Euro', symbol: '€' },
      { code: 'GBP', name: 'British Pound', symbol: '£' },
      { code: 'GHS', name: 'Ghanaian Cedi', symbol: '₵' },
      { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
      { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
    ];
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-bord-card bg-bg-pr p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-bold text-par-n text-lab-pr">Add or Update Currency</h4>
            <div className="flex flex-wrap items-center gap-1.5">
              {CURRENCY_PRESETS.map((p) => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => {
                    setCurCode(p.code);
                    setCurName(p.name);
                    setCurSymbol(p.symbol);
                    setCurSymbolNative(p.symbol);
                  }}
                  className="rounded-full bg-fill-qt hover:bg-fill-tr px-2.5 py-1 text-cap-s font-semibold text-lab-pr2 cursor-pointer"
                >
                  {p.code} {p.symbol}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
            <Input
              placeholder="Code (NGN)"
              value={curCode}
              onChange={(e) => setCurCode(e.target.value.toUpperCase())}
            />
            <Input
              placeholder="Name"
              value={curName}
              onChange={(e) => setCurName(e.target.value)}
            />
            <Input
              placeholder="Symbol (₦)"
              value={curSymbol}
              onChange={(e) => setCurSymbol(e.target.value)}
            />
            <Input
              placeholder="Native Symbol"
              value={curSymbolNative}
              onChange={(e) => setCurSymbolNative(e.target.value)}
            />
            <Input
              type="number"
              min={1}
              placeholder="Order"
              value={String(curOrder)}
              onChange={(e) => setCurOrder(Math.max(1, Number(e.target.value) || 1))}
            />
            <Button
              variant="primary"
              onClick={() =>
                onAction('currency.upsert', undefined, {
                  alpha3Code: curCode.trim().toUpperCase(),
                  name: curName.trim(),
                  symbol: curSymbol.trim(),
                  symbolNative: curSymbolNative.trim() || curSymbol.trim(),
                  order: curOrder,
                  status: true,
                })
              }
            >
              Upsert Currency
            </Button>
          </div>
        </div>

        <div className="space-y-2.5">
          {list
            .filter((c) => Boolean(c && c.alpha3Code))
            .map((c) => {
              const codeUpper = String(c.alpha3Code || '').toUpperCase();
              return (
                <div key={c._id || codeUpper} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-bord-pr p-3">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="font-semibold text-lab-pr">{codeUpper}</span>
                    <span className="text-lab-sc">
                      — {c.name} ({c.symbolNative || c.symbol})
                    </span>
                    {typeof c.order === 'number' && (
                      <span className="text-cap-s text-lab-tr">#{c.order}</span>
                    )}
                    {typeof c.usageCount === 'number' && c.usageCount > 0 && (
                      <Badge variant="outline">{c.usageCount} wallets</Badge>
                    )}
                    {c.isDefault && <Badge variant="brand">Default</Badge>}
                    {!c.status && <Badge variant="outline">Disabled</Badge>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setCurCode(codeUpper);
                        setCurName(c.name);
                        setCurSymbol(c.symbol);
                        setCurSymbolNative(c.symbolNative || c.symbol);
                        setCurOrder(c.order || 1);
                      }}
                      title="Edit currency"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                    {!c.isDefault && (
                      <Button size="sm" variant="outline" onClick={() => onAction('currency.set_default', c._id)}>
                        <Star className="h-3.5 w-3.5" /> Set Default
                      </Button>
                    )}
                    <Switch
                      checked={Boolean(c.status)}
                      disabled={Boolean(c.isDefault && c.status)}
                      onCheckedChange={(v) =>
                        onAction('currency.upsert', undefined, {
                          alpha3Code: codeUpper,
                          name: c.name,
                          symbol: c.symbol,
                          symbolNative: c.symbolNative || c.symbol,
                          order: c.order || 1,
                          status: v,
                        })
                      }
                    />
                    {!c.isDefault && (
                      <Button size="sm" variant="ghost" onClick={() => onAction('currency.delete', c._id)}>
                        <Trash2 className="h-4 w-4 text-red-900" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    );
  }

  if (resource === 'locales') {
    const list = (Array.isArray(data) ? data : []) as Array<{
      _id: string;
      alpha2Code: string;
      name: string;
      nativeName?: string;
      direction?: 'ltr' | 'rtl';
      order?: number;
      usageCount?: number;
      status: boolean;
      isDefault?: boolean;
      isPermanent?: boolean;
    }>;
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-bord-card bg-bg-pr p-4 space-y-3">
          <h4 className="font-bold text-par-n text-lab-pr">Add or Update Locale</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
            <Input
              placeholder="Code (fr)"
              value={locCode}
              onChange={(e) => setLocCode(e.target.value.toLowerCase())}
            />
            <Input
              placeholder="Name (French)"
              value={locName}
              onChange={(e) => setLocName(e.target.value)}
            />
            <Input
              placeholder="Native (Français)"
              value={locNativeName}
              onChange={(e) => setLocNativeName(e.target.value)}
            />
            <Select
              value={locDirection}
              onChange={(e) => setLocDirection(e.target.value === 'rtl' ? 'rtl' : 'ltr')}
            >
              <option value="ltr">LTR (Left-to-Right)</option>
              <option value="rtl">RTL (Right-to-Left)</option>
            </Select>
            <Input
              type="number"
              min={1}
              placeholder="Order"
              value={String(locOrder)}
              onChange={(e) => setLocOrder(Math.max(1, Number(e.target.value) || 1))}
            />
            <Button
              variant="primary"
              onClick={() =>
                onAction('locale.upsert', undefined, {
                  alpha2Code: locCode.trim().toLowerCase(),
                  name: locName.trim(),
                  nativeName: locNativeName.trim() || locName.trim(),
                  direction: locDirection,
                  order: locOrder,
                  status: true,
                })
              }
            >
              Upsert Locale
            </Button>
          </div>
        </div>

        <div className="space-y-2.5">
          {list
            .filter((l) => Boolean(l && (l.alpha2Code || (l as { code?: string }).code)))
            .map((l) => {
              const locCodeLower = String(l.alpha2Code || (l as { code?: string }).code || '').toLowerCase();
              const isPermanent = Boolean(l.isPermanent || locCodeLower === 'en');
              return (
                <div key={l._id || locCodeLower} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-bord-pr p-3">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="font-semibold text-lab-pr">{locCodeLower.toUpperCase()}</span>
                    <span className="text-lab-sc">
                      — {l.name}
                      {l.nativeName && l.nativeName !== l.name ? ` (${l.nativeName})` : ''}
                    </span>
                    <Badge variant="outline">{(l.direction || 'ltr').toUpperCase()}</Badge>
                    {typeof l.usageCount === 'number' && l.usageCount > 0 && (
                      <Badge variant="outline">{l.usageCount} users</Badge>
                    )}
                    {l.isDefault && <Badge variant="brand">Default</Badge>}
                    {isPermanent && <Badge variant="outline">Permanent</Badge>}
                    {!l.status && <Badge variant="outline">Disabled</Badge>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setLocCode(locCodeLower);
                        setLocName(l.name);
                        setLocNativeName(l.nativeName || l.name);
                        setLocDirection(l.direction === 'rtl' ? 'rtl' : 'ltr');
                        setLocOrder(l.order || 1);
                      }}
                      title="Edit locale"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                    {!l.isDefault && (
                      <Button size="sm" variant="outline" onClick={() => onAction('locale.set_default', l._id)}>
                        <Star className="h-3.5 w-3.5" /> Set Default
                      </Button>
                    )}
                    <Switch
                      checked={Boolean(l.status)}
                      disabled={Boolean((l.isDefault || isPermanent) && l.status)}
                      onCheckedChange={(v) =>
                        onAction('locale.upsert', undefined, {
                          alpha2Code: locCodeLower,
                          name: l.name,
                          nativeName: l.nativeName || l.name,
                          direction: l.direction || 'ltr',
                          order: l.order || 1,
                          status: v,
                        })
                      }
                    />
                    {!l.isDefault && !isPermanent && (
                      <Button size="sm" variant="ghost" onClick={() => onAction('locale.delete', l._id)}>
                        <Trash2 className="h-4 w-4 text-red-900" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    );
  }

  if (resource === 'static_pages') {
    const list = (Array.isArray(data) ? data : []) as Array<{
      _id: string;
      slug: string;
      title: string;
      contentByLocale?: Record<string, string>;
    }>;
    const localeOptions =
      bootstrap?.locales && bootstrap.locales.length > 0
        ? bootstrap.locales.map((l) => ({
          code: (l.code || l.alpha2Code || 'en').toLowerCase(),
          label: `${l.nativeName || l.name} (${(l.code || l.alpha2Code || 'en').toUpperCase()})`,
        }))
        : [{ code: 'en', label: 'English (EN)' }];

    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-bord-card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-bold text-par-n text-lab-pr">Edit or Create Static Page</h4>
            <span className="text-cap-s text-lab-sc">Public URL: /document/{pageSlug || 'slug'}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Slug (terms-of-use, privacy-policy, about)"
              value={pageSlug}
              onChange={(e) => setPageSlug(e.target.value.toLowerCase())}
            />
            <Input label="Page Title" value={pageTitle} onChange={(e) => setPageTitle(e.target.value)} />
            <Select
              label="Language"
              value={pageLocale}
              onChange={(e) => {
                const nextLoc = e.target.value.toLowerCase();
                const updatedMap = { ...pageContentMap, [pageLocale]: pageContent };
                setPageContentMap(updatedMap);
                setPageLocale(nextLoc);
                setPageContent(updatedMap[nextLoc] ?? '');
              }}
            >
              {localeOptions.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
          <Textarea
            label={`Content (${pageLocale.toUpperCase()})`}
            rows={7}
            value={pageContent}
            onChange={(e) => {
              const nextText = e.target.value;
              setPageContent(nextText);
              setPageContentMap((prev) => ({ ...prev, [pageLocale]: nextText }));
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              onClick={async () => {
                const mergedMap = { ...pageContentMap, [pageLocale]: pageContent };
                await onAction('static_page.upsert', undefined, {
                  slug: pageSlug,
                  title: pageTitle,
                  locale: pageLocale,
                  content: pageContent,
                  contentByLocale: mergedMap,
                });
              }}
            >
              Save Static Page
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setPageSlug('');
                setPageTitle('');
                setPageLocale('en');
                setPageContent('');
                setPageContentMap({});
              }}
            >
              New Page
            </Button>
          </div>
        </div>
        {list
          .filter((p) => Boolean(p && p.slug))
          .map((p) => {
            const translatedLocales = Object.keys(p.contentByLocale || {}).filter((k) =>
              Boolean(p.contentByLocale?.[k]?.trim())
            );
            return (
              <div key={p._id} className="rounded-2xl border border-bord-pr p-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-lab-pr">{p.title}</p>
                    {translatedLocales.map((code) => (
                      <Badge key={code} variant="outline">
                        {code.toUpperCase()}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-cap-s text-lab-sc">/document/{p.slug}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/document/${p.slug}`} target="_blank">
                    <Button size="sm" variant="ghost">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const map = p.contentByLocale || {};
                      setPageSlug(p.slug);
                      setPageTitle(p.title);
                      setPageContentMap(map);
                      setPageContent(map[pageLocale] ?? map.en ?? Object.values(map)[0] ?? '');
                    }}
                  >
                    <Edit3 className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onAction('static_page.delete', p._id)}>
                    <Trash2 className="h-4 w-4 text-red-900" />
                  </Button>
                </div>
              </div>
            );
          })}
      </div>
    );
  }

  const formatSettingLabel = (key: string) =>
    key
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]+/g, ' ')
      .replace(/^./, (c) => c.toUpperCase());

  const renderSettingsGroupCard = (group: string, values: Record<string, unknown>) => {
    const merged = { ...values, ...(draftGroups[group] || {}) };
    const hasEdits = Boolean(draftGroups[group] && Object.keys(draftGroups[group]).length > 0);
    const saveGroup = async () => {
      await onAction('settings.update', undefined, { group, values: merged });
      setDraftGroups((prev) => {
        const next = { ...prev };
        delete next[group];
        return next;
      });
    };

    if (group === 'acquiring') {
      const gateways: Array<{
        title: string;
        subtitle: string;
        statusKey: string;
        fields: Array<{ key: string; label: string }>;
      }> = [
          {
            title: 'Paystack',
            subtitle: 'Cards, Bank Transfer, USSD & Mobile Money (Webhook: /api/v1/payments/webhook/paystack)',
            statusKey: 'paystackStatus',
            fields: [
              { key: 'paystackName', label: 'Display Name' },
              { key: 'paystackPublicKey', label: 'Public Key (pk_...)' },
              { key: 'paystackSecretKey', label: 'Secret Key (sk_...)' },
              { key: 'paystackCurrency', label: 'Currency (e.g. NGN, GHS, ZAR, USD)' },
            ],
          },
          {
            title: 'Stripe',
            subtitle: 'Global Cards & Apple/Google Pay (Webhook: /api/v1/payments/webhook/stripe)',
            statusKey: 'stripeStatus',
            fields: [
              { key: 'stripeName', label: 'Display Name' },
              { key: 'stripePublicKey', label: 'Publishable Key' },
              { key: 'stripeSecretKey', label: 'Secret Key' },
              { key: 'stripeWebhookSecret', label: 'Webhook Signing Secret' },
            ],
          },
          {
            title: 'PayPal',
            subtitle: 'PayPal Express Checkout (Webhook: /api/v1/payments/webhook/paypal)',
            statusKey: 'paypalStatus',
            fields: [
              { key: 'paypalName', label: 'Display Name' },
              { key: 'paypalMode', label: 'Mode (sandbox or live)' },
              { key: 'paypalClientId', label: 'Client ID' },
              { key: 'paypalSecretKey', label: 'Client Secret' },
              { key: 'paypalWebhookId', label: 'Webhook ID' },
            ],
          },
          {
            title: 'YooKassa',
            subtitle: 'YooKassa Acquiring (Webhook: /api/v1/payments/webhook/yoo_kassa)',
            statusKey: 'ykStatus',
            fields: [
              { key: 'ykName', label: 'Display Name' },
              { key: 'ykShopId', label: 'Shop ID' },
              { key: 'ykSecretKey', label: 'Secret Key' },
              { key: 'ykCurrency', label: 'Currency' },
            ],
          },
          {
            title: 'RoboKassa',
            subtitle: 'RoboKassa Acquiring (Webhook: /api/v1/payments/webhook/robokassa)',
            statusKey: 'rkStatus',
            fields: [
              { key: 'rkName', label: 'Display Name' },
              { key: 'rkMerchantLogin', label: 'Merchant Login' },
              { key: 'rkPassOne', label: 'Password #1' },
              { key: 'rkPassTwo', label: 'Password #2' },
              { key: 'rkMode', label: 'Mode (test or live)' },
              { key: 'rkCurrency', label: 'Currency' },
            ],
          },
        ];

      return (
        <div key={group} className="rounded-2xl border border-bord-card p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="font-bold text-par-m uppercase text-lab-pr">Payment Gateways (Acquiring)</h4>
              <p className="text-cap-s text-lab-sc">
                Enable and configure Paystack, Stripe, PayPal, YooKassa, or RoboKassa for wallet deposits.
              </p>
            </div>
            {hasEdits && (
              <Button size="sm" variant="primary" onClick={saveGroup}>
                Save Payment Config
              </Button>
            )}
          </div>

          <div className="space-y-4">
            {gateways.map((gw) => (
              <div key={gw.statusKey} className="rounded-2xl border border-bord-pr bg-fill-fv/40 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-par-n text-lab-pr">{gw.title}</p>
                    <p className="text-cap-s text-lab-sc">{gw.subtitle}</p>
                  </div>
                  <Switch
                    label={Boolean(merged[gw.statusKey]) ? 'Enabled' : 'Disabled'}
                    checked={Boolean(merged[gw.statusKey])}
                    onCheckedChange={(next) =>
                      onAction('settings.update', undefined, {
                        group,
                        values: { ...merged, [gw.statusKey]: next },
                      })
                    }
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {gw.fields.map((f) => (
                    <Input
                      key={f.key}
                      label={f.label}
                      value={String(merged[f.key] ?? '')}
                      onChange={(e) => {
                        const nextVal = e.target.value;
                        setDraftGroups((prev) => ({
                          ...prev,
                          [group]: { ...(prev[group] || {}), [f.key]: nextVal },
                        }));
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (group === 'brand') {
      const brandAssets: Array<{
        key: string;
        label: string;
        hint: string;
        defaultUrl: string;
        darkPreviewBg?: boolean;
        pngOnly?: boolean;
        maxKilobytes?: number;
      }> = [
          {
            key: 'logoLightUrl',
            label: 'Upload light theme logo',
            hint: 'Displayed when light mode is active (PNG format, max 1024 KB).',
            defaultUrl: '/assets/logos/light.png',
            pngOnly: true,
            maxKilobytes: 1024,
          },
          {
            key: 'logoDarkUrl',
            label: 'Upload dark theme logo',
            hint: 'Displayed when dark mode is active (PNG format, max 1024 KB).',
            defaultUrl: '/assets/logos/dark.png',
            darkPreviewBg: true,
            pngOnly: true,
            maxKilobytes: 1024,
          },
          {
            key: 'faviconUrl',
            label: 'Upload favicon',
            hint: 'Square PNG/ICO/SVG icon used in browser tabs (max 1024 KB).',
            defaultUrl: '/assets/logos/favicon.png',
            maxKilobytes: 1024,
          },
          {
            key: 'watermarkUrl',
            label: 'Upload watermark image. Only PNG format is supported.',
            hint: 'Bottom-right (30px padding) on images; top-left (30px, 30px) on videos.',
            defaultUrl: '/assets/watermarks/default.png',
            darkPreviewBg: true,
            pngOnly: true,
            maxKilobytes: 1024,
          },
        ];

      return (
        <div key={group} className="rounded-2xl border border-bord-card p-4 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="font-bold text-par-m uppercase text-lab-pr">Branding & Design</h4>
              <p className="text-cap-s text-lab-sc">
                Upload your logo, favicons, and brand watermark.
              </p>
            </div>
            {hasEdits && (
              <Button size="sm" variant="primary" onClick={saveGroup}>
                Save Branding
              </Button>
            )}
          </div>

          <div className="rounded-xl border border-bord-pr bg-fill-fv/40 px-3.5 py-2.5">
            <p className="font-semibold text-par-s text-lab-pr">Video & Image Watermark</p>
            <p className="text-cap-s text-lab-sc">
              Your brand watermark will be added to all videos and images uploaded to the platform.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Switch
              label="Users can switch to the dark theme?"
              checked={Boolean(merged.darkThemeEnabled)}
              onCheckedChange={(next) =>
                onAction('settings.update', undefined, { group, values: { ...merged, darkThemeEnabled: next } })
              }
            />
            <Select
              label="Default theme"
              value={String(merged.defaultTheme || 'light')}
              onChange={(e) => {
                const nextVal = e.target.value;
                setDraftGroups((prev) => ({
                  ...prev,
                  [group]: { ...(prev[group] || {}), defaultTheme: nextVal },
                }));
              }}
            >
              <option value="light">Light theme</option>
              <option value="dark">Dark theme</option>
            </Select>
            <Switch
              label="Add watermark to images?"
              checked={Boolean(merged.imagesWatermarkEnabled)}
              onCheckedChange={(next) =>
                onAction('settings.update', undefined, {
                  group,
                  values: { ...merged, imagesWatermarkEnabled: next },
                })
              }
            />
            <Switch
              label="Add watermark to videos?"
              checked={Boolean(merged.videosWatermarkEnabled)}
              onCheckedChange={(next) =>
                onAction('settings.update', undefined, {
                  group,
                  values: { ...merged, videosWatermarkEnabled: next },
                })
              }
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {brandAssets.map((asset) => {
              const currentUrl = String(merged[asset.key] || asset.defaultUrl);
              const isUploading = uploadingBrandKey === asset.key;
              return (
                <div key={asset.key} className="rounded-2xl border border-bord-pr bg-fill-fv/40 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-par-n text-lab-pr">{asset.label}</p>
                      <p className="text-cap-s text-lab-sc">{asset.hint}</p>
                    </div>
                    <div
                      className={`h-12 w-16 rounded-xl border border-bord-pr flex items-center justify-center p-1.5 shrink-0 ${asset.darkPreviewBg ? 'bg-zinc-900' : 'bg-white'
                        }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={currentUrl} alt={asset.label} className="max-h-full max-w-full object-contain" />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 rounded-full border border-bord-pr bg-bg-pr px-3 py-1.5 text-cap-l font-semibold text-lab-pr hover:bg-fill-pr cursor-pointer">
                      <Upload className="h-3.5 w-3.5" />
                      {isUploading ? 'Uploading...' : 'Upload Image'}
                      <input
                        type="file"
                        accept={
                          asset.pngOnly
                            ? 'image/png,.png'
                            : 'image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,.ico'
                        }
                        className="hidden"
                        disabled={isUploading}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;
                          if (
                            asset.pngOnly &&
                            file.type !== 'image/png' &&
                            file.type !== 'image/x-png' &&
                            !file.name.toLowerCase().endsWith('.png')
                          ) {
                            error('Invalid format', 'Only PNG format is supported.');
                            return;
                          }
                          if (asset.maxKilobytes && file.size > asset.maxKilobytes * 1024) {
                            error('File too large', `Maximum file size is ${asset.maxKilobytes} KB.`);
                            return;
                          }
                          setUploadingBrandKey(asset.key);
                          try {
                            const uploaded = await uploadFileToR2(file, 'system', 'system_asset');
                            await onAction('settings.update', undefined, {
                              group,
                              values: { ...merged, [asset.key]: uploaded.publicUrl },
                            });
                            setDraftGroups((prev) => {
                              const nextGroup = { ...(prev[group] || {}) };
                              delete nextGroup[asset.key];
                              return { ...prev, [group]: nextGroup };
                            });
                          } catch (err) {
                            error('Asset upload failed', err instanceof Error ? err.message : undefined);
                          } finally {
                            setUploadingBrandKey(null);
                          }
                        }}
                      />
                    </label>
                    {currentUrl !== asset.defaultUrl && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          onAction('settings.update', undefined, {
                            group,
                            values: { ...merged, [asset.key]: asset.defaultUrl },
                          })
                        }
                      >
                        Reset Default
                      </Button>
                    )}
                  </div>

                  <Input
                    label="Asset URL"
                    value={String(merged[asset.key] ?? '')}
                    onChange={(e) => {
                      const nextVal = e.target.value;
                      setDraftGroups((prev) => ({
                        ...prev,
                        [group]: { ...(prev[group] || {}), [asset.key]: nextVal },
                      }));
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div key={group} className="rounded-2xl border border-bord-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-par-m uppercase text-lab-pr">{group}</h4>
          {hasEdits && (
            <Button size="sm" variant="primary" onClick={saveGroup}>
              Save {group}
            </Button>
          )}
        </div>
        <div className={`grid grid-cols-1 ${group === 'code' ? '' : 'md:grid-cols-2'} gap-3`}>
          {Object.entries(merged).map(([k, v]) => {
            if (typeof v === 'boolean') {
              return (
                <Switch
                  key={k}
                  label={formatSettingLabel(k)}
                  checked={v}
                  onCheckedChange={(next) =>
                    onAction('settings.update', undefined, { group, values: { ...merged, [k]: next } })
                  }
                />
              );
            }
            if (group === 'code' && typeof v === 'string') {
              return (
                <Textarea
                  key={k}
                  label={formatSettingLabel(k)}
                  value={v}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setDraftGroups((prev) => ({
                      ...prev,
                      [group]: { ...(prev[group] || {}), [k]: nextVal },
                    }));
                  }}
                />
              );
            }
            if (group === 'ads' && k === 'billingModel' && typeof v === 'string') {
              return (
                <Select
                  key={k}
                  label="Credit Deduction Model"
                  value={v}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setDraftGroups((prev) => ({
                      ...prev,
                      [group]: { ...(prev[group] || {}), [k]: nextVal },
                    }));
                  }}
                >
                  <option value="viewable_cpm">Viewable Impressions (Cooldown Throttled)</option>
                  <option value="every_impression">Every Viewable Impression (No Cooldown)</option>
                  <option value="cpc">Pay Per Click Only (CPC)</option>
                  <option value="hybrid">Hybrid (Viewable Impression + Click)</option>
                </Select>
              );
            }
            if (group === 'app' && k === 'defaultCurrency' && typeof v === 'string') {
              const currencyOpts =
                bootstrap?.currencies && bootstrap.currencies.length > 0
                  ? bootstrap.currencies
                  : [{ code: v || 'NGN', name: v || 'NGN', symbol: '₦' }];
              return (
                <Select
                  key={k}
                  label={formatSettingLabel(k)}
                  value={v}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setDraftGroups((prev) => ({
                      ...prev,
                      [group]: { ...(prev[group] || {}), [k]: nextVal },
                    }));
                  }}
                >
                  {currencyOpts.map((c) => {
                    const code = c.code || (c as { alpha3Code?: string }).alpha3Code || 'NGN';
                    return (
                      <option key={code} value={code}>
                        {code} — {c.name} ({c.symbol})
                      </option>
                    );
                  })}
                </Select>
              );
            }
            if (group === 'app' && k === 'locale' && typeof v === 'string') {
              const localeOpts =
                bootstrap?.locales && bootstrap.locales.length > 0
                  ? bootstrap.locales
                  : [{ code: 'en', name: 'English', nativeName: 'English' }];
              return (
                <Select
                  key={k}
                  label={formatSettingLabel(k)}
                  value={v}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setDraftGroups((prev) => ({
                      ...prev,
                      [group]: { ...(prev[group] || {}), [k]: nextVal },
                    }));
                  }}
                >
                  {localeOpts.map((l) => {
                    const code = l.code || (l as { alpha2Code?: string }).alpha2Code || 'en';
                    return (
                      <option key={code} value={code}>
                        {code.toUpperCase()} — {l.nativeName || l.name}
                      </option>
                    );
                  })}
                </Select>
              );
            }
            if (typeof v === 'string' || typeof v === 'number') {
              return (
                <Input
                  key={k}
                  label={formatSettingLabel(k)}
                  type={typeof v === 'number' ? 'number' : 'text'}
                  value={String(v)}
                  onChange={(e) => {
                    const nextVal = typeof v === 'number' ? Number(e.target.value) : e.target.value;
                    setDraftGroups((prev) => ({
                      ...prev,
                      [group]: { ...(prev[group] || {}), [k]: nextVal },
                    }));
                  }}
                />
              );
            }
            if (Array.isArray(v)) {
              return (
                <Input
                  key={k}
                  label={`${formatSettingLabel(k)} (comma-separated)`}
                  value={v.join(', ')}
                  onChange={(e) => {
                    const arr = e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    setDraftGroups((prev) => ({
                      ...prev,
                      [group]: { ...(prev[group] || {}), [k]: arr },
                    }));
                  }}
                />
              );
            }
            return null;
          })}
        </div>
      </div>
    );
  };

  if (resource === 'acquiring') {
    const d = (data || {}) as {
      acquiring?: Record<string, unknown>;
      wallet?: Record<string, unknown>;
    };
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-bord-card bg-fill-pr/30 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Wallet className="h-5 w-5 text-lab-pr2" />
            <div>
              <p className="font-bold text-par-n text-lab-pr">Wallet & Acquiring Overview</p>
              <p className="text-cap-s text-lab-sc">
                Min deposit: {formatCurrency(Number(d.wallet?.depositMinAmount ?? 2000), defaultCurrency, bootstrap?.currencies, locale)} · Max deposit: {formatCurrency(Number(d.wallet?.depositMaxAmount ?? 1000000), defaultCurrency, bootstrap?.currencies, locale)} · Min withdrawal: {formatCurrency(Number(d.wallet?.withdrawMinAmount ?? 10000), defaultCurrency, bootstrap?.currencies, locale)} · Max withdrawal: {formatCurrency(Number(d.wallet?.withdrawMaxAmount ?? 500000), defaultCurrency, bootstrap?.currencies, locale)} · Withdrawal fee: {String(d.wallet?.commissionWithdraw ?? 2.5)}%
              </p>
            </div>
          </div>
          {onNavigateTab && (
            <Button size="sm" variant="outline" onClick={() => onNavigateTab('payments')}>
              View Payments & Wallets
            </Button>
          )}
        </div>
        {d.acquiring && renderSettingsGroupCard('acquiring', d.acquiring)}
      </div>
    );
  }

  if (resource === 'verification') {
    const d = (data || {}) as {
      verification?: Record<string, unknown>;
      pendingAuthorshipCount?: number;
      verifiedUsersCount?: number;
      users?: Array<{
        _id: string;
        username: string;
        firstName?: string;
        lastName?: string;
        email?: string;
        avatar?: string;
        verified?: boolean;
        verifiedAt?: string | null;
        type?: string;
      }>;
    };
    const filteredUsers = (d.users || []).filter((u) => {
      if (verificationFilter === 'verified') return Boolean(u.verified);
      if (verificationFilter === 'unverified') return !u.verified;
      return true;
    });
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-bord-card bg-bg-pr p-4">
            <p className="text-cap-s text-lab-sc">Verified Accounts</p>
            <p className="font-outfit text-title-2 font-bold text-lab-pr mt-1 flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 text-brand-900" />
              {d.verifiedUsersCount ?? 0}
            </p>
          </div>
          <div className="rounded-2xl border border-bord-card bg-bg-pr p-4">
            <p className="text-cap-s text-lab-sc">Pending Author Requests</p>
            <p className="font-outfit text-title-2 font-bold text-lab-pr mt-1">{d.pendingAuthorshipCount ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-bord-card bg-fill-pr/30 p-4 flex items-center justify-between gap-2">
            <div>
              <p className="font-bold text-par-n text-lab-pr">Authorship Queue</p>
              <p className="text-cap-s text-lab-sc">Review submitted creator verification requests</p>
            </div>
            {onNavigateTab && (
              <Button size="sm" variant="primary" onClick={() => onNavigateTab('authorship')}>
                Review
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-bord-card bg-bg-pr p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-par-m text-lab-pr">Verification Directory</h3>
              <p className="text-cap-s text-lab-sc">
                Search via the bar above and grant or revoke official account verification badges.
              </p>
            </div>
            <div className="flex gap-1.5">
              {(['all', 'verified', 'unverified'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setVerificationFilter(st)}
                  className={`rounded-full px-3 py-1 text-cap-s font-medium capitalize transition-colors cursor-pointer ${verificationFilter === st ? 'bg-lab-pr text-bg-pr' : 'bg-fill-qt text-lab-sc hover:text-lab-pr'
                    }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {filteredUsers.length === 0 ? (
            <p className="text-cap-l text-lab-sc py-4 text-center">No matching accounts in verification view.</p>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map((u) => (
                <div key={u._id} className="rounded-2xl border border-bord-pr p-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar src={u.avatar || '/assets/avatars/default-avatar.png'} alt={u.username} size="sm" verified={u.verified} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-par-s text-lab-pr truncate">
                          {`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username}
                        </p>
                        <AdminStatusBadge status={u.verified ? 'verified' : 'unverified'} />
                        {u.type && <Badge variant="outline">{u.type}</Badge>}
                      </div>
                      <p className="text-cap-s text-lab-sc truncate">
                        @{u.username} · {u.email || 'no email'}
                        {u.verifiedAt ? ` · Verified ${new Date(u.verifiedAt).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={u.verified ? 'outline' : 'primary'}
                    onClick={() => onAction('user.toggle_verify', u._id)}
                  >
                    <BadgeCheck className="h-3.5 w-3.5" />
                    {u.verified ? 'Revoke Badge' : 'Verify User'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {d.verification && renderSettingsGroupCard('verification', d.verification)}
      </div>
    );
  }

  if (resource === 'cashouts') {
    const list = (Array.isArray(data) ? data : []) as Array<{
      _id: string;
      amount: number;
      currency: string;
      status: string;
      paymentMethod?: string;
      credentials?: string;
      reviewerNotes?: string;
      createdAt?: string;
      userId?: { username?: string; email?: string };
    }>;
    const filtered = list.filter((c) => cashoutFilter === 'all' || c.status === cashoutFilter);
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {['all', 'pending', 'paid', 'rejected', 'cancelled'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setCashoutFilter(st)}
                className={`rounded-full px-3 py-1 text-cap-s font-medium capitalize transition-colors cursor-pointer ${cashoutFilter === st ? 'bg-lab-pr text-bg-pr' : 'bg-fill-qt text-lab-sc hover:text-lab-pr'
                  }`}
              >
                {st}
              </button>
            ))}
          </div>
          <span className="text-cap-s text-lab-sc">{filtered.length} withdrawal request(s)</span>
        </div>

        <div className="space-y-2.5">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-bord-card bg-bg-pr p-6 text-center text-par-n text-lab-sc">
              No withdrawal requests found.
            </div>
          ) : (
            filtered.map((c) => {
              const amountLabel = formatCurrency(Number(c.amount || 0), c.currency, bootstrap?.currencies, locale);
              return (
                <div key={c._id} className="rounded-2xl border border-bord-card bg-bg-pr p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <p className="font-bold text-par-n text-lab-pr">
                      @{c.userId?.username || 'user'}{' '}
                      <span className="font-normal text-lab-sc">({c.userId?.email || 'no email'})</span>
                    </p>
                    <p className="text-cap-l font-bold text-lab-pr">
                      {amountLabel}
                      {c.paymentMethod ? ` · ${c.paymentMethod}` : ''}
                    </p>
                    {c.credentials && <p className="text-cap-s text-lab-sc break-all">{c.credentials}</p>}
                    {c.reviewerNotes && <p className="text-cap-s text-lab-tr break-all">Note: {c.reviewerNotes}</p>}
                    <div className="flex items-center gap-2 flex-wrap">
                      <AdminStatusBadge status={c.status} />
                      {c.createdAt && <span className="text-cap-s text-lab-sc">{new Date(c.createdAt).toLocaleString()}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <AdminApprovalControl
                      status={c.status}
                      approveLabel="Mark Paid"
                      rejectLabel="Reject"
                      allowOverride={false}
                      onApprove={() => {
                        setCashoutNote('');
                        setCashoutDecisionModal({
                          id: c._id,
                          decision: 'paid',
                          username: c.userId?.username || 'user',
                          amountLabel,
                        });
                      }}
                      onReject={() => {
                        setCashoutNote('');
                        setCashoutDecisionModal({
                          id: c._id,
                          decision: 'rejected',
                          username: c.userId?.username || 'user',
                          amountLabel,
                        });
                      }}
                    />
                    <Button size="sm" variant="ghost" onClick={() => onAction('cashout.delete', c._id)}>
                      <Trash2 className="h-4 w-4 text-red-900" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <Modal
          open={Boolean(cashoutDecisionModal)}
          onClose={() => setCashoutDecisionModal(null)}
          title={
            cashoutDecisionModal?.decision === 'paid'
              ? `Confirm Payout for @${cashoutDecisionModal?.username}`
              : `Reject Withdrawal for @${cashoutDecisionModal?.username}`
          }
        >
          {cashoutDecisionModal && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await onAction('cashout.review', cashoutDecisionModal.id, {
                  decision: cashoutDecisionModal.decision,
                  notes: cashoutNote.trim(),
                });
                setCashoutDecisionModal(null);
                setCashoutNote('');
              }}
              className="space-y-4"
            >
              <div className="rounded-xl border border-bord-pr bg-fill-qt p-3 text-cap-l">
                <p className="font-bold text-lab-pr">{cashoutDecisionModal.amountLabel}</p>
                <p className="text-lab-sc mt-0.5">
                  {cashoutDecisionModal.decision === 'paid'
                    ? 'Marking this request as paid notifies the creator that funds have been sent.'
                    : 'Rejecting this request atomically refunds the reserved amount back to the user wallet.'}
                </p>
              </div>
              <Textarea
                label="Reviewer Note (optional)"
                placeholder={
                  cashoutDecisionModal.decision === 'paid'
                    ? 'e.g. Sent via bank transfer ref #...'
                    : 'Reason shown to user for declined withdrawal...'
                }
                value={cashoutNote}
                onChange={(e) => setCashoutNote(e.target.value)}
                rows={3}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setCashoutDecisionModal(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant={cashoutDecisionModal.decision === 'paid' ? 'primary' : 'danger'}
                >
                  {cashoutDecisionModal.decision === 'paid' ? 'Confirm Paid' : 'Reject & Refund'}
                </Button>
              </div>
            </form>
          )}
        </Modal>
      </div>
    );
  }

  if (resource === 'lab') {
    const lab = (data || {}) as {
      nodeVersion?: string;
      environment?: string;
      integrations?: Record<string, boolean>;
      counts?: Record<string, number>;
    };
    const integrations = Object.entries(lab.integrations || {});
    return (
      <div className="space-y-5">
        <div className="rounded-3xl border border-bord-card bg-fill-pr/40 p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-bold text-par-m text-lab-pr flex items-center gap-2">
              <Wrench className="h-4 w-4 text-lab-pr2" /> Platform Diagnostics & Cache Control
            </h3>
            <p className="text-cap-l text-lab-sc">
              Runtime: {lab.nodeVersion || 'Node.js'} · Environment: <span className="font-semibold uppercase">{lab.environment || 'production'}</span>
            </p>
          </div>
          <Button
            variant="primary"
            disabled={clearingCache}
            onClick={async () => {
              setClearingCache(true);
              try {
                await onAction('cache.reset');
              } finally {
                setClearingCache(false);
              }
            }}
          >
            <RefreshCw className={`h-4 w-4 ${clearingCache ? 'animate-spin' : ''}`} />
            Reset Settings & Layout Cache
          </Button>
        </div>

        {lab.counts && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(lab.counts).map(([k, v]) => (
              <div key={k} className="rounded-2xl border border-bord-card bg-bg-pr p-4">
                <p className="text-cap-s text-lab-sc capitalize">{k.replace(/Count$/, '')}</p>
                <p className="font-outfit text-title-2 font-bold text-lab-pr mt-1">{v}</p>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-bord-card bg-bg-pr p-4 space-y-3">
          <h4 className="font-bold text-par-n text-lab-pr">Connected Services & Integrations</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {integrations.map(([key, connected]) => (
              <div key={key} className="flex items-center justify-between rounded-xl border border-bord-pr px-3 py-2.5">
                <span className="text-cap-l font-medium text-lab-pr capitalize">{formatSettingLabel(key)}</span>
                <Badge variant={connected ? 'success' : 'outline'}>
                  {connected ? (
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Configured
                    </span>
                  ) : (
                    'Not Set'
                  )}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (resource === 'settings') {
    const settingsObj = (data || {}) as Record<string, Record<string, unknown>>;
    const subTabs: Array<{ key: string; label: string }> = [
      { key: 'app', label: 'General' },
      { key: 'features', label: 'Features' },
      { key: 'auth', label: 'Auth & Login' },
      { key: 'brand', label: 'Branding' },
      { key: 'wallet', label: 'Wallet & Limits' },
      { key: 'ads', label: 'Ads' },
      { key: 'mail', label: 'Mail & SMTP' },
      { key: 'verification', label: 'Verification' },
      { key: 'code', label: 'Code Injection' },
      { key: 'all', label: 'All Groups' },
    ];
    const entries = Object.entries(settingsObj).filter(
      ([group]) => group !== 'acquiring' && (settingsSubTab === 'all' || group === settingsSubTab)
    );

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5 pb-1">
          {subTabs.map((st) => (
            <button
              key={st.key}
              type="button"
              onClick={() => setSettingsSubTab(st.key)}
              className={`rounded-full px-3 py-1 text-cap-s font-medium transition-colors cursor-pointer ${settingsSubTab === st.key
                ? 'bg-lab-pr text-bg-pr'
                : 'bg-fill-qt text-lab-sc hover:text-lab-pr'
                }`}
            >
              {st.label}
            </button>
          ))}
        </div>

        {(settingsSubTab === 'mail' || settingsSubTab === 'all') && (
          <div className="rounded-2xl border border-bord-card p-4 flex flex-wrap gap-2 items-end">
            <Input
              label="Send SMTP Test Email To"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="admin@example.com"
              className="flex-1 min-w-[220px]"
            />
            <Button
              variant="primary"
              onClick={async () => {
                try {
                  await apiFetch('/admin/manage', { method: 'POST', json: { action: 'mail.test', payload: { to: testEmail } } });
                  success('SMTP test email dispatched');
                } catch (err) {
                  error('SMTP test failed', err instanceof Error ? err.message : undefined);
                }
              }}
            >
              Test SMTP
            </Button>
          </div>
        )}

        {entries.map(([group, values]) => renderSettingsGroupCard(group, values))}
      </div>
    );
  }

  return null;
}

export function AdminStatusBadge({
  status,
  label,
}: {
  status?: string | boolean | null;
  label?: string;
}) {
  const normalized =
    typeof status === 'boolean'
      ? status
        ? 'approved'
        : 'pending'
      : String(status || 'pending').trim().toLowerCase();

  const variant: 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'outline' =
    [
      'approved',
      'paid',
      'processed',
      'resolved',
      'verified',
      'active',
      'published',
      'completed',
      'author',
    ].includes(normalized)
      ? 'success'
      : [
        'rejected',
        'declined',
        'ignored',
        'dismissed',
        'blocked',
        'suspended',
        'failed',
        'cancelled',
        'banned',
      ].includes(normalized)
        ? 'danger'
        : ['pending', 'in_progress', 'paused', 'warning'].includes(normalized)
          ? 'warning'
          : ['draft', 'inactive', 'closed', 'expired', 'unverified'].includes(normalized)
            ? 'outline'
            : 'brand';

  const displayLabel = label || normalized.replace(/_/g, ' ');
  return (
    <Badge variant={variant} className="capitalize">
      {displayLabel}
    </Badge>
  );
}

export function AdminApprovalControl({
  status,
  approvedLabel = 'Approved',
  rejectedLabel = 'Rejected',
  pendingLabel = 'Pending',
  approveLabel = 'Approve',
  rejectLabel = 'Reject',
  allowOverride = true,
  onApprove,
  onReject,
}: {
  status?: string | null;
  approvedLabel?: string;
  rejectedLabel?: string;
  pendingLabel?: string;
  approveLabel?: string;
  rejectLabel?: string;
  allowOverride?: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const st = String(status || 'pending').trim().toLowerCase();
  const isApproved = ['approved', 'paid', 'processed', 'resolved', 'verified'].includes(st);
  const isRejected = ['rejected', 'declined', 'ignored', 'dismissed'].includes(st);

  if (isApproved) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant="success" className="gap-1">
          <CheckCircle2 className="h-3 w-3" /> {approvedLabel}
        </Badge>
        {allowOverride && (
          <Button size="sm" variant="outline" onClick={onReject}>
            <X className="h-3.5 w-3.5 text-red-900" /> {rejectLabel}
          </Button>
        )}
      </div>
    );
  }

  if (isRejected) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant="danger" className="gap-1">
          <X className="h-3 w-3" /> {rejectedLabel}
        </Badge>
        {allowOverride && (
          <Button size="sm" variant="outline" onClick={onApprove}>
            <Check className="h-3.5 w-3.5" /> {approveLabel}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge variant="warning" className="gap-1">
        <Clock className="h-3 w-3" /> {pendingLabel}
      </Badge>
      <AdminDecisionButtons
        approveLabel={approveLabel}
        rejectLabel={rejectLabel}
        onApprove={onApprove}
        onReject={onReject}
      />
    </div>
  );
}

export function AdminDecisionButtons({
  onApprove,
  onReject,
  approveLabel = 'Approve',
  rejectLabel = 'Reject',
}: {
  onApprove: () => void;
  onReject: () => void;
  approveLabel?: string;
  rejectLabel?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Button size="sm" variant="primary" onClick={onApprove}>
        <Check className="h-3.5 w-3.5" /> {approveLabel}
      </Button>
      <Button size="sm" variant="danger" onClick={onReject}>
        <X className="h-3.5 w-3.5" /> {rejectLabel}
      </Button>
    </div>
  );
}
