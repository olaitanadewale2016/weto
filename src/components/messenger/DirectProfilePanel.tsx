'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Archive,
  ArchiveRestore,
  BadgeCheck,
  Bell,
  BellOff,
  Coins,
  Copy,
  FileText,
  Image as ImageIcon,
  Phone,
  Search,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { useToast } from '@/components/providers/ToastProvider';
import { formatRelativeTime } from '@/lib/i18n';
import { resolveMediaUrl } from '@/lib/media-url';
import { cn } from '@/lib/utils';

export interface DirectProfileUser {
  _id?: string;
  username: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  verified?: boolean;
  lastActive?: string;
  bio?: string;
  about?: string;
}

export interface DirectProfileMediaMessage {
  id: string;
  type: string;
  content?: string;
  createdAt: string;
  media?: {
    publicUrl?: string;
    url?: string;
    mimeType?: string;
    filename?: string;
    size?: number;
    sizeBytes?: number;
    durationSeconds?: number;
    type?: string;
  } | null;
}

export interface DirectProfilePanelProps {
  user: DirectProfileUser;
  isOnline?: boolean;
  messages?: DirectProfileMediaMessage[];
  locale?: string;
  isArchived?: boolean;
  isMuted?: boolean;
  onToggleMute?: () => void;
  onStartCall?: (mode: 'audio' | 'video') => void;
  onOpenSearch?: () => void;
  onOpenTip?: () => void;
  onChatAction?: (action: 'archive' | 'unarchive' | 'clear' | 'delete') => void;
  onOpenLightbox?: (url: string) => void;
  onClose?: () => void;
}

