'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Archive,
  BadgeCheck,
  Bell,
  BellOff,
  Coins,
  Copy,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Phone,
  Search,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
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
      {/* Top Header */}
      <div className="px-4 py-3 border-b border-bord-pr flex items-center justify-between shrink-0 bg-bg-pr">
        <h3 className="text-par-l font-bold text-lab-pr truncate">User Info</h3>
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

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto hidden-scroll divide-y divide-bord-pr">
        {/* User Hero Section */}
        <div className="p-4 flex flex-col items-center text-center space-y-3 bg-fill-fv/25">
          <div className="relative">
            <Avatar src={user.avatar} alt={displayName} size="xl" online={isOnline} />
          </div>

          <div className="space-y-0.5 max-w-full">
            <div className="flex items-center justify-center gap-1.5">
              <h2 className="text-title-3 font-bold text-lab-pr truncate">{displayName}</h2>
              {user.verified && <BadgeCheck className="size-4 text-brand-900 shrink-0" />}
            </div>
            <button
              type="button"
              onClick={handleCopyUsername}
              className="inline-flex items-center gap-1 text-par-s text-lab-sc hover:text-brand-900 transition-colors cursor-pointer group"
              title="Copy @username"
            >
              <span>@{user.username}</span>
              <Copy className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            <p className="text-cap-l text-lab-sc">
              {isOnline
                ? 'Online'
                : user.lastActive
                ? `Last seen ${formatRelativeTime(user.lastActive, locale)}`
                : 'Offline'}
            </p>
          </div>

          {/* Quick Action Circles */}
          <div className="flex items-center justify-center gap-3 pt-1">
            {onStartCall && (
              <>
                <button
                  type="button"
                  onClick={() => onStartCall('audio')}
                  className="flex flex-col items-center gap-1.5 text-lab-sc hover:text-brand-900 transition-colors cursor-pointer group"
                  title="Audio call"
                >
                  <div className="size-10 rounded-full bg-fill-qt group-hover:bg-brand-900/10 flex items-center justify-center transition-colors">
                    <Phone className="size-4 text-lab-pr group-hover:text-brand-900" />
                  </div>
                  <span className="text-[12.5px] font-medium">Call</span>
                </button>
                <button
                  type="button"
                  onClick={() => onStartCall('video')}
                  className="flex flex-col items-center gap-1.5 text-lab-sc hover:text-brand-900 transition-colors cursor-pointer group"
                  title="Video call"
                >
                  <div className="size-10 rounded-full bg-fill-qt group-hover:bg-brand-900/10 flex items-center justify-center transition-colors">
                    <Video className="size-4 text-lab-pr group-hover:text-brand-900" />
                  </div>
                  <span className="text-[12.5px] font-medium">Video</span>
                </button>
              </>
            )}

            {onOpenTip && (
              <button
                type="button"
                onClick={onOpenTip}
                className="flex flex-col items-center gap-1.5 text-lab-sc hover:text-amber-500 transition-colors cursor-pointer group"
                title="Send Tip"
              >
                <div className="size-10 rounded-full bg-amber-500/10 group-hover:bg-amber-500/20 flex items-center justify-center transition-colors">
                  <Coins className="size-4 text-amber-500" />
                </div>
                <span className="text-[12.5px] font-medium">Tip</span>
              </button>
            )}

            <Link
              href={`/@${user.username}`}
              className="flex flex-col items-center gap-1.5 text-lab-sc hover:text-brand-900 transition-colors cursor-pointer group"
              title="View full profile"
            >
              <div className="size-10 rounded-full bg-fill-qt group-hover:bg-brand-900/10 flex items-center justify-center transition-colors">
                <ExternalLink className="size-4 text-lab-pr group-hover:text-brand-900" />
              </div>
              <span className="text-[12.5px] font-medium">Profile</span>
            </Link>
          </div>
        </div>

        {/* 2 Tabs: Info & Shared Media */}
        <div className="flex border-b border-bord-pr bg-fill-fv/30 shrink-0">
          <button
            type="button"
            onClick={() => setTab('info')}
            className={cn(
              'flex-1 py-2.5 text-par-s font-semibold text-center border-b-2 transition-colors cursor-pointer',
              tab === 'info'
                ? 'border-brand-900 text-brand-900 bg-bg-pr'
                : 'border-transparent text-lab-sc hover:text-lab-pr'
            )}
          >
            Details
          </button>
          <button
            type="button"
            onClick={() => setTab('media')}
            className={cn(
              'flex-1 py-2.5 text-par-s font-semibold text-center border-b-2 transition-colors cursor-pointer flex items-center justify-center gap-1.5',
              tab === 'media'
                ? 'border-brand-900 text-brand-900 bg-bg-pr'
                : 'border-transparent text-lab-sc hover:text-lab-pr'
            )}
          >
            <span>Media</span>
            {(mediaItems.length > 0 || fileItems.length > 0) && (
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-fill-sc text-lab-sc">
                {mediaItems.length + fileItems.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab 1: Info & Management */}
        {tab === 'info' && (
          <div className="p-4 space-y-4">
            {/* Bio / About */}
            {(user.bio || user.about) && (
              <div className="p-3 rounded-2xl bg-fill-qt/50 border border-bord-card space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-lab-sc">Bio</p>
                <p className="text-par-s text-lab-pr whitespace-pre-wrap">{user.bio || user.about}</p>
              </div>
            )}

            {/* Quick Actions List */}
            <div className="rounded-2xl border border-bord-pr overflow-hidden divide-y divide-bord-pr bg-bg-pr">
              {onOpenSearch && (
                <button
                  type="button"
                  onClick={onOpenSearch}
                  className="w-full flex items-center justify-between px-4 py-3 text-left text-par-s text-lab-pr hover:bg-fill-fv transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Search className="size-4 text-lab-sc" />
                    <span>Search in conversation</span>
                  </div>
                </button>
              )}

              {onToggleMute && (
                <button
                  type="button"
                  onClick={onToggleMute}
                  className="w-full flex items-center justify-between px-4 py-3 text-left text-par-s text-lab-pr hover:bg-fill-fv transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    {isMuted ? (
                      <BellOff className="size-4 text-amber-500" />
                    ) : (
                      <Bell className="size-4 text-lab-sc" />
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
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-par-s text-lab-pr hover:bg-fill-fv transition-colors cursor-pointer"
                  >
                    <Archive className="size-4 text-lab-sc" />
                    <span>{isArchived ? 'Unarchive chat' : 'Archive chat'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onChatAction('clear')}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-par-s text-lab-pr hover:bg-fill-fv transition-colors cursor-pointer"
                  >
                    <X className="size-4 text-lab-sc" />
                    <span>Clear chat history</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onChatAction('delete')}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-par-s text-red-600 hover:bg-red-500/10 transition-colors cursor-pointer"
                  >
                    <Trash2 className="size-4 text-red-600" />
                    <span>Delete conversation</span>
                  </button>
                </>
              )}
            </div>
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
