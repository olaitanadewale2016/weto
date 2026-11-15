'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Camera, Loader2, Settings } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import { apiFetch, uploadFileToR2 } from '@/lib/api-client';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';

export interface EditableProfileFields {
  firstName: string;
  lastName: string;
  bio?: string;
  caption?: string;
  website?: string;
  avatar?: string;
  cover?: string;
}

interface ProfileEditModalProps {
  open: boolean;
  onClose: () => void;
  initial: EditableProfileFields;
  onUpdated: (patch: Partial<EditableProfileFields>) => void;
}

export function ProfileEditModal({
  open,
  onClose,
  initial,
  onUpdated,
}: ProfileEditModalProps) {
  const { updateUserPatch, refreshBootstrap } = useApp();
  const { error, success } = useToast();

  const [form, setForm] = useState<EditableProfileFields>(initial);
  const [uploadingKind, setUploadingKind] = useState<'avatar' | 'cover' | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  async function handleImagePick(kind: 'avatar' | 'cover', e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    setForm((prev) => ({ ...prev, [kind]: previewUrl }));
    setUploadingKind(kind);
    setUploadProgress(0);

    try {
      const up = await uploadFileToR2(
        file,
        kind === 'avatar' ? 'avatars' : 'covers',
        kind === 'avatar' ? 'user_avatar' : 'user_cover',
        (pct) => setUploadProgress(pct)
      );

      await apiFetch('/settings', {
        method: 'PATCH',
        json: { section: kind, data: { url: up.publicUrl } },
      });

      setForm((prev) => ({ ...prev, [kind]: up.publicUrl }));
      updateUserPatch({ [kind]: up.publicUrl });
      onUpdated({ [kind]: up.publicUrl });
      success(`${kind === 'avatar' ? 'Profile photo' : 'Cover image'} updated!`);
      void refreshBootstrap();
    } catch (err) {
      setForm((prev) => ({ ...prev, [kind]: initial[kind] }));
      error('Upload failed', err instanceof Error ? err.message : undefined);
    } finally {
      setUploadingKind(null);
      setUploadProgress(0);
      URL.revokeObjectURL(previewUrl);
    }
  }

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim()) {
      error('First name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        bio: form.bio?.trim() || '',
        caption: form.caption?.trim() || '',
        website: form.website?.trim() || '',
      };
      await apiFetch('/settings', {
        method: 'PATCH',
        json: { section: 'account', data: payload },
      });
      updateUserPatch({
        firstName: payload.firstName,
        lastName: payload.lastName,
        bio: payload.bio,
      });
      onUpdated(payload);
      success('Profile updated!');
      void refreshBootstrap();
      onClose();
    } catch (err) {
      error('Could not save profile', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit profile" maxWidthClass="max-w-lg">
      <div className="space-y-4">
        {/* Cover + Overlapping Avatar matching PHP ProfileEditModal.vue */}
        <div>
          <div className="relative h-36 sm:h-40 rounded-2xl bg-fill-qt overflow-hidden border border-bord-card">
            {form.cover ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={form.cover}
                alt="Cover preview"
                className="w-full h-full object-cover"
              />
            ) : null}
            <label
              className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/65 hover:bg-black/80 text-white px-3 py-1.5 text-cap-s font-semibold cursor-pointer transition-colors"
              title="Change cover photo"
            >
              {uploadingKind === 'cover' ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Camera className="size-3.5" />
              )}
              <span>{uploadingKind === 'cover' ? `${uploadProgress}%` : 'Edit cover'}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingKind !== null}
                onChange={(e) => void handleImagePick('cover', e)}
              />
            </label>
          </div>

          <div className="px-3 -mt-10 relative z-10 flex items-end justify-between">
            <div className="relative inline-block">
              <Avatar
                src={form.avatar}
                alt={form.firstName}
                size="xl"
                className="ring-4 ring-bg-pr bg-fill-qt"
              />
              <label
                className="absolute inset-0 rounded-full bg-black/45 hover:bg-black/60 text-white flex items-center justify-center cursor-pointer transition-colors"
                title="Change profile photo"
              >
                {uploadingKind === 'avatar' ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Camera className="size-5" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingKind !== null}
                  onChange={(e) => void handleImagePick('avatar', e)}
                />
              </label>
            </div>

            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 rounded-full border border-bord-pr px-3 py-1.5 text-cap-l font-semibold text-lab-pr hover:bg-fill-pr transition-colors"
            >
              <Settings className="size-3.5" /> Account settings
            </Link>
          </div>
        </div>

        {uploadingKind ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-cap-s text-lab-sc">
              <span>Uploading {uploadingKind === 'avatar' ? 'avatar' : 'cover photo'}...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-fill-qt overflow-hidden">
              <div
                className="h-full bg-brand-900 transition-all duration-150"
                style={{ width: `${Math.max(8, uploadProgress)}%` }}
              />
            </div>
          </div>
        ) : null}

        <p className="text-cap-s text-lab-sc">
          Recommended: square avatar (at least 400x400) and wide cover banner (1500x500). Changes apply immediately across Weto.
        </p>

        <form onSubmit={handleSaveDetails} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="First Name"
              value={form.firstName}
              onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
              required
            />
            <Input
              label="Last Name"
              value={form.lastName}
              onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
            />
          </div>

          <Input
            label="Tagline / Caption"
            placeholder="Role, headline, or short status"
            value={form.caption || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, caption: e.target.value }))}
          />

          <Textarea
            label="Bio"
            placeholder="Tell people about yourself..."
            rows={3}
            value={form.bio || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, bio: e.target.value }))}
          />

          <Input
            label="Website"
            placeholder="https://..."
            value={form.website || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))}
          />

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button type="submit" variant="primary" loading={saving} disabled={uploadingKind !== null}>
              Save changes
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
