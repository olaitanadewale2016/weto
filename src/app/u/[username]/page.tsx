'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Ban,
  Calendar,
  Flag,
  Globe,
  HeartHandshake,
  Link2,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Settings,
  UserCheck,
  UserPlus,
  VolumeX,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Avatar, VerifiedBadge } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { Modal } from '@/components/ui/modal';
import { MediaLightbox } from '@/components/ui/media-lightbox';
import { FeedList } from '@/components/feed/FeedList';
import { ReportModal } from '@/components/modals/ReportModal';
import { ProfileEditModal } from '@/components/profile/ProfileEditModal';
import { SupportCreatorModal } from '@/components/profile/SupportCreatorModal';
import { apiFetch } from '@/lib/api-client';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';
import { formatLocalizedDate } from '@/lib/i18n';

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
  country?: string | null;
  city?: string | null;
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
  const [activeTab, setActiveTab] = useState<'posts' | 'about'>('posts');
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [mediaLightbox, setMediaLightbox] = useState<{ url: string; label: string } | null>(null);

  const [listModal, setListModal] = useState<'followers' | 'followings' | null>(null);
  const [listUsers, setListUsers] = useState<RelationUser[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<ProfileData>(`/users/${encodeURIComponent(cleanUsername)}`);
      setProfile(data);
    } catch {
      setProfile(null);
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
    try {
      const chat = await apiFetch<{ id: string }>('/chats', {
        method: 'POST',
        json: { type: 'direct', targetUserId: profile.id },
      });
      router.push(`/messenger/c/${chat.id}`);
    } catch (err) {
      error('Cannot message this user', err instanceof Error ? err.message : undefined);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="p-8 text-center text-lab-sc">Loading profile...</div>
      </AppShell>
    );
  }

  if (!profile) {
    return (
      <AppShell>
        <div className="p-10 text-center space-y-2">
          <h1 className="text-title-2 font-bold text-lab-pr">Profile unavailable</h1>
          <p className="text-par-n text-lab-sc">This account does not exist or has been restricted.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* PageHeader matching Source/resources/js/spa/apps/desktop/components/layout/PageHeader.vue */}
      <div className="sticky top-14 md:top-0 z-20 bg-bg-pr/95 backdrop-blur-md border-b border-bord-pr flex items-center gap-3 p-4 leading-none">
        <button
          type="button"
          onClick={() => router.back()}
          className="h-8 w-8 rounded-full hover:bg-fill-tr flex items-center justify-center text-lab-pr cursor-pointer shrink-0"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <p className="text-par-l font-bold text-lab-pr truncate">
            {profile.firstName} {profile.lastName}
          </p>
          <p className="text-cap-s text-lab-sc mt-0.5">{profile.publicationsCount} publications</p>
        </div>
      </div>

      {/* Cover Banner */}
      <button
        type="button"
        onClick={() => {
          if (profile.cover) {
            setMediaLightbox({
              url: profile.cover,
              label: `${profile.firstName} ${profile.lastName} · Cover`,
            });
          }
        }}
        className="relative block w-full h-44 sm:h-52 bg-fill-sc overflow-hidden text-left cursor-pointer"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={profile.cover || '/assets/covers/default-cover.png'}
          alt="Profile cover"
          decoding="async"
          fetchPriority="high"
          className="h-full w-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </button>

      {/* Profile Header */}
      <div className="px-4 pb-4 border-b border-bord-pr">
        <div className="flex items-end justify-between -mt-12 mb-3">
          <button
            type="button"
            onClick={() => {
              if (profile.avatar) {
                setMediaLightbox({
                  url: profile.avatar,
                  label: `@${profile.username}`,
                });
              }
            }}
            className="rounded-full cursor-pointer relative z-10"
            aria-label="Preview profile picture"
          >
            <Avatar
              src={profile.avatar}
              alt={profile.username}
              size="xl"
              verified={profile.verified}
              className="ring-4 ring-bg-pr"
            />
          </button>

          <div className="flex items-center gap-2 pt-14">
            {profile.viewerContext.isSelf ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  Edit profile
                </Button>
                <Link href="/settings" aria-label="Account settings">
                  <Button variant="outline" size="icon" title="Account settings">
                    <Settings className="h-4 w-4" />
                  </Button>
                </Link>
              </>
            ) : (
              <>
                {(profile.monetization?.tipsEnabled || profile.monetization?.subscriptionsEnabled) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!user) {
                        router.push('/auth/login');
                        return;
                      }
                      setSupportOpen(true);
                    }}
                    title="Support creator"
                  >
                    <HeartHandshake className="h-4 w-4 text-brand-900" /> Support
                  </Button>
                )}
                <Button variant="outline" size="icon" onClick={handleStartChat} title="Send message">
                  <MessageCircle className="h-4 w-4" />
                </Button>
                <Button
                  variant={profile.viewerContext.isFollowing ? 'secondary' : 'primary'}
                  size="sm"
                  onClick={() => handleRelation('follow')}
                >
                  {profile.viewerContext.isFollowing ? (
                    <>
                      <UserCheck className="h-4 w-4" /> Following
                    </>
                  ) : profile.viewerContext.isRequested ? (
                    'Requested'
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" /> Follow
                    </>
                  )}
                </Button>
                <div className="relative">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setMenuOpen((v) => !v)}
                    aria-label="Profile options"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                  {menuOpen && (
                    <div className="absolute right-0 mt-1 w-44 rounded-2xl border border-bord-pr bg-bg-pr shadow-vertical-tr py-1 z-20">
                      <button
                        type="button"
                        onClick={() => handleRelation('mute')}
                        className="w-full px-3.5 py-2 text-left text-cap-l text-lab-pr hover:bg-fill-pr flex items-center gap-2"
                      >
                        <VolumeX className="h-4 w-4" />
                        {profile.viewerContext.isMuted ? 'Unmute user' : 'Mute user'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRelation('block')}
                        className="w-full px-3.5 py-2 text-left text-cap-l text-red-900 hover:bg-fill-pr flex items-center gap-2"
                      >
                        <Ban className="h-4 w-4" /> Block user
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          setReportOpen(true);
                        }}
                        className="w-full px-3.5 py-2 text-left text-cap-l text-red-900 hover:bg-fill-pr flex items-center gap-2"
                      >
                        <Flag className="h-4 w-4" /> Report account
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <h1 className="text-title-2 font-bold text-lab-pr flex items-center gap-1.5">
            {profile.firstName} {profile.lastName}
            {profile.verified && <VerifiedBadge />}
          </h1>
          <p className="text-par-n text-lab-sc">@{profile.username}</p>
          {profile.bio && <p className="text-par-m text-lab-pr pt-1 whitespace-pre-wrap">{profile.bio}</p>}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 text-cap-l text-lab-sc">
            {(profile.city || profile.country) && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {[profile.city, profile.country].filter(Boolean).join(', ')}
              </span>
            )}
            {profile.website && (
              <a
                href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-brand-900 hover:underline"
              >
                <Globe className="h-3.5 w-3.5" /> {profile.website}
              </a>
            )}
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" /> Joined {formatLocalizedDate(profile.createdAt, locale)}
            </span>
          </div>

          <div className="flex items-center gap-5 pt-2 text-par-n">
            <button
              type="button"
              onClick={() => openRelationList('followings')}
              className="hover:underline cursor-pointer"
            >
              <span className="font-bold text-lab-pr">{profile.followingCount}</span>{' '}
              <span className="text-lab-sc">Following</span>
            </button>
            <button
              type="button"
              onClick={() => openRelationList('followers')}
              className="hover:underline cursor-pointer"
            >
              <span className="font-bold text-lab-pr">{profile.followersCount}</span>{' '}
              <span className="text-lab-sc">Followers</span>
            </button>
            <span>
              <span className="font-bold text-lab-pr">{profile.publicationsCount}</span>{' '}
              <span className="text-lab-sc">Posts</span>
            </span>
          </div>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onChange={(k) => setActiveTab(k as 'posts' | 'about')}
        tabs={[
          { key: 'posts', label: 'Publications', count: profile.publicationsCount },
          { key: 'about', label: 'About' },
        ]}
      />

      {activeTab === 'posts' ? (
        <FeedList mode="user" username={profile.username} />
      ) : (
        <div className="p-5 space-y-4">
          {profile.category && (
            <div className="rounded-2xl border border-bord-pr p-4">
              <p className="text-cap-l text-lab-sc">Category</p>
              <p className="text-par-n font-semibold text-lab-pr capitalize">{profile.category}</p>
            </div>
          )}
          {profile.socialLinks && profile.socialLinks.filter((s) => s.url).length > 0 && (
            <div className="rounded-2xl border border-bord-pr p-4 space-y-2">
              <p className="text-cap-l text-lab-sc">Social Profiles</p>
              {profile.socialLinks
                .filter((s) => s.url)
                .map((s) => (
                  <a
                    key={s.platform}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-xl bg-fill-pr px-3 py-2 text-par-n hover:bg-fill-sc"
                  >
                    <span className="capitalize font-medium text-lab-pr">{s.platform}</span>
                    <Link2 className="h-4 w-4 text-lab-sc" />
                  </a>
                ))}
            </div>
          )}
        </div>
      )}

      <Modal
        open={listModal !== null}
        onClose={() => setListModal(null)}
        title={listModal === 'followers' ? 'Followers' : 'Following'}
      >
        {listLoading ? (
          <p className="text-center text-lab-sc py-6">Loading...</p>
        ) : listUsers.length === 0 ? (
          <p className="text-center text-lab-sc py-6">No users found.</p>
        ) : (
          <div className="space-y-3">
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

      {!profile.viewerContext.isSelf &&
        (profile.monetization?.tipsEnabled || profile.monetization?.subscriptionsEnabled) && (
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
