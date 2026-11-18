'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  Archive,
  ArrowLeft,
  BadgeCheck,
  BarChart2,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Coins,
  Compass,
  Copy,
  CornerUpLeft,
  ExternalLink,
  FileDown,
  Film,
  Forward,
  Image as ImageIcon,
  Info,
  Languages,
  Lock,
  LogOut,
  MapPin,
  MessageCircle,
  MessageSquareOff,
  Mic,
  MoreHorizontal,
  Paperclip,
  Phone,
  Pin,
  PinOff,
  Plus,
  Search,
  Send,
  Settings,
  Smile,
  Trash2,
  Users,
  Video,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MediaLightbox } from '@/components/ui/media-lightbox';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import { VideoCallStage } from '@/components/messenger/VideoCallStage';
import { StickerEmojiPicker } from '@/components/messenger/StickerEmojiPicker';
import { GroupInfoPanel } from '@/components/messenger/GroupInfoPanel';
import { DirectProfilePanel } from '@/components/messenger/DirectProfilePanel';
import { AvatarPresetPicker } from '@/components/profile/AvatarPresetPicker';
import { apiFetch, uploadFileToR2 } from '@/lib/api-client';
import { GiphyAttribution, GiphyPicker } from '@/components/feed/GiphyPicker';
import { SupportCreatorModal } from '@/components/profile/SupportCreatorModal';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';
import { getFirebaseClientFirestore, markFirestoreDisabled } from '@/lib/firebase/client';
import { formatCurrency } from '@/lib/currency';
import { formatRelativeTime } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface TypingUserInfo {
  userId?: string;
  username: string;
  firstName?: string;
  avatar?: string;
}

interface ChatUserSummary {
  _id: string;
  username: string;
  firstName: string;
  lastName: string;
  avatar: string;
  verified?: boolean;
  lastActive?: string;
}

interface ChatGroupMeta {
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
  isPaid?: boolean;
  entryPrice?: number;
  monetizationNote?: string;
  revenueTotal?: number;
}

interface ChatSummary {
  id: string;
  chatUuid: string;
  type: 'direct' | 'group';
  group?: ChatGroupMeta;
  isArchived?: boolean;
  isMuted?: boolean;
  membersCount?: number;
  interlocutor?: ChatUserSummary | null;
  participants?: Array<{ user: ChatUserSummary; role: string; isMuted?: boolean; lastReadAt?: string }>;
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
  pinnedMessageIds?: string[];
  lastMessagePreview?: string;
  lastActivity: string;
  unreadCount: number;
}

interface DiscoverGroupItem {
  id: string;
  chatUuid: string;
  group?: ChatGroupMeta;
  membersCount: number;
  lastMessagePreview?: string;
  lastActivity?: string;
  isJoined: boolean;
  isPendingApproval?: boolean;
  isBanned?: boolean;
}

interface ParentMessageRef {
  _id?: string;
  id?: string;
  type?: string;
  content?: string | null;
  isDeleted?: boolean;
  senderId?: { _id?: string; username?: string; firstName?: string; lastName?: string } | null;
}

interface ChatPollOption {
  id: string;
  text: string;
  voterIds: string[];
}

interface ChatPoll {
  question: string;
  options: ChatPollOption[];
}

interface ChatLocationData {
  lat: number;
  lng: number;
  label?: string;
}

interface ActiveCallSummary {
  id: string;
  callUuid: string;
  audioOnly: boolean;
  status: string;
  initiatorId: string;
  participantCount: number;
}

interface ChatMessage {
  id: string;
  type: string;
  content?: string;
  senderId: string;
  sender?: ChatUserSummary;
  parentId?: ParentMessageRef | null;
  stickerUrl?: string | null;
  forwardedFromId?: string | null;
  poll?: ChatPoll | null;
  location?: ChatLocationData | null;
  media?: {
    publicUrl?: string;
    url?: string;
    type?: string;
    mimeType?: string;
    sizeBytes?: number;
    durationSeconds?: number;
    filename?: string;
  } | null;
  linkSnapshot?: { url: string; title?: string; description?: string; domain?: string } | null;
  contextRef?: {
    kind: 'product' | 'job';
    id: string;
    hashId?: string;
    title: string;
    priceLabel?: string;
    imageUrl?: string;
  } | null;
  reactionSummary?: Array<{ unifiedId: string; nativeSymbol: string; count: number }>;
  deliveredTo?: string[];
  readBy?: string[];
  isDeleted?: boolean;
  isEdited?: boolean;
  editedAt?: string | null;
  createdAt: string;
}

interface InviteItem {
  _id: string;
  chatId: { _id: string; group?: { name: string; description?: string; avatar?: string } };
  senderId: { username: string; firstName: string; lastName: string; avatar: string };
}

interface UserSearchResult {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  avatar: string;
}

const CHAT_REACTIONS = [
  { unifiedId: '1f44d', nativeSymbol: '👍' },
  { unifiedId: '2764', nativeSymbol: '❤️' },
  { unifiedId: '1f602', nativeSymbol: '😂' },
  { unifiedId: '1f62e', nativeSymbol: '😮' },
  { unifiedId: '1f525', nativeSymbol: '🔥' },
  { unifiedId: '1f64f', nativeSymbol: '🙏' },
];

function isRecentlyActive(lastActive: string | undefined, nowMs: number, hasSocket: boolean): boolean {
  if (hasSocket || nowMs <= 0 || !lastActive) return false;
  return nowMs - new Date(lastActive).getTime() < 2 * 60 * 1000;
}

function getDateKey(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDateDivider(isoDate: string, locale: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (getDateKey(isoDate) === getDateKey(now.toISOString())) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (getDateKey(isoDate) === getDateKey(yesterday.toISOString())) return 'Yesterday';
  try {
    return new Intl.DateTimeFormat(locale || 'en', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    }).format(date);
  } catch {
    return date.toDateString();
  }
}

function formatMessageTime(isoDate: string, locale: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale || 'en', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return formatRelativeTime(isoDate, locale);
  }
}

function getMessagePreviewLabel(msg: {
  type?: string;
  content?: string | null;
  isDeleted?: boolean;
  poll?: { question?: string } | null;
  location?: { label?: string } | null;
}): string {
  if (msg.isDeleted) return 'Message deleted';
  if (msg.content?.trim()) return msg.content.trim();
  if (msg.type === 'sticker') return 'Sticker';
  if (msg.type === 'poll') return msg.poll?.question ? `Poll: ${msg.poll.question}` : 'Poll';
  if (msg.type === 'location') return msg.location?.label ? `Location: ${msg.location.label}` : 'Shared location';
  if (msg.type === 'system') return 'Call update';
  if (msg.type === 'gif') return 'GIF';
  if (msg.type === 'image') return 'Photo';
  if (msg.type === 'video' || msg.type === 'video_circle') return 'Video';
  if (msg.type === 'audio') return 'Voice message';
  return 'Attachment';
}

interface MessengerInboxCacheEntry {
  chats: ChatSummary[];
  invites: InviteItem[];
  tab: 'chats' | 'groups' | 'invites' | 'archive';
  ts: number;
}

interface MessengerThreadCacheEntry {
  chat: ChatSummary;
  messages: ChatMessage[];
  ts: number;
}

let messengerInboxCache: MessengerInboxCacheEntry | null = null;
const messengerThreadCache = new Map<string, MessengerThreadCacheEntry>();

/** Exact Grupo Pro `.toggle_middle_full_screen` SVGs from layouts/chat_page/chatbox.php */
function GrupoExpandChatIcon({ expanded, className = 'size-[19px]' }: { expanded: boolean; className?: string }) {
  return expanded ? (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M15 15V14H14V15H15ZM20.2929 21.7071C20.6834 22.0976 21.3166 22.0976 21.7071 21.7071C22.0976 21.3166 22.0976 20.6834 21.7071 20.2929L20.2929 21.7071ZM15 9H14V10H15V9ZM21.7071 3.70711C22.0976 3.31658 22.0976 2.68342 21.7071 2.29289C21.3166 1.90237 20.6834 1.90237 20.2929 2.29289L21.7071 3.70711ZM9 15H10V14H9V15ZM2.29289 20.2929C1.90237 20.6834 1.90237 21.3166 2.29289 21.7071C2.68342 22.0976 3.31658 22.0976 3.70711 21.7071L2.29289 20.2929ZM9 9V10H10V9H9ZM3.70711 2.29289C3.31658 1.90237 2.68342 1.90237 2.29289 2.29289C1.90237 2.68342 1.90237 3.31658 2.29289 3.70711L3.70711 2.29289ZM16 20V15H14V20H16ZM15 16H20V14H15V16ZM14.2929 15.7071L20.2929 21.7071L21.7071 20.2929L15.7071 14.2929L14.2929 15.7071ZM14 4V9H16V4H14ZM15 10H20V8H15V10ZM15.7071 9.70711L21.7071 3.70711L20.2929 2.29289L14.2929 8.29289L15.7071 9.70711ZM10 20V15H8V20H10ZM9 14H4V16H9V14ZM8.29289 14.2929L2.29289 20.2929L3.70711 21.7071L9.70711 15.7071L8.29289 14.2929ZM8 4V9H10V4H8ZM9 8H4V10H9V8ZM9.70711 8.29289L3.70711 2.29289L2.29289 3.70711L8.29289 9.70711L9.70711 8.29289Z" fill="currentColor" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M20 20V21H21V20H20ZM15.7071 14.2929C15.3166 13.9024 14.6834 13.9024 14.2929 14.2929C13.9024 14.6834 13.9024 15.3166 14.2929 15.7071L15.7071 14.2929ZM19 14V20H21V14H19ZM20 19H14V21H20V19ZM20.7071 19.2929L15.7071 14.2929L14.2929 15.7071L19.2929 20.7071L20.7071 19.2929Z" fill="currentColor" />
      <path d="M4 20H3V21H4V20ZM9.70711 15.7071C10.0976 15.3166 10.0976 14.6834 9.70711 14.2929C9.31658 13.9024 8.68342 13.9024 8.29289 14.2929L9.70711 15.7071ZM3 14V20H5V14H3ZM4 21H10V19H4V21ZM4.70711 20.7071L9.70711 15.7071L8.29289 14.2929L3.29289 19.2929L4.70711 20.7071Z" fill="currentColor" />
      <path d="M20 4H21V3H20V4ZM14.2929 8.29289C13.9024 8.68342 13.9024 9.31658 14.2929 9.70711C14.6834 10.0976 15.3166 10.0976 15.7071 9.70711L14.2929 8.29289ZM21 10V4H19V10H21ZM20 3H14V5H20V3ZM19.2929 3.29289L14.2929 8.29289L15.7071 9.70711L20.7071 4.70711L19.2929 3.29289Z" fill="currentColor" />
      <path d="M4 4V3H3V4H4ZM8.29289 9.70711C8.68342 10.0976 9.31658 10.0976 9.70711 9.70711C10.0976 9.31658 10.0976 8.68342 9.70711 8.29289L8.29289 9.70711ZM5 10V4H3V10H5ZM4 5H10V3H4V5ZM3.29289 4.70711L8.29289 9.70711L9.70711 8.29289L4.70711 3.29289L3.29289 4.70711Z" fill="currentColor" />
    </svg>
  );
}

/** Exact Grupo Pro chat header icons from layouts/chat_page/chatbox.php */
function GrupoVoiceCallIcon({ className = 'size-[19px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M21.97 18.33C21.97 18.69 21.89 19.06 21.72 19.42C21.55 19.78 21.33 20.12 21.04 20.44C20.55 20.98 20.01 21.37 19.4 21.62C18.8 21.87 18.15 22 17.45 22C16.43 22 15.34 21.76 14.19 21.27C13.04 20.78 11.89 20.12 10.75 19.29C9.6 18.45 8.51 17.52 7.47 16.49C6.44 15.45 5.51 14.36 4.68 13.22C3.86 12.08 3.2 10.94 2.72 9.81C2.24 8.67 2 7.58 2 6.54C2 5.86 2.12 5.21 2.36 4.61C2.6 4 2.98 3.44 3.51 2.94C4.15 2.31 4.85 2 5.59 2C5.87 2 6.15 2.06 6.4 2.18C6.66 2.3 6.89 2.48 7.07 2.74L9.39 6.01C9.57 6.26 9.7 6.49 9.79 6.71C9.88 6.92 9.93 7.13 9.93 7.32C9.93 7.56 9.86 7.8 9.72 8.03C9.59 8.26 9.4 8.5 9.16 8.74L8.4 9.53C8.29 9.64 8.24 9.77 8.24 9.93C8.24 10.01 8.25 10.08 8.27 10.16C8.3 10.24 8.33 10.3 8.35 10.36C8.53 10.69 8.84 11.12 9.28 11.64C9.73 12.16 10.21 12.69 10.73 13.22C11.27 13.75 11.79 14.24 12.32 14.69C12.84 15.13 13.27 15.43 13.61 15.61C13.66 15.63 13.72 15.66 13.79 15.69C13.87 15.72 13.95 15.73 14.04 15.73C14.21 15.73 14.34 15.67 14.45 15.56L15.21 14.81C15.46 14.56 15.7 14.37 15.93 14.25C16.16 14.11 16.39 14.04 16.64 14.04C16.83 14.04 17.03 14.08 17.25 14.17C17.47 14.26 17.7 14.39 17.95 14.56L21.26 16.91C21.52 17.09 21.7 17.3 21.81 17.55C21.91 17.8 21.97 18.05 21.97 18.33Z" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" />
      <path d="M18.5 9C18.5 8.4 18.03 7.48 17.33 6.73C16.69 6.04 15.84 5.5 15 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 9C22 5.13 18.87 2 15 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GrupoVideoCallIcon({ className = 'size-[20px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 1024 1024" fill="currentColor" className={className} aria-hidden="true">
      <path d="M713.6 780.8v-537.6h-604.8v537.6h604.8zM780.8 344l201.6-100.8v537.6l-201.6-100.8v134.4c0 18.557-15.043 33.6-33.6 33.6v0h-672c-18.557 0-33.6-15.043-33.6-33.6v0-604.8c0-18.557 15.043-33.6 33.6-33.6v0h672c18.557 0 33.6 15.043 33.6 33.6v0 134.4zM780.8 419.13v185.74l134.4 67.2v-320.14l-134.4 67.2zM176 310.4h201.6v67.2h-201.6v-67.2z" />
    </svg>
  );
}

