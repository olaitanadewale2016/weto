'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Link2,
  Loader2,
  Plus,
  RotateCcw,
  ShieldCheck,
  Unlink,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api-client';
import { clearBootstrapCache, useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';

export interface LinkedAccount {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  fullName?: string;
  avatar: string;
  bio?: string;
  caption?: string;
  verified: boolean;
  status?: string;
  isActive: boolean;
  isMaster?: boolean;
  isPrevious?: boolean;
  canSwitch?: boolean;
  canUnlink?: boolean;
}

interface PreviousAccountInfo {
  id: string;
  username: string;
  fullName: string;
  avatar: string;
  verified?: boolean;
  isMaster?: boolean;
}

interface AccountsOverviewResponse {
  activeAccountId: string;
  masterAccountId: string;
  isMasterSession: boolean;
  switchEnabled: boolean;
  linkEnabled: boolean;
  maxLinkedAccounts: number;
  canAddMore: boolean;
  previousAccount?: PreviousAccountInfo | null;
  accounts: LinkedAccount[];
}

interface LookupAccountPreview {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatar: string;
  verified: boolean;
  bio?: string;
  emailHint?: string | null;
}

type ActivePanelMode = 'list' | 'link_existing' | 'create';

export function AccountManagerPanel({
  active = true,
  onDone,
  redirectOnSwitch,
}: {
  active?: boolean;
  onDone?: () => void;
  redirectOnSwitch?: string;
}) {
  const { refreshBootstrap } = useApp();
  const { success, error } = useToast();

  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [previousAccount, setPreviousAccount] = useState<PreviousAccountInfo | null>(null);
  const [meta, setMeta] = useState<{
    isMasterSession: boolean;
    switchEnabled: boolean;
    linkEnabled: boolean;
    canAddMore: boolean;
    maxLinkedAccounts: number;
  }>({
    isMasterSession: true,
    switchEnabled: true,
    linkEnabled: true,
    canAddMore: true,
    maxLinkedAccounts: 5,
  });

  const [loading, setLoading] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [confirmUnlinkAcc, setConfirmUnlinkAcc] = useState<LinkedAccount | null>(null);
  const [unlinking, setUnlinking] = useState(false);

  const [mode, setMode] = useState<ActivePanelMode>('list');

  // 2-step PHP "Link Existing Account" state
  const [linkLogin, setLinkLogin] = useState('');
  const [lookupPreview, setLookupPreview] = useState<LookupAccountPreview | null>(null);
  const [linkPassword, setLinkPassword] = useState('');
  const [switchImmediately, setSwitchImmediately] = useState(true);
  const [linkingBusy, setLinkingBusy] = useState(false);

  // "Create Linked Profile" state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<AccountsOverviewResponse>('/api/v1/auth/accounts');
      setAccounts(data.accounts || []);
      setPreviousAccount(data.previousAccount ?? null);
      setMeta({
        isMasterSession: data.isMasterSession ?? true,
        switchEnabled: data.switchEnabled ?? true,
        linkEnabled: data.linkEnabled ?? true,
        canAddMore: data.canAddMore ?? true,
        maxLinkedAccounts: data.maxLinkedAccounts ?? 5,
      });
    } catch {
      // Handled gracefully cleanly without noise
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      await fetchAccounts();
    })();
    return () => {
      cancelled = true;
    };
  }, [active, fetchAccounts]);

  async function finalizeAccountTransition(reloadMessage?: string) {
    clearBootstrapCache();
    await refreshBootstrap();
    if (reloadMessage) success(reloadMessage);
    onDone?.();
    if (redirectOnSwitch) {
      window.location.assign(redirectOnSwitch);
    } else {
      window.location.reload();
    }
  }

  async function switchAccount(acc: LinkedAccount) {
    if (acc.isActive || switchingId) return;
    if (acc.canSwitch === false) {
      error('Account switching is currently unavailable for this profile.');
      return;
    }

    setSwitchingId(acc.id);
    try {
      await apiFetch('/api/v1/auth/accounts', {
        method: 'POST',
        json: { action: 'switch', targetAccountId: acc.id },
      });
      await finalizeAccountTransition(`Switched to @${acc.username}`);
    } catch (err) {
      error(err instanceof Error ? err.message : 'Unable to switch accounts.');
      setSwitchingId(null);
    }
  }

  async function switchBackToPrevious() {
    if (!previousAccount || switchingId) return;
    setSwitchingId(previousAccount.id);
    try {
      const res = await apiFetch<{ username?: string }>('/api/v1/auth/accounts', {
        method: 'POST',
        json: { action: 'switch_back' },
      });
      await finalizeAccountTransition(`Switched back to @${res.username || previousAccount.username}`);
    } catch (err) {
      error(err instanceof Error ? err.message : 'Unable to switch back to previous account.');
      setSwitchingId(null);
    }
  }

  async function confirmUnlink() {
    if (!confirmUnlinkAcc || unlinking) return;
    setUnlinking(true);
    try {
      await apiFetch('/api/v1/auth/accounts', {
        method: 'POST',
        json: { action: 'unlink', targetAccountId: confirmUnlinkAcc.id },
      });
      success(`Unlinked @${confirmUnlinkAcc.username}`);
      setConfirmUnlinkAcc(null);
      await fetchAccounts();
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to unlink account.');
    } finally {
      setUnlinking(false);
    }
  }

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!linkLogin.trim() || linkingBusy) return;
    setLinkingBusy(true);
    try {
      const res = await apiFetch<{ account: LookupAccountPreview }>('/api/v1/auth/accounts', {
        method: 'POST',
        json: { action: 'lookup', login: linkLogin.trim() },
      });
      setLookupPreview(res.account);
      setLinkPassword('');
    } catch (err) {
      error(err instanceof Error ? err.message : 'Unable to find that account.');
    } finally {
      setLinkingBusy(false);
    }
  }

  async function handleLinkExisting(e: React.FormEvent) {
    e.preventDefault();
    if (!lookupPreview || !linkPassword || linkingBusy) return;
    setLinkingBusy(true);
    try {
      const res = await apiFetch<{ linked: boolean; switched: boolean; username: string }>(
        '/api/v1/auth/accounts',
        {
          method: 'POST',
          json: {
            action: 'link_existing',
            login: lookupPreview.username,
            password: linkPassword,
            switchImmediately,
          },
        }
      );

      setLookupPreview(null);
      setLinkLogin('');
      setLinkPassword('');
      setMode('list');

      if (res.switched) {
        await finalizeAccountTransition(`Linked & switched to @${res.username}`);
      } else {
        success(`Linked @${res.username} to your accounts`);
        await fetchAccounts();
      }
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to link account.');
    } finally {
      setLinkingBusy(false);
    }
  }

  async function createLinkedAccount(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const res = await apiFetch<{ username: string }>('/api/v1/auth/accounts', {
        method: 'POST',
        json: {
          action: 'create',
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          username: username.trim() || undefined,
        },
      });
      setFirstName('');
      setLastName('');
      setUsername('');
      setMode('list');
      await finalizeAccountTransition(`Created & switched to @${res.username}`);
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to create linked profile.');
    } finally {
      setCreating(false);
    }
  }

  if (mode === 'link_existing') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setMode('list');
              setLookupPreview(null);
              setLinkPassword('');
            }}
            className="inline-flex items-center gap-1.5 text-cap-l font-semibold text-lab-sc hover:text-lab-pr cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" /> Back to accounts
          </button>
        </div>

        <div className="rounded-xl border border-bord-pr bg-fill-qt p-3.5 text-cap-l text-lab-sc">
          Enter the username or email of an existing standalone Weto account, then verify its
          password to link it with your master profile for instant switching.
        </div>

        {!lookupPreview ? (
          <form onSubmit={handleLookup} className="space-y-3">
            <Input
              label="Account Username or Email"
              placeholder="@username or email@example.com"
              value={linkLogin}
              onChange={(e) => setLinkLogin(e.target.value)}
              required
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setMode('list')}>
                Cancel
              </Button>
              <Button type="submit" loading={linkingBusy}>
                Find Account
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleLinkExisting} className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-bord-pr bg-fill-pr/40 p-3">
              <Avatar
                src={lookupPreview.avatar}
                alt={lookupPreview.username}
                size="md"
                verified={lookupPreview.verified}
              />
              <div className="min-w-0 flex-1">
                <p className="text-par-n font-bold text-lab-pr truncate">
                  {lookupPreview.fullName}
                </p>
                <p className="text-cap-l text-lab-sc truncate">
                  @{lookupPreview.username}
                  {lookupPreview.emailHint ? ` · ${lookupPreview.emailHint}` : ''}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setLookupPreview(null);
                  setLinkPassword('');
                }}
              >
                Change
              </Button>
            </div>

            <Input
              label={`Password for @${lookupPreview.username}`}
              type="password"
              placeholder="Enter target account password"
              value={linkPassword}
              onChange={(e) => setLinkPassword(e.target.value)}
              required
              autoFocus
            />

            <label className="flex items-center gap-2 text-par-s text-lab-pr2 cursor-pointer">
              <input
                type="checkbox"
                checked={switchImmediately}
                onChange={(e) => setSwitchImmediately(e.target.checked)}
                className="rounded border-bord-pr"
              />
              Switch to @{lookupPreview.username} right after linking
            </label>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setLookupPreview(null);
                  setLinkPassword('');
                }}
              >
                Back
              </Button>
              <Button type="submit" loading={linkingBusy}>
                Verify & Link Account
              </Button>
            </div>
          </form>
        )}
      </div>
    );
  }

  if (mode === 'create') {
    return (
      <form onSubmit={createLinkedAccount} className="space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <button
            type="button"
            onClick={() => setMode('list')}
            className="inline-flex items-center gap-1.5 text-cap-l font-semibold text-lab-sc hover:text-lab-pr cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" /> Back to accounts
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="First Name"
            placeholder="Alex"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
          <Input
            label="Last Name (optional)"
            placeholder="Studio"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
        <Input
          label="Username"
          placeholder="alex_studio"
          value={username}
          onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9._]/g, ''))}
          required
        />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={() => setMode('list')}>
            Cancel
          </Button>
          <Button type="submit" loading={creating}>
            Create & Switch
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      {previousAccount && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-900/25 bg-brand-900/5 p-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar
              src={previousAccount.avatar}
              alt={previousAccount.username}
              size="sm"
              verified={previousAccount.verified}
            />
            <div className="min-w-0">
              <p className="text-cap-s text-lab-sc">Previous account</p>
              <p className="text-par-s font-semibold text-lab-pr truncate">
                @{previousAccount.username}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            loading={switchingId === previousAccount.id}
            disabled={Boolean(switchingId)}
            onClick={switchBackToPrevious}
            className="shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Switch back
          </Button>
        </div>
      )}

      {!meta.isMasterSession && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-cap-l text-amber-800 dark:text-amber-300">
          <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            You are browsing with a linked profile. Switch back to your master account below to link
            or unlink other accounts.
          </span>
        </div>
      )}

      {confirmUnlinkAcc && (
        <div className="rounded-xl border border-red-900/30 bg-red-900/10 p-3.5 space-y-2.5">
          <p className="text-par-s font-semibold text-lab-pr">
            Unlink @{confirmUnlinkAcc.username}?
          </p>
          <p className="text-cap-l text-lab-sc">
            You can re-link this account later using its username/email and password.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmUnlinkAcc(null)}
              disabled={unlinking}
            >
              Cancel
            </Button>
            <Button size="sm" variant="danger" loading={unlinking} onClick={confirmUnlink}>
              Confirm Unlink
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-8 flex items-center justify-center gap-2 text-par-n text-lab-sc">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts...
        </div>
      ) : accounts.length === 0 ? (
        <p className="py-6 text-center text-par-n text-lab-sc">No linked accounts yet.</p>
      ) : (
        <div className="space-y-2 max-h-[340px] overflow-y-auto pr-0.5">
          {accounts.map((acc) => {
            const isBusy = switchingId === acc.id;
            const displayName =
              acc.fullName || `${acc.firstName || ''} ${acc.lastName || ''}`.trim() || acc.username;
            return (
              <div
                key={acc.id}
                className={`flex items-center gap-2 rounded-xl border transition-colors ${acc.isActive
                  ? 'border-brand-900 bg-brand-900/5'
                  : 'border-bord-pr hover:bg-fill-qt'
                  }`}
              >
                <button
                  type="button"
                  disabled={acc.isActive || Boolean(switchingId) || acc.canSwitch === false}
                  onClick={() => switchAccount(acc)}
                  className="flex-1 min-w-0 flex items-center justify-between gap-3 p-3 text-left cursor-pointer disabled:cursor-default"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      src={acc.avatar}
                      alt={acc.username}
                      size="md"
                      verified={acc.verified}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-par-n font-semibold text-lab-pr truncate">
                          {displayName}
                        </p>
                        {acc.isMaster && (
                          <Badge variant="outline" className="text-[11px] px-1.5 py-0">
                            Master account
                          </Badge>
                        )}
                        {acc.isPrevious && !acc.isActive && (
                          <Badge variant="outline" className="text-[11px] px-1.5 py-0">
                            Previous
                          </Badge>
                        )}
                        {acc.isActive && (
                          <Badge variant="success" className="text-[11px] px-1.5 py-0">
                            Active
                          </Badge>
                        )}
                      </div>
                      <p className="text-cap-l text-lab-sc truncate">
                        @{acc.username}
                        {acc.bio ? ` · ${acc.bio}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {isBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin text-brand-900" />
                    ) : acc.isActive ? (
                      <span className="h-6 w-6 rounded-full bg-brand-900 text-white flex items-center justify-center">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span className="text-cap-s font-semibold text-lab-sc">Switch</span>
                    )}
                  </div>
                </button>

                {acc.canUnlink && !acc.isActive && (
                  <button
                    type="button"
                    title={`Unlink @${acc.username}`}
                    onClick={() => setConfirmUnlinkAcc(acc)}
                    className="mr-2 p-2 rounded-lg text-lab-sc hover:text-red-900 hover:bg-red-900/10 cursor-pointer shrink-0"
                  >
                    <Unlink className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {meta.linkEnabled && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-bord-pr">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={!meta.isMasterSession || !meta.canAddMore}
            onClick={() => setMode('link_existing')}
          >
            <Link2 className="h-4 w-4" /> Link Existing Account
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={!meta.canAddMore}
            onClick={() => setMode('create')}
          >
            <UserPlus className="h-4 w-4" /> Create Linked Profile
          </Button>
          {!meta.isMasterSession && (
            <p className="sm:col-span-2 text-center text-cap-s text-lab-sc">
              Switch back to your master profile to link existing standalone accounts or unlink profiles.
            </p>
          )}
          {!meta.canAddMore && meta.isMasterSession && (
            <p className="sm:col-span-2 text-center text-cap-s text-lab-sc">
              Maximum of {meta.maxLinkedAccounts} linked profiles reached.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function AccountSwitcherModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Switch or Link Accounts">
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-xl bg-fill-qt p-3 text-cap-l text-lab-sc">
          <UserCheck className="h-4 w-4 text-brand-900 shrink-0" />
          <span>
            Switch between linked identities instantly or link another Weto account using its
            credentials.
          </span>
        </div>
        <AccountManagerPanel active={open} onDone={onClose} />
      </div>
    </Modal>
  );
}

export { Plus };
