'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  BadgeCheck,
  Check,
  Copy,
  FileDown,
  Image as ImageIcon,
  Lock,
  LogOut,
  MessageSquareOff,
  Phone,
  RefreshCw,
  Settings,
  Shield,
  ShieldAlert,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Video,
  VolumeX,
  X,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AvatarPresetPicker } from '@/components/profile/AvatarPresetPicker';
import { apiFetch, uploadFileToR2 } from '@/lib/api-client';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';

const GROUP_CATEGORIES = [
  'General',
  'Tech & Creators',
  'Marketplace',
  'Gaming',
  'Music & Culture',
  'Support',
];

export interface GroupInfoParticipant {
  user: {
    _id: string;
    username: string;
    firstName: string;
    lastName: string;
    avatar: string;
    verified?: boolean;
  };
  role: string;
  isMuted?: boolean;
}

export interface GroupInfoChat {
  id: string;
  group?: {
    ownerId?: string;
    name: string;
    description?: string;
    avatar?: string;
    coverImage?: string | null;
    category?: string;
    inviteCode?: string;
    visibility?: 'public' | 'private';
    privacy?: 'open' | 'closed';
    status?: string;
    verified?: boolean;
    isPinned?: boolean;
    autoJoin?: boolean;
    unleavable?: boolean;
    postingMode?: 'everyone' | 'admins_only';
    requiresApproval?: boolean;
    isPasswordProtected?: boolean;
  };
  participants?: GroupInfoParticipant[];
  pendingJoinUsers?: Array<{
    _id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
  }>;
  bannedUsers?: Array<{
    _id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
  }>;
}

export interface GroupInfoMediaMessage {
  id: string;
  type: string;
  media?: {
    publicUrl?: string;
    url?: string;
    filename?: string;
    sizeBytes?: number;
  } | null;
}

interface InviteCandidate {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  avatar: string;
}

interface GroupInfoPanelProps {
  chat: GroupInfoChat;
  currentUserId: string;
  myRole?: string;
  onlineUsers: Set<string>;
  pinnedCount: number;
  messages: GroupInfoMediaMessage[];
  inviteUserQuery: string;
  inviteUserResults: InviteCandidate[];
  onInviteQueryChange: (val: string) => void;
  onInviteUser: (userId: string) => void;
  onStartCall: (mode: 'audio' | 'video') => void;
  onLeaveGroup: () => void;
  onDeleteGroup: () => void;
  onOpenLightbox: (url: string) => void;
  onRefresh: () => void;
  onClose: () => void;
}

