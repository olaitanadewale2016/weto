'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  AtSign,
  Ban,
  Briefcase,
  Calendar,
  ChevronLeft,
  Flag,
  Gamepad2,
  Globe,
  HeartHandshake,
  Info,
  Link2,
  Mail,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Phone,
  Settings,
  Smile,
  Tag,
  UserCheck,
  UserPlus,
  VolumeX,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Avatar, VerifiedBadge, normalizeAvatarSrc, normalizeCoverSrc } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { MediaLightbox } from '@/components/ui/media-lightbox';
import { ActionSheet, ActionSheetGroup, ActionSheetItem } from '@/components/mobile/ActionSheet';
import { FeedList } from '@/components/feed/FeedList';
import { ReportModal } from '@/components/modals/ReportModal';
import { ProfileEditModal } from '@/components/profile/ProfileEditModal';
import { SupportCreatorModal } from '@/components/profile/SupportCreatorModal';
import { apiFetch } from '@/lib/api-client';
import { COUNTRIES } from '@/data/world';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';
import { formatLocalizedDate, formatRelativeTime } from '@/lib/i18n';
import { abbreviateNumber, cn } from '@/lib/utils';

interface ProfileData {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  caption?: string;
  category?: string;
  bio?: string;
  website?: string;
  avatar?: string;
  cover?: string;
  verified?: boolean;
  type?: string;
  publicationsCount: number;
  followersCount: number;
  followingCount: number;
  socialLinks?: Array<{ platform: string; url: string }>;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  city?: string | null;
  gender?: string | null;
  lastActive?: string | null;
  createdAt: string;
  monetization?: {
    tipsEnabled: boolean;
    subscriptionsEnabled: boolean;
    monthlyPrice: number;
    currency: string;
    description?: string;
  };
  viewerContext: {
    isSelf: boolean;
    isFollowing: boolean;
    isRequested: boolean;
    isMuted: boolean;
  };
}

interface RelationUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  avatar: string;
  verified?: boolean;
  bio?: string;
}

