'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Award,
  BadgeCheck,
  Ban,
  Bell,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Globe,
  Key,
  Laptop,
  Lock,
  LogOut,
  MapPin,
  Shield,
  Smartphone,
  Trash2,
  Upload,
  User,
  Users,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { AccountSwitcherModal } from '@/components/modals/AccountSwitcherModal';
import { AvatarPresetPicker } from '@/components/profile/AvatarPresetPicker';
import { Avatar, normalizeCoverSrc } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs } from '@/components/ui/tabs';
import { apiFetch, uploadFileToR2 } from '@/lib/api-client';
import { COUNTRIES, PROFILE_CATEGORIES, SOCIAL_PLATFORMS } from '@/data/world';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';

interface SettingsPayload {
  profile: {
    firstName: string;
    lastName: string;
    username: string;
    bio: string;
    caption: string;
    category: string | null;
    website: string;
    country: string | null;
    city: string | null;
    gender: string;
    phone: string;
    email: string;
    language: string;
    theme: 'light' | 'dark';
    avatar: string;
    cover: string;
    type: string;
  };
  privacySettings: Record<string, boolean>;
  permitSettings: Record<string, string>;
  notificationSettings: { email: Record<string, boolean>; push: Record<string, boolean> };
  securitySettings: { twoFactorEnabled: boolean; twoFactorType: string; loginNotification: boolean };
  socialLinks: Array<{ platform: string; url: string }>;
  authorshipRequest?: { status: string } | null;
  apiKeys: Array<{ id?: string; _id?: string; name: string; keyPrefix: string; lastUsedAt?: string }>;
}

interface DeviceSession {
  _id?: string;
  deviceHash: string;
  platform: string;
  browser: string;
  platformType: 'desktop' | 'mobile' | 'tablet';
  ipAddress: string;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  timezone?: string | null;
  isLocationUnknown?: boolean;
  lastOnline: string;
}

interface GeoSummary {
  ip: string;
  configured: boolean;
  country: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  unknown: boolean;
}