export function GroupInfoPanel({
  chat,
  currentUserId,
  myRole,
  onlineUsers,
  pinnedCount,
  messages,
  inviteUserQuery,
  inviteUserResults,
  onInviteQueryChange,
  onInviteUser,
  onStartCall,
  onLeaveGroup,
  onDeleteGroup,
  onOpenLightbox,
  onRefresh,
  onClose,
}: GroupInfoPanelProps) {
  const { success, error } = useToast();
  const [panelTab, setPanelTab] = useState<'members' | 'media' | 'settings'>('members');
  const [memberSearch, setMemberSearch] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);

  const g = chat.group;
  const isOwner = myRole === 'owner' || String(g?.ownerId) === currentUserId;
  const isAdminOrOwner = isOwner || myRole === 'admin';

  // Edit group settings state
  const [editName, setEditName] = useState(g?.name || '');
  const [editDesc, setEditDesc] = useState(g?.description || '');
  const [editAvatar, setEditAvatar] = useState(g?.avatar || '/assets/avatars/default-avatar.png');
  const [editCover, setEditCover] = useState(g?.coverImage || '');
  const [editCategory, setEditCategory] = useState(g?.category || 'General');
  const [editVisibility, setEditVisibility] = useState<'public' | 'private'>(
    g?.visibility || 'public'
  );
  const [editPostingMode, setEditPostingMode] = useState<'everyone' | 'admins_only'>(
    g?.postingMode || 'everyone'
  );
  const [editApproval, setEditApproval] = useState(Boolean(g?.requiresApproval));
  const [editPassword, setEditPassword] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const mediaItems = messages.filter(
    (m) => (m.type === 'image' || m.type === 'gif' || m.type === 'video') && (m.media?.publicUrl || m.media?.url)
  );
  const fileItems = messages.filter(
    (m) => m.type === 'file' && (m.media?.publicUrl || m.media?.url)
  );

  const filteredParticipants = (chat.participants || []).filter((p) => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return true;
    const full = `${p.user.firstName || ''} ${p.user.lastName || ''} ${p.user.username || ''}`.toLowerCase();
    return full.includes(q);
  });

  async function patchGroup(payload: Record<string, unknown>, okMessage?: string) {
    try {
      await apiFetch(`/chats/${chat.id}`, {
        method: 'PATCH',
        json: payload,
      });
      if (okMessage) success(okMessage);
      onRefresh();
    } catch (err) {
      error('Group action failed', err instanceof Error ? err.message : undefined);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!editName.trim() || savingSettings) return;
    setSavingSettings(true);
    try {
      await patchGroup(
        {
          action: 'update_group',
          groupName: editName.trim(),
          groupDescription: editDesc.trim(),
          groupAvatar: editAvatar,
          groupCover: editCover || null,
          category: editCategory,
          visibility: editVisibility,
          privacy: editApproval ? 'closed' : 'open',
          postingMode: editPostingMode,
          requiresApproval: editApproval,
          ...(editPassword.trim() ? { password: editPassword.trim() } : {}),
        },
        'Group settings updated'
      );
      setEditPassword('');
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleUploadGroupMedia(file: File, kind: 'avatar' | 'cover') {
    setUploadingImage(true);
    try {
      const up = await uploadFileToR2(file, 'chats', 'system_asset');
      if (kind === 'avatar') setEditAvatar(up.publicUrl);
      else setEditCover(up.publicUrl);
      success(kind === 'avatar' ? 'Avatar ready — click Save Settings' : 'Cover ready — click Save Settings');
    } catch (err) {
      error('Upload failed', err instanceof Error ? err.message : undefined);
    } finally {
      setUploadingImage(false);
    }
  }

  function handleCopyInviteLink() {
    if (typeof window === 'undefined') return;
    const url = g?.inviteCode
      ? `${window.location.origin}/messenger?joinGroup=${encodeURIComponent(g.inviteCode)}`
      : `${window.location.origin}/messenger/c/${chat.id}`;
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopiedInvite(true);
        success('Invite link copied!');
        setTimeout(() => setCopiedInvite(false), 2000);
      },
      () => error('Could not copy invite link')
    );
  }

  return (
    <aside className="flex flex-col h-full bg-bg-pr border-l border-bord-pr overflow-hidden">
      {/* Grupo Info Header */}
      <div className="px-4 py-3 border-b border-bord-pr flex items-center justify-between gap-2 shrink-0">
        <p className="text-par-n font-bold text-lab-pr truncate">Room Info</p>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-full text-lab-sc hover:text-lab-pr hover:bg-fill-sc cursor-pointer"
          aria-label="Close room info"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Cover & Avatar Hero (matches Grupo info_panel.php) */}
        <div className="relative">
          <div className="h-24 w-full bg-gradient-to-r from-brand-900/25 via-brand-900/15 to-fill-qt overflow-hidden">
            {g?.coverImage && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={g.coverImage} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="-mt-8 px-4 flex flex-col items-center text-center">
            <div className="rounded-full ring-4 ring-bg-pr bg-bg-pr">
              <Avatar src={g?.avatar} alt={g?.name || 'Group'} size="lg" />
            </div>
            <div className="flex items-center justify-center gap-1 mt-2">
              <h3 className="text-par-l font-bold text-lab-pr">{g?.name || 'Group Chat'}</h3>
              {g?.verified && <BadgeCheck className="h-4 w-4 text-brand-900 shrink-0" />}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-1">
              {g?.category && (
                <span className="rounded-full bg-fill-qt px-2.5 py-0.5 text-[11px] font-semibold text-lab-sc">
                  {g.category}
                </span>
              )}
              {g?.isPasswordProtected && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600">
                  <Lock className="h-3 w-3" /> Password
                </span>
              )}
              {g?.postingMode === 'admins_only' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-900/10 px-2 py-0.5 text-[11px] font-semibold text-brand-900">
                  <MessageSquareOff className="h-3 w-3" /> Announcements
                </span>
              )}
            </div>
            {g?.description && (
              <p className="text-cap-l text-lab-sc mt-2 leading-relaxed">{g.description}</p>
            )}
          </div>
        </div>

        {/* Quick Actions Bar */}
        <div className="px-4 py-3 flex items-center justify-center gap-2 border-b border-bord-pr">
          <button
            type="button"
            onClick={() => onStartCall('audio')}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-bord-pr py-2 text-cap-l font-semibold text-lab-pr hover:bg-fill-fv cursor-pointer"
          >
            <Phone className="h-3.5 w-3.5 text-brand-900" /> Audio
          </button>
          <button
            type="button"
            onClick={() => onStartCall('video')}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-bord-pr py-2 text-cap-l font-semibold text-lab-pr hover:bg-fill-fv cursor-pointer"
          >
            <Video className="h-3.5 w-3.5 text-brand-900" /> Video
          </button>
          <button
            type="button"
            onClick={handleCopyInviteLink}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-bord-pr py-2 text-cap-l font-semibold text-lab-pr hover:bg-fill-fv cursor-pointer"
            title="Copy invite link"
          >
            {copiedInvite ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5 text-lab-sc" />}
            Invite
          </button>
        </div>

        {/* Statistics Row */}
        <div className="grid grid-cols-3 divide-x divide-bord-pr border-b border-bord-pr text-center py-2.5">
          <div>
            <p className="text-par-n font-bold text-lab-pr">{chat.participants?.length || 0}</p>
            <p className="text-[11px] text-lab-sc">Members</p>
          </div>
          <div>
            <p className="text-par-n font-bold text-lab-pr">{mediaItems.length + fileItems.length}</p>
            <p className="text-[11px] text-lab-sc">Media</p>
          </div>
          <div>
            <p className="text-par-n font-bold text-lab-pr">{pinnedCount}</p>
            <p className="text-[11px] text-lab-sc">Pinned</p>
          </div>
        </div>

        {/* Sub-Tabs */}
        <div className={cn('grid border-b border-bord-pr', isAdminOrOwner ? 'grid-cols-3' : 'grid-cols-2')}>
          <button
            type="button"
            onClick={() => setPanelTab('members')}
            className={cn(
              'py-2.5 text-cap-l font-semibold border-b-2 transition-colors cursor-pointer flex items-center justify-center gap-1',
              panelTab === 'members'
                ? 'border-brand-900 text-brand-900'
                : 'border-transparent text-lab-sc hover:text-lab-pr'
            )}
          >
            <Users className="h-3.5 w-3.5" /> Members
          </button>
          <button
            type="button"
            onClick={() => setPanelTab('media')}
            className={cn(
              'py-2.5 text-cap-l font-semibold border-b-2 transition-colors cursor-pointer flex items-center justify-center gap-1',
              panelTab === 'media'
                ? 'border-brand-900 text-brand-900'
                : 'border-transparent text-lab-sc hover:text-lab-pr'
            )}
          >
            <ImageIcon className="h-3.5 w-3.5" /> Media
          </button>
          {isAdminOrOwner && (
            <button
              type="button"
              onClick={() => setPanelTab('settings')}
              className={cn(
                'py-2.5 text-cap-l font-semibold border-b-2 transition-colors cursor-pointer flex items-center justify-center gap-1',
                panelTab === 'settings'
                  ? 'border-brand-900 text-brand-900'
                  : 'border-transparent text-lab-sc hover:text-lab-pr'
              )}
            >
              <Settings className="h-3.5 w-3.5" /> Settings
            </button>
          )}
        </div>

        {/* TAB 1: MEMBERS & MODERATION */}
        {panelTab === 'members' && (
          <div className="p-4 space-y-4">
            {/* Pending Join Requests (Admins/Owner) */}
            {isAdminOrOwner && (chat.pendingJoinUsers?.length || 0) > 0 && (
              <div className="space-y-2 rounded-2xl border border-brand-900/30 bg-brand-900/5 p-3">
                <p className="text-cap-l font-bold text-brand-900">
                  Join Requests ({chat.pendingJoinUsers?.length})
                </p>
                {chat.pendingJoinUsers?.map((u) => (
                  <div key={u._id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar src={u.avatar} alt={u.username} size="xs" />
                      <span className="text-cap-l font-medium text-lab-pr truncate">@{u.username}</span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() =>
                          void patchGroup(
                            { action: 'approve_join', targetUserId: u._id },
                            `Approved @${u.username}`
                          )
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void patchGroup({ action: 'reject_join', targetUserId: u._id })
                        }
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <input
              type="search"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Filter members..."
              className="w-full h-8 rounded-full bg-fill-qt border border-bord-card px-3 text-cap-l text-lab-pr placeholder:text-lab-tr focus:outline-none focus:border-bord-pr"
            />

            <div className="space-y-2">
              {filteredParticipants.map((p) => {
                const pid = String(p.user._id);
                const isSelf = pid === currentUserId;
                const canModerateThisUser =
                  !isSelf &&
                  p.role !== 'owner' &&
                  (isOwner || (myRole === 'admin' && p.role === 'member'));

                return (
                  <div
                    key={pid}
                    className="rounded-2xl border border-bord-card bg-fill-qt/40 p-2.5 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/@${p.user.username}`}
                        className="flex items-center gap-2.5 min-w-0"
                      >
                        <Avatar
                          src={p.user.avatar}
                          alt={p.user.username}
                          online={onlineUsers.has(pid)}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="text-cap-l font-semibold text-lab-pr truncate">
                              {`${p.user.firstName || ''} ${p.user.lastName || ''}`.trim() ||
                                `@${p.user.username}`}
                            </p>
                            {p.user.verified && <BadgeCheck className="h-3.5 w-3.5 text-brand-900 shrink-0" />}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-lab-sc">
                            <span className="truncate">@{p.user.username}</span>
                            {p.role === 'owner' && (
                              <span className="rounded bg-brand-900/15 text-brand-900 px-1.5 py-0.2 font-semibold">
                                Owner
                              </span>
                            )}
                            {p.role === 'admin' && (
                              <span className="rounded bg-green-600/15 text-green-600 px-1.5 py-0.2 font-semibold">
                                Admin
                              </span>
                            )}
                            {p.isMuted && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-red-500/15 text-red-600 px-1.5 py-0.2 font-semibold">
                                <VolumeX className="h-2.5 w-2.5" /> Muted
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    </div>

                    {canModerateThisUser && (
                      <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-bord-pr/60">
                        {isOwner && (
                          <button
                            type="button"
                            onClick={() =>
                              void patchGroup(
                                {
                                  action: 'set_role',
                                  targetUserId: pid,
                                  role: p.role === 'admin' ? 'member' : 'admin',
                                },
                                p.role === 'admin'
                                  ? `Removed admin role from @${p.user.username}`
                                  : `Promoted @${p.user.username} to Admin`
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-full bg-bg-pr border border-bord-pr px-2 py-0.5 text-[11px] font-medium text-lab-pr hover:bg-fill-fv cursor-pointer"
                          >
                            <Shield className="h-3 w-3 text-brand-900" />
                            {p.role === 'admin' ? 'Demote' : 'Make Admin'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            void patchGroup(
                              {
                                action: 'mute_participant',
                                targetUserId: pid,
                                muted: !p.isMuted,
                              },
                              p.isMuted ? `Unmuted @${p.user.username}` : `Muted @${p.user.username}`
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-full bg-bg-pr border border-bord-pr px-2 py-0.5 text-[11px] font-medium text-lab-pr hover:bg-fill-fv cursor-pointer"
                        >
                          <VolumeX className="h-3 w-3" />
                          {p.isMuted ? 'Unmute' : 'Mute'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void patchGroup(
                              { action: 'remove_participant', targetUserId: pid },
                              `Removed @${p.user.username}`
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-full bg-bg-pr border border-bord-pr px-2 py-0.5 text-[11px] font-medium text-lab-sc hover:text-lab-pr hover:bg-fill-fv cursor-pointer"
                        >
                          Kick
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void patchGroup(
                              { action: 'ban_participant', targetUserId: pid },
                              `Banned @${p.user.username}`
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-full bg-red-500/10 border border-red-500/30 px-2 py-0.5 text-[11px] font-medium text-red-600 hover:bg-red-500/20 cursor-pointer"
                        >
                          <ShieldAlert className="h-3 w-3" /> Ban
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Invite New Members */}
            <div className="space-y-2 pt-3 border-t border-bord-pr">
              <Input
                label="Invite people"
                placeholder="Search username or name..."
                value={inviteUserQuery}
                onChange={(e) => onInviteQueryChange(e.target.value)}
              />
              <div className="max-h-40 overflow-y-auto space-y-1.5">
                {inviteUserResults.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-bord-pr p-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar src={u.avatar} alt={u.username} size="xs" />
                      <span className="text-cap-l text-lab-pr truncate">@{u.username}</span>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => onInviteUser(u.id)}>
                      <UserPlus className="h-3.5 w-3.5" /> Invite
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Banned Users (Admins/Owner) */}
            {isAdminOrOwner && (chat.bannedUsers?.length || 0) > 0 && (
              <div className="space-y-2 pt-3 border-t border-bord-pr">
                <p className="text-cap-l font-bold text-lab-pr">Banned Users</p>
                {chat.bannedUsers?.map((u) => (
                  <div
                    key={u._id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-bord-pr p-2"
                  >
                    <span className="text-cap-l text-lab-sc truncate">@{u.username}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void patchGroup(
                          { action: 'unban_participant', targetUserId: u._id },
                          `Unbanned @${u.username}`
                        )
                      }
                    >
                      <UserCheck className="h-3.5 w-3.5" /> Unban
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Leave / Delete Group */}
            <div className="pt-3 border-t border-bord-pr space-y-2">
              {!isOwner && !g?.unleavable && (
                <Button type="button" variant="danger" className="w-full" onClick={onLeaveGroup}>
                  <LogOut className="h-4 w-4" /> Leave Group
                </Button>
              )}
              {isOwner && (
                <Button type="button" variant="danger" className="w-full" onClick={onDeleteGroup}>
                  <Trash2 className="h-4 w-4" /> Delete Group
                </Button>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: SHARED MEDIA & FILES */}
        {panelTab === 'media' && (
          <div className="p-4 space-y-4">
            <div>
              <p className="text-cap-l font-bold text-lab-pr mb-2">Photos & Videos ({mediaItems.length})</p>
              {mediaItems.length === 0 ? (
                <p className="text-cap-l text-lab-sc">No shared media yet.</p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {mediaItems.map((m) => {
                    const url = String(m.media?.publicUrl || m.media?.url || '');
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => (m.type === 'video' ? window.open(url, '_blank') : onOpenLightbox(url))}
                        className="aspect-square rounded-lg overflow-hidden bg-fill-qt border border-bord-card cursor-pointer"
                      >
                        {m.type === 'video' ? (
                          <div className="h-full w-full flex items-center justify-center bg-black/80 text-white text-[11px] font-semibold">
                            Video
                          </div>
                        ) : (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={url} alt="" className="h-full w-full object-cover" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {fileItems.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-bord-pr">
                <p className="text-cap-l font-bold text-lab-pr">Files ({fileItems.length})</p>
                {fileItems.map((f) => {
                  const url = String(f.media?.publicUrl || f.media?.url || '');
                  return (
                    <a
                      key={f.id}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-xl border border-bord-pr p-2 hover:bg-fill-fv"
                    >
                      <FileDown className="h-4 w-4 text-lab-sc shrink-0" />
                      <span className="text-cap-l text-lab-pr truncate">
                        {f.media?.filename || 'Download file'}
                      </span>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: GROUP SETTINGS (Owner / Admin) */}
        {panelTab === 'settings' && isAdminOrOwner && (
          <form onSubmit={handleSaveSettings} className="p-4 space-y-4">
            <Input
              label="Group Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={80}
              required
            />
            <div className="space-y-1">
              <label className="block text-cap-l font-semibold text-lab-pr">Description</label>
              <textarea
                rows={3}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                maxLength={500}
                className="w-full rounded-xl border border-bord-pr bg-bg-pr px-3 py-2 text-par-n text-lab-pr focus:outline-none focus:border-brand-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block text-cap-l font-semibold text-lab-pr">Category</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full h-9 rounded-xl border border-bord-pr bg-bg-pr px-2.5 text-cap-l text-lab-pr"
                >
                  {GROUP_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-cap-l font-semibold text-lab-pr">Visibility</label>
                <select
                  value={editVisibility}
                  onChange={(e) => setEditVisibility(e.target.value as 'public' | 'private')}
                  className="w-full h-9 rounded-xl border border-bord-pr bg-bg-pr px-2.5 text-cap-l text-lab-pr"
                >
                  <option value="public">Public (Discoverable)</option>
                  <option value="private">Private (Invite Only)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-cap-l font-semibold text-lab-pr">Who Can Send Messages</label>
              <select
                value={editPostingMode}
                onChange={(e) => setEditPostingMode(e.target.value as 'everyone' | 'admins_only')}
                className="w-full h-9 rounded-xl border border-bord-pr bg-bg-pr px-2.5 text-cap-l text-lab-pr"
              >
                <option value="everyone">All Members</option>
                <option value="admins_only">Admins & Owner Only (Announcements)</option>
              </select>
            </div>

            <label className="flex items-center justify-between gap-2 rounded-xl border border-bord-pr px-3 py-2 cursor-pointer">
              <span className="text-cap-l font-medium text-lab-pr">Require admin approval to join</span>
              <input
                type="checkbox"
                checked={editApproval}
                onChange={(e) => setEditApproval(e.target.checked)}
                className="accent-brand-900"
              />
            </label>

            <div className="space-y-2">
              <Input
                label={g?.isPasswordProtected ? 'Change Room Password' : 'Set Room Password (Optional)'}
                type="password"
                placeholder="Leave blank to keep unchanged"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
              />
              {g?.isPasswordProtected && (
                <button
                  type="button"
                  onClick={() => void patchGroup({ action: 'update_group', clearPassword: true }, 'Room password removed')}
                  className="text-cap-s text-red-600 hover:underline cursor-pointer"
                >
                  Remove password lock
                </button>
              )}
            </div>

            {/* Avatar & Cover Picker */}
            <div className="space-y-2 pt-2 border-t border-bord-pr">
              <div className="flex items-center justify-between">
                <span className="text-cap-l font-semibold text-lab-pr">Group Avatar</span>
                <div className="flex gap-2">
                  <label className="text-cap-s font-semibold text-brand-900 hover:underline cursor-pointer">
                    {uploadingImage ? 'Uploading...' : 'Upload Avatar'}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingImage}
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) void handleUploadGroupMedia(file, 'avatar');
                      }}
                    />
                  </label>
                  <label className="text-cap-s font-semibold text-lab-sc hover:underline cursor-pointer">
                    Upload Cover
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingImage}
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) void handleUploadGroupMedia(file, 'cover');
                      }}
                    />
                  </label>
                </div>
              </div>
              <AvatarPresetPicker
                selectedUrl={editAvatar}
                onSelect={(url) => setEditAvatar(url)}
              />
            </div>

            {/* Invite Code Management */}
            <div className="rounded-xl border border-bord-pr bg-fill-qt/50 p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] text-lab-sc">Invite Code</p>
                <p className="text-cap-l font-bold text-lab-pr truncate">{g?.inviteCode || 'NONE'}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  void patchGroup(
                    { action: 'update_group', regenerateInviteCode: true },
                    'Invite link regenerated'
                  )
                }
              >
                <RefreshCw className="h-3.5 w-3.5" /> Reset
              </Button>
            </div>

            <Button type="submit" variant="primary" className="w-full" disabled={savingSettings}>
              {savingSettings ? 'Saving...' : 'Save Group Settings'}
            </Button>
          </form>
        )}
      </div>
    </aside>
  );
}