function GrupoOptionsIcon({ className = 'size-[19px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M8 8H16M16 12H8M8 16H12M20 12V6C20 4.89543 19.1046 4 18 4H6C4.89543 4 4 4.89543 4 6V18C4 19.1046 4.89543 20 6 20H12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M18 15V18M18 21V18M18 18H21M18 18H15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

export function MessengerClient({ activeChatId }: { activeChatId?: string }) {
  const router = useRouter();
  const { user, bootstrap, theme, socket, onlineUsers, locale, setCounters } = useApp();
  const { error, success } = useToast();

  const initialThread = activeChatId ? messengerThreadCache.get(activeChatId) : undefined;
  const initialSummary =
    initialThread?.chat ||
    (activeChatId ? messengerInboxCache?.chats.find((c) => c.id === activeChatId) || null : null);

  const [tab, setTab] = useState<'chats' | 'groups' | 'discover' | 'invites' | 'archive'>('chats');
  const [searchQ, setSearchQ] = useState('');
  const [chats, setChats] = useState<ChatSummary[]>(() => messengerInboxCache?.chats || []);
  const [discoverGroups, setDiscoverGroups] = useState<DiscoverGroupItem[]>([]);
  const [discoverCategory, setDiscoverCategory] = useState('All');
  const [loadingDiscover, setLoadingDiscover] = useState(false);
  const [invites, setInvites] = useState<InviteItem[]>(() => messengerInboxCache?.invites || []);
  const [inviteCount, setInviteCount] = useState(() => messengerInboxCache?.invites.length || 0);
  const [loadingList, setLoadingList] = useState(() => !messengerInboxCache);
  const [joinPreviewStatus, setJoinPreviewStatus] = useState<'not_joined' | 'pending' | 'banned' | null>(null);
  const [joinPasswordModal, setJoinPasswordModal] = useState<{ id: string; name: string } | null>(null);
  const [joinPasswordInput, setJoinPasswordInput] = useState('');
  const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null);

  const [activeChat, setActiveChat] = useState<ChatSummary | null>(() => initialSummary);
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialThread?.messages || []);
  const [loadingThread, setLoadingThread] = useState(() => Boolean(activeChatId && !initialThread));
  const [msgText, setMsgText] = useState('');
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingUserInfo[]>([]);
  const [pollNow, setPollNow] = useState<number>(0);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [threadSearchOpen, setThreadSearchOpen] = useState(false);
  const [threadSearchQ, setThreadSearchQ] = useState('');
  const [threadMenuOpen, setThreadMenuOpen] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [directInfoOpen, setDirectInfoOpen] = useState(false);
  const [mobileActionMsg, setMobileActionMsg] = useState<ChatMessage | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [msgTranslations, setMsgTranslations] = useState<Record<string, string | null>>({});
  const [translatingMsgId, setTranslatingMsgId] = useState<string | null>(null);

  const [callMode, setCallMode] = useState<'video' | 'audio' | null>(null);
  const [showChatInCall, setShowChatInCall] = useState(false);
  const [activeCall, setActiveCall] = useState<ActiveCallSummary | null>(null);
  const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([]);
  const [pinIndex, setPinIndex] = useState(0);
  const [chatMuted, setChatMuted] = useState(false);
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
  const [forwardTargets, setForwardTargets] = useState<string[]>([]);
  const [forwarding, setForwarding] = useState(false);
  const [sendingLocation, setSendingLocation] = useState(false);

  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatMode, setNewChatMode] = useState<'direct' | 'group'>('direct');
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupCategory, setGroupCategory] = useState('General');
  const [groupVisibility, setGroupVisibility] = useState<'public' | 'private'>('public');
  const [groupPostingMode, setGroupPostingMode] = useState<'everyone' | 'admins_only'>('everyone');
  const [groupApproval, setGroupApproval] = useState(false);
  const [groupPassword, setGroupPassword] = useState('');
  const [groupIsPaid, setGroupIsPaid] = useState(false);
  const [groupEntryPrice, setGroupEntryPrice] = useState('500');
  const [groupMonetizationNote, setGroupMonetizationNote] = useState('');
  const [groupAvatar, setGroupAvatar] = useState('/assets/avatars/presets/avatar-h2mjRO.png');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [middleFullScreen, setMiddleFullScreen] = useState(false);
  const [joinPaidModal, setJoinPaidModal] = useState<{
    id: string;
    name: string;
    price: number;
    note?: string;
    isPasswordProtected?: boolean;
  } | null>(null);
  const [joinPaidPassword, setJoinPaidPassword] = useState('');

  const [inviteUserQuery, setInviteUserQuery] = useState('');
  const [inviteUserResults, setInviteUserResults] = useState<UserSearchResult[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const cancelRecordingRef = useRef(false);
  const recordingSecondsRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingPingRef = useRef<number>(0);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const chatMutedRef = useRef(chatMuted);

  const attachMenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const threadMenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stickerMenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tipDirectUserModalOpen, setTipDirectUserModalOpen] = useState(false);

  // Draggable Split Pane Widths & Responsive Bounds
  const [leftSidebarWidth, setLeftSidebarWidth] = useState<number>(340);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const leftDragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const [rightPanelWidth, setRightPanelWidth] = useState<number>(320);
  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const rightDragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    try {
      const savedLeft = localStorage.getItem('cp_messenger_sidebar_width');
      if (savedLeft) {
        const val = parseInt(savedLeft, 10);
        if (!isNaN(val) && val >= 260 && val <= 560) {
          setLeftSidebarWidth(val);
        }
      }
      const savedRight = localStorage.getItem('cp_messenger_right_width');
      if (savedRight) {
        const val = parseInt(savedRight, 10);
        if (!isNaN(val) && val >= 260 && val <= 520) {
          setRightPanelWidth(val);
        }
      }
    } catch { }
  }, []);

  const handleLeftResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsDraggingLeft(true);
    leftDragRef.current = {
      startX: e.clientX,
      startWidth: leftSidebarWidth,
    };
  }, [leftSidebarWidth]);

  useEffect(() => {
    if (!isDraggingLeft) return;

    const onPointerMove = (e: PointerEvent) => {
      if (!leftDragRef.current) return;
      const delta = e.clientX - leftDragRef.current.startX;
      const maxWidth = Math.min(560, Math.floor(window.innerWidth * 0.45));
      const newWidth = Math.max(260, Math.min(maxWidth, leftDragRef.current.startWidth + delta));
      setLeftSidebarWidth(newWidth);
    };

    const onPointerUp = () => {
      setIsDraggingLeft(false);
      leftDragRef.current = null;
      try {
        localStorage.setItem('cp_messenger_sidebar_width', String(leftSidebarWidth));
      } catch { }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [isDraggingLeft, leftSidebarWidth]);

  const handleRightResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsDraggingRight(true);
    rightDragRef.current = {
      startX: e.clientX,
      startWidth: rightPanelWidth,
    };
  }, [rightPanelWidth]);

  useEffect(() => {
    if (!isDraggingRight) return;

    const onPointerMove = (e: PointerEvent) => {
      if (!rightDragRef.current) return;
      const delta = rightDragRef.current.startX - e.clientX;
      const maxWidth = Math.min(500, Math.floor(window.innerWidth * 0.4));
      const newWidth = Math.max(260, Math.min(maxWidth, rightDragRef.current.startWidth + delta));
      setRightPanelWidth(newWidth);
    };

    const onPointerUp = () => {
      setIsDraggingRight(false);
      rightDragRef.current = null;
      try {
        localStorage.setItem('cp_messenger_right_width', String(rightPanelWidth));
      } catch { }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [isDraggingRight, rightPanelWidth]);

  const handleAttachEnter = () => {
    if (attachMenuTimeoutRef.current) {
      clearTimeout(attachMenuTimeoutRef.current);
      attachMenuTimeoutRef.current = null;
    }
    setAttachMenuOpen(true);
  };

  const handleAttachLeave = () => {
    if (attachMenuTimeoutRef.current) {
      clearTimeout(attachMenuTimeoutRef.current);
    }
    attachMenuTimeoutRef.current = setTimeout(() => {
      setAttachMenuOpen(false);
    }, 250);
  };

  const handleStickerEnter = () => {
    if (stickerMenuTimeoutRef.current) {
      clearTimeout(stickerMenuTimeoutRef.current);
      stickerMenuTimeoutRef.current = null;
    }
    setShowStickerPicker(true);
  };

  const handleStickerLeave = () => {
    if (stickerMenuTimeoutRef.current) {
      clearTimeout(stickerMenuTimeoutRef.current);
    }
    stickerMenuTimeoutRef.current = setTimeout(() => {
      setShowStickerPicker(false);
    }, 280);
  };

  const handleThreadMenuEnter = () => {
    if (threadMenuTimeoutRef.current) {
      clearTimeout(threadMenuTimeoutRef.current);
      threadMenuTimeoutRef.current = null;
    }
    setThreadMenuOpen(true);
  };

  const handleThreadMenuLeave = () => {
    if (threadMenuTimeoutRef.current) {
      clearTimeout(threadMenuTimeoutRef.current);
    }
    threadMenuTimeoutRef.current = setTimeout(() => {
      setThreadMenuOpen(false);
    }, 250);
  };

  useEffect(() => {
    chatMutedRef.current = chatMuted;
  }, [chatMuted]);

  const playChatSound = useCallback((kind: 'received' | 'sent') => {
    if (chatMutedRef.current || typeof window === 'undefined') return;
    try {
      const src =
        kind === 'sent'
          ? '/assets/sounds/chats/chat-message-sent.mp3'
          : '/assets/sounds/chats/active-chat-message-received.mp3';
      const audio = new Audio(src);
      audio.volume = 0.55;
      void audio.play().catch(() => undefined);
    } catch {
      // ignore audio autoplay restriction
    }
  }, []);

  useEffect(() => {
    if (tab !== 'chats' || searchQ.trim() || loadingList) return;
    const total = chats.reduce((sum, item) => sum + (item.unreadCount || 0), 0);
    setCounters((prev) => (prev.unreadMessages === total ? prev : { ...prev, unreadMessages: total }));
  }, [chats, tab, searchQ, loadingList, setCounters]);

  const loadDiscoverGroups = useCallback(async () => {
    if (!user) return;
    setLoadingDiscover(true);
    try {
      const qs = new URLSearchParams({ tab: 'discover' });
      if (discoverCategory !== 'All') qs.set('category', discoverCategory);
      if (searchQ.trim()) qs.set('q', searchQ.trim());
      const res = await apiFetch<DiscoverGroupItem[]>(`/chats?${qs.toString()}`);
      setDiscoverGroups(Array.isArray(res) ? res : []);
    } catch {
      setDiscoverGroups([]);
    } finally {
      setLoadingDiscover(false);
    }
  }, [user, discoverCategory, searchQ]);

  useEffect(() => {
    if (tab !== 'discover' || !user) return;
    const id = setTimeout(() => {
      void loadDiscoverGroups();
    }, 0);
    return () => clearTimeout(id);
  }, [tab, user, loadDiscoverGroups]);

  useEffect(() => {
    if (!user || typeof window === 'undefined') return;
    const qsParams = new URLSearchParams(window.location.search);
    const reqTab = qsParams.get('tab');
    const joinCode = qsParams.get('joinGroup');
    if (reqTab === 'discover' || reqTab === 'groups' || reqTab === 'invites' || reqTab === 'archive') {
      const t = setTimeout(() => setTab(reqTab), 0);
      return () => clearTimeout(t);
    }
    if (joinCode) {
      apiFetch<{ id: string }>(`/chats?code=${encodeURIComponent(joinCode)}`)
        .then((res) => {
          if (res?.id) {
            router.replace(`/messenger/c/${res.id}?inviteCode=${encodeURIComponent(joinCode)}`);
          }
        })
        .catch(() => error('Group invite link is invalid or expired.'));
    }
  }, [user, router, error]);

  const loadInbox = useCallback(async () => {
    if (!user) return;
    if (!messengerInboxCache) {
      setLoadingList(true);
    }
    try {
      setPollNow(Date.now());
      const [inviteRes, chatsRes] = await Promise.all([
        apiFetch<InviteItem[]>('/chats?tab=invites').catch(() => [] as InviteItem[]),
        tab === 'invites' || tab === 'discover'
          ? Promise.resolve<ChatSummary[] | null>(null)
          : (() => {
            const apiTab = tab === 'archive' ? 'archive' : 'inbox';
            const qs = new URLSearchParams({ tab: apiTab });
            if (searchQ.trim()) qs.set('q', searchQ.trim());
            return apiFetch<ChatSummary[]>(`/chats?${qs.toString()}`);
          })(),
      ]);
      const invList = Array.isArray(inviteRes) ? inviteRes : [];
      setInvites(invList);
      setInviteCount(invList.length);
      if (chatsRes !== null) {
        const nextChats = Array.isArray(chatsRes) ? chatsRes : [];
        setChats(nextChats);
        if (!searchQ.trim() && (tab === 'chats' || tab === 'groups')) {
          messengerInboxCache = {
            chats: nextChats,
            invites: invList,
            tab,
            ts: Date.now(),
          };
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingList(false);
    }
  }, [user, tab, searchQ]);

  const currentUserId = user?.id;

  const loadConversation = useCallback(
    async (chatId: string, queryText = '', silent = false) => {
      try {
        const params = new URLSearchParams();
        if (queryText.trim()) params.set('q', queryText.trim());
        if (typeof window !== 'undefined') {
          const ic = new URLSearchParams(window.location.search).get('inviteCode');
          if (ic) params.set('inviteCode', ic);
        }
        const qs = params.toString() ? `?${params.toString()}` : '';
        const res = await apiFetch<{
          joinPreview?: boolean;
          membershipStatus?: 'not_joined' | 'pending' | 'banned';
          chat: ChatSummary;
          messages: ChatMessage[];
          typingUsers?: TypingUserInfo[];
          pinnedMessages?: ChatMessage[];
          activeCall?: ActiveCallSummary | null;
        }>(`/chats/${chatId}${qs}`);
        setActiveChat(res.chat);
        if (res.joinPreview) {
          setJoinPreviewStatus(res.membershipStatus || 'not_joined');
          setMessages([]);
          setPinnedMessages([]);
          setActiveCall(null);
          return;
        }
        setJoinPreviewStatus(null);
        if (Array.isArray(res.typingUsers)) {
          setTypingUsers(res.typingUsers);
        }
        if (Array.isArray(res.pinnedMessages)) {
          setPinnedMessages(res.pinnedMessages);
          setPinIndex((idx) => (idx >= res.pinnedMessages!.length ? 0 : idx));
        } else if (!queryText.trim()) {
          setPinnedMessages([]);
        }
        setActiveCall(res.activeCall ?? null);
        const list = res.messages || [];
        let addedNew = false;
        let receivedFromOther = false;
        setMessages((prev) => {
          const prevLastId = prev[prev.length - 1]?.id;
          const nextLast = list[list.length - 1];
          addedNew = Boolean(nextLast && nextLast.id !== prevLastId);
          receivedFromOther = Boolean(
            addedNew && nextLast && String(nextLast.sender?._id || nextLast.senderId) !== currentUserId
          );
          return list;
        });
        if (silent && receivedFromOther) {
          playChatSound('received');
        }
        if (!queryText.trim()) {
          messengerThreadCache.set(chatId, {
            chat: res.chat,
            messages: list,
            ts: Date.now(),
          });
          const lastMsg = list[list.length - 1];
          const shouldMarkRead =
            !silent ||
            (addedNew && String(lastMsg?.sender?._id || lastMsg?.senderId) !== currentUserId);
          if (shouldMarkRead) {
            await apiFetch(`/chats/${chatId}`, {
              method: 'PATCH',
              json: { action: 'read', lastReadMessageId: lastMsg?.id },
            }).catch(() => undefined);
          }
          setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c)));
          if (!silent || addedNew) {
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
          }
        }
      } catch (err) {
        if (!silent) {
          error('Could not load conversation', err instanceof Error ? err.message : undefined);
        }
      } finally {
        setLoadingThread(false);
      }
    },
    [error, currentUserId, playChatSound]
  );

  useEffect(() => {
    const id = setTimeout(() => {
      void loadInbox();
    }, 0);
    return () => clearTimeout(id);
  }, [loadInbox]);

  const prevActiveChatIdRef = useRef<string | undefined>(activeChatId);
  const chatsRef = useRef(chats);

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  useEffect(() => {
    const id = setTimeout(() => {
      if (prevActiveChatIdRef.current !== activeChatId) {
        prevActiveChatIdRef.current = activeChatId;
        setReplyTo(null);
        setThreadSearchOpen(false);
        setThreadSearchQ('');
        setThreadMenuOpen(false);
        setDirectInfoOpen(false);
        setGroupInfoOpen(false);
        setMobileActionMsg(null);
        setTypingUsers([]);
        setShowGifPicker(false);
        setShowStickerPicker(false);
        setAttachMenuOpen(false);
        setCallMode(null);
        setShowChatInCall(false);
        setActiveCall(null);
        setPinnedMessages([]);
        setPinIndex(0);
        setJoinPreviewStatus(null);
      }
      if (activeChatId && user) {
        const qsParams =
          typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const answerMode = qsParams?.get('answerCall');
        if (answerMode === 'video' || answerMode === 'audio') {
          setShowChatInCall(false);
          setCallMode(answerMode);
          qsParams?.delete('answerCall');
          const nextSearch = qsParams?.toString();
          const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`;
          window.history.replaceState(null, '', nextUrl);
        }
        if (!threadSearchOpen) {
          const cached = messengerThreadCache.get(activeChatId);
          const summary = cached?.chat || chatsRef.current.find((c) => c.id === activeChatId) || null;
          if (summary) setActiveChat(summary);
          if (cached) {
            setMessages(cached.messages);
            setLoadingThread(false);
          } else {
            setMessages([]);
            setLoadingThread(true);
          }
        }
        void loadConversation(activeChatId, threadSearchOpen ? threadSearchQ : '');
      } else {
        setActiveChat(null);
        setMessages([]);
        setLoadingThread(false);
      }
    }, 0);
    return () => clearTimeout(id);
  }, [activeChatId, user, threadSearchOpen, threadSearchQ, loadConversation]);

  // Firebase FCM + User Realtime CustomEvent bridge (works immediately on Vercel without Socket.IO)
  useEffect(() => {
    if (!user) return;
    const onChatEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<Record<string, unknown>>).detail || {};
      const eventChatId = detail.chatId ? String(detail.chatId) : undefined;
      void loadInbox();
      if (activeChatId && !threadSearchOpen && (!eventChatId || eventChatId === activeChatId)) {
        void loadConversation(activeChatId, '', true);
      }
    };
    const onCallEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<Record<string, unknown>>).detail || {};
      const eventChatId = detail.chatId ? String(detail.chatId) : undefined;
      if (activeChatId && (!eventChatId || eventChatId === activeChatId)) {
        void loadConversation(activeChatId, '', true);
      }
    };
    window.addEventListener('weto:chat-event', onChatEvent);
    window.addEventListener('weto:call-event', onCallEvent);
    return () => {
      window.removeEventListener('weto:chat-event', onChatEvent);
      window.removeEventListener('weto:call-event', onCallEvent);
    };
  }, [user, activeChatId, threadSearchOpen, loadInbox, loadConversation]);

  // Firebase Firestore live room listener (sub-second messages, read receipts, reactions & typing when Firestore is enabled)
  useEffect(() => {
    if (!activeChatId || !user) return;
    const db = getFirebaseClientFirestore();
    if (!db) return;

    let firstSnapshot = true;
    let prevEventAt = 0;

    const unsub = onSnapshot(
      doc(db, 'chats', activeChatId),
      (snap) => {
        if (!snap.exists()) {
          firstSnapshot = false;
          return;
        }
        const data = snap.data() as {
          lastEventAt?: number;
          typing?: Record<string, TypingUserInfo & { expiresAt?: number } | null>;
        };
        const now = Date.now();
        if (data.typing) {
          const activeTypers: TypingUserInfo[] = [];
          for (const [uid, entry] of Object.entries(data.typing)) {
            if (entry && uid !== user.id && (entry.expiresAt ?? 0) > now) {
              activeTypers.push({
                userId: entry.userId || uid,
                username: entry.username,
                firstName: entry.firstName,
                avatar: entry.avatar,
              });
            }
          }
          setTypingUsers(activeTypers);
        }
        const eventAt = data.lastEventAt ?? 0;
        if (!firstSnapshot && eventAt > prevEventAt && !threadSearchOpen) {
          void loadConversation(activeChatId, '', true);
        }
        prevEventAt = eventAt;
        firstSnapshot = false;
      },
      () => {
        markFirestoreDisabled();
      }
    );

    return () => unsub();
  }, [activeChatId, user, threadSearchOpen, loadConversation]);

  // Socket.IO inbox updates across all messenger views
  useEffect(() => {
    if (!socket || !user) return;

    const onInboxUpdate = () => {
      void loadInbox();
    };

    socket.on('chat:inbox:update', onInboxUpdate);
    return () => {
      socket.off('chat:inbox:update', onInboxUpdate);
    };
  }, [socket, user, loadInbox]);

  // Socket.IO active chat room subscription & real-time events
  useEffect(() => {
    if (!socket || !activeChatId) return;

    socket.emit('chat:join', activeChatId);

    const onMessageReceived = (payload: { chatId?: string; message?: ChatMessage } & Partial<ChatMessage>) => {
      const targetChatId = payload.chatId;
      if (targetChatId && targetChatId !== activeChatId) return;
      const incoming = payload.message || (payload.id ? (payload as ChatMessage) : null);
      if (!incoming?.id) return;

      setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);

      if (String(incoming.sender?._id || incoming.senderId) !== user?.id) {
        playChatSound('received');
        apiFetch(`/chats/${activeChatId}`, {
          method: 'PATCH',
          json: { action: 'read', lastReadMessageId: incoming.id },
        }).catch(() => undefined);
      }
      void loadInbox();
    };

    const onTyping = (payload: { chatId: string; userId: string; username: string; typing: boolean }) => {
      if (payload.chatId !== activeChatId || payload.userId === user?.id) return;
      setTypingUsers((prev) =>
        payload.typing
          ? prev.some((u) => u.username === payload.username)
            ? prev
            : [...prev, { userId: payload.userId, username: payload.username }]
          : prev.filter((u) => u.username !== payload.username)
      );
    };

    const onMessageDeleted = (payload: { chatId?: string; messageId: string }) => {
      if (payload.chatId && payload.chatId !== activeChatId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === payload.messageId ? { ...m, isDeleted: true, content: '' } : m))
      );
    };

    const onMessageRead = (payload: { chatId: string; userId: string }) => {
      if (payload.chatId !== activeChatId || !payload.userId) return;
      setMessages((prev) =>
        prev.map((m) => {
          const readBy = m.readBy || [];
          if (readBy.some((id) => String(id) === String(payload.userId))) return m;
          return { ...m, readBy: [...readBy, payload.userId] };
        })
      );
    };

    const onMessageReaction = (payload: {
      chatId: string;
      messageId: string;
      reactionSummary: Array<{ unifiedId: string; nativeSymbol: string; count: number }>;
    }) => {
      if (payload.chatId !== activeChatId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId ? { ...m, reactionSummary: payload.reactionSummary || [] } : m
        )
      );
    };

    const onCallState = (payload: { chatId?: string; status?: string }) => {
      if (payload.chatId && payload.chatId !== activeChatId) return;
      void loadConversation(activeChatId, '', true);
    };

    socket.on('chat:message:received', onMessageReceived);
    socket.on('chat:typing', onTyping);
    socket.on('chat:message:deleted', onMessageDeleted);
    socket.on('chat:message:read', onMessageRead);
    socket.on('chat:message:reaction', onMessageReaction);
    socket.on('chat:call:state', onCallState);

    return () => {
      if (typingStopTimerRef.current) {
        clearTimeout(typingStopTimerRef.current);
        typingStopTimerRef.current = null;
      }
      socket.emit('chat:typing:stop', { chatId: activeChatId });
      socket.emit('chat:leave', activeChatId);
      socket.off('chat:message:received', onMessageReceived);
      socket.off('chat:typing', onTyping);
      socket.off('chat:message:deleted', onMessageDeleted);
      socket.off('chat:message:read', onMessageRead);
      socket.off('chat:message:reaction', onMessageReaction);
      socket.off('chat:call:state', onCallState);
    };
  }, [socket, activeChatId, user?.id, loadInbox, loadConversation, playChatSound]);

  // Polling fallback when deployed without a standalone Socket.IO server (e.g. pure Vercel)
  useEffect(() => {
    if (socket || !user) return;

    const refreshInboxSilently = () => {
      if (document.visibilityState !== 'visible') return;
      setPollNow(Date.now());
      if (tab === 'invites') {
        apiFetch<InviteItem[]>('/chats?tab=invites')
          .then((res) => {
            const list = Array.isArray(res) ? res : [];
            setInvites(list);
            setInviteCount(list.length);
          })
          .catch(() => undefined);
      } else {
        const apiTab = tab === 'archive' ? 'archive' : 'inbox';
        const qs = new URLSearchParams({ tab: apiTab });
        if (searchQ.trim()) qs.set('q', searchQ.trim());
        apiFetch<ChatSummary[]>(`/chats?${qs.toString()}`)
          .then((res) => {
            setChats(Array.isArray(res) ? res : []);
          })
          .catch(() => undefined);
      }
    };

    const inboxTimer = setInterval(refreshInboxSilently, 6000);
    const activeTimer =
      activeChatId && !threadSearchOpen
        ? setInterval(() => {
          if (document.visibilityState !== 'visible') return;
          void loadConversation(activeChatId, '', true);
        }, 2000)
        : null;

    return () => {
      clearInterval(inboxTimer);
      if (activeTimer) clearInterval(activeTimer);
    };
  }, [socket, activeChatId, threadSearchOpen, user, tab, searchQ, loadConversation]);

  // User search in New Chat modal
  useEffect(() => {
    if (!newChatOpen) return;
    apiFetch<UserSearchResult[] | { users: UserSearchResult[] }>(
      `/users?q=${encodeURIComponent(userQuery)}&limit=12`
    )
      .then((res) => {
        const list = Array.isArray(res) ? res : res?.users || [];
        setUserResults(list.filter((u) => u.id !== user?.id));
      })
      .catch(() => setUserResults([]));
  }, [newChatOpen, userQuery, user?.id]);

  // User search in Group Info invite modal
  useEffect(() => {
    if (!groupInfoOpen || activeChat?.type !== 'group') return;
    apiFetch<UserSearchResult[] | { users: UserSearchResult[] }>(
      `/users?q=${encodeURIComponent(inviteUserQuery)}&limit=10`
    )
      .then((res) => {
        const list = Array.isArray(res) ? res : res?.users || [];
        const existingIds = new Set((activeChat.participants || []).map((p) => String(p.user._id)));
        setInviteUserResults(list.filter((u) => u.id !== user?.id && !existingIds.has(u.id)));
      })
      .catch(() => setInviteUserResults([]));
  }, [groupInfoOpen, inviteUserQuery, activeChat, user?.id]);

  function emitTypingChange(hasText: boolean) {
    if (!activeChatId) return;
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }

    const sendServerTyping = (typing: boolean) => {
      apiFetch(`/chats/${activeChatId}/typing`, {
        method: 'POST',
        json: { typing },
      }).catch(() => undefined);
    };

    if (hasText) {
      socket?.emit('chat:typing:start', { chatId: activeChatId });
      const now = Date.now();
      if (now - lastTypingPingRef.current > 1800) {
        lastTypingPingRef.current = now;
        sendServerTyping(true);
      }
      typingStopTimerRef.current = setTimeout(() => {
        socket?.emit('chat:typing:stop', { chatId: activeChatId });
        lastTypingPingRef.current = 0;
        sendServerTyping(false);
      }, 2800);
    } else {
      socket?.emit('chat:typing:stop', { chatId: activeChatId });
      if (lastTypingPingRef.current !== 0) {
        lastTypingPingRef.current = 0;
        sendServerTyping(false);
      }
    }
  }

  async function handleSendText(e: React.FormEvent) {
    e.preventDefault();
    if (!activeChatId || !msgText.trim() || sending) return;
    setSending(true);
    try {
      const sent = await apiFetch<ChatMessage>(`/chats/${activeChatId}`, {
        method: 'POST',
        json: {
          type: 'text',
          content: msgText.trim(),
          ...(replyTo ? { parentId: replyTo.id } : {}),
        },
      });
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      setMsgText('');
      setReplyTo(null);
      emitTypingChange(false);
      playChatSound('sent');
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);
      void loadInbox();
    } catch (err) {
      error('Failed to send message', err instanceof Error ? err.message : undefined);
    } finally {
      setSending(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeChatId) return;
    setUploadingMedia(true);
    setUploadProgress(5);
    try {
      const up = await uploadFileToR2(file, 'chats', 'message', (pct) => setUploadProgress(pct));
      const msgType =
        up.mediaType === 'image'
          ? 'image'
          : up.mediaType === 'video'
            ? 'video'
            : up.mediaType === 'audio'
              ? 'audio'
              : 'file';
      const sent = await apiFetch<ChatMessage>(`/chats/${activeChatId}`, {
        method: 'POST',
        json: {
          type: msgType,
          mediaId: up.mediaId,
          ...(replyTo ? { parentId: replyTo.id } : {}),
        },
      });
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      setReplyTo(null);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);
      void loadInbox();
    } catch (err) {
      error('Attachment upload failed', err instanceof Error ? err.message : undefined);
    } finally {
      setUploadingMedia(false);
      setUploadProgress(null);
    }
  }

  function pickRecordingMime(): { mimeType: string; ext: string } {
    if (typeof MediaRecorder === 'undefined') {
      return { mimeType: 'audio/webm', ext: 'webm' };
    }
    const candidates = [
      { mime: 'audio/webm;codecs=opus', clean: 'audio/webm', ext: 'webm' },
      { mime: 'audio/webm', clean: 'audio/webm', ext: 'webm' },
      { mime: 'audio/mp4', clean: 'audio/mp4', ext: 'm4a' },
      { mime: 'audio/ogg;codecs=opus', clean: 'audio/ogg', ext: 'ogg' },
      { mime: 'audio/ogg', clean: 'audio/ogg', ext: 'ogg' },
    ];
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c.mime)) {
        return { mimeType: c.clean, ext: c.ext };
      }
    }
    return { mimeType: 'audio/webm', ext: 'webm' };
  }

  function stopVoiceRecording(cancel: boolean) {
    cancelRecordingRef.current = cancel;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
    setRecordingSeconds(0);
  }

  async function startVoiceRecording() {
    if (!activeChatId || recording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      error('Voice recording is not supported on this browser');
      return;
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('weto:pause-all-audio'));
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chosen = pickRecordingMime();
      const recorder = new MediaRecorder(
        stream,
        MediaRecorder.isTypeSupported(chosen.mimeType) ? { mimeType: chosen.mimeType } : undefined
      );
      audioChunksRef.current = [];
      cancelRecordingRef.current = false;
      recordingSecondsRef.current = 0;
      setRecordingSeconds(0);

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
        if (cancelRecordingRef.current) {
          audioChunksRef.current = [];
          return;
        }
        const blobType = (recorder.mimeType || chosen.mimeType).split(';')[0].trim();
        const blob = new Blob(audioChunksRef.current, { type: blobType });
        audioChunksRef.current = [];
        if (blob.size < 256) {
          error('Voice note was too short');
          return;
        }
        const durationSeconds = Math.max(1, recordingSecondsRef.current);
        const ext = blobType.includes('mp4') ? 'm4a' : blobType.includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blobType });
        setUploadingMedia(true);
        setUploadProgress(5);
        try {
          const up = await uploadFileToR2(
            file,
            'chats',
            'message',
            (pct) => setUploadProgress(pct),
            { durationSeconds }
          );
          const sent = await apiFetch<ChatMessage>(`/chats/${activeChatId}`, {
            method: 'POST',
            json: {
              type: 'audio',
              mediaId: up.mediaId,
              ...(replyTo ? { parentId: replyTo.id } : {}),
            },
          });
          setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
          setReplyTo(null);
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);
          void loadInbox();
        } catch (err) {
          error('Voice note upload failed', err instanceof Error ? err.message : undefined);
        } finally {
          setUploadingMedia(false);
          setUploadProgress(null);
        }
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      error('Microphone access denied');
    }
  }

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      setRecordingSeconds((prev) => {
        const next = prev + 1;
        recordingSecondsRef.current = next;
        if (next >= 120) {
          stopVoiceRecording(false);
        }
        return next;
      });
    }, 1000);
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        stopVoiceRecording(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [recording]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        cancelRecordingRef.current = true;
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  useEffect(() => {
    if (!middleFullScreen) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMiddleFullScreen(false);
      }
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [middleFullScreen]);

  async function handleDeleteMessage(messageId: string, scope: 'local' | 'global') {
    if (!activeChatId) return;
    try {
      await apiFetch(`/chats/${activeChatId}/messages/${messageId}?scope=${scope}`, { method: 'DELETE' });
      if (scope === 'local') {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, isDeleted: true, content: '' } : m))
        );
      }
      void loadInbox();
    } catch (err) {
      error('Could not delete message', err instanceof Error ? err.message : undefined);
    }
  }

  async function handleTranslateMessage(msg: ChatMessage) {
    const text = msg.content?.trim();
    if (!text) return;
    if (msgTranslations[msg.id]) {
      setMsgTranslations((prev) => ({ ...prev, [msg.id]: null }));
      return;
    }
    setTranslatingMsgId(msg.id);
    try {
      const res = await apiFetch<{ translatedText: string }>('/translate', {
        method: 'POST',
        json: { text, targetLang: locale || 'en' },
      });
      setMsgTranslations((prev) => ({ ...prev, [msg.id]: res.translatedText }));
    } catch (err) {
      error('Translation unavailable', err instanceof Error ? err.message : undefined);
    } finally {
      setTranslatingMsgId(null);
    }
  }

  async function handleSendGif(gifUrl: string) {
    if (!activeChatId || sending) return;
    setShowGifPicker(false);
    setSending(true);
    try {
      const sent = await apiFetch<ChatMessage>(`/chats/${activeChatId}`, {
        method: 'POST',
        json: {
          type: 'gif',
          gifUrl,
          parentId: replyTo?.id,
        },
      });
      setReplyTo(null);
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      playChatSound('sent');
      void loadInbox();
    } catch (err) {
      error('Could not send GIF', err instanceof Error ? err.message : undefined);
    } finally {
      setSending(false);
    }
  }

  async function handleSendSticker(stickerUrl: string) {
    if (!activeChatId || sending) return;
    setShowStickerPicker(false);
    setSending(true);
    try {
      const sent = await apiFetch<ChatMessage>(`/chats/${activeChatId}`, {
        method: 'POST',
        json: {
          type: 'sticker',
          stickerUrl,
          parentId: replyTo?.id,
        },
      });
      setReplyTo(null);
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      playChatSound('sent');
      void loadInbox();
    } catch (err) {
      error('Could not send sticker', err instanceof Error ? err.message : undefined);
    } finally {
      setSending(false);
    }
  }

  async function handleCreatePoll(e: React.FormEvent) {
    e.preventDefault();
    if (!activeChatId || sending) return;
    const question = pollQuestion.trim();
    const cleanedOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (!question || cleanedOptions.length < 2) {
      error('Please enter a poll question and at least 2 options.');
      return;
    }
    setSending(true);
    try {
      const sent = await apiFetch<ChatMessage>(`/chats/${activeChatId}`, {
        method: 'POST',
        json: {
          type: 'poll',
          pollQuestion: question,
          pollOptions: cleanedOptions,
          parentId: replyTo?.id,
        },
      });
      setReplyTo(null);
      setPollModalOpen(false);
      setPollQuestion('');
      setPollOptions(['', '']);
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      playChatSound('sent');
      void loadInbox();
    } catch (err) {
      error('Could not create poll', err instanceof Error ? err.message : undefined);
    } finally {
      setSending(false);
    }
  }

  async function handleVotePoll(messageId: string, optionId: string) {
    if (!activeChatId) return;
    try {
      const res = await apiFetch<{ poll: ChatPoll }>(
        `/chats/${activeChatId}/messages/${messageId}`,
        {
          method: 'POST',
          json: { action: 'vote_poll', optionId },
        }
      );
      if (res.poll) {
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, poll: res.poll } : m)));
      }
    } catch (err) {
      error('Vote failed', err instanceof Error ? err.message : undefined);
    }
  }

  async function handleShareLocation() {
    if (!activeChatId || sendingLocation) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      error('Geolocation is not supported in this browser.');
      return;
    }
    setSendingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = Number(pos.coords.latitude.toFixed(6));
          const lng = Number(pos.coords.longitude.toFixed(6));
          const sent = await apiFetch<ChatMessage>(`/chats/${activeChatId}`, {
            method: 'POST',
            json: {
              type: 'location',
              location: { lat, lng, label: `${lat}, ${lng}` },
              parentId: replyTo?.id,
            },
          });
          setReplyTo(null);
          setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
          playChatSound('sent');
          void loadInbox();
        } catch (err) {
          error('Could not share location', err instanceof Error ? err.message : undefined);
        } finally {
          setSendingLocation(false);
        }
      },
      () => {
        setSendingLocation(false);
        error('Location permission denied or unavailable.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function handlePinToggle(messageId: string) {
    if (!activeChatId) return;
    const isPinned = pinnedMessages.some((pm) => pm.id === messageId);
    try {
      const res = await apiFetch<{ pinnedMessages?: ChatMessage[] }>(`/chats/${activeChatId}`, {
        method: 'PATCH',
        json: { action: isPinned ? 'unpin_message' : 'pin_message', messageId },
      });
      if (Array.isArray(res.pinnedMessages)) {
        setPinnedMessages(res.pinnedMessages);
        setPinIndex(0);
      } else {
        void loadConversation(activeChatId, '', true);
      }
      success(isPinned ? 'Message unpinned' : 'Message pinned');
    } catch (err) {
      error('Could not update pin', err instanceof Error ? err.message : undefined);
    }
  }

  async function handleForwardSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeChatId || !forwardMsg || forwardTargets.length === 0 || forwarding) return;
    setForwarding(true);
    try {
      const res = await apiFetch<{ forwarded?: number; forwardedCount?: number }>(`/chats/${activeChatId}`, {
        method: 'PATCH',
        json: {
          action: 'forward_message',
          messageId: forwardMsg.id,
          targetChatIds: forwardTargets,
        },
      });
      const sentCount = res.forwarded ?? res.forwardedCount ?? forwardTargets.length;
      success(`Forwarded to ${sentCount} chat(s)`);
      setForwardMsg(null);
      setForwardTargets([]);
      void loadInbox();
    } catch (err) {
      error('Forward failed', err instanceof Error ? err.message : undefined);
    } finally {
      setForwarding(false);
    }
  }

  function handleStartCall(mode: 'video' | 'audio') {
    if (!activeChatId) return;
    setShowChatInCall(false);
    setGroupInfoOpen(false);
    setThreadMenuOpen(false);
    setCallMode(mode);
  }

  async function handleToggleReaction(messageId: string, unifiedId: string, nativeSymbol: string) {
    if (!activeChatId) return;
    try {
      const res = await apiFetch<{
        reactionSummary: Array<{ unifiedId: string; nativeSymbol: string; count: number }>;
      }>(`/chats/${activeChatId}/messages/${messageId}`, {
        method: 'POST',
        json: { unifiedId, nativeSymbol },
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactionSummary: res.reactionSummary || [] } : m))
      );
    } catch {
      // ignore
    }
  }

  async function handleChatAction(action: 'archive' | 'unarchive' | 'clear' | 'delete' | 'leave_group') {
    if (!activeChat) return;
    setThreadMenuOpen(false);
    try {
      if (action === 'delete') {
        await apiFetch(`/chats/${activeChat.id}`, { method: 'DELETE' });
        success('Conversation deleted');
        router.push('/messenger');
        void loadInbox();
        return;
      }
      await apiFetch(`/chats/${activeChat.id}`, {
        method: 'PATCH',
        json: { action },
      });
      if (action === 'clear') {
        setMessages([]);
        success('Chat history cleared');
        void loadInbox();
      } else if (action === 'leave_group') {
        setGroupInfoOpen(false);
        success('Left group');
        router.push('/messenger');
        void loadInbox();
      } else {
        success(action === 'unarchive' ? 'Moved to Inbox' : 'Conversation archived');
        router.push('/messenger');
        void loadInbox();
      }
    } catch (err) {
      error('Action failed', err instanceof Error ? err.message : undefined);
    }
  }

  async function handleInviteToGroup(targetUserId: string) {
    if (!activeChat) return;
    try {
      await apiFetch(`/chats/${activeChat.id}`, {
        method: 'PATCH',
        json: { action: 'invite_send', targetUserId },
      });
      success('Group invitation sent');
    } catch (err) {
      error('Could not invite user', err instanceof Error ? err.message : undefined);
    }
  }

  async function startDirectChat(targetUserId: string) {
    try {
      const res = await apiFetch<{ id: string }>('/chats', {
        method: 'POST',
        json: { type: 'direct', targetUserId },
      });
      setNewChatOpen(false);
      router.push(`/messenger/c/${res.id}`);
    } catch (err) {
      error('Could not open chat', err instanceof Error ? err.message : undefined);
    }
  }

  async function createGroupChat(e?: React.SyntheticEvent) {
    e?.preventDefault();
    if (!groupName.trim()) return;
    const numericPrice = Math.max(0, Number(groupEntryPrice || 0));
    try {
      const res = await apiFetch<{ id: string }>('/chats', {
        method: 'POST',
        json: {
          type: 'group',
          groupName: groupName.trim(),
          groupDescription: groupDescription.trim(),
          category: groupCategory,
          visibility: groupVisibility,
          postingMode: groupPostingMode,
          requiresApproval: groupApproval,
          password: groupPassword.trim() || undefined,
          isPaid: groupIsPaid && numericPrice > 0,
          entryPrice: groupIsPaid ? numericPrice : 0,
          monetizationNote: groupMonetizationNote.trim() || undefined,
          avatar: groupAvatar,
          memberIds: selectedMembers,
        },
      });
      setNewChatOpen(false);
      setGroupName('');
      setGroupDescription('');
      setGroupPassword('');
      setGroupIsPaid(false);
      setGroupEntryPrice('500');
      setGroupMonetizationNote('');
      setSelectedMembers([]);
      success('Group created!');
      router.push(`/messenger/c/${res.id}`);
    } catch (err) {
      error('Failed to create group', err instanceof Error ? err.message : undefined);
    }
  }

  async function handleJoinGroup(
    chatId: string,
    opts?: {
      password?: string;
      isPasswordProtected?: boolean;
      isPaid?: boolean;
      entryPrice?: number;
      monetizationNote?: string;
      payFromWallet?: boolean;
      name?: string;
      inviteCode?: string;
    }
  ) {
    const price = Number(opts?.entryPrice || 0);
    if (opts?.isPaid && price > 0 && !opts?.payFromWallet) {
      setJoinPaidPassword('');
      setJoinPaidModal({
        id: chatId,
        name: opts.name || 'Paid Group',
        price,
        note: opts.monetizationNote,
        isPasswordProtected: opts.isPasswordProtected,
      });
      return;
    }
    if (opts?.isPasswordProtected && !opts?.password) {
      setJoinPasswordInput('');
      setJoinPasswordModal({ id: chatId, name: opts.name || 'Protected Group' });
      return;
    }
    setJoiningGroupId(chatId);
    try {
      const urlInviteCode =
        opts?.inviteCode ||
        (typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('inviteCode') || undefined
          : undefined);
      const res = await apiFetch<{ joined?: boolean; pending?: boolean }>(`/chats/${chatId}`, {
        method: 'PATCH',
        json: {
          action: 'join_group',
          password: opts?.password,
          payFromWallet: Boolean(opts?.payFromWallet),
          inviteCode: urlInviteCode,
        },
      });
      setJoinPasswordModal(null);
      setJoinPasswordInput('');
      setJoinPaidModal(null);
      setJoinPaidPassword('');
      if (res.pending) {
        success('Join request sent to group admins');
        setJoinPreviewStatus('pending');
      } else {
        success('Joined group!');
        setJoinPreviewStatus(null);
        void loadInbox();
        if (activeChatId === chatId) {
          void loadConversation(chatId);
        } else {
          router.push(`/messenger/c/${chatId}`);
        }
      }
      if (tab === 'discover') {
        void loadDiscoverGroups();
      }
    } catch (err) {
      error('Could not join group', err instanceof Error ? err.message : undefined);
    } finally {
      setJoiningGroupId(null);
    }
  }

  async function handleCancelJoinRequest(chatId: string) {
    try {
      await apiFetch(`/chats/${chatId}`, {
        method: 'PATCH',
        json: { action: 'cancel_join_request' },
      });
      success('Join request cancelled');
      setJoinPreviewStatus('not_joined');
      if (tab === 'discover') void loadDiscoverGroups();
    } catch (err) {
      error('Action failed', err instanceof Error ? err.message : undefined);
    }
  }

  async function respondInvite(chatId: string, accept: boolean) {
    try {
      await apiFetch(`/chats/${chatId}`, {
        method: 'PATCH',
        json: { action: 'invite_respond', accept },
      });
      success(accept ? 'Joined group!' : 'Invitation declined');
      setTab('chats');
      void loadInbox();
    } catch (err) {
      error('Action failed', err instanceof Error ? err.message : undefined);
    }
  }

  if (!user) {
    return (
      <div className="p-8">
        <EmptyState
          title="Sign in to use Messenger"
          action={
            <Link href="/auth/login">
              <Button variant="primary">Sign in</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const interlocutor =
    activeChat?.type === 'direct'
      ? activeChat.participants?.find((p) => String(p.user._id) !== user.id)?.user ||
      activeChat.interlocutor ||
      null
      : null;

  const activeTitle =
    activeChat?.type === 'group'
      ? activeChat.group?.name || 'Group Chat'
      : interlocutor
        ? `${interlocutor.firstName || ''} ${interlocutor.lastName || ''}`.trim() || `@${interlocutor.username}`
        : 'Chat';

  const activeAvatar = activeChat?.type === 'group' ? activeChat.group?.avatar : interlocutor?.avatar;
  const interlocutorOnline = Boolean(
    interlocutor?._id &&
    (onlineUsers.has(String(interlocutor._id)) ||
      isRecentlyActive(interlocutor.lastActive, pollNow, Boolean(socket)))
  );

  const myParticipantRole = activeChat?.participants?.find((p) => String(p.user._id) === user.id)?.role;
  const isArchivedChat = Boolean(activeChat?.isArchived || tab === 'archive');
  const visibleChats = tab === 'groups' ? chats.filter((c) => c.type === 'group') : chats;
  const typingNames = typingUsers.map((t) => t.firstName || `@${t.username}`).join(', ');
  const isGroupMuted = Boolean(activeChat?.type === 'group' && activeChat.isMuted);
  const isReadOnlyRoom = Boolean(
    activeChat?.type === 'group' &&
    activeChat.group?.postingMode === 'admins_only' &&
    myParticipantRole === 'member'
  );
  const mentionMatch =
    activeChat?.type === 'group' && !joinPreviewStatus
      ? msgText.match(/(?:^|\s)@([a-zA-Z0-9._]*)$/)
      : null;
  const mentionCandidates = mentionMatch
    ? (activeChat?.participants || [])
      .filter(
        (p) =>
          String(p.user._id) !== user.id &&
          p.user.username.toLowerCase().includes((mentionMatch[1] || '').toLowerCase())
      )
      .slice(0, 6)
    : [];
  const appName = bootstrap?.config?.appName || 'Weto';
  const logoSrc =
    theme === 'dark'
      ? bootstrap?.config?.logos?.dark || '/assets/logos/dark.png'
      : bootstrap?.config?.logos?.light || '/assets/logos/light.png';

  const chatMediaImages = messages
    .filter(
      (msg) =>
        !msg.isDeleted &&
        (msg.type === 'image' || msg.type === 'gif') &&
        Boolean(msg.media?.publicUrl || msg.media?.url)
    )
    .map((msg) => ({
      url: String(msg.media?.publicUrl || msg.media?.url || ''),
      alt: msg.media?.filename || (msg.type === 'gif' ? 'GIF' : 'Attachment'),
    }));
  const matchedLightboxIdx = lightboxImageUrl
    ? chatMediaImages.findIndex((item) => item.url === lightboxImageUrl)
    : -1;
  const lightboxItems =
    chatMediaImages.length > 0 && matchedLightboxIdx >= 0
      ? chatMediaImages
      : lightboxImageUrl
        ? [{ url: lightboxImageUrl, alt: 'Attachment preview' }]
        : [];
  const lightboxInitialIndex = matchedLightboxIdx >= 0 ? matchedLightboxIdx : 0;
  const safePinIdx = pinnedMessages.length > 0 ? Math.min(pinIndex, pinnedMessages.length - 1) : 0;
  const currentPinned = pinnedMessages[safePinIdx] || pinnedMessages[0] || null;

  const renderMessageBody = (
    m: ChatMessage,
    variant: 'desktop' | 'mobile-mine' | 'mobile-other',
    inlineTimestampNode?: React.ReactNode
  ) => {
    if (m.isDeleted) {
      return <p className="text-cap-l italic text-lab-sc">Message deleted</p>;
    }

    if (m.type === 'system') {
      const label =
        m.content === 'user_initiated_video_call'
          ? 'Started a video call'
          : m.content === 'user_initiated_audio_call'
            ? 'Started an audio call'
            : m.content || 'Call update';
      return (
        <div className="inline-flex items-center gap-1.5 rounded-full bg-black/30 dark:bg-black/55 backdrop-blur-xs px-3.5 py-1 text-[12px] font-medium text-white shadow-xs">
          {m.content === 'user_initiated_video_call' ? (
            <Video className="size-3.5 text-emerald-300 shrink-0" />
          ) : (
            <Phone className="size-3.5 text-emerald-300 shrink-0" />
          )}
          <span>{label}</span>
        </div>
      );
    }

    const mediaUrl = m.media?.publicUrl || m.media?.url;
    const boxClass =
      'bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] text-lab-pr dark:text-white';

    const totalPollVotes = m.poll
      ? m.poll.options.reduce((sum, opt) => sum + (opt.voterIds?.length || 0), 0)
      : 0;

    return (
      <>
        {m.forwardedFromId && (
          <div className="flex items-center gap-1 text-[11.5px] font-medium text-brand-900 dark:text-emerald-400 mb-1 select-none">
            <Forward className="size-3 shrink-0" />
            <span>Forwarded message</span>
          </div>
        )}

        {m.type === 'sticker' && m.stickerUrl && (
          <div className="relative inline-block py-0.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.stickerUrl}
              alt="Sticker"
              loading="lazy"
              decoding="async"
              className="h-32 w-32 object-contain"
            />
            {inlineTimestampNode && (
              <div className="absolute bottom-1 right-1 z-10 px-1.5 py-0.5 rounded-full bg-black/45 backdrop-blur-xs text-[10px] text-white font-medium inline-flex items-center gap-0.5 pointer-events-none shadow-xs">
                {inlineTimestampNode}
              </div>
            )}
          </div>
        )}

        {m.type === 'poll' && m.poll && (
          <div
            className={cn(
              'rounded-2xl border p-3 space-y-2 w-full max-w-full text-left',
              middleFullScreen ? 'sm:w-96 md:w-[420px]' : 'sm:w-80',
              boxClass
            )}
          >
            <div className="flex items-start gap-2">
              <BarChart2 className="h-4 w-4 text-brand-900 shrink-0 mt-0.5" />
              <p className="text-par-n font-bold text-lab-pr leading-snug">{m.poll.question}</p>
            </div>
            <div className="space-y-1.5">
              {m.poll.options.map((opt) => {
                const count = opt.voterIds?.length || 0;
                const pct = totalPollVotes > 0 ? Math.round((count / totalPollVotes) * 100) : 0;
                const voted = Boolean(
                  currentUserId && opt.voterIds?.some((vid) => String(vid) === currentUserId)
                );
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => void handleVotePoll(m.id, opt.id)}
                    className={cn(
                      'relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer',
                      voted
                        ? 'border-brand-900 bg-brand-900/10'
                        : 'border-bord-card bg-bg-pr/70 hover:bg-fill-fv'
                    )}
                  >
                    <div
                      className="absolute inset-y-0 left-0 bg-brand-900/15 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                    <div className="relative flex items-center justify-between gap-2 text-cap-l">
                      <span className={cn('truncate', voted ? 'font-bold text-brand-900' : 'text-lab-pr')}>
                        {opt.text}
                      </span>
                      <span className="shrink-0 text-cap-s font-semibold text-lab-sc tabular-nums">
                        {pct}% ({count})
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between pt-1">
              <p className="text-[11px] text-lab-sc">
                {totalPollVotes} {totalPollVotes === 1 ? 'vote' : 'votes'} · Tap an option to vote
              </p>
              {!m.content && inlineTimestampNode}
            </div>
          </div>
        )}

        {m.type === 'location' && m.location && (
          <div className="space-y-1">
            <a
              href={`https://www.google.com/maps?q=${encodeURIComponent(`${m.location.lat},${m.location.lng}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center gap-2.5 rounded-xl px-3 py-2.5 border transition-opacity hover:opacity-90 w-full max-w-full min-w-0',
                middleFullScreen ? 'sm:w-96 md:w-[420px]' : 'sm:w-72',
                boxClass
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-900/15 text-brand-900">
                <MapPin className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="text-cap-l font-semibold text-lab-pr truncate">Shared Location</p>
                <p className="text-[11px] text-lab-sc truncate">
                  {m.location.label || `${m.location.lat.toFixed(4)}, ${m.location.lng.toFixed(4)}`}
                </p>
              </div>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-lab-sc" />
            </a>
            {!m.content && inlineTimestampNode && (
              <div className="flex justify-end pt-0.5">
                {inlineTimestampNode}
              </div>
            )}
          </div>
        )}

        {mediaUrl && (
          <>
            {(m.type === 'image' || m.type === 'gif') && (
              <div className="relative inline-block max-w-full rounded-xl overflow-hidden border border-black/[0.06] dark:border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setLightboxImageUrl(mediaUrl)}
                  className="block overflow-hidden cursor-pointer"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaUrl}
                    alt={m.media?.filename || (m.type === 'gif' ? 'GIF' : 'Image attachment')}
                    loading="lazy"
                    decoding="async"
                    className={cn(
                      'max-w-full object-cover',
                      middleFullScreen
                        ? 'max-h-80 sm:max-h-96 md:max-h-[440px]'
                        : 'max-h-72 sm:max-h-80'
                    )}
                  />
                </button>
                {!m.content && inlineTimestampNode && (
                  <div className="absolute bottom-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded-full bg-black/50 backdrop-blur-xs text-[10.5px] text-white font-medium inline-flex items-center gap-1 shadow-xs pointer-events-none">
                    {inlineTimestampNode}
                  </div>
                )}
                {m.type === 'gif' && <GiphyAttribution className="absolute bottom-2 left-2 z-10" />}
              </div>
            )}

            {(m.type === 'video' || m.type === 'video_circle') && (
              <div className="relative inline-block max-w-full rounded-xl overflow-hidden">
                <video
                  src={mediaUrl}
                  controls
                  playsInline
                  className={cn(
                    'rounded-xl max-w-full bg-black border border-bord-card',
                    middleFullScreen
                      ? 'max-h-80 sm:max-h-96 md:max-h-[440px]'
                      : 'max-h-72 sm:max-h-80'
                  )}
                />
                {!m.content && inlineTimestampNode && (
                  <div className="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-xs text-[10.5px] text-white font-medium inline-flex items-center gap-1 shadow-xs pointer-events-none">
                    {inlineTimestampNode}
                  </div>
                )}
              </div>
            )}

            {m.type === 'audio' && (
              <div
                className={cn(
                  'space-y-1 max-w-full',
                  middleFullScreen ? 'w-[240px] sm:w-[320px] md:w-[360px]' : 'w-[210px] sm:w-[260px]'
                )}
              >
                <audio src={mediaUrl} controls className="w-full h-9 max-w-full" />
                <div className="flex items-center justify-between text-cap-s text-lab-sc">
                  {m.media?.durationSeconds ? (
                    <p className="text-[11px] text-lab-sc">
                      Voice note · {Math.floor(m.media.durationSeconds / 60)}:
                      {String(Math.floor(m.media.durationSeconds % 60)).padStart(2, '0')}
                    </p>
                  ) : <span />}
                  {!m.content && inlineTimestampNode}
                </div>
              </div>
            )}

            {m.type !== 'image' &&
              m.type !== 'gif' &&
              m.type !== 'video' &&
              m.type !== 'video_circle' &&
              m.type !== 'audio' && (
                <div className="space-y-1">
                  <a
                    href={mediaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={m.media?.filename}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl px-3 py-2 border text-cap-l transition-opacity hover:opacity-90 w-full max-w-full min-w-0 overflow-hidden',
                      middleFullScreen ? 'md:max-w-md lg:max-w-lg' : 'md:max-w-sm',
                      boxClass
                    )}
                  >
                    <FileDown className="h-4 w-4 shrink-0 text-lab-sc" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{m.media?.filename || 'Download attachment'}</p>
                      {m.media?.sizeBytes ? (
                        <p className="text-[10px] text-lab-sc">{(m.media.sizeBytes / 1024).toFixed(1)} KB</p>
                      ) : null}
                    </div>
                  </a>
                  {!m.content && inlineTimestampNode && (
                    <div className="flex justify-end pt-0.5">
                      {inlineTimestampNode}
                    </div>
                  )}
                </div>
              )}
          </>
        )}

        {m.content && (
          <div className="space-y-1 min-w-0 max-w-full">
            <div className="text-[15.5px] sm:text-[16px] leading-relaxed text-inherit whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              <span>{msgTranslations[m.id] || m.content}</span>
              {inlineTimestampNode}
            </div>
            {msgTranslations[m.id] && (
              <button
                type="button"
                onClick={() => setMsgTranslations((prev) => ({ ...prev, [m.id]: null }))}
                className="text-cap-s text-lab-sc underline cursor-pointer block mt-1"
              >
                Translated · Show original
              </button>
            )}
          </div>
        )}

        {m.linkSnapshot?.url && (
          <div className="space-y-1">
            <a
              href={m.linkSnapshot.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'block rounded-xl p-2.5 border text-left transition-opacity hover:opacity-90 w-full max-w-full min-w-0 overflow-hidden',
                middleFullScreen ? 'md:max-w-lg lg:max-w-xl' : 'md:max-w-md',
                boxClass
              )}
            >
              <div className="flex items-center justify-between gap-2 text-cap-s text-lab-sc min-w-0">
                <span className="truncate">{m.linkSnapshot.domain || m.linkSnapshot.url}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </div>
              {m.linkSnapshot.title && (
                <p className="text-cap-l font-semibold text-lab-pr mt-0.5 line-clamp-1 [overflow-wrap:anywhere]">
                  {m.linkSnapshot.title}
                </p>
              )}
              {m.linkSnapshot.description && (
                <p className="text-cap-s text-lab-sc mt-0.5 line-clamp-2 [overflow-wrap:anywhere]">
                  {m.linkSnapshot.description}
                </p>
              )}
            </a>
            {!m.content && inlineTimestampNode && (
              <div className="flex justify-end pt-0.5">
                {inlineTimestampNode}
              </div>
            )}
          </div>
        )}

        {m.contextRef?.title && (() => {
          const refHref =
            m.contextRef.kind === 'product'
              ? `/marketplace/product/${encodeURIComponent(m.contextRef.hashId || m.contextRef.id)}`
              : '/jobs';
          return (
            <div className="space-y-1">
              <Link
                href={refHref}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl p-2 border transition-opacity hover:opacity-90 w-full max-w-full min-w-0 overflow-hidden text-left',
                  middleFullScreen ? 'md:max-w-lg lg:max-w-xl' : 'md:max-w-md',
                  boxClass
                )}
              >
                {m.contextRef.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={m.contextRef.imageUrl}
                    alt={m.contextRef.title}
                    loading="lazy"
                    decoding="async"
                    className="size-11 rounded-lg object-cover shrink-0 bg-fill-qt"
                  />
                ) : null}
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="text-[11px] uppercase tracking-wide font-semibold text-lab-sc truncate">
                    {m.contextRef.kind === 'product' ? 'Marketplace Product' : 'Job Listing'}
                  </p>
                  <p className="text-cap-l font-semibold text-lab-pr truncate">{m.contextRef.title}</p>
                  {m.contextRef.priceLabel ? (
                    <p className="text-cap-s font-semibold text-brand-900 truncate">{m.contextRef.priceLabel}</p>
                  ) : null}
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-lab-sc shrink-0" />
              </Link>
              {!m.content && inlineTimestampNode && (
                <div className="flex justify-end pt-0.5">
                  {inlineTimestampNode}
                </div>
              )}
            </div>
          );
        })()}
      </>
    );
  };

  return (
    <div
      className={cn(
        'flex overflow-hidden bg-bg-pr w-full max-w-full h-full overscroll-none',
        (isDraggingLeft || isDraggingRight) && 'select-none cursor-col-resize'
      )}
    >
      {/* Desktop Far-Left Vertical Action Bar (Grupo + PHP MessengerActionBar parity, hidden in Expand mode) */}
      <aside
        className={cn(
          'hidden w-16 shrink-0 h-full max-h-full border-r border-bord-pr bg-bg-pr flex flex-col items-center justify-between py-5 overflow-hidden select-none',
          !middleFullScreen && 'md:flex'
        )}
      >
        <div className="flex flex-col items-center">
          <Link
            href="/"
            title={appName}
            className="size-10 rounded-full flex items-center justify-center hover:bg-fill-fv transition-colors"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} alt={appName} className="size-7 object-contain" />
          </Link>

          <div className="w-6 border-t border-bord-pr my-3" />

          <button
            type="button"
            onClick={() => setNewChatOpen(true)}
            title="New conversation"
            aria-label="New conversation"
            className="size-10 rounded-full flex items-center justify-center text-lab-sc hover:text-lab-pr hover:bg-fill-fv transition-colors cursor-pointer"
          >
            <Plus className="size-5" />
          </button>

          <div className="w-6 border-t border-bord-pr my-3" />

          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => setTab('chats')}
              title="Messages"
              aria-label="Messages"
              className={cn(
                'size-10 rounded-full flex items-center justify-center transition-colors cursor-pointer',
                tab === 'chats' || tab === 'groups'
                  ? 'bg-fill-sc text-lab-pr'
                  : 'text-lab-sc hover:text-lab-pr hover:bg-fill-fv'
              )}
            >
              <MessageCircle className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => setTab('discover')}
              title="Discover Community Groups"
              aria-label="Discover Community Groups"
              className={cn(
                'size-10 rounded-full flex items-center justify-center transition-colors cursor-pointer',
                tab === 'discover'
                  ? 'bg-fill-sc text-brand-900'
                  : 'text-lab-sc hover:text-lab-pr hover:bg-fill-fv'
              )}
            >
              <Compass className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => setTab('invites')}
              title="Group Invites"
              aria-label="Group Invites"
              className={cn(
                'relative size-10 rounded-full flex items-center justify-center transition-colors cursor-pointer',
                tab === 'invites'
                  ? 'bg-fill-sc text-brand-900'
                  : 'text-lab-sc hover:text-lab-pr hover:bg-fill-fv'
              )}
            >
              <Users className="size-5" />
              {inviteCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-brand-900 text-white text-[10px] font-bold flex items-center justify-center px-1">
                  {inviteCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setTab('archive')}
              title="Archive"
              aria-label="Archive"
              className={cn(
                'size-10 rounded-full flex items-center justify-center transition-colors cursor-pointer',
                tab === 'archive'
                  ? 'bg-fill-sc text-lab-pr'
                  : 'text-lab-sc hover:text-lab-pr hover:bg-fill-fv'
              )}
            >
              <Archive className="size-5" />
            </button>
          </div>
        </div>

        <div className="mt-auto shrink-0 flex flex-col items-center gap-3">
          <Link
            href="/settings"
            title="Settings"
            aria-label="Settings"
            className="size-10 rounded-full flex items-center justify-center text-lab-sc hover:text-lab-pr hover:bg-fill-fv transition-colors"
          >
            <Settings className="size-5" />
          </Link>
          <Link href={`/@${user.username}`} title={`@${user.username}`} className="block">
            <Avatar src={user.avatar} alt={user.username} size="sm" />
          </Link>
        </div>
      </aside>

      {/* Left Conversation List (Simplified Grupo aside + Homepage typography, resizable) */}
      <div
        style={{
          '--left-sidebar-w': `${leftSidebarWidth}px`,
        } as React.CSSProperties}
        className={cn(
          'w-full md:w-[var(--left-sidebar-w,360px)] shrink-0 h-full min-h-0 overflow-hidden flex flex-col bg-bg-pr min-w-0',
          activeChatId || middleFullScreen ? (middleFullScreen ? 'hidden' : 'hidden md:flex') : 'flex'
        )}
      >
        <div className="px-4 sm:px-5 pt-[calc(0.875rem+env(safe-area-inset-top,0px))] pb-3.5 border-b border-bord-pr space-y-3 shrink-0 px-safe">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Link
                href="/"
                className="p-1.5 -ml-1.5 rounded-full text-lab-pr hover:bg-fill-tr shrink-0"
                title="Back to Home"
                aria-label="Back to Home"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <h1 className="text-title-3 font-bold text-lab-pr truncate">
                {tab === 'archive' ? 'Archived' : tab === 'invites' ? 'Invites' : 'Messages'}
              </h1>
            </div>
            <button
              type="button"
              onClick={() => setNewChatOpen(true)}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-lab-pr text-bg-pr text-par-s font-semibold hover:opacity-90 transition-opacity cursor-pointer shrink-0"
            >
              <Plus className="h-4 w-4" /> New
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-lab-tr" />
            <input
              type="search"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search chats & rooms..."
              className="w-full h-10 rounded-full bg-fill-qt border border-transparent focus:border-bord-pr pl-10 pr-4 text-par-n text-lab-pr placeholder:text-lab-tr focus:outline-none"
            />
          </div>

          {/* Simplified 3-Pill Switcher + Mobile Invites/Archive access */}
          <div
            onWheel={(e) => {
              if (e.deltaY !== 0) e.currentTarget.scrollLeft += e.deltaY;
            }}
            className="flex items-center gap-1.5 overflow-x-auto hidden-scroll"
          >
            {(
              [
                { key: 'chats', label: 'All Chats' },
                { key: 'groups', label: 'Groups' },
                { key: 'discover', label: 'Discover' },
              ] as const
            ).map((item) => {
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={cn(
                    'flex-1 min-w-fit rounded-full px-3.5 py-2 text-par-s font-semibold transition-colors cursor-pointer whitespace-nowrap',
                    active
                      ? 'bg-brand-900 text-white'
                      : 'bg-fill-qt text-lab-sc hover:text-lab-pr hover:bg-fill-sc'
                  )}
                >
                  {item.label}
                </button>
              );
            })}
            {(inviteCount > 0 || tab === 'invites') && (
              <button
                type="button"
                onClick={() => setTab('invites')}
                className={cn(
                  'md:hidden shrink-0 rounded-full px-3 py-2 text-par-s font-semibold transition-colors cursor-pointer',
                  tab === 'invites'
                    ? 'bg-brand-900 text-white'
                    : 'bg-fill-qt text-lab-sc hover:text-lab-pr'
                )}
              >
                Invites{inviteCount > 0 ? ` (${inviteCount})` : ''}
              </button>
            )}
            <button
              type="button"
              onClick={() => setTab(tab === 'archive' ? 'chats' : 'archive')}
              className={cn(
                'md:hidden shrink-0 rounded-full px-3 py-2 text-par-s font-semibold transition-colors cursor-pointer',
                tab === 'archive'
                  ? 'bg-brand-900 text-white'
                  : 'bg-fill-qt text-lab-sc hover:text-lab-pr'
              )}
            >
              Archive
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-bord-pr pb-safe">
          {tab === 'discover' ? (
            <div className="p-4 sm:p-5 space-y-3.5">
              <div
                onWheel={(e) => {
                  if (e.deltaY !== 0) e.currentTarget.scrollLeft += e.deltaY;
                }}
                className="flex items-center gap-1.5 overflow-x-auto pb-1 hidden-scroll"
              >
                {['All', 'General', 'Tech & Creators', 'Marketplace', 'Gaming', 'Music & Culture', 'Support'].map(
                  (cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setDiscoverCategory(cat)}
                      className={cn(
                        'shrink-0 rounded-full px-3.5 py-1.5 text-cap-l font-semibold transition-colors cursor-pointer',
                        discoverCategory === cat
                          ? 'bg-brand-900 text-white'
                          : 'bg-fill-qt text-lab-sc hover:text-lab-pr'
                      )}
                    >
                      {cat}
                    </button>
                  )
                )}
              </div>

              {loadingDiscover ? (
                <p className="p-4 text-center text-lab-sc text-par-n">Loading rooms...</p>
              ) : discoverGroups.length === 0 ? (
                <div className="p-6 text-center space-y-2.5">
                  <p className="text-par-n text-lab-sc">No public groups found in this category.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setNewChatMode('group');
                      setNewChatOpen(true);
                    }}
                  >
                    Create Community Group
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {discoverGroups.map((item) => {
                    const g = item.group;
                    const entryPrice = Number(g?.entryPrice || 0);
                    const isPaidGroup = Boolean(g?.isPaid && entryPrice > 0);
                    return (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-bord-card bg-fill-qt/40 p-4 space-y-2.5"
                      >
                        <div className="flex items-start gap-3">
                          <Avatar src={g?.avatar} alt={g?.name || 'Group'} size="md" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-par-m font-bold text-lab-pr truncate">
                                {g?.name || 'Community Group'}
                              </p>
                              {g?.verified && <BadgeCheck className="h-4 w-4 text-brand-900 shrink-0" />}
                              {g?.isPinned && <Pin className="h-3.5 w-3.5 text-brand-900 shrink-0" />}
                              {g?.isPasswordProtected && (
                                <Lock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                              )}
                              {isPaidGroup && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-green-600/15 px-2 py-0.5 text-cap-s font-bold text-green-700 dark:text-green-400">
                                  <Coins className="h-3 w-3" /> {formatCurrency(entryPrice, bootstrap?.config?.defaultCurrency || 'NGN', bootstrap?.currencies, locale)}
                                </span>
                              )}
                            </div>
                            <p className="text-cap-l text-lab-sc mt-0.5">
                              {g?.category || 'General'} · {item.membersCount}{' '}
                              {item.membersCount === 1 ? 'member' : 'members'}
                            </p>
                            {g?.description && (
                              <p className="text-par-s text-lab-sc mt-1 line-clamp-2">{g.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          {item.isBanned ? (
                            <span className="text-par-s font-semibold text-red-600">Banned</span>
                          ) : item.isJoined ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => router.push(`/messenger/c/${item.id}`)}
                            >
                              Open Room
                            </Button>
                          ) : item.isPendingApproval ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void handleCancelJoinRequest(item.id)}
                            >
                              Pending · Cancel
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={joiningGroupId === item.id}
                              onClick={() =>
                                void handleJoinGroup(item.id, {
                                  isPasswordProtected: Boolean(g?.isPasswordProtected),
                                  isPaid: isPaidGroup,
                                  entryPrice,
                                  monetizationNote: g?.monetizationNote,
                                  name: g?.name,
                                })
                              }
                            >
                              {isPaidGroup
                                ? `Pay ${formatCurrency(entryPrice, bootstrap?.config?.defaultCurrency || 'NGN', bootstrap?.currencies, locale)} & Join`
                                : g?.requiresApproval
                                  ? 'Request Join'
                                  : g?.isPasswordProtected
                                    ? 'Unlock & Join'
                                    : 'Join Group'}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <>
              {loadingList && <p className="p-4 text-center text-lab-sc text-par-n">Loading...</p>}

              {!loadingList && tab === 'invites' && invites.length === 0 && (
                <p className="p-6 text-center text-lab-sc text-par-n">No pending group invitations.</p>
              )}

              {tab === 'invites' &&
                invites.map((inv) => (
                  <div key={inv._id} className="p-4 sm:p-5 space-y-2.5">
                    <p className="text-par-m font-semibold text-lab-pr">
                      {inv.chatId?.group?.name || 'Group Chat'}
                    </p>
                    <p className="text-par-s text-lab-sc">
                      Invited by @{inv.senderId?.username}
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="primary" onClick={() => respondInvite(inv.chatId._id, true)}>
                        Accept
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => respondInvite(inv.chatId._id, false)}>
                        Decline
                      </Button>
                    </div>
                  </div>
                ))}

              {tab !== 'invites' && !loadingList && visibleChats.length === 0 && (
                <div className="p-6 text-center space-y-3">
                  <p className="text-lab-sc text-par-n">
                    {tab === 'groups' ? 'No group chats yet.' : 'No conversations yet.'}
                  </p>
                  {tab === 'groups' && (
                    <Button size="sm" variant="outline" onClick={() => setTab('discover')}>
                      Browse Community Groups
                    </Button>
                  )}
                </div>
              )}

              {tab !== 'invites' &&
                visibleChats.map((c) => {
                  const title =
                    c.type === 'group'
                      ? c.group?.name || 'Group Chat'
                      : `${c.interlocutor?.firstName || ''} ${c.interlocutor?.lastName || ''}`.trim() ||
                      `@${c.interlocutor?.username}`;
                  const avatarSrc = c.type === 'group' ? c.group?.avatar : c.interlocutor?.avatar;
                  const isOnline = Boolean(
                    c.interlocutor?._id &&
                    (onlineUsers.has(String(c.interlocutor._id)) ||
                      isRecentlyActive(c.interlocutor.lastActive, pollNow, Boolean(socket)))
                  );

                  return (
                    <Link
                      key={c.id}
                      href={`/messenger/c/${c.id}`}
                      className={cn(
                        'flex items-center gap-3.5 px-4 sm:px-5 py-3.5 hover:bg-fill-pr transition-colors',
                        activeChatId === c.id && 'bg-fill-sc'
                      )}
                    >
                      <Avatar src={avatarSrc} alt={title} online={isOnline} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-par-m font-semibold text-lab-pr truncate">{title}</p>
                            {c.type === 'group' && c.group?.verified && (
                              <BadgeCheck className="h-4 w-4 text-brand-900 shrink-0" />
                            )}
                            {c.type === 'group' && c.group?.isPinned && (
                              <Pin className="h-3.5 w-3.5 text-brand-900 shrink-0" />
                            )}
                          </div>
                          <span className="text-cap-l text-lab-tr shrink-0">
                            {formatRelativeTime(c.lastActivity, locale)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <p className="text-par-s text-lab-sc truncate">
                            {c.lastMessagePreview || 'No messages yet'}
                          </p>
                          {c.unreadCount > 0 && (
                            <span className="h-5 min-w-[22px] px-1.5 rounded-full bg-brand-900 text-white text-cap-s font-bold flex items-center justify-center">
                              {c.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
            </>
          )}
        </div>
      </div>

      {/* Draggable Divider Handle between Left Chat List and Middle Chat View */}
      {!middleFullScreen && (
        <div
          role="separator"
          aria-orientation="vertical"
          tabIndex={0}
          onPointerDown={handleLeftResizeStart}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              setLeftSidebarWidth((w) => Math.max(260, w - 20));
            } else if (e.key === 'ArrowRight') {
              setLeftSidebarWidth((w) => Math.min(560, w + 20));
            }
          }}
          className={cn(
            'hidden md:flex relative items-center justify-center w-2 -ml-1 z-20 cursor-col-resize hover:bg-brand-900/40 active:bg-brand-900 transition-colors select-none group shrink-0 border-l border-bord-pr',
            isDraggingLeft && 'bg-brand-900/80 border-brand-900'
          )}
          title="Drag to resize chat list"
        >
          <div className="w-0.5 h-7 rounded-full bg-lab-tr group-hover:bg-brand-900 transition-colors" />
        </div>
      )}

      {/* Right Active Thread */}
      <div
        className={cn(
          'flex-1 flex flex-col bg-bg-pr min-w-0 min-h-0 h-full max-h-full overflow-hidden relative',
          activeChatId ? 'flex w-full md:flex-1' : 'hidden md:flex md:flex-1'
        )}
      >
        {!activeChatId ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <EmptyState
              icon={Users}
              title="Select a conversation"
              description="Choose an existing chat or start a new direct or group conversation."
              action={
                <Button variant="primary" onClick={() => setNewChatOpen(true)}>
                  Start Conversation
                </Button>
              }
            />
          </div>
        ) : !activeChat ? (
          <div className="flex-1 flex flex-col bg-bg-pr animate-pulse">
            <div className="pt-safe px-safe border-b border-bord-pr">
              <div className="h-16 px-4 flex items-center gap-3">
                <Link
                  href="/messenger"
                  className="md:hidden p-1.5 -ml-1.5 rounded-full text-lab-pr hover:bg-fill-tr shrink-0"
                  aria-label="Back to Messenger"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Link>
                <div className="size-10 rounded-full bg-fill-sc shrink-0" />
                <div className="space-y-1.5 flex-1 max-w-[180px]">
                  <div className="h-3.5 w-32 rounded-full bg-fill-sc" />
                  <div className="h-2.5 w-20 rounded-full bg-fill-sc" />
                </div>
              </div>
            </div>
            <div className="flex-1 p-4 space-y-4 overflow-hidden">
              <div className="h-10 w-52 rounded-2xl bg-fill-fv" />
              <div className="h-12 w-64 rounded-2xl bg-fill-fv ml-auto" />
              <div className="h-9 w-44 rounded-2xl bg-fill-fv" />
              <div className="h-14 w-60 rounded-2xl bg-fill-fv ml-auto" />
            </div>
          </div>
        ) : (
          <>
            {/* Thread Header (PHP ChatHeader.vue px-6 h-16 parity) */}
            <div className="border-b border-bord-pr bg-bg-pr shrink-0 pt-safe px-safe">
              <div
                className={cn(
                  'h-16 px-4 sm:px-6 md:px-8 flex items-center justify-between gap-2 transition-all',
                  middleFullScreen
                    ? 'max-w-[1040px] lg:max-w-[1140px] mx-auto w-full'
                    : 'max-w-[840px] mx-auto w-full'
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Link
                    href="/messenger"
                    className="md:hidden p-1.5 -ml-1.5 rounded-full text-lab-pr hover:bg-fill-tr shrink-0"
                    aria-label="Back to Messenger"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Link>

                  <button
                    type="button"
                    onClick={() => {
                      if (middleFullScreen) setMiddleFullScreen(false);
                      if (activeChat.type === 'group') {
                        setGroupInfoOpen((prev) => !prev);
                      } else {
                        setDirectInfoOpen((prev) => !prev);
                      }
                    }}
                    className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
                  >
                    <Avatar
                      src={activeAvatar}
                      alt={activeTitle}
                      online={activeChat.type === 'direct' ? interlocutorOnline : false}
                      size="md"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-par-l font-bold text-lab-pr truncate">{activeTitle}</p>
                        {activeChat.type === 'group' && activeChat.group?.verified && (
                          <BadgeCheck className="h-4 w-4 text-brand-900 shrink-0" />
                        )}
                        {activeChat.type === 'group' && activeChat.group?.category && (
                          <span className="hidden sm:inline-flex rounded-full bg-fill-qt px-2.5 py-0.5 text-cap-s font-semibold text-lab-sc shrink-0">
                            {activeChat.group.category}
                          </span>
                        )}
                      </div>
                      {typingUsers.length > 0 ? (
                        <p className="text-par-s text-green-600 font-medium animate-pulse truncate">
                          {activeChat.type === 'group' ? `${typingNames} typing...` : 'typing...'}
                        </p>
                      ) : activeChat.type === 'group' ? (
                        <p className="text-par-s text-lab-sc truncate">
                          {activeChat.participants?.length ?? activeChat.membersCount ?? 0} members · Click to view info
                        </p>
                      ) : interlocutorOnline ? (
                        <p className="text-par-s text-green-600 font-medium truncate">Online</p>
                      ) : (
                        <p className="text-par-s text-lab-sc truncate">
                          {interlocutor?.lastActive
                            ? `Active ${formatRelativeTime(interlocutor.lastActive, locale)}`
                            : interlocutor?.username
                              ? `@${interlocutor.username}`
                              : ''}
                        </p>
                      )}
                    </div>
                  </button>
                </div>

                {!joinPreviewStatus && (
                  <div className="flex items-center gap-1 shrink-0 relative">
                    <button
                      type="button"
                      onClick={() => handleStartCall('audio')}
                      className={cn(
                        'size-9 rounded-full flex items-center justify-center text-lab-sc hover:text-lab-pr hover:bg-fill-fv cursor-pointer transition-colors',
                        (callMode === 'audio' || activeCall?.audioOnly) &&
                        'bg-green-600/15 text-green-600'
                      )}
                      title={activeCall?.audioOnly ? 'Join active audio call' : 'Start audio call'}
                      aria-label="Audio call"
                    >
                      <GrupoVoiceCallIcon className="size-[19px]" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStartCall('video')}
                      className={cn(
                        'size-9 rounded-full flex items-center justify-center text-lab-sc hover:text-lab-pr hover:bg-fill-fv cursor-pointer transition-colors',
                        (callMode === 'video' || (activeCall && !activeCall.audioOnly)) &&
                        'bg-brand-900/15 text-brand-900'
                      )}
                      title={
                        activeCall && !activeCall.audioOnly ? 'Join active video call' : 'Start video call'
                      }
                      aria-label="Video call"
                    >
                      <GrupoVideoCallIcon className="size-[20px]" />
                    </button>

                    {/* Exact Grupo Pro Expand Chat Icon & toggle_middle_full_screen Usage */}
                    <button
                      type="button"
                      onClick={() => {
                        setMiddleFullScreen((prev) => {
                          const next = !prev;
                          if (next) {
                            setGroupInfoOpen(false);
                            setDirectInfoOpen(false);
                          }
                          return next;
                        });
                      }}
                      className={cn(
                        'hidden md:inline-flex size-9 rounded-full items-center justify-center text-lab-sc hover:text-lab-pr hover:bg-fill-fv cursor-pointer transition-colors',
                        middleFullScreen && 'bg-brand-900/15 text-brand-900'
                      )}
                      title={middleFullScreen ? 'Restore sidebar layout' : 'Expand chat full screen'}
                      aria-label={middleFullScreen ? 'Restore sidebar layout' : 'Expand chat full screen'}
                    >
                      <GrupoExpandChatIcon expanded={middleFullScreen} className="size-[19px]" />
                    </button>

                    {/* Conversation options with hover open & auto-close on mouse leave */}
                    <div
                      className="relative shrink-0"
                      onMouseEnter={handleThreadMenuEnter}
                      onMouseLeave={handleThreadMenuLeave}
                    >
                      <button
                        type="button"
                        onClick={() => setThreadMenuOpen((prev) => !prev)}
                        className={cn(
                          'size-9 rounded-full flex items-center justify-center text-lab-sc hover:text-lab-pr hover:bg-fill-fv cursor-pointer transition-colors',
                          threadMenuOpen && 'bg-fill-sc text-lab-pr'
                        )}
                        title="Conversation options"
                        aria-label="Conversation options"
                      >
                        <GrupoOptionsIcon className="size-[19px]" />
                      </button>

                      {threadMenuOpen && (
                        <div
                          className="absolute right-0 top-11 z-30 w-56 rounded-2xl border border-bord-pr bg-bg-pr shadow-xl py-1.5 divide-y divide-bord-tr"
                          onMouseEnter={handleThreadMenuEnter}
                          onMouseLeave={handleThreadMenuLeave}
                        >
                          <div className="pb-1">
                            <button
                              type="button"
                              onClick={() => {
                                setThreadMenuOpen(false);
                                if (middleFullScreen) setMiddleFullScreen(false);
                                if (activeChat.type === 'group') {
                                  setGroupInfoOpen((prev) => !prev);
                                } else {
                                  setDirectInfoOpen((prev) => !prev);
                                }
                              }}
                              className="w-full px-3.5 py-2 text-left text-par-n text-lab-pr hover:bg-fill-pr flex items-center gap-2.5 cursor-pointer"
                            >
                              <Info className="h-4 w-4 text-lab-sc" />
                              {activeChat.type === 'group' ? 'Group info & members' : 'Conversation info'}
                            </button>

                            {/* Tip Support option */}
                            {activeChat.type === 'group' ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setThreadMenuOpen(false);
                                  setGroupInfoOpen(true);
                                }}
                                className="w-full px-3.5 py-2 text-left text-par-n text-brand-900 font-semibold hover:bg-fill-pr flex items-center gap-2.5 cursor-pointer"
                              >
                                <Coins className="h-4 w-4 text-brand-900" />
                                Support Creator (Tip)
                              </button>
                            ) : interlocutor ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setThreadMenuOpen(false);
                                  setTipDirectUserModalOpen(true);
                                }}
                                className="w-full px-3.5 py-2 text-left text-par-n text-brand-900 font-semibold hover:bg-fill-pr flex items-center gap-2.5 cursor-pointer"
                              >
                                <Coins className="h-4 w-4 text-brand-900" />
                                Send Tip to @{interlocutor.username}
                              </button>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => {
                                setThreadMenuOpen(false);
                                setThreadSearchOpen((prev) => {
                                  if (prev) setThreadSearchQ('');
                                  return !prev;
                                });
                              }}
                              className="w-full px-3.5 py-2 text-left text-par-n text-lab-pr hover:bg-fill-pr flex items-center gap-2.5 cursor-pointer"
                            >
                              <Search className="h-4 w-4 text-lab-sc" />
                              {threadSearchOpen ? 'Close message search' : 'Search messages'}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setChatMuted((prev) => !prev);
                                setThreadMenuOpen(false);
                              }}
                              className="w-full px-3.5 py-2 text-left text-par-n text-lab-pr hover:bg-fill-pr flex items-center gap-2.5 cursor-pointer"
                            >
                              {chatMuted ? (
                                <>
                                  <Volume2 className="h-4 w-4 text-lab-sc" />
                                  Unmute notifications
                                </>
                              ) : (
                                <>
                                  <VolumeX className="h-4 w-4 text-lab-sc" />
                                  Mute notifications
                                </>
                              )}
                            </button>
                          </div>

                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() => handleChatAction(isArchivedChat ? 'unarchive' : 'archive')}
                              className="w-full px-3.5 py-2 text-left text-par-n text-lab-pr hover:bg-fill-pr flex items-center gap-2.5 cursor-pointer"
                            >
                              <Archive className="h-4 w-4 text-lab-sc" />
                              {isArchivedChat ? 'Unarchive chat' : 'Archive chat'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleChatAction('clear')}
                              className="w-full px-3.5 py-2 text-left text-par-n text-lab-pr hover:bg-fill-pr flex items-center gap-2.5 cursor-pointer"
                            >
                              <X className="h-4 w-4 text-lab-sc" />
                              Clear history
                            </button>
                            {activeChat.type === 'group' && myParticipantRole !== 'owner' && (
                              <button
                                type="button"
                                onClick={() => handleChatAction('leave_group')}
                                className="w-full px-3.5 py-2 text-left text-par-n text-red-600 hover:bg-fill-pr flex items-center gap-2.5 cursor-pointer"
                              >
                                <LogOut className="h-4 w-4" />
                                Leave group
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleChatAction('delete')}
                              className="w-full px-3.5 py-2 text-left text-par-n text-red-600 hover:bg-fill-pr flex items-center gap-2.5 cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                              {activeChat.type === 'group' && myParticipantRole === 'owner'
                                ? 'Delete group'
                                : 'Delete chat'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {threadSearchOpen && (
                <div className="px-4 pb-3">
                  <div className={cn('relative', middleFullScreen && 'max-w-[1040px] lg:max-w-[1140px] mx-auto')}>
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-lab-tr" />
                    <input
                      type="search"
                      autoFocus
                      value={threadSearchQ}
                      onChange={(e) => setThreadSearchQ(e.target.value)}
                      placeholder="Search messages in this chat..."
                      className="w-full h-9 rounded-full bg-fill-qt border border-bord-card pl-9 pr-8 text-[16px] md:text-par-n text-lab-pr placeholder:text-lab-tr focus:outline-none focus:border-bord-pr"
                    />
                    {threadSearchQ && (
                      <button
                        type="button"
                        onClick={() => setThreadSearchQ('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-lab-tr hover:text-lab-pr cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {joinPreviewStatus ? (
              <div className="flex-1 flex items-center justify-center p-6">
                <div className="w-full max-w-md rounded-3xl border border-bord-pr bg-bg-pr p-6 text-center space-y-4 shadow-sm">
                  <div className="flex justify-center">
                    <Avatar src={activeAvatar} alt={activeTitle} size="lg" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-center gap-1.5">
                      <h2 className="text-title-3 font-bold text-lab-pr">{activeTitle}</h2>
                      {activeChat.group?.verified && (
                        <BadgeCheck className="h-4 w-4 text-brand-900 shrink-0" />
                      )}
                    </div>
                    <p className="text-par-s text-lab-sc">
                      {activeChat.group?.category || 'General'} · {activeChat.membersCount ?? 0} members
                    </p>
                    {activeChat.group?.isPaid && (activeChat.group?.entryPrice || 0) > 0 && (
                      <div className="inline-flex items-center gap-1.5 rounded-full bg-green-600/15 px-3 py-1 text-par-s font-bold text-green-700 dark:text-green-400">
                        <Coins className="h-4 w-4" /> Paid Group · {formatCurrency(Number(activeChat.group.entryPrice), bootstrap?.config?.defaultCurrency || 'NGN', bootstrap?.currencies, locale)} Entry
                      </div>
                    )}
                  </div>
                  {activeChat.group?.description && (
                    <p className="text-par-n text-lab-sc leading-relaxed">
                      {activeChat.group.description}
                    </p>
                  )}
                  {activeChat.group?.monetizationNote && (
                    <p className="text-par-s font-medium text-brand-900">
                      {activeChat.group.monetizationNote}
                    </p>
                  )}

                  {joinPreviewStatus === 'banned' ? (
                    <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-3 text-par-s font-semibold text-red-600">
                      You have been banned from joining this group.
                    </div>
                  ) : joinPreviewStatus === 'pending' ? (
                    <div className="space-y-2">
                      <p className="text-par-s font-medium text-brand-900">
                        Your join request is awaiting admin approval.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleCancelJoinRequest(activeChat.id)}
                      >
                        Cancel Request
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="primary"
                      className="w-full"
                      disabled={joiningGroupId === activeChat.id}
                      onClick={() =>
                        void handleJoinGroup(activeChat.id, {
                          isPasswordProtected: Boolean(activeChat.group?.isPasswordProtected),
                          isPaid: Boolean(activeChat.group?.isPaid && (activeChat.group?.entryPrice || 0) > 0),
                          entryPrice: activeChat.group?.entryPrice,
                          monetizationNote: activeChat.group?.monetizationNote,
                          name: activeTitle,
                        })
                      }
                    >
                      {activeChat.group?.isPaid && (activeChat.group?.entryPrice || 0) > 0
                        ? `Pay ${formatCurrency(Number(activeChat.group.entryPrice), bootstrap?.config?.defaultCurrency || 'NGN', bootstrap?.currencies, locale)} & Join`
                        : activeChat.group?.isPasswordProtected
                          ? 'Enter Password & Join Group'
                          : activeChat.group?.requiresApproval
                            ? 'Request to Join Group'
                            : 'Join Community Group'}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Active incoming/ongoing call join strip */}
                {activeCall && !callMode && (
                  <div className="px-4 py-2 border-b border-bord-pr bg-green-600/10 shrink-0">
                    <div
                      className={cn(
                        'w-full flex items-center justify-between gap-3',
                        middleFullScreen && 'max-w-[1040px] lg:max-w-[1140px] mx-auto'
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-2.5 w-2.5 rounded-full bg-green-600 animate-pulse shrink-0" />
                        <p className="text-cap-l font-semibold text-lab-pr truncate">
                          {activeCall.audioOnly ? 'Live Audio Call' : 'Live Video Call'} in progress (
                          {activeCall.participantCount} joined)
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        onClick={() => handleStartCall(activeCall.audioOnly ? 'audio' : 'video')}
                      >
                        {activeCall.audioOnly ? (
                          <Phone className="h-3.5 w-3.5" />
                        ) : (
                          <Video className="h-3.5 w-3.5" />
                        )}
                        Join
                      </Button>
                    </div>
                  </div>
                )}

                {/* WebRTC Video / Audio / Screen-Sharing Stage */}
                {callMode && (
                  <VideoCallStage
                    chatId={activeChat.id}
                    chatType={activeChat.type}
                    audioOnly={callMode === 'audio'}
                    currentUser={{
                      id: user.id,
                      username: user.username,
                      firstName: user.firstName,
                      lastName: user.lastName,
                      avatar: user.avatar,
                    }}
                    isGroupAdmin={
                      activeChat.type === 'group' &&
                      (myParticipantRole === 'owner' || myParticipantRole === 'admin')
                    }
                    socket={socket}
                    chatWindowVisible={showChatInCall}
                    onToggleChatWindow={() => setShowChatInCall((v) => !v)}
                    onExit={() => {
                      setCallMode(null);
                      setShowChatInCall(false);
                      void loadConversation(activeChat.id, '', true);
                    }}
                  />
                )}

                {/* Pinned Messages Carousel (Grupo Pro parity) */}
                {currentPinned && pinnedMessages.length > 0 && (!callMode || showChatInCall) && (
                  <div className="px-4 sm:px-6 md:px-8 py-2.5 border-b border-bord-card bg-fill-qt shrink-0">
                    <div
                      className={cn(
                        'w-full flex items-center justify-between gap-2',
                        middleFullScreen
                          ? 'max-w-[1040px] lg:max-w-[1140px] mx-auto'
                          : 'max-w-[840px] mx-auto'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const el = document.getElementById(`msg-${currentPinned.id}`);
                          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-900/15 text-brand-900">
                          <Pin className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-cap-l font-bold text-brand-900 truncate">
                            Pinned Message {pinnedMessages.length > 1 ? `(${safePinIdx + 1}/${pinnedMessages.length})` : ''}
                          </p>
                          <p className="text-par-s text-lab-pr truncate">
                            {getMessagePreviewLabel(currentPinned)}
                          </p>
                        </div>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        {pinnedMessages.length > 1 && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setPinIndex((prev) => (prev - 1 + pinnedMessages.length) % pinnedMessages.length)
                              }
                              className="p-1 rounded-full text-lab-sc hover:text-lab-pr hover:bg-fill-fv cursor-pointer"
                              title="Previous pinned message"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setPinIndex((prev) => (prev + 1) % pinnedMessages.length)}
                              className="p-1 rounded-full text-lab-sc hover:text-lab-pr hover:bg-fill-fv cursor-pointer"
                              title="Next pinned message"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => void handlePinToggle(currentPinned.id)}
                          className="p-1 rounded-full text-lab-sc hover:text-red-600 hover:bg-fill-fv cursor-pointer"
                          title="Unpin message"
                        >
                          <PinOff className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Messages Timeline (Previous theme colors + Telegram layout & proper margins) */}
                <div
                  className={cn(
                    'flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain py-4 px-4 sm:px-6 md:px-8 px-safe space-y-2 bg-fill-fv/35',
                    callMode && !showChatInCall && 'hidden'
                  )}
                >
                  <div
                    className={cn(
                      'mx-auto w-full space-y-2 transition-all duration-150',
                      middleFullScreen
                        ? 'max-w-[1040px] lg:max-w-[1140px]'
                        : 'max-w-[840px]'
                    )}
                  >
                    {!loadingThread && !threadSearchQ && (
                      <div className="border-b border-bord-card/60 px-4 py-5 mb-2 text-center">
                        <div className="flex justify-center mb-2.5">
                          <Avatar src={activeAvatar} alt={activeTitle} size="lg" />
                        </div>
                        <div className="flex items-center justify-center gap-1">
                          <h3 className="text-par-l font-bold text-lab-pr">{activeTitle}</h3>
                          {activeChat.type === 'direct' && interlocutor?.verified && (
                            <BadgeCheck className="size-4 text-brand-900 shrink-0" />
                          )}
                        </div>
                        {activeChat.type === 'group' ? (
                          <p className="text-cap-l text-lab-sc mt-1">
                            {activeChat.group?.description || `${activeChat.participants?.length || 0} participants`}
                          </p>
                        ) : (
                          <>
                            <p className="text-cap-l text-lab-sc mt-0.5">
                              @{interlocutor?.username}
                              {interlocutor?.lastActive
                                ? ` · Last active ${formatRelativeTime(interlocutor.lastActive, locale)}`
                                : ''}
                            </p>
                            {interlocutor?.username && (
                              <div className="mt-2.5">
                                <Link
                                  href={`/@${interlocutor.username}`}
                                  className="inline-flex items-center rounded-full border border-bord-pr px-3.5 py-1 text-cap-l font-medium text-lab-pr hover:bg-fill-fv transition-colors"
                                >
                                  View profile
                                </Link>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {loadingThread && messages.length === 0 && (
                      <div className="space-y-3 animate-pulse py-2 px-2 sm:px-4">
                        <div className="h-10 w-52 rounded-2xl bg-fill-fv" />
                        <div className="h-12 w-64 rounded-2xl bg-fill-fv ml-auto" />
                        <div className="h-9 w-44 rounded-2xl bg-fill-fv" />
                        <div className="h-14 w-60 rounded-2xl bg-fill-fv ml-auto" />
                      </div>
                    )}

                    {!loadingThread && messages.length === 0 && (
                      <p className="text-center text-par-n text-lab-sc py-12">
                        {threadSearchQ ? 'No matching messages found.' : 'Say hello to start the conversation!'}
                      </p>
                    )}

                    {messages.map((m, idx) => {
                      const mine = String(m.sender?._id || m.senderId) === user.id;
                      const readByOther = (m.readBy || []).some((id) => String(id) !== user.id);
                      const prevMsg = idx > 0 ? messages[idx - 1] : null;
                      const showDateDivider = !prevMsg || getDateKey(prevMsg.createdAt) !== getDateKey(m.createdAt);
                      const prevSenderId = prevMsg ? String(prevMsg.sender?._id || prevMsg.senderId) : '';
                      const currSenderId = String(m.sender?._id || m.senderId);
                      const timeDiffMs = prevMsg
                        ? new Date(m.createdAt).getTime() - new Date(prevMsg.createdAt).getTime()
                        : Number.POSITIVE_INFINITY;

                      const nextMsg = idx < messages.length - 1 ? messages[idx + 1] : null;
                      const isNextDateDivider = !nextMsg || getDateKey(nextMsg.createdAt) !== getDateKey(m.createdAt);
                      const nextSenderId = nextMsg ? String(nextMsg.sender?._id || nextMsg.senderId) : '';
                      const nextTimeDiffMs = nextMsg
                        ? new Date(nextMsg.createdAt).getTime() - new Date(m.createdAt).getTime()
                        : Number.POSITIVE_INFINITY;

                      const isFirstInCluster =
                        !prevMsg ||
                        showDateDivider ||
                        prevMsg.type === 'system' ||
                        prevSenderId !== currSenderId ||
                        timeDiffMs > 300_000;

                      const isLastInCluster =
                        !nextMsg ||
                        isNextDateDivider ||
                        nextMsg.type === 'system' ||
                        nextSenderId !== currSenderId ||
                        nextTimeDiffMs > 300_000;

                      const senderName =
                        `${m.sender?.firstName || ''} ${m.sender?.lastName || ''}`.trim() ||
                        (m.sender?.username ? `@${m.sender.username}` : 'User');
                      const isStickerOnly = m.type === 'sticker' && !m.content && !m.parentId && !m.isDeleted;
                      const isGroupChat = activeChat.type === 'group';

                      if (m.type === 'system') {
                        return (
                          <React.Fragment key={m.id}>
                            <span id={`msg-${m.id}`} className="sr-only" />
                            {showDateDivider && (
                              <div className="sticky top-2 z-10 flex justify-center py-2 pointer-events-none">
                                <span className="px-3.5 py-1 rounded-full bg-fill-sc border border-bord-card/60 text-par-s text-lab-sc font-medium shadow-xs select-none backdrop-blur-xs">
                                  {formatDateDivider(m.createdAt, locale)}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-center py-1 select-none">
                              {renderMessageBody(m, 'desktop')}
                            </div>
                          </React.Fragment>
                        );
                      }

                      const inlineTimestampNode = (
                        <span className="float-right ml-2.5 mt-1 -mb-0.5 inline-flex items-center gap-0.5 text-[12px] sm:text-[12.5px] select-none text-lab-sc tabular-nums">
                          {m.isEdited && <span className="text-[10.5px] italic mr-0.5">edited</span>}
                          <span>{formatMessageTime(m.createdAt, locale)}</span>
                          {mine &&
                            (readByOther ? (
                              <CheckCheck className="h-3.5 w-3.5 text-brand-900 shrink-0 ml-0.5" />
                            ) : (
                              <Check className="h-3.5 w-3.5 text-lab-tr shrink-0 ml-0.5" />
                            ))}
                        </span>
                      );

                      return (
                        <React.Fragment key={m.id}>
                          <span id={`msg-${m.id}`} className="sr-only" />
                          {showDateDivider && (
                            <div className="sticky top-2 z-10 flex justify-center py-2 pointer-events-none">
                              <span className="px-3.5 py-1 rounded-full bg-fill-sc border border-bord-card/60 text-par-s text-lab-sc font-medium shadow-xs select-none backdrop-blur-xs">
                                {formatDateDivider(m.createdAt, locale)}
                              </span>
                            </div>
                          )}

                          <div
                            onDoubleClick={() => {
                              if (m.isDeleted) return;
                              setReplyTo(m);
                              messageInputRef.current?.focus();
                            }}
                            className={cn(
                              'flex items-end gap-2 group relative w-full min-w-0 transition-all',
                              mine ? 'justify-end' : 'justify-start',
                              isFirstInCluster ? 'mt-3 mb-0.5' : 'mt-0.5 mb-0.5'
                            )}
                          >
                            {/* Telegram Group Avatar (at bottom of cluster, incoming only) */}
                            {!mine && isGroupChat && (
                              <div className="w-7 shrink-0 flex flex-col justify-end self-end mb-0.5">
                                {isLastInCluster ? (
                                  <Avatar src={m.sender?.avatar} alt={m.sender?.username} size="xs" />
                                ) : (
                                  <div className="w-6 h-6" />
                                )}
                              </div>
                            )}

                            <div
                              className={cn(
                                'min-w-0 flex flex-col transition-all',
                                middleFullScreen
                                  ? 'max-w-[85%] sm:max-w-[72%] lg:max-w-[60%] xl:max-w-[52%]'
                                  : 'max-w-[85%] sm:max-w-[76%] lg:max-w-[68%]',
                                mine ? 'items-end' : 'items-start'
                              )}
                            >
                              <div
                                className={cn(
                                  'flex items-center gap-1.5 max-w-full min-w-0',
                                  mine && 'flex-row-reverse'
                                )}
                              >
                                <div
                                  className={cn(
                                    'min-w-0 max-w-full overflow-hidden space-y-1',
                                    isStickerOnly
                                      ? 'bg-transparent border-0 shadow-none p-0'
                                      : cn(
                                        'rounded-2xl px-4 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
                                        mine
                                          ? cn(
                                            'bg-fill-qt border border-bord-pr/80 text-lab-pr',
                                            isLastInCluster ? 'rounded-br-[4px]' : 'rounded-br-2xl'
                                          )
                                          : cn(
                                            'bg-bg-pr border border-bord-card text-lab-pr',
                                            isLastInCluster ? 'rounded-bl-[4px]' : 'rounded-bl-2xl'
                                          )
                                      )
                                  )}
                                >
                                  {/* Telegram Group Sender Name inside bubble */}
                                  {!mine && isGroupChat && isFirstInCluster && (
                                    <div className="font-semibold text-[14px] text-brand-900 hover:underline mb-1 truncate cursor-pointer select-none">
                                      {senderName}
                                    </div>
                                  )}

                                  {/* Telegram Quote Reply Block */}
                                  {m.parentId && !m.isDeleted && (
                                    <div
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const el = document.getElementById(`msg-${m.parentId?.id}`);
                                        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                      }}
                                      className="max-w-full min-w-0 overflow-hidden rounded-md px-2.5 py-1 mb-1.5 border-l-[3px] border-brand-900 bg-fill-fv/80 text-left cursor-pointer hover:bg-fill-sc transition-colors"
                                    >
                                      <p className="text-[13px] font-semibold text-brand-900 truncate">
                                        {m.parentId.senderId?.firstName || m.parentId.senderId?.username || 'Reply'}
                                      </p>
                                      <p className="text-[13.5px] text-lab-sc truncate">
                                        {getMessagePreviewLabel(m.parentId)}
                                      </p>
                                    </div>
                                  )}

                                  <div className="space-y-1 text-left">
                                    {renderMessageBody(m, mine ? 'mobile-mine' : 'mobile-other', inlineTimestampNode)}
                                  </div>
                                </div>

                                {!m.isDeleted && (
                                  <button
                                    type="button"
                                    onClick={() => setMobileActionMsg(m)}
                                    className="shrink-0 size-7 rounded-full flex items-center justify-center text-lab-tr hover:text-lab-pr hover:bg-fill-sc md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer self-center"
                                    title="Message options"
                                    aria-label="Message actions"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </button>
                                )}
                              </div>

                              {m.reactionSummary && m.reactionSummary.length > 0 && (
                                <div
                                  className={cn(
                                    'flex flex-wrap gap-1 pt-1',
                                    mine ? 'justify-end' : 'justify-start'
                                  )}
                                >
                                  {m.reactionSummary.map((rs) => (
                                    <button
                                      key={rs.unifiedId}
                                      type="button"
                                      onClick={() => handleToggleReaction(m.id, rs.unifiedId, rs.nativeSymbol)}
                                      className="inline-flex items-center gap-1 rounded-full bg-bg-pr border border-bord-card px-2 py-0.5 text-cap-s text-lab-pr hover:bg-fill-sc cursor-pointer shadow-xs"
                                    >
                                      <span>{rs.nativeSymbol}</span>
                                      <span className="font-semibold text-lab-sc text-[11px]">
                                        {rs.count}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}

                    {typingUsers.length > 0 && (
                      <div className="flex items-end gap-2 justify-start px-1 py-1">
                        <div className="rounded-2xl rounded-bl-[4px] bg-bg-pr border border-bord-card px-3.5 py-2.5 flex items-center gap-1.5 shadow-xs">
                          <span className="h-1.5 w-1.5 rounded-full bg-lab-sc animate-bounce [animation-delay:-0.3s]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-lab-sc animate-bounce [animation-delay:-0.15s]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-lab-sc animate-bounce" />
                        </div>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {(!callMode || showChatInCall) && (
                  <>
                    {/* Reply Preview Banner (Telegram style) */}
                    {replyTo && (
                      <div className="border-t border-bord-pr bg-bg-pr px-4 sm:px-6 md:px-8 py-2 shrink-0 shadow-xs">
                        <div
                          className={cn(
                            'w-full flex items-center justify-between gap-3',
                            middleFullScreen ? 'max-w-[1040px] lg:max-w-[1140px] mx-auto' : 'max-w-[840px] mx-auto'
                          )}
                        >
                          <div className="min-w-0 border-l-[3px] border-brand-900 dark:border-emerald-400 pl-2.5">
                            <p className="text-cap-s font-bold text-brand-900 dark:text-emerald-400 truncate">
                              Replying to {replyTo.sender?.firstName || replyTo.sender?.username || 'Message'}
                            </p>
                            <p className="text-cap-l text-lab-sc truncate">{getMessagePreviewLabel(replyTo)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setReplyTo(null)}
                            className="p-1 rounded-full text-lab-sc hover:text-lab-pr hover:bg-fill-fv cursor-pointer shrink-0"
                            aria-label="Cancel reply"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Upload Progress Bar */}
                    {uploadingMedia && (
                      <div className="border-t border-bord-pr bg-fill-qt px-4 sm:px-6 md:px-8 py-2 shrink-0">
                        <div
                          className={cn(
                            'w-full flex items-center gap-3',
                            middleFullScreen ? 'max-w-[1040px] lg:max-w-[1140px] mx-auto' : 'max-w-[840px] mx-auto'
                          )}
                        >
                          <div className="flex-1 h-1.5 rounded-full bg-fill-sc overflow-hidden">
                            <div
                              className="h-full bg-brand-900 transition-all"
                              style={{ width: `${uploadProgress ?? 40}%` }}
                            />
                          </div>
                          <span className="text-cap-s text-lab-sc shrink-0">
                            Uploading to R2{uploadProgress !== null ? ` (${uploadProgress}%)` : '...'}
                          </span>
                        </div>
                      </div>
                    )}

                    {showGifPicker && !recording && (
                      <div className="px-4 sm:px-6 md:px-8 py-2 border-t border-bord-pr bg-bg-pr shrink-0">
                        <div
                          className={cn(
                            'w-full',
                            middleFullScreen ? 'max-w-[1040px] lg:max-w-[1140px] mx-auto' : 'max-w-[840px] mx-auto'
                          )}
                        >
                          <GiphyPicker
                            onSelect={(url) => void handleSendGif(url)}
                            onClose={() => setShowGifPicker(false)}
                          />
                        </div>
                      </div>
                    )}

                    {/* Composer (matches PHP ChatForm + AudioRecorder.vue) */}
                    {isGroupMuted || isReadOnlyRoom ? (
                      <div className="sticky bottom-0 z-20 w-full px-4 sm:px-6 md:px-8 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] border-t border-bord-pr bg-fill-qt shrink-0">
                        <div
                          className={cn(
                            'w-full flex items-center justify-center gap-2 text-cap-l text-lab-sc',
                            middleFullScreen ? 'max-w-[1040px] lg:max-w-[1140px] mx-auto' : 'max-w-[840px] mx-auto'
                          )}
                        >
                          <MessageSquareOff className="h-4 w-4 text-lab-sc shrink-0" />
                          <span>
                            {isGroupMuted
                              ? 'You are muted in this group and cannot send messages.'
                              : 'Only group admins and owners can post messages in this room.'}
                          </span>
                        </div>
                      </div>
                    ) : recording ? (
                      <div className="sticky bottom-0 z-20 w-full px-4 sm:px-6 md:px-8 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] border-t border-bord-pr bg-bg-pr shrink-0">
                        <div
                          className={cn(
                            'w-full flex items-center justify-between gap-3',
                            middleFullScreen ? 'max-w-[1040px] lg:max-w-[1140px] mx-auto' : 'max-w-[840px] mx-auto'
                          )}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="h-2.5 w-2.5 rounded-full bg-red-600 animate-pulse" />
                            <span className="text-par-n font-semibold text-lab-pr tabular-nums">
                              {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}
                            </span>
                            <span className="text-cap-l text-lab-sc hidden sm:inline">Recording voice note (max 2:00)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => stopVoiceRecording(true)}
                            >
                              <X className="h-4 w-4" /> Cancel
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="primary"
                              onClick={() => stopVoiceRecording(false)}
                            >
                              <Send className="h-4 w-4" /> Send
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="sticky bottom-0 z-20 w-full relative px-4 sm:px-6 md:px-8 px-safe py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] border-t border-bord-pr bg-bg-pr shrink-0">
                        <div
                          className={cn(
                            'w-full relative',
                            middleFullScreen ? 'max-w-[1040px] lg:max-w-[1140px] mx-auto' : 'max-w-[840px] mx-auto'
                          )}
                        >
                          {mentionCandidates.length > 0 && (
                            <div className="absolute bottom-full left-4 right-4 sm:right-auto sm:w-72 mb-1.5 z-30 rounded-2xl border border-bord-pr bg-bg-pr shadow-xl overflow-hidden divide-y divide-bord-pr">
                              {mentionCandidates.map((cand) => (
                                <button
                                  key={cand.user._id}
                                  type="button"
                                  onClick={() => {
                                    setMsgText((prev) =>
                                      prev.replace(/(?:^|\s)@([a-zA-Z0-9._]*)$/, (full) =>
                                        full.startsWith(' ')
                                          ? ` @${cand.user.username} `
                                          : `@${cand.user.username} `
                                      )
                                    );
                                    messageInputRef.current?.focus();
                                  }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-fill-fv cursor-pointer"
                                >
                                  <Avatar src={cand.user.avatar} alt={cand.user.username} size="xs" />
                                  <div className="min-w-0">
                                    <p className="text-cap-l font-semibold text-lab-pr truncate">
                                      {`${cand.user.firstName || ''} ${cand.user.lastName || ''}`.trim() ||
                                        `@${cand.user.username}`}
                                    </p>
                                    <p className="text-[11px] text-lab-sc truncate">@{cand.user.username}</p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                          {/* Telegram-style Composer Form */}
                          <form
                            onSubmit={handleSendText}
                            className="flex items-center gap-2 min-w-0 max-w-full"
                          >
                            {/* Telegram Attachment button (Paperclip on far left) with hover popup and auto-close on mouse leave */}
                            <div
                              className="relative shrink-0"
                              onMouseEnter={handleAttachEnter}
                              onMouseLeave={handleAttachLeave}
                            >
                              <button
                                type="button"
                                disabled={uploadingMedia}
                                onClick={() => setAttachMenuOpen((v) => !v)}
                                className={cn(
                                  'size-9 rounded-full flex items-center justify-center transition-all cursor-pointer disabled:opacity-50 shrink-0',
                                  attachMenuOpen
                                    ? 'bg-brand-900 text-white rotate-45'
                                    : 'text-lab-sc hover:text-lab-pr hover:bg-fill-fv'
                                )}
                                title="Attach file or media"
                                aria-label="Attach file or media"
                              >
                                <Paperclip className="h-5 w-5" strokeWidth={1.8} />
                              </button>

                              {/* Attachment Popover Menu */}
                              {attachMenuOpen && (
                                <div
                                  className="absolute bottom-full left-0 mb-2 z-30 w-56 rounded-2xl border border-bord-pr bg-bg-pr shadow-xl p-1.5 space-y-0.5"
                                  onMouseEnter={handleAttachEnter}
                                  onMouseLeave={handleAttachLeave}
                                >
                                  <label className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-par-s font-medium text-lab-pr hover:bg-fill-fv cursor-pointer">
                                    <ImageIcon className="h-4 w-4 text-brand-900 shrink-0" strokeWidth={1.75} />
                                    <span>Photo or Video</span>
                                    <input
                                      type="file"
                                      accept="image/*,video/*"
                                      disabled={uploadingMedia}
                                      className="hidden"
                                      onChange={(e) => {
                                        setAttachMenuOpen(false);
                                        void handleFileUpload(e);
                                      }}
                                    />
                                  </label>

                                  <label className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-par-s font-medium text-lab-pr hover:bg-fill-fv cursor-pointer">
                                    <Paperclip className="h-4 w-4 text-lab-sc shrink-0" strokeWidth={1.75} />
                                    <span>Attach File</span>
                                    <input
                                      type="file"
                                      accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar"
                                      disabled={uploadingMedia}
                                      className="hidden"
                                      onChange={(e) => {
                                        setAttachMenuOpen(false);
                                        void handleFileUpload(e);
                                      }}
                                    />
                                  </label>

                                  <button
                                    type="button"
                                    disabled={uploadingMedia}
                                    onClick={() => {
                                      setAttachMenuOpen(false);
                                      setShowStickerPicker(false);
                                      setShowGifPicker(true);
                                    }}
                                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-par-s font-medium text-lab-pr hover:bg-fill-fv cursor-pointer disabled:opacity-50"
                                  >
                                    <Film className="h-4 w-4 text-lab-sc shrink-0" strokeWidth={1.75} />
                                    <span>GIFs</span>
                                  </button>

                                  <button
                                    type="button"
                                    disabled={uploadingMedia}
                                    onClick={() => {
                                      setAttachMenuOpen(false);
                                      setShowGifPicker(false);
                                      setShowStickerPicker(true);
                                    }}
                                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-par-s font-medium text-lab-pr hover:bg-fill-fv cursor-pointer disabled:opacity-50"
                                  >
                                    <Smile className="h-4 w-4 text-lab-sc shrink-0" strokeWidth={1.75} />
                                    <span>Stickers &amp; Emoji</span>
                                  </button>

                                  <button
                                    type="button"
                                    disabled={uploadingMedia || sending}
                                    onClick={() => {
                                      setAttachMenuOpen(false);
                                      setPollQuestion('');
                                      setPollOptions(['', '']);
                                      setPollModalOpen(true);
                                    }}
                                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-par-s font-medium text-lab-pr hover:bg-fill-fv cursor-pointer disabled:opacity-50"
                                  >
                                    <BarChart2 className="h-4 w-4 text-lab-sc shrink-0" strokeWidth={1.75} />
                                    <span>Create Poll</span>
                                  </button>

                                  <button
                                    type="button"
                                    disabled={uploadingMedia || sendingLocation}
                                    onClick={() => {
                                      setAttachMenuOpen(false);
                                      void handleShareLocation();
                                    }}
                                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-par-s font-medium text-lab-pr hover:bg-fill-fv cursor-pointer disabled:opacity-50"
                                  >
                                    <MapPin className="h-4 w-4 text-lab-sc shrink-0" strokeWidth={1.75} />
                                    <span>Share Location</span>
                                  </button>

                                  <button
                                    type="button"
                                    disabled={uploadingMedia}
                                    onClick={() => {
                                      setAttachMenuOpen(false);
                                      void startVoiceRecording();
                                    }}
                                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-par-s font-medium text-lab-pr hover:bg-fill-fv cursor-pointer disabled:opacity-50"
                                  >
                                    <Mic className="h-4 w-4 text-lab-sc shrink-0" strokeWidth={1.75} />
                                    <span>Voice Message</span>
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Telegram Rounded Input Pill with Smile/Sticker Button inside */}
                            <div className="flex-1 min-w-0 flex items-center bg-fill-qt dark:bg-fill-sc/60 border border-transparent focus-within:border-brand-900/40 focus-within:bg-bg-pr rounded-full px-3.5 py-1 transition-all">
                              <input
                                ref={messageInputRef}
                                type="text"
                                value={msgText}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setMsgText(val);
                                  emitTypingChange(val.length > 0);
                                }}
                                placeholder="Write a message..."
                                className="flex-1 min-w-[80px] bg-transparent border-0 py-1.5 text-par-m text-lab-pr placeholder:text-lab-tr focus:outline-none"
                              />

                              {/* Telegram Hover Floating Sticker & Emoji Popover Card */}
                              <div
                                className="relative shrink-0 flex items-center"
                                onMouseEnter={handleStickerEnter}
                                onMouseLeave={handleStickerLeave}
                              >
                                <button
                                  type="button"
                                  disabled={uploadingMedia}
                                  onClick={() => {
                                    setAttachMenuOpen(false);
                                    setShowGifPicker(false);
                                    setShowStickerPicker((v) => !v);
                                  }}
                                  className={cn(
                                    'size-8 rounded-full flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50 shrink-0 ml-1',
                                    showStickerPicker
                                      ? 'text-brand-900 bg-brand-900/10'
                                      : 'text-lab-sc hover:text-lab-pr hover:bg-fill-fv'
                                  )}
                                  title="Emoji & Stickers"
                                  aria-label="Emoji and stickers"
                                >
                                  <Smile className="h-5 w-5" strokeWidth={1.8} />
                                </button>

                                {showStickerPicker && !recording && (
                                  <div
                                    className="absolute bottom-full right-0 mb-3 z-50 w-[calc(100vw-1.5rem)] sm:w-[410px] max-w-[410px] h-[380px] sm:h-[450px] rounded-2xl border border-bord-pr bg-bg-pr/95 backdrop-blur-md shadow-2xl overflow-hidden"
                                    onMouseEnter={handleStickerEnter}
                                    onMouseLeave={handleStickerLeave}
                                  >
                                    <StickerEmojiPicker
                                      onSelectEmoji={(emoji) => {
                                        setMsgText((prev) => prev + emoji);
                                        messageInputRef.current?.focus();
                                      }}
                                      onSelectSticker={(stickerUrl) => void handleSendSticker(stickerUrl)}
                                      onSelectGif={(gifUrl) => void handleSendGif(gifUrl)}
                                      onClose={() => setShowStickerPicker(false)}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Telegram Circular Action Button: Send Paperplane or Voice Note Mic */}
                            {msgText.trim() ? (
                              <button
                                type="submit"
                                disabled={sending || uploadingMedia}
                                aria-label="Send message"
                                className="size-10 rounded-full bg-brand-900 text-white hover:opacity-90 inline-flex items-center justify-center transition-transform active:scale-95 shrink-0 cursor-pointer disabled:opacity-50 shadow-xs"
                              >
                                <Send className="h-4 w-4 ml-0.5" strokeWidth={2.2} />
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={uploadingMedia}
                                onClick={startVoiceRecording}
                                title="Record voice note"
                                aria-label="Record voice note"
                                className="size-10 rounded-full bg-fill-qt text-lab-sc hover:text-lab-pr hover:bg-fill-sc dark:bg-fill-sc/60 dark:hover:bg-fill-sc inline-flex items-center justify-center transition-transform active:scale-95 shrink-0 cursor-pointer disabled:opacity-50"
                              >
                                <Mic className="h-5 w-5" strokeWidth={1.8} />
                              </button>
                            )}
                          </form>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Desktop Docked 3rd Column: Group Info or Direct Profile View (Resizable & Responsive) */}
      {!middleFullScreen &&
        ((activeChat?.type === 'group' && groupInfoOpen && !joinPreviewStatus) ||
          (activeChat?.type === 'direct' && directInfoOpen && interlocutor)) && (
          <>
            {/* Draggable Divider Handle between Middle Chat View and Right Info/Profile Panel */}
            <div
              role="separator"
              aria-orientation="vertical"
              tabIndex={0}
              onPointerDown={handleRightResizeStart}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') {
                  setRightPanelWidth((w) => Math.min(500, w + 20));
                } else if (e.key === 'ArrowRight') {
                  setRightPanelWidth((w) => Math.max(260, w - 20));
                }
              }}
              className={cn(
                'hidden lg:flex relative items-center justify-center w-2 -mr-1 z-20 cursor-col-resize hover:bg-brand-900/40 active:bg-brand-900 transition-colors select-none group shrink-0 border-l border-bord-pr',
                isDraggingRight && 'bg-brand-900/80 border-brand-900'
              )}
              title="Drag to resize profile & info panel"
            >
              <div className="w-0.5 h-7 rounded-full bg-lab-tr group-hover:bg-brand-900 transition-colors" />
            </div>

            <div
              style={{
                '--right-panel-w': `${rightPanelWidth}px`,
              } as React.CSSProperties}
              className="hidden lg:flex w-[var(--right-panel-w,320px)] shrink-0 h-full min-h-0 overflow-hidden border-l border-bord-pr bg-bg-pr flex-col"
            >
              {activeChat?.type === 'group' ? (
                <GroupInfoPanel
                  key={activeChat.id}
                  chat={activeChat}
                  currentUserId={user.id}
                  myRole={myParticipantRole}
                  onlineUsers={onlineUsers}
                  pinnedCount={pinnedMessages.length}
                  messages={messages}
                  inviteUserQuery={inviteUserQuery}
                  inviteUserResults={inviteUserResults}
                  onInviteQueryChange={setInviteUserQuery}
                  onInviteUser={(uid) => void handleInviteToGroup(uid)}
                  onStartCall={(mode) => handleStartCall(mode)}
                  onLeaveGroup={() => void handleChatAction('leave_group')}
                  onDeleteGroup={() => void handleChatAction('delete')}
                  onOpenLightbox={(url) => setLightboxImageUrl(url)}
                  onRefresh={() => {
                    void loadConversation(activeChat.id, '', true);
                    void loadInbox();
                  }}
                  onClose={() => setGroupInfoOpen(false)}
                />
              ) : interlocutor ? (
                <DirectProfilePanel
                  key={activeChat.id}
                  user={{
                    _id: interlocutor._id,
                    username: interlocutor.username,
                    firstName: interlocutor.firstName,
                    lastName: interlocutor.lastName,
                    avatar: interlocutor.avatar,
                    verified: interlocutor.verified,
                    lastActive: interlocutor.lastActive,
                  }}
                  isOnline={interlocutorOnline}
                  messages={messages}
                  locale={locale}
                  isArchived={isArchivedChat}
                  isMuted={chatMuted}
                  onToggleMute={() => setChatMuted((prev) => !prev)}
                  onStartCall={(mode) => handleStartCall(mode)}
                  onOpenSearch={() => setThreadSearchOpen(true)}
                  onOpenTip={() => setTipDirectUserModalOpen(true)}
                  onChatAction={(action) => void handleChatAction(action)}
                  onOpenLightbox={(url) => setLightboxImageUrl(url)}
                  onClose={() => setDirectInfoOpen(false)}
                />
              ) : null}
            </div>
          </>
        )}

      {/* New Chat / Group Modal */}
      <Modal open={newChatOpen} onClose={() => setNewChatOpen(false)} title="New Conversation">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={newChatMode === 'direct' ? 'brand' : 'outline'}
              onClick={() => setNewChatMode('direct')}
            >
              Direct Chat
            </Button>
            <Button
              type="button"
              variant={newChatMode === 'group' ? 'brand' : 'outline'}
              onClick={() => setNewChatMode('group')}
            >
              Group Chat
            </Button>
          </div>

          {newChatMode === 'group' && (
            <div className="space-y-3 rounded-2xl border border-bord-pr bg-fill-qt/40 p-3">
              <Input
                label="Group Name"
                placeholder="Design & Engineering"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
              <Input
                label="Description (Optional)"
                placeholder="What is this group about?"
                value={groupDescription}
                onChange={(e) => setGroupDescription(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="block text-cap-s font-semibold text-lab-pr">Category</label>
                  <select
                    value={groupCategory}
                    onChange={(e) => setGroupCategory(e.target.value)}
                    className="w-full h-9 rounded-xl border border-bord-pr bg-bg-pr px-2.5 text-cap-l text-lab-pr"
                  >
                    {['General', 'Tech & Creators', 'Marketplace', 'Gaming', 'Music & Culture', 'Support'].map(
                      (c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-cap-s font-semibold text-lab-pr">Visibility</label>
                  <select
                    value={groupVisibility}
                    onChange={(e) => setGroupVisibility(e.target.value as 'public' | 'private')}
                    className="w-full h-9 rounded-xl border border-bord-pr bg-bg-pr px-2.5 text-cap-l text-lab-pr"
                  >
                    <option value="public">Public (Discoverable)</option>
                    <option value="private">Private (Invite Only)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="block text-cap-s font-semibold text-lab-pr">Posting Mode</label>
                  <select
                    value={groupPostingMode}
                    onChange={(e) =>
                      setGroupPostingMode(e.target.value as 'everyone' | 'admins_only')
                    }
                    className="w-full h-9 rounded-xl border border-bord-pr bg-bg-pr px-2.5 text-cap-l text-lab-pr"
                  >
                    <option value="everyone">All Members</option>
                    <option value="admins_only">Admins Only</option>
                  </select>
                </div>
                <Input
                  label="Room Password (Optional)"
                  type="password"
                  placeholder="Optional lock"
                  value={groupPassword}
                  onChange={(e) => setGroupPassword(e.target.value)}
                />
              </div>
              <label className="flex items-center justify-between gap-2 text-par-s text-lab-pr cursor-pointer">
                <span>Require admin approval to join</span>
                <input
                  type="checkbox"
                  checked={groupApproval}
                  onChange={(e) => setGroupApproval(e.target.checked)}
                  className="accent-brand-900"
                />
              </label>

              {/* Group Monetization (Paid Entry Setup) */}
              <div className="rounded-xl border border-bord-pr bg-bg-pr p-3 space-y-2.5">
                <label className="flex items-center justify-between gap-2 text-par-s font-semibold text-lab-pr cursor-pointer">
                  <span className="flex items-center gap-1.5">
                    <Coins className="h-4 w-4 text-brand-900" /> Monetize Group (Paid Entry)
                  </span>
                  <input
                    type="checkbox"
                    checked={groupIsPaid}
                    onChange={(e) => setGroupIsPaid(e.target.checked)}
                    className="accent-brand-900"
                  />
                </label>
                {groupIsPaid && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Input
                      label="Entry Fee (NGN)"
                      type="number"
                      min={50}
                      step={50}
                      value={groupEntryPrice}
                      onChange={(e) => setGroupEntryPrice(e.target.value)}
                      placeholder="500"
                    />
                    <Input
                      label="Perks Note (Optional)"
                      value={groupMonetizationNote}
                      onChange={(e) => setGroupMonetizationNote(e.target.value)}
                      placeholder="VIP calls & guides"
                      maxLength={240}
                    />
                  </div>
                )}
              </div>

              <AvatarPresetPicker
                selectedUrl={groupAvatar}
                onSelect={(url) => setGroupAvatar(url)}
              />
            </div>
          )}

          <Input
            label="Find People"
            placeholder="Search by username or name..."
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
          />

          <div className="max-h-56 overflow-y-auto space-y-2">
            {userResults.map((u) => {
              const checked = selectedMembers.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    if (newChatMode === 'direct') {
                      startDirectChat(u.id);
                    } else {
                      setSelectedMembers((prev) =>
                        checked ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                      );
                    }
                  }}
                  className={cn(
                    'w-full flex items-center justify-between gap-3 rounded-2xl border p-2.5 cursor-pointer',
                    checked ? 'border-brand-900 bg-brand-900/10' : 'border-bord-pr hover:bg-fill-pr'
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar src={u.avatar} alt={u.username} size="sm" />
                    <div className="text-left min-w-0">
                      <p className="text-par-n font-semibold text-lab-pr truncate">
                        {u.firstName} {u.lastName}
                      </p>
                      <p className="text-cap-s text-lab-sc truncate">@{u.username}</p>
                    </div>
                  </div>
                  {newChatMode === 'group' && checked && <Check className="h-4 w-4 text-brand-900" />}
                </button>
              );
            })}
          </div>

          {newChatMode === 'group' && (
            <Button type="button" variant="primary" className="w-full" onClick={createGroupChat}>
              Create Group ({selectedMembers.length} invited)
            </Button>
          )}
        </div>
      </Modal>

      {/* Mobile/Tablet Group Info & Management Modal */}
      {activeChat?.type === 'group' && groupInfoOpen && !joinPreviewStatus && (
        <div className="lg:hidden">
          <Modal
            open={groupInfoOpen}
            onClose={() => setGroupInfoOpen(false)}
            title={activeChat.group?.name || 'Group Info'}
          >
            <div className="-m-4 max-h-[75dvh] overflow-y-auto">
              <GroupInfoPanel
                key={activeChat.id}
                chat={activeChat}
                currentUserId={user.id}
                myRole={myParticipantRole}
                onlineUsers={onlineUsers}
                pinnedCount={pinnedMessages.length}
                messages={messages}
                inviteUserQuery={inviteUserQuery}
                inviteUserResults={inviteUserResults}
                onInviteQueryChange={setInviteUserQuery}
                onInviteUser={(uid) => void handleInviteToGroup(uid)}
                onStartCall={(mode) => {
                  setGroupInfoOpen(false);
                  handleStartCall(mode);
                }}
                onLeaveGroup={() => void handleChatAction('leave_group')}
                onDeleteGroup={() => void handleChatAction('delete')}
                onOpenLightbox={(url) => setLightboxImageUrl(url)}
                onRefresh={() => {
                  void loadConversation(activeChat.id, '', true);
                  void loadInbox();
                }}
                onClose={() => setGroupInfoOpen(false)}
              />
            </div>
          </Modal>
        </div>
      )}

      {/* Password Prompt Modal for Protected Groups */}
      <Modal
        open={Boolean(joinPasswordModal)}
        onClose={() => {
          setJoinPasswordModal(null);
          setJoinPasswordInput('');
        }}
        title={`Enter Password · ${joinPasswordModal?.name || 'Group'}`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!joinPasswordModal) return;
            void handleJoinGroup(joinPasswordModal.id, { password: joinPasswordInput });
          }}
          className="space-y-4"
        >
          <Input
            label="Room Password"
            type="password"
            placeholder="Enter group password..."
            value={joinPasswordInput}
            onChange={(e) => setJoinPasswordInput(e.target.value)}
            required
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setJoinPasswordModal(null);
                setJoinPasswordInput('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={Boolean(joinPasswordModal && joiningGroupId === joinPasswordModal.id)}
            >
              Unlock & Join
            </Button>
          </div>
        </form>
      </Modal>

      {/* Paid Group Checkout Confirmation Modal */}
      <Modal
        open={Boolean(joinPaidModal)}
        onClose={() => {
          setJoinPaidModal(null);
          setJoinPaidPassword('');
        }}
        title={`Paid Group Access · ${joinPaidModal?.name || 'Group'}`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!joinPaidModal) return;
            void handleJoinGroup(joinPaidModal.id, {
              isPaid: true,
              entryPrice: joinPaidModal.price,
              payFromWallet: true,
              password: joinPaidModal.isPasswordProtected ? joinPaidPassword : undefined,
            });
          }}
          className="space-y-4"
        >
          <div className="rounded-2xl border border-bord-pr bg-fill-qt p-4 space-y-1.5">
            <p className="text-cap-l font-semibold text-lab-sc">One-time Wallet Entry Fee</p>
            <p className="text-title-2 font-bold text-lab-pr">
              {formatCurrency(Number(joinPaidModal?.price || 0), bootstrap?.config?.defaultCurrency || 'NGN', bootstrap?.currencies, locale)}
            </p>
            {joinPaidModal?.note && (
              <p className="text-par-s text-lab-sc pt-1">{joinPaidModal.note}</p>
            )}
          </div>
          {joinPaidModal?.isPasswordProtected && (
            <Input
              label="Room Password"
              type="password"
              placeholder="Enter group password..."
              value={joinPaidPassword}
              onChange={(e) => setJoinPaidPassword(e.target.value)}
              required
            />
          )}
          <div className="flex items-center justify-between gap-2 pt-1">
            <Link
              href="/wallet"
              className="text-par-s font-semibold text-brand-900 hover:underline"
            >
              Top up Wallet
            </Link>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setJoinPaidModal(null);
                  setJoinPaidPassword('');
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={Boolean(joinPaidModal && joiningGroupId === joinPaidModal.id)}
              >
                Pay {formatCurrency(Number(joinPaidModal?.price || 0), bootstrap?.config?.defaultCurrency || 'NGN', bootstrap?.currencies, locale)} & Join
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Mobile/Tablet Direct Chat Info Sheet Modal (Responsive Parity with Desktop 3rd Column) */}
      {activeChat?.type === 'direct' && interlocutor && (
        <div className="lg:hidden">
          <Modal
            open={directInfoOpen}
            onClose={() => setDirectInfoOpen(false)}
            title="Conversation Info"
          >
            <div className="max-h-[80vh] overflow-y-auto">
              <DirectProfilePanel
                user={{
                  _id: interlocutor._id,
                  username: interlocutor.username,
                  firstName: interlocutor.firstName,
                  lastName: interlocutor.lastName,
                  avatar: interlocutor.avatar,
                  verified: interlocutor.verified,
                  lastActive: interlocutor.lastActive,
                }}
                isOnline={interlocutorOnline}
                messages={messages}
                locale={locale}
                isArchived={isArchivedChat}
                isMuted={chatMuted}
                onToggleMute={() => setChatMuted((prev) => !prev)}
                onStartCall={(mode) => {
                  setDirectInfoOpen(false);
                  handleStartCall(mode);
                }}
                onOpenSearch={() => {
                  setDirectInfoOpen(false);
                  setThreadSearchOpen(true);
                }}
                onOpenTip={() => {
                  setDirectInfoOpen(false);
                  setTipDirectUserModalOpen(true);
                }}
                onChatAction={(action) => {
                  setDirectInfoOpen(false);
                  void handleChatAction(action);
                }}
                onOpenLightbox={(url) => {
                  setDirectInfoOpen(false);
                  setLightboxImageUrl(url);
                }}
                onClose={() => setDirectInfoOpen(false)}
              />
            </div>
          </Modal>
        </div>
      )}

      {/* Message Actions Modal */}
      {mobileActionMsg && (
        <Modal
          open={Boolean(mobileActionMsg)}
          onClose={() => setMobileActionMsg(null)}
          title="Message Actions"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-around py-2 rounded-2xl bg-fill-qt">
              {CHAT_REACTIONS.map((r) => (
                <button
                  key={r.unifiedId}
                  type="button"
                  onClick={() => {
                    const msgId = mobileActionMsg.id;
                    setMobileActionMsg(null);
                    void handleToggleReaction(msgId, r.unifiedId, r.nativeSymbol);
                  }}
                  className="h-10 w-10 rounded-full hover:bg-fill-sc flex items-center justify-center text-xl cursor-pointer"
                >
                  {r.nativeSymbol}
                </button>
              ))}
            </div>

            <div className="divide-y divide-bord-pr rounded-2xl border border-bord-pr overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  const target = mobileActionMsg;
                  setMobileActionMsg(null);
                  setReplyTo(target);
                  messageInputRef.current?.focus();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-par-n text-lab-pr hover:bg-fill-pr cursor-pointer"
              >
                <CornerUpLeft className="h-4 w-4 text-lab-sc" />
                Reply
              </button>

              <button
                type="button"
                onClick={() => {
                  const targetId = mobileActionMsg.id;
                  setMobileActionMsg(null);
                  void handlePinToggle(targetId);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-par-n text-lab-pr hover:bg-fill-pr cursor-pointer"
              >
                {pinnedMessages.some((pm) => pm.id === mobileActionMsg.id) ? (
                  <>
                    <PinOff className="h-4 w-4 text-brand-900" />
                    Unpin message
                  </>
                ) : (
                  <>
                    <Pin className="h-4 w-4 text-lab-sc" />
                    Pin message
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  const target = mobileActionMsg;
                  setMobileActionMsg(null);
                  setForwardMsg(target);
                  setForwardTargets([]);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-par-n text-lab-pr hover:bg-fill-pr cursor-pointer"
              >
                <Forward className="h-4 w-4 text-lab-sc" />
                Forward message
              </button>

              {mobileActionMsg.content && (
                <>
                  <button
                    type="button"
                    disabled={translatingMsgId === mobileActionMsg.id}
                    onClick={() => {
                      const target = mobileActionMsg;
                      setMobileActionMsg(null);
                      void handleTranslateMessage(target);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-par-n text-lab-pr hover:bg-fill-pr cursor-pointer disabled:opacity-50"
                  >
                    <Languages className="h-4 w-4 text-lab-sc" />
                    {msgTranslations[mobileActionMsg.id] ? 'Show original' : 'Translate message'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const txt = mobileActionMsg.content || '';
                      setMobileActionMsg(null);
                      navigator.clipboard?.writeText(txt).then(
                        () => success('Copied to clipboard'),
                        () => undefined
                      );
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-par-n text-lab-pr hover:bg-fill-pr cursor-pointer"
                  >
                    <Copy className="h-4 w-4 text-lab-sc" />
                    Copy text
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  const id = mobileActionMsg.id;
                  setMobileActionMsg(null);
                  void handleDeleteMessage(id, 'local');
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-par-n text-lab-pr hover:bg-fill-pr cursor-pointer"
              >
                <Trash2 className="h-4 w-4 text-lab-sc" />
                Delete for me
              </button>

              {String(mobileActionMsg.sender?._id || mobileActionMsg.senderId) === user.id && (
                <button
                  type="button"
                  onClick={() => {
                    const id = mobileActionMsg.id;
                    setMobileActionMsg(null);
                    void handleDeleteMessage(id, 'global');
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-par-n text-red-600 hover:bg-fill-pr cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete for everyone
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Create Poll Modal (Grupo Pro parity) */}
      <Modal
        open={pollModalOpen}
        onClose={() => setPollModalOpen(false)}
        title="Create In-Chat Poll"
      >
        <form onSubmit={handleCreatePoll} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-cap-l font-semibold text-lab-pr">Question</label>
            <Input
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="Ask the chat a question..."
              maxLength={240}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="block text-cap-l font-semibold text-lab-pr">Options</label>
            {pollOptions.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  value={opt}
                  onChange={(e) => {
                    const next = [...pollOptions];
                    next[idx] = e.target.value;
                    setPollOptions(next);
                  }}
                  placeholder={`Option ${idx + 1}`}
                  maxLength={120}
                  required={idx < 2}
                />
                {pollOptions.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setPollOptions((prev) => prev.filter((_, i) => i !== idx))}
                    className="p-2 rounded-full text-lab-sc hover:text-red-600 hover:bg-fill-fv cursor-pointer"
                    aria-label="Remove option"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {pollOptions.length < 6 && (
              <button
                type="button"
                onClick={() => setPollOptions((prev) => [...prev, ''])}
                className="inline-flex items-center gap-1.5 text-cap-l font-semibold text-brand-900 hover:underline cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Add option
              </button>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setPollModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={sending}>
              Post Poll
            </Button>
          </div>
        </form>
      </Modal>

      {/* Forward Message Modal (Grupo Pro parity) */}
      <Modal
        open={Boolean(forwardMsg)}
        onClose={() => {
          setForwardMsg(null);
          setForwardTargets([]);
        }}
        title="Forward Message"
      >
        <form onSubmit={handleForwardSubmit} className="space-y-4">
          {forwardMsg && (
            <div className="rounded-xl border border-bord-card bg-fill-qt px-3 py-2 text-cap-l text-lab-sc truncate">
              {getMessagePreviewLabel(forwardMsg)}
            </div>
          )}
          <div className="max-h-64 overflow-y-auto divide-y divide-bord-pr rounded-xl border border-bord-pr">
            {chats.length === 0 ? (
              <p className="p-4 text-center text-par-n text-lab-sc">No conversations found.</p>
            ) : (
              chats.map((c) => {
                const label =
                  c.type === 'group'
                    ? c.group?.name || 'Group Chat'
                    : c.interlocutor
                      ? `${c.interlocutor.firstName || ''} ${c.interlocutor.lastName || ''}`.trim() ||
                      `@${c.interlocutor.username}`
                      : 'Direct Chat';
                const avatarSrc = c.type === 'group' ? c.group?.avatar : c.interlocutor?.avatar;
                const checked = forwardTargets.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      setForwardTargets((prev) =>
                        checked ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                      )
                    }
                    className={cn(
                      'w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors cursor-pointer',
                      checked ? 'bg-brand-900/10' : 'hover:bg-fill-fv'
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar src={avatarSrc} alt={label} size="sm" />
                      <span className="text-par-n font-medium text-lab-pr truncate">{label}</span>
                    </div>
                    <span
                      className={cn(
                        'h-5 w-5 rounded-full border flex items-center justify-center shrink-0',
                        checked
                          ? 'bg-brand-900 border-brand-900 text-white'
                          : 'border-bord-pr bg-bg-pr'
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setForwardMsg(null);
                setForwardTargets([]);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={forwarding || forwardTargets.length === 0}
            >
              Forward ({forwardTargets.length})
            </Button>
          </div>
        </form>
      </Modal>

      {/* Direct User Support / Creator Tip Modal */}
      {interlocutor && (
        <SupportCreatorModal
          open={tipDirectUserModalOpen}
          onClose={() => setTipDirectUserModalOpen(false)}
          creator={{
            id: interlocutor._id,
            username: interlocutor.username,
            firstName: interlocutor.firstName || '',
            lastName: interlocutor.lastName || '',
            monetization: {
              tipsEnabled: true,
              subscriptionsEnabled: false,
              monthlyPrice: 0,
              currency: bootstrap?.config?.defaultCurrency || 'NGN',
            },
          }}
        />
      )}

      {/* Fullscreen PHP-parity Media Lightbox */}
      <MediaLightbox
        open={Boolean(lightboxImageUrl)}
        onClose={() => setLightboxImageUrl(null)}
        images={lightboxItems}
        initialIndex={lightboxInitialIndex}
        albumName={activeTitle}
      />
    </div>
  );
}
