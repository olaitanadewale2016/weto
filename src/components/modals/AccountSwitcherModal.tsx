'use client';

import React, { useEffect, useState } from 'react';
import { Check, Plus, UserCheck } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { apiFetch } from '@/lib/api-client';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';

interface LinkedAccount {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  avatar: string;
  verified: boolean;
  isActive: boolean;
}

export function AccountSwitcherModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { refreshBootstrap } = useApp();
  const { success, error } = useToast();
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const id = setTimeout(() => {
      setLoading(true);
      apiFetch<{ accounts: LinkedAccount[] }>('/auth/accounts')
        .then((res) => {
          if (!cancelled) setAccounts(res.accounts || []);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [open]);

  async function handleSwitch(accountId: string) {
    try {
      await apiFetch('/auth/accounts', {
        method: 'POST',
        json: { action: 'switch', accountId },
      });
      await refreshBootstrap();
      success('Switched active account');
      onClose();
      window.location.reload();
    } catch (err) {
      error('Could not switch account', err instanceof Error ? err.message : undefined);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setCreating(true);
    try {
      await apiFetch('/auth/accounts', {
        method: 'POST',
        json: {
          action: 'create',
          username: username.trim().toLowerCase(),
          firstName: firstName.trim() || username.trim(),
        },
      });
      await refreshBootstrap();
      success('New profile created and activated');
      setUsername('');
      setFirstName('');
      setShowCreateForm(false);
      onClose();
      window.location.reload();
    } catch (err) {
      error('Failed to create account', err instanceof Error ? err.message : undefined);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Switch Account"
      description="Manage and switch between your linked Weto profiles."
    >
      <div className="space-y-3">
        {loading && <p className="text-par-n text-lab-sc py-4 text-center">Loading accounts...</p>}

        {!loading &&
          accounts.map((acc) => (
            <button
              key={acc.id}
              type="button"
              onClick={() => !acc.isActive && handleSwitch(acc.id)}
              className="w-full flex items-center justify-between gap-3 rounded-2xl border border-bord-pr p-3 hover:bg-fill-pr transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Avatar src={acc.avatar} alt={acc.username} verified={acc.verified} size="md" />
                <div className="text-left min-w-0">
                  <p className="text-par-n font-semibold text-lab-pr truncate">
                    {acc.firstName} {acc.lastName}
                  </p>
                  <p className="text-cap-l text-lab-sc truncate">@{acc.username}</p>
                </div>
              </div>
              {acc.isActive ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-900/12 px-2.5 py-1 text-cap-s font-semibold text-brand-900">
                  <Check className="h-3.5 w-3.5" /> Active
                </span>
              ) : (
                <UserCheck className="h-4 w-4 text-lab-tr" />
              )}
            </button>
          ))}

        {!showCreateForm ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setShowCreateForm(true)}
          >
            <Plus className="h-4 w-4" />
            Create Linked Profile
          </Button>
        ) : (
          <form onSubmit={handleCreate} className="space-y-3 rounded-2xl bg-fill-pr p-4 border border-bord-pr">
            <Input
              label="Username"
              placeholder="new_handle"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <Input
              label="Display Name"
              placeholder="Creative Studio"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={creating}>
                Create Profile
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