export default function UserProfilePage() {
  const params = useParams<{ username: string }>();
  const router = useRouter();
  const { user, locale } = useApp();
  const { error, success } = useToast();

  const cleanUsername = decodeURIComponent(params.username || '').replace(/^@/, '');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'posts' | 'media' | 'info'>('posts');
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [mediaLightbox, setMediaLightbox] = useState<{ url: string; label: string } | null>(null);

  const [listModal, setListModal] = useState<'followers' | 'followings' | null>(null);
  const [listUsers, setListUsers] = useState<RelationUser[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('click', onOutside);
    return () => document.removeEventListener('click', onOutside);
  }, [menuOpen]);

  const loadProfile = useCallback(async () => {
    setProfile((prev) => {
      if (!prev) setLoading(true);
      return prev;
    });
    try {
      const data = await apiFetch<ProfileData>(`/users/${encodeURIComponent(cleanUsername)}`);
      setProfile(data);
    } catch {
      setProfile((prev) => prev ?? null);
    } finally {
      setLoading(false);
    }
  }, [cleanUsername]);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadProfile();
    }, 0);
    return () => clearTimeout(id);
  }, [loadProfile]);

  async function openRelationList(kind: 'followers' | 'followings') {
    setListModal(kind);
    setListLoading(true);
    try {
      const rows = await apiFetch<RelationUser[]>(
        `/users/${encodeURIComponent(cleanUsername)}?tab=${kind}`
      );
      setListUsers(Array.isArray(rows) ? rows : []);
    } catch {
      setListUsers([]);
    } finally {
      setListLoading(false);
    }
  }

  async function handleRelation(action: 'follow' | 'block' | 'mute') {
    if (!user || !profile) {
      router.push('/auth/login');
      return;
    }
    try {
      const res = await apiFetch<{ following?: boolean; blocked?: boolean; muted?: boolean }>(
        '/relations',
        {
          method: 'POST',
          json: { action, targetUserId: profile.id },
        }
      );
      if (action === 'follow') {
        success(res.following ? 'Following user' : 'Unfollowed user');
      } else if (action === 'mute') {
        success(res.muted ? 'User muted' : 'User unmuted');
      } else if (action === 'block') {
        success(res.blocked ? 'User blocked' : 'User unblocked');
      }
      setMenuOpen(false);
      setMobileMenuOpen(false);
      loadProfile();
    } catch (err) {
      error('Action failed', err instanceof Error ? err.message : undefined);
    }
  }

  async function handleStartChat() {
    if (!user || !profile) {
      router.push('/auth/login');
      return;
    }
    setSendingMessage(true);
    try {
      const chat = await apiFetch<{ id: string }>('/chats', {
        method: 'POST',
        json: { type: 'direct', targetUserId: profile.id },
      });
      router.push(`/messenger/c/${chat.id}`);
    } catch (err) {
      error('Cannot message this user', err instanceof Error ? err.message : undefined);
    } finally {
      setSendingMessage(false);
    }
  }

  async function handleCopyProfileLink() {
    if (!profile) return;
    try {
      const url = `${window.location.origin}/@${profile.username}`;
      await navigator.clipboard.writeText(url);
      success('Profile link copied');
    } catch {
      error('Could not copy link');
    } finally {
      setMenuOpen(false);
      setMobileMenuOpen(false);
    }
  }

  function handleMentionUser() {
    if (!profile) return;
    setMenuOpen(false);
    setMobileMenuOpen(false);
    router.push(`/new/post?mention=${encodeURIComponent(`@${profile.username}`)}`);
  }

  if (loading) {
    return (
      <AppShell hideMobileHeader>
        <div className="sticky top-0 z-20 bg-bg-pr/95 backdrop-blur-md pt-safe px-safe border-b border-bord-pr/60 md:hidden">
          <div className="px-4 py-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="p-1.5 rounded-full hover:bg-fill-sc text-lab-pr"
              aria-label="Go back"
            >
              <ChevronLeft className="size-6" />
            </button>
            <div className="h-5 w-24 bg-fill-sc rounded" />
          </div>
        </div>
        <div>
          <Skeleton className="h-44 sm:h-52 w-full rounded-none" />
          <div className="p-4 space-y-4">
            <div className="flex items-end justify-between -mt-16">
              <Skeleton className="size-24 sm:size-28 rounded-full border-4 border-bg-pr" />
              <Skeleton className="h-9 w-28 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-6 w-48 rounded-full" />
              <Skeleton className="h-4 w-32 rounded-full" />
              <Skeleton className="h-4 w-3/4 rounded-full mt-3" />
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!profile) {
    return (
      <AppShell hideMobileHeader>
        <div className="sticky top-0 z-20 bg-bg-pr/95 backdrop-blur-md pt-safe px-safe border-b border-bord-pr/60 flex items-center gap-3 px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-1.5 rounded-full hover:bg-fill-sc text-lab-pr"
            aria-label="Go back"
          >
            <ChevronLeft className="size-6" />
          </button>
          <span className="font-bold text-lab-pr">Profile</span>
        </div>
        <div className="p-10 text-center space-y-2">
          <h1 className="text-title-2 font-bold text-lab-pr">Profile unavailable</h1>
          <p className="text-par-n text-lab-sc">This account does not exist or has been restricted.</p>
        </div>
      </AppShell>
    );
  }

  const fullName = `${profile.firstName} ${profile.lastName}`.trim() || profile.username;
  const resolvedCountry = profile.country
    ? COUNTRIES.find((c) => c.code.toLowerCase() === profile.country?.toLowerCase())?.name ||
    profile.country
    : null;
  const locationText = [resolvedCountry, profile.city].filter(Boolean).join(', ');
  const websiteHref = profile.website
    ? profile.website.startsWith('http')
      ? profile.website
      : `https://${profile.website}`
    : null;
  const socialLinks = (profile.socialLinks || []).filter((s) => Boolean(s.url));
  const hasMonetization = Boolean(
    profile.monetization?.tipsEnabled || profile.monetization?.subscriptionsEnabled
  );

  return (
    <AppShell hideMobileHeader>
      {/* =====================================================================
       * PHP Desktop Profile Layout (md+) matching desktop/views/profile/ProfileIndex.vue
       * ===================================================================== */}
      <div className="hidden md:block">
        {/* ProfileCover.vue: edge-to-edge banner with top-left floating back button */}
        <div className="relative overflow-hidden min-h-[180px] h-52 bg-fill-fv">
          <button
            type="button"
            onClick={() => {
              if (profile.cover) {
                setMediaLightbox({
                  url: normalizeCoverSrc(profile.cover),
                  label: `${fullName}${profile.caption ? ` ${profile.caption}` : ''}`,
                });
              }
            }}
            className="block w-full h-full cursor-pointer text-left"
            aria-label="Preview cover image"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={normalizeCoverSrc(profile.cover)}
              src={normalizeCoverSrc(profile.cover)}
              alt="Profile cover"
              decoding="async"
              fetchPriority="high"
              onLoad={(e) => {
                e.currentTarget.dataset.fallbackApplied = '';
              }}
              onError={(e) => {
                if (e.currentTarget.dataset.fallbackApplied !== '1') {
                  e.currentTarget.dataset.fallbackApplied = '1';
                  e.currentTarget.src = '/assets/covers/default-cover.png';
                }
              }}
              className="h-full w-full object-cover"
            />
          </button>

          <button
            type="button"
            onClick={() => router.back()}
            className="cursor-pointer absolute top-4 left-4 backdrop-blur-xl bg-black/50 hover:bg-black/35 smoothing size-10 inline-flex items-center justify-center rounded-full text-white/95"
            aria-label="Go back"
          >
            <ArrowLeft className="size-5" />
          </button>
        </div>

        {/* Profile Overview Section matching desktop/ProfileIndex.vue */}
        <div className="p-4 pb-3">
          <div className="flex justify-between items-start mb-2">
            {/* ProfileAvatar.vue (-mt-[78px] overlap) */}
            <div className="-mt-[78px] relative z-10">
              <button
                type="button"
                onClick={() => {
                  const avatarUrl = normalizeAvatarSrc(profile.avatar);
                  if (avatarUrl) {
                    setMediaLightbox({
                      url: avatarUrl,
                      label: `${fullName}${profile.caption ? ` ${profile.caption}` : ''}`,
                    });
                  }
                }}
                className="cursor-pointer relative z-10 border-4 border-bg-pr rounded-full bg-bg-pr block"
                aria-label="Preview profile avatar"
              >
                <Avatar
                  src={profile.avatar}
                  alt={profile.username}
                  size="xl"
                  verified={profile.verified}
                  className="size-28 sm:size-[120px]"
                />
              </button>
            </div>

            {/* ProfileControls.vue */}
            <div className="shrink-0 flex items-center gap-2 leading-none" ref={menuRef}>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="size-9 rounded-full border border-bord-pr bg-bg-pr text-lab-sc hover:text-lab-pr hover:bg-fill-qt flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="Profile options"
                >
                  <MoreHorizontal className="size-5" />
                </button>

                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-56 rounded-2xl border border-bord-pr bg-bg-pr shadow-vertical-tr py-1.5 z-30 divide-y divide-bord-tr/60">
                    <div className="py-1">
                      {!profile.viewerContext.isSelf && (
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            void handleStartChat();
                          }}
                          disabled={sendingMessage}
                          className="w-full px-3.5 py-2 text-left text-par-s text-lab-pr hover:bg-fill-qt flex items-center gap-2.5 cursor-pointer"
                        >
                          <MessageCircle className="size-4 text-lab-sc shrink-0" />
                          <span>Send message</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleMentionUser}
                        className="w-full px-3.5 py-2 text-left text-par-s text-lab-pr hover:bg-fill-qt flex items-center gap-2.5 cursor-pointer"
                      >
                        <AtSign className="size-4 text-lab-sc shrink-0" />
                        <span className="truncate">Mention @{profile.username}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyProfileLink}
                        className="w-full px-3.5 py-2 text-left text-par-s text-lab-pr hover:bg-fill-qt flex items-center gap-2.5 cursor-pointer"
                      >
                        <Link2 className="size-4 text-lab-sc shrink-0" />
                        <span>Copy profile link</span>
                      </button>
                      {!profile.viewerContext.isSelf && (
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            router.push(`/games?challenge=${encodeURIComponent(profile.username)}`);
                          }}
                          className="w-full px-3.5 py-2 text-left text-par-s text-lab-pr hover:bg-fill-qt flex items-center gap-2.5 cursor-pointer"
                        >
                          <Gamepad2 className="size-4 text-brand-900 shrink-0" />
                          <span className="truncate">Challenge @{profile.username}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          setActiveTab('info');
                        }}
                        className="w-full px-3.5 py-2 text-left text-par-s text-lab-pr hover:bg-fill-qt flex items-center gap-2.5 cursor-pointer"
                      >
                        <Info className="size-4 text-lab-sc shrink-0" />
                        <span>About this profile</span>
                      </button>
                      {profile.viewerContext.isSelf && (
                        <Link
                          href="/settings"
                          onClick={() => setMenuOpen(false)}
                          className="w-full px-3.5 py-2 text-left text-par-s text-lab-pr hover:bg-fill-qt flex items-center gap-2.5"
                        >
                          <Settings className="size-4 text-lab-sc shrink-0" />
                          <span>Account settings</span>
                        </Link>
                      )}
                    </div>

                    {!profile.viewerContext.isSelf && (
                      <div className="py-1">
                        <button
                          type="button"
                          onClick={() => handleRelation('mute')}
                          className={cn(
                            'w-full px-3.5 py-2 text-left text-par-s hover:bg-fill-qt flex items-center gap-2.5 cursor-pointer',
                            profile.viewerContext.isMuted ? 'text-lab-pr' : 'text-red-900'
                          )}
                        >
                          <VolumeX className="size-4 shrink-0" />
                          <span className="truncate">
                            {profile.viewerContext.isMuted
                              ? `Unmute @${profile.username}`
                              : `Mute @${profile.username}`}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRelation('block')}
                          className="w-full px-3.5 py-2 text-left text-par-s text-red-900 hover:bg-fill-qt flex items-center gap-2.5 cursor-pointer"
                        >
                          <Ban className="size-4 shrink-0" />
                          <span className="truncate">Block @{profile.username}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            setReportOpen(true);
                          }}
                          className="w-full px-3.5 py-2 text-left text-par-s text-red-900 hover:bg-fill-qt flex items-center gap-2.5 cursor-pointer"
                        >
                          <Flag className="size-4 shrink-0" />
                          <span className="truncate">Report @{profile.username}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {profile.viewerContext.isSelf ? (
                <Button variant="primary" size="md" onClick={() => setEditOpen(true)}>
                  Edit profile
                </Button>
              ) : (
                <>
                  {hasMonetization && (
                    <Button
                      variant="outline"
                      size="md"
                      onClick={() => {
                        if (!user) {
                          router.push('/auth/login');
                          return;
                        }
                        setSupportOpen(true);
                      }}
                    >
                      <HeartHandshake className="size-4 text-brand-900" /> Support
                    </Button>
                  )}
                  <Button
                    variant={profile.viewerContext.isFollowing ? 'secondary' : 'primary'}
                    size="md"
                    onClick={() => handleRelation('follow')}
                  >
                    {profile.viewerContext.isFollowing ? (
                      <>
                        <UserCheck className="size-4" /> Following
                      </>
                    ) : profile.viewerContext.isRequested ? (
                      'Requested'
                    ) : (
                      <>
                        <UserPlus className="size-4" /> Follow
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* ProfileName.vue */}
          <div className="block">
            <h1 className="text-title-2 font-bold leading-tight text-lab-pr flex items-center gap-1.5">
              <span>{fullName}</span>
              {profile.verified && <VerifiedBadge />}
            </h1>
            <p className="text-par-n font-medium text-lab-sc mt-0.5">@{profile.username}</p>

            {profile.bio && (
              <p className="mt-4 max-w-[78%] text-par-m text-lab-pr2 whitespace-pre-wrap leading-relaxed">
                {profile.bio}
              </p>
            )}

            {websiteHref && profile.website && (
              <div className="mt-2">
                <a
                  href={websiteHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-900 text-par-n font-medium hover:underline break-all"
                >
                  {profile.website}
                </a>
              </div>
            )}
          </div>

          {/* ProfileOverview.vue */}
          {(profile.caption || locationText || profile.createdAt) && (
            <div className="my-3 flex gap-x-4 gap-y-1.5 flex-wrap text-par-s text-lab-sc">
              {profile.caption && (
                <div className="inline-flex items-center gap-1.5">
                  <Briefcase className="size-4 text-lab-tr shrink-0" />
                  <span>{profile.caption}</span>
                </div>
              )}
              {locationText && (
                <div className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4 text-lab-tr shrink-0" />
                  <span>{locationText}</span>
                </div>
              )}
              <div className="inline-flex items-center gap-1.5">
                <Calendar className="size-4 text-lab-tr shrink-0" />
                <span>Joined {formatLocalizedDate(profile.createdAt, locale)}</span>
              </div>
            </div>
          )}

          {/* ProfileMetrics.vue: Followers -> Following -> Posts */}
          <div className="flex flex-wrap gap-5 text-par-n text-lab-sc">
            <button
              type="button"
              onClick={() => openRelationList('followers')}
              className="hover:underline cursor-pointer"
            >
              <span className="text-lab-pr2 font-mono font-semibold">
                {abbreviateNumber(profile.followersCount)}
              </span>{' '}
              <span>{profile.followersCount === 1 ? 'Follower' : 'Followers'}</span>
            </button>
            <button
              type="button"
              onClick={() => openRelationList('followings')}
              className="hover:underline cursor-pointer"
            >
              <span className="text-lab-pr2 font-mono font-semibold">
                {abbreviateNumber(profile.followingCount)}
              </span>{' '}
              <span>Following</span>
            </button>
            <span>
              <span className="text-lab-pr2 font-mono font-semibold">
                {abbreviateNumber(profile.publicationsCount)}
              </span>{' '}
              <span>{profile.publicationsCount === 1 ? 'Post' : 'Posts'}</span>
            </span>
          </div>
        </div>
      </div>

      {/* =====================================================================
       * PHP Mobile Profile Layout (< md) matching mobile/views/profile/ProfileIndex.vue
       * ===================================================================== */}
      <div className="md:hidden">
        {/* mobile/ProfileControls.vue top bar */}
        <div className="sticky top-0 z-20 bg-bg-pr/95 backdrop-blur-md pt-safe px-safe border-b border-bord-pr/60">
          <div className="px-4 py-2.5 flex items-center justify-between gap-2 leading-none">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex items-center gap-1 -ml-1.5 text-lab-pr2 cursor-pointer min-w-0"
              aria-label="Go back"
            >
              <ChevronLeft className="size-6 shrink-0" />
              <div className="min-w-0 text-left">
                <p className="font-semibold text-par-m truncate leading-tight">{fullName}</p>
                <p className="text-cap-m text-lab-sc truncate">
                  {profile.publicationsCount || 0} {profile.publicationsCount === 1 ? 'post' : 'posts'}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="size-9 rounded-full hover:bg-fill-qt flex items-center justify-center text-lab-pr2 cursor-pointer shrink-0"
              aria-label="Profile options"
            >
              <MoreHorizontal className="size-5" />
            </button>
          </div>
        </div>

        {/* mobile/ProfileAvatar.vue: Cover image + side-by-side Avatar & Name/Caption */}
        <button
          type="button"
          onClick={() => {
            if (profile.cover) {
              setMediaLightbox({
                url: normalizeCoverSrc(profile.cover),
                label: `${fullName}${profile.caption ? ` ${profile.caption}` : ''}`,
              });
            }
          }}
          className="block w-full relative overflow-hidden cursor-pointer h-32 sm:h-40 bg-fill-fv mb-4"
          aria-label="Preview cover image"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={normalizeCoverSrc(profile.cover)}
            src={normalizeCoverSrc(profile.cover)}
            alt="Profile cover"
            decoding="async"
            fetchPriority="high"
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
        </button>

        <div className="flex items-center gap-3.5 px-4 mb-3">
          <button
            type="button"
            onClick={() => {
              const avatarUrl = normalizeAvatarSrc(profile.avatar);
              if (avatarUrl) {
                setMediaLightbox({
                  url: avatarUrl,
                  label: `${fullName}${profile.caption ? ` ${profile.caption}` : ''}`,
                });
              }
            }}
            className="cursor-pointer shrink-0 rounded-full"
            aria-label="Preview profile avatar"
          >
            <Avatar
              src={profile.avatar}
              alt={profile.username}
              size="xl"
              verified={profile.verified}
              className="size-20"
            />
          </button>

          <div className="min-w-0">
            <h1 className="text-title-2 font-semibold leading-tight text-lab-pr2 flex items-center gap-1.5 flex-wrap">
              <span className="truncate">{fullName}</span>
              {profile.verified && <VerifiedBadge />}
            </h1>
            <p className="text-par-n font-medium text-lab-sc truncate mt-0.5">
              @{profile.username}
            </p>
            {profile.caption && (
              <p className="text-par-s text-lab-sc truncate mt-0.5">{profile.caption}</p>
            )}
          </div>
        </div>

        {/* mobile/ProfileBio.vue */}
        {(profile.bio || (websiteHref && profile.website)) && (
          <div className="px-4 mb-3">
            {profile.bio && (
              <p className="text-par-m text-lab-pr2 mb-1.5 whitespace-pre-wrap leading-relaxed">
                {profile.bio}
              </p>
            )}
            {websiteHref && profile.website && (
              <a
                href={websiteHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-900 text-par-n underline break-all"
              >
                {profile.website}
              </a>
            )}
          </div>
        )}

        {/* mobile/ProfileOverview.vue (stacked vertical icon rows) */}
        {(profile.caption || locationText || profile.createdAt) && (
          <div className="px-4 mb-3 flex flex-col gap-2">
            {profile.caption && (
              <div className="inline-flex gap-2 text-lab-pr2 items-center text-par-n">
                <Briefcase className="size-4 text-lab-pr3 shrink-0" />
                <span>{profile.caption}</span>
              </div>
            )}
            {locationText && (
              <div className="inline-flex gap-2 text-lab-pr2 items-center text-par-n">
                <MapPin className="size-4 text-lab-pr3 shrink-0" />
                <span>{locationText}</span>
              </div>
            )}
            <div className="inline-flex gap-2 text-lab-pr2 items-center text-par-n">
              <Calendar className="size-4 text-lab-pr3 shrink-0" />
              <span>Joined {formatLocalizedDate(profile.createdAt, locale)}</span>
            </div>
          </div>
        )}

        {/* mobile/ProfileMetrics.vue */}
        <div className="px-4 flex flex-wrap gap-4 text-par-m text-lab-pr2">
          <button
            type="button"
            onClick={() => openRelationList('followers')}
            className="cursor-pointer"
          >
            <span className="font-semibold">{abbreviateNumber(profile.followersCount)}</span>{' '}
            <span>{profile.followersCount === 1 ? 'Follower' : 'Followers'}</span>
          </button>
          <button
            type="button"
            onClick={() => openRelationList('followings')}
            className="cursor-pointer"
          >
            <span className="font-semibold">{abbreviateNumber(profile.followingCount)}</span>{' '}
            <span>Following</span>
          </button>
          <span>
            <span className="font-semibold">{abbreviateNumber(profile.publicationsCount)}</span>{' '}
            <span>{profile.publicationsCount === 1 ? 'Post' : 'Posts'}</span>
          </span>
        </div>

        {/* mobile/ProfileActions.vue */}
        <div className="px-4 py-3 space-y-2">
          {profile.viewerContext.isSelf ? (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="md"
                className="w-full"
                onClick={() => setEditOpen(true)}
              >
                Edit profile
              </Button>
              <Link href="/settings" className="block">
                <Button variant="secondary" size="md" className="w-full">
                  Account settings
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={profile.viewerContext.isFollowing ? 'secondary' : 'primary'}
                  size="md"
                  className="w-full"
                  onClick={() => handleRelation('follow')}
                >
                  {profile.viewerContext.isFollowing
                    ? 'Following'
                    : profile.viewerContext.isRequested
                      ? 'Requested'
                      : 'Follow'}
                </Button>
                <Button
                  variant="outline"
                  size="md"
                  className="w-full"
                  loading={sendingMessage}
                  onClick={handleStartChat}
                >
                  Send message
                </Button>
              </div>
              {hasMonetization && (
                <Button
                  variant="outline"
                  size="md"
                  className="w-full"
                  onClick={() => {
                    if (!user) {
                      router.push('/auth/login');
                      return;
                    }
                    setSupportOpen(true);
                  }}
                >
                  <HeartHandshake className="size-4 text-brand-900" /> Support creator
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* =====================================================================
       * PHP Profile Tabs (Posts · Media · Info) — 3-column ContentTabs grid
       * ===================================================================== */}
      <div className="sticky top-[calc(3.25rem+env(safe-area-inset-top,0px))] md:top-0 bg-bg-pr z-10 border-b border-bord-pr">
        <Tabs
          variant="grid"
          value={activeTab}
          onChange={(k) => setActiveTab(k as 'posts' | 'media' | 'info')}
          tabs={[
            { key: 'posts', label: 'Posts' },
            { key: 'media', label: 'Media' },
            { key: 'info', label: 'Info' },
          ]}
        />
      </div>

      <div>
        {activeTab === 'posts' ? (
          <FeedList mode="user" username={profile.username} />
        ) : activeTab === 'media' ? (
          <FeedList mode="user_media" username={profile.username} />
        ) : (
          /* PHP ProfileInfo.vue */
          <div className="p-4 space-y-5">
            {/* Information Group */}
            <div className="pb-4 border-b border-bord-pr space-y-3">
              <h3 className="text-par-m font-bold text-lab-pr">Information</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Calendar className="size-5 text-lab-sc shrink-0 mt-0.5" />
                  <div>
                    <p className="text-cap-l text-lab-sc">Join date</p>
                    <p className="text-par-n font-medium text-lab-pr">
                      {formatLocalizedDate(profile.createdAt, locale)}
                    </p>
                  </div>
                </div>

                {locationText && (
                  <div className="flex items-start gap-3">
                    <MapPin className="size-5 text-lab-sc shrink-0 mt-0.5" />
                    <div>
                      <p className="text-cap-l text-lab-sc">Location</p>
                      <p className="text-par-n font-medium text-lab-pr">{locationText}</p>
                    </div>
                  </div>
                )}

                {profile.gender && profile.gender !== 'not-specified' && (
                  <div className="flex items-start gap-3">
                    <Smile className="size-5 text-lab-sc shrink-0 mt-0.5" />
                    <div>
                      <p className="text-cap-l text-lab-sc">Gender</p>
                      <p className="text-par-n font-medium text-lab-pr capitalize">
                        {profile.gender}
                      </p>
                    </div>
                  </div>
                )}

                {profile.category && (
                  <div className="flex items-start gap-3">
                    <Tag className="size-5 text-lab-sc shrink-0 mt-0.5" />
                    <div>
                      <p className="text-cap-l text-lab-sc">Category</p>
                      <p className="text-par-n font-medium text-lab-pr capitalize">
                        {profile.category}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Contacts Group (respecting privacySettings from API) */}
            {(profile.email || profile.phone) && (
              <div className="pb-4 border-b border-bord-pr space-y-3">
                <h3 className="text-par-m font-bold text-lab-pr">Contacts</h3>
                <div className="space-y-3">
                  {profile.email && (
                    <div className="flex items-start gap-3">
                      <Mail className="size-5 text-lab-sc shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-cap-l text-lab-sc">E-Mail</p>
                        <a
                          href={`mailto:${profile.email}`}
                          className="text-par-n font-medium text-brand-900 hover:underline break-all"
                        >
                          {profile.email}
                        </a>
                      </div>
                    </div>
                  )}
                  {profile.phone && (
                    <div className="flex items-start gap-3">
                      <Phone className="size-5 text-lab-sc shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-cap-l text-lab-sc">Phone</p>
                        <a
                          href={`tel:${profile.phone}`}
                          className="text-par-n font-medium text-brand-900 hover:underline"
                        >
                          {profile.phone}
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Social Media Links */}
            {socialLinks.length > 0 && (
              <div className="pb-2 space-y-2.5">
                <div className="flex flex-wrap gap-2">
                  {socialLinks.map((s) => (
                    <a
                      key={s.platform}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-bord-pr bg-fill-qt/50 hover:bg-fill-qt px-3.5 py-2 text-par-s font-medium text-lab-pr transition-colors"
                    >
                      <Globe className="size-4 text-lab-sc" />
                      <span className="capitalize">{s.platform}</span>
                      <Link2 className="size-3.5 text-lab-tr" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            <p className="text-cap-l text-lab-sc">
              Some personal details may be hidden according to the user&apos;s privacy settings.
            </p>

            {profile.lastActive && (
              <p className="text-par-s text-brand-900 font-medium">
                Last seen {formatRelativeTime(profile.lastActive, locale)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Desktop bottom footer signature matching ProfileIndex.vue */}
      <div className="hidden md:block px-4 py-4 border-t border-bord-pr leading-none">
        <span className="text-cap-s text-lab-sc font-medium">
          {fullName} @{profile.username}
        </span>
      </div>

      {/* Mobile Profile Options ActionSheet matching mobile/ProfileControls.vue */}
      <ActionSheet open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} muted>
        <div className="space-y-4">
          <ActionSheetGroup>
            {!profile.viewerContext.isSelf && (
              <ActionSheetItem
                icon={Gamepad2}
                label={`Challenge @${profile.username} to Tic-Tac-Toe`}
                onClick={() => {
                  setMobileMenuOpen(false);
                  router.push(`/games?challenge=${encodeURIComponent(profile.username)}`);
                }}
              />
            )}
            <ActionSheetItem
              icon={AtSign}
              label={`Mention @${profile.username}`}
              onClick={handleMentionUser}
            />
            <ActionSheetItem
              icon={Link2}
              label="Copy profile link"
              onClick={() => void handleCopyProfileLink()}
            />
          </ActionSheetGroup>

          <ActionSheetGroup>
            <ActionSheetItem
              icon={Info}
              label="About this profile"
              onClick={() => {
                setMobileMenuOpen(false);
                setActiveTab('info');
              }}
            />
            {profile.viewerContext.isSelf ? (
              <>
                <ActionSheetItem
                  icon={Pencil}
                  label="Edit profile"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setEditOpen(true);
                  }}
                />
                <Link href="/settings" onClick={() => setMobileMenuOpen(false)}>
                  <ActionSheetItem icon={Settings} label="Account settings" />
                </Link>
              </>
            ) : (
              <>
                <ActionSheetItem
                  icon={Flag}
                  danger
                  label={`Report @${profile.username}`}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setReportOpen(true);
                  }}
                />
                <ActionSheetItem
                  icon={Ban}
                  danger
                  label={`Block @${profile.username}`}
                  onClick={() => void handleRelation('block')}
                />
                <ActionSheetItem
                  icon={VolumeX}
                  danger={!profile.viewerContext.isMuted}
                  label={
                    profile.viewerContext.isMuted
                      ? `Unmute @${profile.username}`
                      : `Mute @${profile.username}`
                  }
                  onClick={() => void handleRelation('mute')}
                />
              </>
            )}
          </ActionSheetGroup>
        </div>
      </ActionSheet>

      {/* Followers / Following Modal */}
      <Modal
        open={listModal !== null}
        onClose={() => setListModal(null)}
        title={listModal === 'followers' ? 'Followers' : 'Following'}
      >
        {listLoading ? (
          <p className="text-center text-lab-sc py-6 text-par-n">Loading...</p>
        ) : listUsers.length === 0 ? (
          <p className="text-center text-lab-sc py-6 text-par-n">No users found.</p>
        ) : (
          <div className="space-y-2.5">
            {listUsers.map((u) => (
              <Link
                key={u.id}
                href={`/@${u.username}`}
                onClick={() => setListModal(null)}
                className="flex items-center gap-3 rounded-2xl p-2 hover:bg-fill-pr"
              >
                <Avatar src={u.avatar} alt={u.username} verified={u.verified} size="md" />
                <div className="min-w-0">
                  <p className="text-par-n font-semibold text-lab-pr truncate">
                    {u.firstName} {u.lastName}
                  </p>
                  <p className="text-cap-l text-lab-sc truncate">@{u.username}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Modal>

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="user"
        targetId={profile.id}
      />

      {profile.viewerContext.isSelf && editOpen && (
        <ProfileEditModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          initial={{
            firstName: profile.firstName,
            lastName: profile.lastName,
            bio: profile.bio || '',
            caption: profile.caption || '',
            website: profile.website || '',
            avatar: profile.avatar || '',
            cover: profile.cover || '',
          }}
          onUpdated={(patch) => {
            setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
          }}
        />
      )}

      <MediaLightbox
        open={Boolean(mediaLightbox)}
        onClose={() => setMediaLightbox(null)}
        images={mediaLightbox ? [{ url: mediaLightbox.url, alt: mediaLightbox.label }] : []}
        albumName={mediaLightbox?.label}
      />

      {!profile.viewerContext.isSelf && hasMonetization && (
        <SupportCreatorModal
          open={supportOpen}
          onClose={() => setSupportOpen(false)}
          creator={{
            id: profile.id,
            username: profile.username,
            firstName: profile.firstName,
            lastName: profile.lastName,
            monetization: profile.monetization,
          }}
        />
      )}
    </AppShell>
  );
}