export default function SettingsPage() {
  const { user, refreshBootstrap, updateUserPatch, setTheme, setLocale, bootstrap, logout } = useApp();
  const { error, success } = useToast();
  const currentUserId = user?.id;

  const [tab, setTab] = useState('account');
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [mobileInDetail, setMobileInDetail] = useState(false);
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState<'avatar' | 'cover' | null>(null);

  // Form states
  const [accountForm, setAccountForm] = useState<SettingsPayload['profile'] | null>(null);
  const [privacyForm, setPrivacyForm] = useState<Record<string, boolean>>({});
  const [permitsForm, setPermitsForm] = useState<Record<string, string>>({});
  const [notifForm, setNotifForm] = useState<{ email: Record<string, boolean>; push: Record<string, boolean> }>({
    email: {},
    push: {},
  });
  const [socialForm, setSocialForm] = useState<Record<string, string>>({});
  const [newKeyName, setNewKeyName] = useState('');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [geo, setGeo] = useState<GeoSummary | null>(null);
  const [terminatingDevices, setTerminatingDevices] = useState(false);

  const loadSettings = useCallback(
    async (silent = false) => {
      if (!currentUserId) {
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const [res, devRes, geoRes] = await Promise.all([
          apiFetch<SettingsPayload>('/settings'),
          apiFetch<DeviceSession[]>('/devices').catch(() => []),
          apiFetch<GeoSummary>('/geo').catch(() => null),
        ]);
        setData(res);
        setAccountForm(res.profile);
        setPrivacyForm(res.privacySettings || {});
        setPermitsForm(res.permitSettings || {});
        setNotifForm(res.notificationSettings || { email: {}, push: {} });
        const linksMap: Record<string, string> = {};
        for (const s of res.socialLinks || []) linksMap[s.platform] = s.url;
        setSocialForm(linksMap);
        setDevices(Array.isArray(devRes) ? devRes : []);
        if (geoRes) setGeo(geoRes);
      } catch {
        // ignore
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [currentUserId]
  );

  useEffect(() => {
    const id = setTimeout(() => {
      void loadSettings();
    }, 0);
    return () => clearTimeout(id);
  }, [loadSettings]);

  async function patchSection(section: string, payload: Record<string, unknown>, msg = 'Settings updated') {
    setSaving(true);
    try {
      const res = await apiFetch<Record<string, unknown>>('/settings', {
        method: 'PATCH',
        json: { section, data: payload },
      });
      if (section === 'account') {
        updateUserPatch({
          firstName: typeof payload.firstName === 'string' ? payload.firstName.trim() : undefined,
          lastName: typeof payload.lastName === 'string' ? payload.lastName.trim() : undefined,
          username: typeof payload.username === 'string' ? payload.username.toLowerCase().trim() : undefined,
          bio: typeof payload.bio === 'string' ? payload.bio.trim() : undefined,
          country: typeof payload.country === 'string' ? payload.country : undefined,
          city: typeof payload.city === 'string' ? payload.city.trim() : undefined,
        });
      } else if ((section === 'avatar' || section === 'cover') && typeof payload.url === 'string') {
        updateUserPatch({ [section]: payload.url });
      }
      success(msg);
      void refreshBootstrap();
      void loadSettings(true);
      return res;
    } catch (err) {
      error('Could not save settings', err instanceof Error ? err.message : undefined);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function uploadProfileImage(kind: 'avatar' | 'cover', e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingImage(kind);
    const localPreview = URL.createObjectURL(file);
    setAccountForm((prev) => (prev ? { ...prev, [kind]: localPreview } : prev));
    updateUserPatch({ [kind]: localPreview });
    try {
      const up = await uploadFileToR2(
        file,
        kind === 'avatar' ? 'avatars' : 'covers',
        kind === 'avatar' ? 'user_avatar' : 'user_cover'
      );
      setAccountForm((prev) => (prev ? { ...prev, [kind]: up.publicUrl } : prev));
      updateUserPatch({ [kind]: up.publicUrl });
      await patchSection(kind, { url: up.publicUrl }, `${kind === 'avatar' ? 'Avatar' : 'Cover'} updated!`);
    } catch (err) {
      error('Upload failed', err instanceof Error ? err.message : undefined);
      void loadSettings(true);
    } finally {
      setUploadingImage(null);
      setTimeout(() => URL.revokeObjectURL(localPreview), 2500);
    }
  }

  async function handleCreateApiKey(e: React.FormEvent) {
    e.preventDefault();
    const res = await patchSection(
      'create_api_key',
      { name: newKeyName.trim() || 'App Key' },
      'API key generated'
    );
    if (res && typeof res.secretKeyOnce === 'string') {
      setRevealedKey(res.secretKeyOnce);
      setNewKeyName('');
    }
  }

  async function handleDeleteAccount() {
    if (!window.confirm('Are you sure you want to permanently schedule your account for deletion?')) return;
    try {
      await apiFetch('/auth/accounts', { method: 'POST', json: { action: 'delete_account' } });
      await logout();
    } catch (err) {
      error('Could not delete account', err instanceof Error ? err.message : undefined);
    }
  }

  async function handleTerminateOtherDevices() {
    if (devices.length <= 1) return;
    setTerminatingDevices(true);
    try {
      const keepDeviceHash = devices[0]?.deviceHash;
      await apiFetch('/devices', {
        method: 'DELETE',
        json: keepDeviceHash ? { keepDeviceHash } : {},
      });
      success('Other device sessions terminated.');
      await loadSettings();
    } catch (err) {
      error('Could not terminate sessions', err instanceof Error ? err.message : undefined);
    } finally {
      setTerminatingDevices(false);
    }
  }

  if (!user) {
    return (
      <AppShell hideMobileHeader>
        <div className="p-8 text-center space-y-3">
          <p className="text-par-l font-bold text-lab-pr">Sign in to manage account settings</p>
          <Link href="/auth/login">
            <Button variant="primary">Sign in</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const TAB_TITLES: Record<string, string> = {
    account: 'Your Account & Profile',
    privacy: 'Privacy & Permits',
    notifications: 'Notifications',
    social: 'Social & Links',
    security: 'Security & API',
  };

  function openMobileSection(key: string) {
    setTab(key);
    setMobileInDetail(true);
  }

  return (
    <AppShell hideMobileHeader>
      {/* Desktop Header + Tabs */}
      <div className="hidden md:block border-b border-bord-pr">
        <div className="px-4 py-3.5">
          <h1 className="text-title-3 font-bold text-lab-pr">Account Settings</h1>
          <p className="text-cap-l text-lab-sc">Profile, privacy, permits, notifications, API keys, and theme.</p>
        </div>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'account', label: 'Profile' },
            { key: 'privacy', label: 'Privacy & Permits' },
            { key: 'notifications', label: 'Notifications' },
            { key: 'social', label: 'Social & Links' },
            { key: 'security', label: 'Security & API' },
          ]}
        />
      </div>

      {/* Mobile Header / Toolbar matching Notifications standard */}
      <div className="md:hidden border-b border-bord-pr sticky top-0 z-20 pt-safe px-safe bg-bg-pr/95 backdrop-blur-md">
        <div className="px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {mobileInDetail ? (
              <button
                type="button"
                onClick={() => setMobileInDetail(false)}
                className="p-1.5 -ml-1.5 rounded-full text-lab-pr hover:bg-fill-tr shrink-0 cursor-pointer"
                aria-label="Back to settings"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : (
              <Link
                href="/"
                className="p-1.5 -ml-1.5 rounded-full text-lab-pr hover:bg-fill-tr shrink-0"
                aria-label="Back to home"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
            )}
            <h1 className="text-title-3 font-bold text-lab-pr truncate">
              {mobileInDetail ? TAB_TITLES[tab] || 'Account Settings' : 'Account Settings'}
            </h1>
          </div>
        </div>
      </div>

      {loading || !accountForm ? (
        <p className="p-8 text-center text-lab-sc">Loading settings...</p>
      ) : (
        <>
          {/* Mobile SettingsNav Menu (PHP SettingsNav.vue parity) */}
          {!mobileInDetail && (
            <div className="md:hidden pb-8">
              <div className="px-4 py-3 text-cap-l font-semibold text-lab-sc uppercase tracking-wide">
                Settings and Privacy
              </div>
              <div className="divide-y divide-bord-tr/40">
                {[
                  { key: 'account', label: 'Your Account & Profile', Icon: User },
                  { key: 'notifications', label: 'Notifications', Icon: Bell },
                  { key: 'privacy', label: 'Privacy & Permits', Icon: Lock },
                  { key: 'social', label: 'Social Links', Icon: Globe },
                  { key: 'security', label: 'Credentials & API Security', Icon: Shield },
                ].map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => openMobileSection(key)}
                    className="w-full flex items-center h-12 px-4 hover:bg-fill-qt cursor-pointer text-left"
                  >
                    <Icon className="size-5 text-lab-pr2 shrink-0" />
                    <span className="ml-3 text-par-l text-lab-pr2">{label}</span>
                    <ChevronRight className="size-5 text-lab-sc ml-auto shrink-0" />
                  </button>
                ))}
              </div>

              <div className="my-2 h-2 bg-fill-qt/50" />

              <div className="px-4 py-3 text-cap-l font-semibold text-lab-sc uppercase tracking-wide">
                Additional Settings
              </div>
              <div>
                <Link
                  href="/auth/link-account"
                  className="w-full flex items-center h-12 px-4 hover:bg-fill-qt"
                >
                  <Users className="size-5 text-lab-pr2 shrink-0" />
                  <span className="ml-3 text-par-l text-lab-pr2">Switch / Link Account</span>
                  <ChevronRight className="size-5 text-lab-sc ml-auto shrink-0" />
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  className="w-full flex items-center h-12 px-4 hover:bg-fill-qt cursor-pointer text-left"
                >
                  <LogOut className="size-5 text-red-900 shrink-0" />
                  <span className="ml-3 text-par-l text-red-900">Sign Out</span>
                </button>
              </div>
            </div>
          )}

          <div className={`${mobileInDetail ? 'block' : 'hidden'} md:block p-5 space-y-6`}>
            {tab === 'account' && (
              <div className="space-y-5">
                {/* Avatar & Cover Upload */}
                <div className="rounded-2xl border border-bord-pr overflow-hidden">
                  <div className="h-28 w-full bg-fill-qt overflow-hidden border-b border-bord-pr">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      key={normalizeCoverSrc(accountForm.cover)}
                      src={normalizeCoverSrc(accountForm.cover)}
                      alt="Profile cover"
                      className="h-full w-full object-cover"
                      onLoad={(e) => {
                        e.currentTarget.dataset.fallbackApplied = '';
                      }}
                      onError={(e) => {
                        if (e.currentTarget.dataset.fallbackApplied !== '1') {
                          e.currentTarget.dataset.fallbackApplied = '1';
                          e.currentTarget.src = '/assets/covers/default-cover.png';
                        }
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-4 p-4">
                    <Avatar src={accountForm.avatar} alt={accountForm.username} size="lg" />
                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex items-center gap-2 rounded-full border border-bord-pr px-4 py-2 text-cap-l font-semibold cursor-pointer hover:bg-fill-pr">
                        <Upload className="h-4 w-4" /> {uploadingImage === 'avatar' ? 'Uploading...' : 'Change Avatar'}
                        <input type="file" accept="image/*" className="hidden" disabled={uploadingImage !== null} onChange={(e) => uploadProfileImage('avatar', e)} />
                      </label>
                      <label className="inline-flex items-center gap-2 rounded-full border border-bord-pr px-4 py-2 text-cap-l font-semibold cursor-pointer hover:bg-fill-pr">
                        <Upload className="h-4 w-4" /> {uploadingImage === 'cover' ? 'Uploading...' : 'Change Cover'}
                        <input type="file" accept="image/*" className="hidden" disabled={uploadingImage !== null} onChange={(e) => uploadProfileImage('cover', e)} />
                      </label>
                    </div>
                  </div>
                  <div className="border-t border-bord-pr px-4 py-3.5 bg-fill-fv/30">
                    <AvatarPresetPicker
                      selectedUrl={accountForm.avatar}
                      disabled={uploadingImage !== null || saving}
                      compact
                      onSelect={(presetUrl) => {
                        setAccountForm((prev) => (prev ? { ...prev, avatar: presetUrl } : prev));
                        updateUserPatch({ avatar: presetUrl });
                        void patchSection('avatar', { url: presetUrl }, 'Avatar updated!');
                      }}
                    />
                  </div>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    patchSection('account', accountForm as unknown as Record<string, unknown>);
                  }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="First Name"
                      value={accountForm.firstName}
                      onChange={(e) => setAccountForm({ ...accountForm, firstName: e.target.value })}
                    />
                    <Input
                      label="Last Name"
                      value={accountForm.lastName}
                      onChange={(e) => setAccountForm({ ...accountForm, lastName: e.target.value })}
                    />
                  </div>
                  <Input
                    label="Username"
                    value={accountForm.username}
                    onChange={(e) => setAccountForm({ ...accountForm, username: e.target.value })}
                  />
                  <Input
                    label="Tagline / Caption"
                    placeholder="Role, headline, or short status"
                    value={accountForm.caption || ''}
                    onChange={(e) => setAccountForm({ ...accountForm, caption: e.target.value })}
                  />
                  <Textarea
                    label="Bio"
                    value={accountForm.bio}
                    onChange={(e) => setAccountForm({ ...accountForm, bio: e.target.value })}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Select
                      label="Profile Category"
                      value={accountForm.category || ''}
                      onChange={(e) => setAccountForm({ ...accountForm, category: e.target.value || null })}
                    >
                      <option value="">None</option>
                      {PROFILE_CATEGORIES.map((c) => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </Select>
                    <Input
                      label="Website"
                      value={accountForm.website || ''}
                      onChange={(e) => setAccountForm({ ...accountForm, website: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Select
                      label="Country"
                      value={accountForm.country || ''}
                      onChange={(e) => setAccountForm({ ...accountForm, country: e.target.value })}
                    >
                      <option value="">Select country</option>
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>{c.name}</option>
                      ))}
                    </Select>
                    <Input
                      label="City"
                      value={accountForm.city || ''}
                      onChange={(e) => setAccountForm({ ...accountForm, city: e.target.value })}
                    />
                  </div>
                  <Button type="submit" variant="primary" loading={saving}>Save Profile Changes</Button>
                </form>

                {/* Theme & Language */}
                <div className="rounded-2xl border border-bord-pr p-4 space-y-4">
                  <h3 className="font-bold text-par-m text-lab-pr">Appearance & Language</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Select
                      label="Color Theme"
                      value={accountForm.theme}
                      onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}
                    >
                      <option value="light">Light Theme</option>
                      <option value="dark">Dark Theme</option>
                    </Select>
                    <Select
                      label="Interface Language"
                      value={accountForm.language}
                      onChange={(e) => {
                        const nextLang = e.target.value;
                        setAccountForm((prev) => (prev ? { ...prev, language: nextLang } : prev));
                        setLocale(nextLang);
                      }}
                    >
                      {(bootstrap?.locales?.length ? bootstrap.locales : [{ code: 'en', name: 'English', nativeName: 'English', direction: 'ltr' as const }]).map((l) => {
                        const localeCode = l.code || (l as { alpha2Code?: string }).alpha2Code || 'en';
                        const labelText = l.nativeName && l.nativeName !== l.name
                          ? `${l.nativeName} (${l.name})`
                          : l.name;
                        const rtlMark = l.direction === 'rtl' ? ' — RTL' : '';
                        return (
                          <option key={localeCode} value={localeCode}>
                            {labelText}{rtlMark}
                          </option>
                        );
                      })}
                    </Select>
                  </div>
                </div>

                {/* Authorship Verification & Community Monetization */}
                <div className="rounded-2xl border border-bord-pr p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Award className="h-6 w-6 text-lab-pr2 shrink-0" />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-par-n text-lab-pr">
                            Creator Authorship &amp; Community Monetization
                          </p>
                          {accountForm.type === 'author' ? (
                            <Badge variant="success">Author Approved</Badge>
                          ) : data?.authorshipRequest?.status === 'pending' ? (
                            <Badge variant="warning">Pending Review</Badge>
                          ) : data?.authorshipRequest?.status === 'rejected' ? (
                            <Badge variant="danger">Rejected</Badge>
                          ) : (
                            <Badge variant="default" className="capitalize">
                              {accountForm.type || 'reader'}
                            </Badge>
                          )}
                        </div>
                        <p className="text-cap-l text-lab-sc">
                          {accountForm.type === 'author'
                            ? 'Your creator authorship is approved. Monetization Studio is unlocked.'
                            : data?.authorshipRequest?.status === 'pending'
                              ? 'Your authorship application is currently waiting for moderator review.'
                              : data?.authorshipRequest?.status === 'rejected'
                                ? 'Your previous authorship request was declined. Update your profile and reapply.'
                                : 'Apply for creator authorship to unlock paid creator monetization features.'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href="/business/monetization">
                        <Button size="sm" variant="primary">
                          Monetization Studio
                        </Button>
                      </Link>
                      {accountForm.type !== 'author' && data?.authorshipRequest?.status !== 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => patchSection('request_authorship', {}, 'Authorship request submitted!')}
                        >
                          {data?.authorshipRequest?.status === 'rejected'
                            ? 'Reapply Authorship'
                            : 'Request Authorship'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Identity Verification (VERIFICATION_SERVICE_URL) */}
                <div className="rounded-2xl border border-bord-pr p-4 space-y-3">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <BadgeCheck
                        className={`h-6 w-6 shrink-0 ${user.verified ? 'text-brand-900' : 'text-lab-sc'
                          }`}
                      />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-par-n text-lab-pr">
                            {user.verified ? 'Identity Verified' : 'Account Verification'}
                          </p>
                          <Badge variant={user.verified ? 'success' : 'outline'}>
                            {user.verified ? 'Verified' : 'Unverified'}
                          </Badge>
                        </div>
                        <p className="text-cap-l text-lab-sc">
                          {user.verified
                            ? 'Your account carries an official verified badge.'
                            : 'Apply for identity verification to earn the official verified badge on your profile.'}
                        </p>
                      </div>
                    </div>
                    {!user.verified && (
                      <a
                        href={
                          bootstrap?.config?.verification?.serviceUrl ||
                          'https://docs.sumsub.com/docs/user-verification'
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button size="sm" variant="primary">
                          Apply for verification <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    )}
                  </div>
                  {!user.verified && (
                    <p className="text-cap-s text-lab-sc border-t border-bord-pr pt-2.5">
                      Before applying, ensure your profile has a clear photo and complies with our{' '}
                      <Link href="/document/verification-rules" className="text-lab-pr2 underline font-medium">
                        platform verification rules
                      </Link>
                      .
                    </p>
                  )}
                </div>

                {/* Switch or Link Accounts */}
                <div className="rounded-2xl border border-bord-pr p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Users className="h-6 w-6 text-lab-pr2 shrink-0" />
                    <div>
                      <p className="font-bold text-par-n text-lab-pr">
                        Linked Accounts &amp; Quick Switch
                      </p>
                      <p className="text-cap-l text-lab-sc">
                        Link existing Weto accounts or create a sub-profile to switch identities in one click.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setSwitcherOpen(true)}>
                      Switch / Link Account
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {tab === 'privacy' && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-bord-pr p-4 space-y-4">
                  <h3 className="font-bold text-par-m text-lab-pr flex items-center gap-2">
                    <Lock className="h-4 w-4" /> Profile Visibility Privacy
                  </h3>
                  {[
                    { key: 'emailPrivacy', label: 'Hide email address on profile' },
                    { key: 'phonePrivacy', label: 'Hide phone number on profile' },
                    { key: 'countryPrivacy', label: 'Hide country' },
                    { key: 'cityPrivacy', label: 'Hide city' },
                    { key: 'lastSeenPrivacy', label: 'Hide last active timestamp' },
                    { key: 'searchPrivacy', label: 'Hide profile from search results' },
                  ].map((item) => (
                    <Switch
                      key={item.key}
                      label={item.label}
                      checked={Boolean(privacyForm[item.key])}
                      onCheckedChange={(v) => setPrivacyForm({ ...privacyForm, [item.key]: v })}
                    />
                  ))}
                  <Button variant="primary" loading={saving} onClick={() => patchSection('privacy', privacyForm)}>
                    Save Privacy
                  </Button>
                </div>

                <div className="rounded-2xl border border-bord-pr p-4 space-y-4">
                  <h3 className="font-bold text-par-m text-lab-pr">Interaction Permits</h3>
                  {[
                    { key: 'directMessages', label: 'Who can send you direct messages' },
                    { key: 'mentions', label: 'Who can @mention you' },
                    { key: 'followers', label: 'Who can follow you' },
                    { key: 'storyReplies', label: 'Who can reply to your stories' },
                    { key: 'groupInvites', label: 'Who can invite you to groups' },
                  ].map((p) => (
                    <Select
                      key={p.key}
                      label={p.label}
                      value={permitsForm[p.key] || 'all'}
                      onChange={(e) => setPermitsForm({ ...permitsForm, [p.key]: e.target.value })}
                    >
                      <option value="all">Everyone</option>
                      <option value="followers">Followers Only</option>
                      <option value="nobody">Nobody (Blocked)</option>
                    </Select>
                  ))}
                  <Button variant="primary" loading={saving} onClick={() => patchSection('permits', permitsForm)}>
                    Save Permits
                  </Button>
                </div>
              </div>
            )}

            {tab === 'notifications' && (
              <div className="rounded-2xl border border-bord-pr p-4 space-y-4">
                <h3 className="font-bold text-par-m text-lab-pr">Email & Push Notification Preferences</h3>
                {['directMessages', 'reactions', 'comments', 'sharedPosts', 'followers', 'mentions'].map((k) => (
                  <div key={k} className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2 border-b border-bord-pr last:border-none">
                    <Switch
                      label={`${k} (Push)`}
                      checked={notifForm.push?.[k] !== false}
                      onCheckedChange={(v) =>
                        setNotifForm((prev) => ({ ...prev, push: { ...prev.push, [k]: v } }))
                      }
                    />
                    <Switch
                      label={`${k} (Email)`}
                      checked={notifForm.email?.[k] !== false}
                      onCheckedChange={(v) =>
                        setNotifForm((prev) => ({ ...prev, email: { ...prev.email, [k]: v } }))
                      }
                    />
                  </div>
                ))}
                <Button variant="primary" loading={saving} onClick={() => patchSection('notifications', notifForm)}>
                  Save Notification Preferences
                </Button>
              </div>
            )}

            {tab === 'social' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const links = SOCIAL_PLATFORMS.map((sp) => ({
                    platform: sp.key,
                    url: socialForm[sp.key] || '',
                  }));
                  patchSection('social_links', { links });
                }}
                className="space-y-4"
              >
                {SOCIAL_PLATFORMS.map((sp) => (
                  <Input
                    key={sp.key}
                    label={sp.label}
                    placeholder={sp.placeholder}
                    value={socialForm[sp.key] || ''}
                    onChange={(e) => setSocialForm({ ...socialForm, [sp.key]: e.target.value })}
                  />
                ))}
                <Button type="submit" variant="primary" loading={saving}>Save Social Links</Button>
              </form>
            )}

            {tab === 'security' && (
              <div className="space-y-6">
                {/* Developer API Keys */}
                <div className="rounded-2xl border border-bord-pr p-4 space-y-4">
                  <h3 className="font-bold text-par-m text-lab-pr flex items-center gap-2">
                    <Key className="h-4 w-4 text-lab-pr2" /> Developer API Keys
                  </h3>
                  {revealedKey && (
                    <div className="rounded-xl bg-green-900/10 border border-green-900/30 p-3 space-y-1">
                      <p className="text-cap-l font-bold text-green-900">Copy your secret API key now (shown once):</p>
                      <div className="flex items-center justify-between gap-2 font-mono text-cap-l">
                        <span className="truncate">{revealedKey}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(revealedKey);
                            success('Copied API key');
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" /> Copy
                        </Button>
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleCreateApiKey} className="flex gap-2">
                    <Input
                      placeholder="Key label (e.g. Mobile Client)"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                    />
                    <Button type="submit" variant="primary" className="shrink-0">
                      Generate Key
                    </Button>
                  </form>

                  {data?.apiKeys && data.apiKeys.length > 0 && (
                    <div className="space-y-2">
                      {data.apiKeys.map((k) => {
                        const kid = String(k._id || k.id);
                        return (
                          <div key={kid} className="flex items-center justify-between rounded-xl border border-bord-pr px-3 py-2">
                            <div>
                              <p className="text-par-n font-semibold text-lab-pr">{k.name}</p>
                              <p className="text-cap-s font-mono text-lab-sc">{k.keyPrefix}...</p>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-900"
                              onClick={() => patchSection('revoke_api_key', { keyId: kid }, 'API key revoked')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-bord-pr p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Shield className="h-5 w-5 text-lab-pr2" />
                    <div>
                      <p className="text-par-n font-semibold text-lab-pr">Firebase Linked Providers</p>
                      <p className="text-cap-l text-lab-sc">Connect Google sign-in to your account.</p>
                    </div>
                  </div>
                  <Link href="/auth/link-account">
                    <Button size="sm" variant="outline">Manage Providers</Button>
                  </Link>
                </div>

                {/* Active Devices & GeoIP Sessions */}
                <div className="rounded-2xl border border-bord-pr p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="font-bold text-par-m text-lab-pr flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-lab-pr2" /> Active Sessions & Location
                      </h3>
                      {geo && (
                        <p className="text-cap-l text-lab-sc mt-0.5">
                          Current IP: <span className="font-mono text-lab-pr">{geo.ip || 'unknown'}</span>
                          {!geo.unknown && (geo.city || geo.country)
                            ? ` · ${[geo.city, geo.region, geo.country].filter(Boolean).join(', ')}${geo.timezone ? ` (${geo.timezone})` : ''}`
                            : geo.configured
                              ? ' · Local / private network'
                              : ' · IP geolocation token not configured'}
                        </p>
                      )}
                    </div>
                    {devices.length > 1 && (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={terminatingDevices}
                        onClick={handleTerminateOtherDevices}
                      >
                        Terminate Other Sessions
                      </Button>
                    )}
                  </div>

                  {devices.length === 0 ? (
                    <p className="text-cap-l text-lab-sc">No tracked device sessions yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {devices.map((dev, idx) => {
                        const loc = [dev.city, dev.region, dev.country].filter(Boolean).join(', ');
                        const isMobile = dev.platformType === 'mobile' || dev.platformType === 'tablet';
                        return (
                          <div
                            key={dev._id || dev.deviceHash}
                            className="flex items-center justify-between gap-3 rounded-xl border border-bord-pr px-3 py-2.5"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {isMobile ? (
                                <Smartphone className="h-4 w-4 text-lab-sc shrink-0" />
                              ) : (
                                <Laptop className="h-4 w-4 text-lab-sc shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p className="text-par-n font-semibold text-lab-pr truncate">
                                  {dev.platform} · {dev.browser}
                                  {idx === 0 && (
                                    <span className="ml-2 text-cap-s font-medium text-green-900 bg-green-900/10 px-2 py-0.5 rounded-full">
                                      Recent
                                    </span>
                                  )}
                                </p>
                                <p className="text-cap-s text-lab-sc truncate">
                                  {loc || 'Unknown location'} · IP {dev.ipAddress}
                                  {dev.timezone ? ` · ${dev.timezone}` : ''}
                                </p>
                              </div>
                            </div>
                            <span className="text-cap-s text-lab-sc shrink-0">
                              {new Date(dev.lastOnline).toLocaleDateString()}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-red-900/30 bg-red-900/5 p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Ban className="h-5 w-5 text-red-900" />
                    <div>
                      <p className="text-par-n font-bold text-red-900">Delete Account</p>
                      <p className="text-cap-l text-lab-sc">Deactivate your profile and revoke active sessions.</p>
                    </div>
                  </div>
                  <Button variant="danger" size="sm" onClick={handleDeleteAccount}>
                    Delete Account
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
      <AccountSwitcherModal open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
    </AppShell>
  );
}