export function DirectProfilePanel({
  user,
  isOnline = false,
  messages = [],
  locale = 'en',
  isArchived = false,
  isMuted = false,
  onToggleMute,
  onStartCall,
  onOpenSearch,
  onOpenTip,
  onChatAction,
  onOpenLightbox,
  onClose,
}: DirectProfilePanelProps) {
  const { success } = useToast();
  const [tab, setTab] = useState<'info' | 'media'>('info');

  const displayName =
    `${user.firstName || ''} ${user.lastName || ''}`.trim() || `@${user.username}`;

  // Filter shared media and files from messages
  const mediaItems = messages.filter(
    (m) =>
      (m.type === 'image' || m.type === 'gif' || m.type === 'video') &&
      Boolean(m.media?.publicUrl || m.media?.url)
  );

  const fileItems = messages.filter(
    (m) => m.type === 'file' && Boolean(m.media?.publicUrl || m.media?.url)
  );

  const handleCopyUsername = () => {
    if (typeof navigator !== 'undefined' && user.username) {
      void navigator.clipboard.writeText(`@${user.username}`);
      success('Username copied to clipboard');
    }
  };

  return (
    <aside className="h-full flex flex-col bg-bg-pr text-lab-pr overflow-hidden select-none">
      {/* Main Scrollable Content (100% PHP ChatInfo.vue structure) */}
      <div className="flex-1 overflow-y-auto hidden-scroll">
        {/* Top Information + ChatOverview Section */}
        <div className="py-4 px-4">
          <div className="mb-6 flex items-center justify-between gap-2">
            <h3 className="text-title-3 font-bold text-lab-pr2 leading-tight truncate">
              Information
            </h3>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-full text-lab-sc hover:text-lab-pr hover:bg-fill-fv transition-colors cursor-pointer"
                title="Close info"
                aria-label="Close info"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="flex justify-center mb-2">
              <Avatar src={user.avatar} alt={displayName} size="xl" online={isOnline} />
            </div>

            <div className="text-center flex flex-col gap-1 max-w-full">
              <h2 className="text-par-l font-bold text-lab-pr inline-flex items-center justify-center gap-1">
                <span className="truncate">{displayName}</span>
                {user.verified && <BadgeCheck className="size-4 text-brand-900 shrink-0" />}
              </h2>
              <button
                type="button"
                onClick={handleCopyUsername}
                className="inline-flex items-center justify-center gap-1 text-par-s text-lab-sc hover:text-brand-900 transition-colors cursor-pointer group"
                title="Copy @username"
              >
                <span>@{user.username}</span>
                <Copy className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              <span className="block text-par-s text-lab-sc">
                {isOnline
                  ? 'Online'
                  : user.lastActive
                  ? `Was online ${formatRelativeTime(user.lastActive, locale)}`
                  : 'Was online N/A'}
              </span>
              {(user.bio || user.about) && (
                <span className="block text-par-n text-lab-pr2 mt-1 whitespace-pre-wrap">
                  {user.bio || user.about}
                </span>
              )}
            </div>

            {/* Quick Action Buttons (View Profile + Calls + Tip) */}
            <div className="flex items-center justify-center gap-3 mt-4 flex-wrap">
              <Link
                href={`/@${user.username}`}
                className="inline-flex items-center justify-center rounded-full bg-fill-qt hover:bg-fill-sc px-5 py-2 text-par-s font-semibold text-lab-pr transition-colors"
                title="View full profile"
              >
                View profile
              </Link>
              {onStartCall && (
                <>
                  <button
                    type="button"
                    onClick={() => onStartCall('audio')}
                    className="size-9 rounded-full bg-fill-qt hover:bg-fill-sc inline-flex items-center justify-center text-lab-pr transition-colors cursor-pointer"
                    title="Audio call"
                    aria-label="Audio call"
                  >
                    <Phone className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartCall('video')}
                    className="size-9 rounded-full bg-fill-qt hover:bg-fill-sc inline-flex items-center justify-center text-lab-pr transition-colors cursor-pointer"
                    title="Video call"
                    aria-label="Video call"
                  >
                    <Video className="size-4" />
                  </button>
                </>
              )}
              {onOpenTip && (
                <button
                  type="button"
                  onClick={onOpenTip}
                  className="size-9 rounded-full bg-amber-500/10 hover:bg-amber-500/20 inline-flex items-center justify-center text-amber-500 transition-colors cursor-pointer"
                  title="Send Tip"
                  aria-label="Send Tip"
                >
                  <Coins className="size-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* PHP ChatInfo.vue thick separator bar */}
        <div className="h-3 w-full bg-fill-qt opacity-70" />

        {/* PHP ContentTabs underline switcher: Details & Shared Media */}
        <div className="grid grid-cols-2 border-b border-b-bord-card">
          <button
            type="button"
            onClick={() => setTab('info')}
            className={cn(
              'py-3.5 text-par-m font-semibold text-center relative transition-colors cursor-pointer',
              tab === 'info'
                ? "text-lab-pr2 after:content-[''] after:absolute after:-bottom-px after:left-0 after:w-full after:h-0.5 after:bg-lab-pr"
                : 'text-lab-sc hover:text-lab-pr'
            )}
          >
            Actions
          </button>
          <button
            type="button"
            onClick={() => setTab('media')}
            className={cn(
              'py-3.5 text-par-m font-semibold text-center relative transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5',
              tab === 'media'
                ? "text-lab-pr2 after:content-[''] after:absolute after:-bottom-px after:left-0 after:w-full after:h-0.5 after:bg-lab-pr"
                : 'text-lab-sc hover:text-lab-pr'
            )}
          >
            <span>Media</span>
            {(mediaItems.length > 0 || fileItems.length > 0) && (
              <span className="text-cap-s text-lab-sc">
                ({mediaItems.length + fileItems.length})
              </span>
            )}
          </button>
        </div>

        {/* Tab 1: Flat ModalRowButton List (100% PHP ChatInfo.vue parity) */}
        {tab === 'info' && (
          <div className="block">
            {onOpenSearch && (
              <button
                type="button"
                onClick={onOpenSearch}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left text-par-n font-medium text-lab-pr hover:bg-fill-fv transition-colors cursor-pointer"
              >
                <Search className="size-[19px] text-lab-sc shrink-0" />
                <span>Search in conversation</span>
              </button>
            )}

            {onToggleMute && (
              <button
                type="button"
                onClick={onToggleMute}
                className="w-full flex items-center justify-between px-4 py-3.5 text-left text-par-n font-medium text-lab-pr hover:bg-fill-fv transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  {isMuted ? (
                    <BellOff className="size-[19px] text-amber-500 shrink-0" />
                  ) : (
                    <Bell className="size-[19px] text-lab-sc shrink-0" />
                  )}
                  <span>Notifications</span>
                </div>
                <span className="text-cap-l text-lab-sc font-medium">
                  {isMuted ? 'Muted' : 'On'}
                </span>
              </button>
            )}

            {onChatAction && (
              <>
                <button
                  type="button"
                  onClick={() => onChatAction(isArchived ? 'unarchive' : 'archive')}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left text-par-n font-medium text-lab-pr hover:bg-fill-fv transition-colors cursor-pointer"
                >
                  {isArchived ? (
                    <ArchiveRestore className="size-[19px] text-lab-sc shrink-0" />
                  ) : (
                    <Archive className="size-[19px] text-lab-sc shrink-0" />
                  )}
                  <span>{isArchived ? 'Unarchive chat' : 'Archive chat'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onChatAction('clear')}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left text-par-n font-medium text-lab-pr hover:bg-fill-fv transition-colors cursor-pointer"
                >
                  <X className="size-[19px] text-lab-sc shrink-0" />
                  <span>Clear conversation</span>
                </button>

                <button
                  type="button"
                  onClick={() => onChatAction('delete')}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left text-par-n font-medium text-red-900 hover:bg-fill-fv transition-colors cursor-pointer"
                >
                  <Trash2 className="size-[19px] text-red-900 shrink-0" />
                  <span>Delete chat</span>
                </button>
              </>
            )}

            <div className="h-3 w-full bg-fill-qt opacity-70" />
          </div>
        )}

        {/* Tab 2: Shared Media & Files */}
        {tab === 'media' && (
          <div className="p-4 space-y-4">
            {/* Photos & Videos Grid */}
            <div>
              <p className="text-cap-l font-bold text-lab-pr mb-2 flex items-center gap-1.5">
                <ImageIcon className="size-4 text-brand-900" />
                Photos &amp; Videos ({mediaItems.length})
              </p>
              {mediaItems.length === 0 ? (
                <p className="text-cap-l text-lab-sc py-4 text-center">No shared media yet.</p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {mediaItems.map((m) => {
                    const url = String(m.media?.publicUrl || m.media?.url || '');
                    const isVid = m.type === 'video';
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          if (url && onOpenLightbox) onOpenLightbox(url);
                        }}
                        className="relative aspect-square rounded-lg overflow-hidden bg-fill-qt hover:opacity-90 transition-opacity cursor-pointer border border-bord-card"
                      >
                        {isVid ? (
                          <div className="w-full h-full flex items-center justify-center bg-black/80">
                            <Video className="size-6 text-white" />
                          </div>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={resolveMediaUrl(url)}
                            alt="Shared media"
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Files List */}
            <div>
              <p className="text-cap-l font-bold text-lab-pr mb-2 flex items-center gap-1.5">
                <FileText className="size-4 text-brand-900" />
                Shared Files ({fileItems.length})
              </p>
              {fileItems.length === 0 ? (
                <p className="text-cap-l text-lab-sc py-4 text-center">No shared files yet.</p>
              ) : (
                <div className="divide-y divide-bord-pr rounded-xl border border-bord-pr overflow-hidden bg-bg-pr">
                  {fileItems.map((f) => {
                    const url = String(f.media?.publicUrl || f.media?.url || '');
                    return (
                      <a
                        key={f.id}
                        href={resolveMediaUrl(url)}
                        target="_blank"
                        rel="noreferrer"
                        download
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-fill-fv transition-colors text-left"
                      >
                        <div className="size-8 rounded-lg bg-fill-qt flex items-center justify-center shrink-0">
                          <FileText className="size-4 text-brand-900" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-par-s font-medium text-lab-pr truncate">
                            {f.media?.filename || 'Document'}
                          </p>
                          <p className="text-[11px] text-lab-sc">
                            {formatRelativeTime(f.createdAt, locale)}
                          </p>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
