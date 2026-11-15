'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Camera, ChevronRight, Loader2, Pencil, Settings, X } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { ActionSheet, ActionSheetGroup, ActionSheetItem } from '@/components/mobile/ActionSheet';
import { apiFetch, uploadFileToR2 } from '@/lib/api-client';
import { normalizeAvatarSrc, normalizeCoverSrc } from '@/components/ui/avatar';
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

/**
 * Matches PHP ColibriPlus Desktop `ProfileEditModal.vue` and Mobile `ProfileEditor.vue`:
 * edge-to-edge Cover editor + overlapping Avatar editor + upload progress bar + Account Settings link.
 */
export function ProfileEditModal({
  open,
  onClose,
  initial,
  onUpdated,
}: ProfileEditModalProps) {
  const { updateUserPatch, refreshBootstrap } = useApp();
  const { error, success } = useToast();

  const [draftMedia, setDraftMedia] = useState<{ avatar?: string; cover?: string }>({});
  const [uploadingKind, setUploadingKind] = useState<'avatar' | 'cover' | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  async function handleImagePick(kind: 'avatar' | 'cover', e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    setDraftMedia((prev) => ({ ...prev, [kind]: previewUrl }));
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

      setDraftMedia((prev) => ({ ...prev, [kind]: up.publicUrl }));
      updateUserPatch({ [kind]: up.publicUrl });
      onUpdated({ [kind]: up.publicUrl });
      success(`${kind === 'avatar' ? 'Profile photo' : 'Cover image'} updated!`);
      void refreshBootstrap();
    } catch (err) {
      setDraftMedia((prev) => ({ ...prev, [kind]: undefined }));
      error('Upload failed', err instanceof Error ? err.message : undefined);
    } finally {
      setUploadingKind(null);
      setUploadProgress(0);
      setTimeout(() => URL.revokeObjectURL(previewUrl), 2500);
    }
  }

  const avatarSrc = normalizeAvatarSrc(draftMedia.avatar ?? initial.avatar) || '/assets/avatars/default-avatar.png';
  const coverSrc = normalizeCoverSrc(draftMedia.cover ?? initial.cover);

  const mediaEditorBody = (
    <div className="flex flex-col">
      {/* Mobile Progress Bar sits above cover in PHP ProfileEditor.vue */}
      {isMobile && uploadingKind ? (
        <div className="h-1.5 bg-fill-qt overflow-hidden">
          <div
            className="h-full bg-green-900 transition-all duration-150"
            style={{ width: `${Math.max(8, uploadProgress)}%` }}
          />
        </div>
      ) : null}

      {/* Edge-to-Edge Cover & Overlapping Avatar */}
      <div className="mb-4">
        <div className="bg-black overflow-hidden relative h-32 md:h-44">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={coverSrc}
            src={coverSrc}
            alt="Cover"
            decoding="async"
            onLoad={(e) => {
              e.currentTarget.dataset.fallbackApplied = '';
            }}
            onError={(e) => {
              if (e.currentTarget.dataset.fallbackApplied !== '1') {
                e.currentTarget.dataset.fallbackApplied = '1';
                e.currentTarget.src = '/assets/covers/default-cover.png';
              }
            }}
            className="w-full h-full object-cover"
          />
          <label
            className="cursor-pointer absolute top-2.5 right-2.5 bg-black/50 hover:bg-black/35 smoothing size-10 inline-flex items-center justify-center rounded-full text-white/95"
            title="Change cover photo"
            aria-label="Change cover photo"
          >
            {uploadingKind === 'cover' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Pencil className="size-4" />
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploadingKind !== null}
              onChange={(e) => void handleImagePick('cover', e)}
            />
          </label>
        </div>

        <div className="px-4 -mt-[42px] md:-mt-[56px] z-20 relative inline-block">
          <div className="relative rounded-full overflow-hidden size-24 md:size-28 border-4 border-bg-pr bg-bg-pr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={avatarSrc}
              src={avatarSrc}
              alt={initial.firstName || 'Avatar'}
              decoding="async"
              onLoad={(e) => {
                e.currentTarget.dataset.fallbackApplied = '';
              }}
              onError={(e) => {
                if (e.currentTarget.dataset.fallbackApplied !== '1') {
                  e.currentTarget.dataset.fallbackApplied = '1';
                  e.currentTarget.src = '/assets/avatars/default-avatar.png';
                }
              }}
              className="w-full h-full object-cover"
            />
            <label
              className="absolute cursor-pointer inset-0 z-20 flex items-center justify-center"
              title="Change profile photo"
              aria-label="Change profile photo"
            >
              <span className="bg-black/50 hover:bg-black/35 smoothing size-10 inline-flex items-center justify-center rounded-full text-white/95">
                {uploadingKind === 'avatar' ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Camera className="size-5" />
                )}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingKind !== null}
                onChange={(e) => void handleImagePick('avatar', e)}
              />
            </label>
          </div>
        </div>
      </div>

      {/* PHP Image Guidance & Resolution Specs (keeping readable par-s / par-n font scale) */}
      <div className="px-4 pb-6 md:pb-8 text-par-s text-lab-sc">
        <p className="mb-2">
          Upload a clear profile photo and cover banner so others can easily recognize your account.
        </p>
        <p className="mb-2">Supported image formats: JPG, JPEG, PNG, GIF, or WebP.</p>
        <div className="h-px bg-bord-pr my-2.5" />
        <p>Recommended sizes: 400×400 px for avatar and 1500×500 px for cover image.</p>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <ActionSheet open={open} onClose={onClose} muted>
        <div className="flex flex-col">
          <div className="px-4 pb-3 border-b border-bord-pr text-center">
            <h2 className="text-par-l font-bold text-lab-pr">Edit profile</h2>
          </div>

          <div className="-mx-4 mt-0">{mediaEditorBody}</div>

          <ActionSheetGroup>
            <Link href="/settings" onClick={onClose}>
              <ActionSheetItem icon={Settings} label="Account settings" />
            </Link>
            <ActionSheetItem icon={X} label="Close" onClick={onClose} />
          </ActionSheetGroup>
        </div>
      </ActionSheet>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit profile" maxWidthClass="max-w-lg" bodyClassName="p-0">
      <div className="overflow-hidden">
        {mediaEditorBody}

        {uploadingKind ? (
          <div className="h-3 bg-fill-qt overflow-hidden">
            <div
              className="h-full bg-green-900 transition-all duration-150"
              style={{ width: `${Math.max(8, uploadProgress)}%` }}
            />
          </div>
        ) : (
          <div className="h-3 bg-fill-qt/70" />
        )}

        <Link
          href="/settings"
          onClick={onClose}
          className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-fill-qt/60 transition-colors text-lab-pr"
        >
          <span className="inline-flex items-center gap-3 text-par-m font-medium">
            <Settings className="size-5 text-lab-pr2 shrink-0" />
            <span>Account settings</span>
          </span>
          <ChevronRight className="size-5 text-lab-sc shrink-0" />
        </Link>
      </div>
    </Modal>
  );
}
