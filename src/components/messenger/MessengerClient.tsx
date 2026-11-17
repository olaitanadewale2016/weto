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
  Copy,
  CornerUpLeft,
  ExternalLink,
  FileDown,
  Film,
  Forward,
  Image as ImageIcon,
  Info,
  Languages,
  LogOut,
  MapPin,
  MessageCircle,
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
  UserPlus,
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
import { apiFetch, uploadFileToR2 } from '@/lib/api-client';
import { GiphyAttribution, GiphyPicker } from '@/components/feed/GiphyPicker';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';
import { getFirebaseClientFirestore, markFirestoreDisabled } from '@/lib/firebase/client';
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

interface ChatSummary {
  id: string;
  chatUuid: string;
  type: 'direct' | 'group';
  group?: { name: string; description?: string; avatar?: string };
  isArchived?: boolean;
  interlocutor?: ChatUserSummary | null;
  participants?: Array<{ user: ChatUserSummary; role: string; lastReadAt?: string }>;
  pinnedMessageIds?: string[];
  lastMessagePreview?: string;
  lastActivity: string;
  unreadCount: number;
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

export function MessengerClient({ activeChatId }: { activeChatId?: string }) {
  const router = useRouter();
  const { user, bootstrap, theme, socket, onlineUsers, locale, setCounters } = useApp();
  const { error, success } = useToast();

  const initialThread = activeChatId ? messengerThreadCache.get(activeChatId) : undefined;
  const initialSummary =
    initialThread?.chat ||
    (activeChatId ? messengerInboxCache?.chats.find((c) => c.id === activeChatId) || null : null);

  const [tab, setTab] = useState<'chats' | 'groups' | 'invites' | 'archive'>('chats');
  const [searchQ, setSearchQ] = useState('');
  const [chats, setChats] = useState<ChatSummary[]>(() => messengerInboxCache?.chats || []);
  const [invites, setInvites] = useState<InviteItem[]>(() => messengerInboxCache?.invites || []);
  const [inviteCount, setInviteCount] = useState(() => messengerInboxCache?.invites.length || 0);
  const [loadingList, setLoadingList] = useState(() => !messengerInboxCache);

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
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);
  const [deleteMenuMsgId, setDeleteMenuMsgId] = useState<string | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
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
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

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

  const loadInbox = useCallback(async () => {
    if (!user) return;
    if (!messengerInboxCache) {
      setLoadingList(true);
    }
    try {
      setPollNow(Date.now());
      const [inviteRes, chatsRes] = await Promise.all([
        apiFetch<InviteItem[]>('/chats?tab=invites').catch(() => [] as InviteItem[]),
        tab === 'invites'
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
        const qs = queryText.trim() ? `?q=${encodeURIComponent(queryText.trim())}` : '';
        const res = await apiFetch<{
          chat: ChatSummary;
          messages: ChatMessage[];
          typingUsers?: TypingUserInfo[];
          pinnedMessages?: ChatMessage[];
          activeCall?: ActiveCallSummary | null;
        }>(`/chats/${chatId}${qs}`);
        setActiveChat(res.chat);
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
        setReactionPickerMsgId(null);
        setDeleteMenuMsgId(null);
        setTypingUsers([]);
        setShowGifPicker(false);
        setShowStickerPicker(false);
        setCallMode(null);
        setShowChatInCall(false);
        setActiveCall(null);
        setPinnedMessages([]);
        setPinIndex(0);
      }
      if (activeChatId && user) {
        const qsParams =
          typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const answerMode = qsParams?.get('answerCall');
        if (answerMode === 'video' || answerMode === 'audio') {
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

  async function handleDeleteMessage(messageId: string, scope: 'local' | 'global') {
    if (!activeChatId) return;
    setDeleteMenuMsgId(null);
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
    setCallMode(mode);
  }

  async function handleToggleReaction(messageId: string, unifiedId: string, nativeSymbol: string) {
    if (!activeChatId) return;
    setReactionPickerMsgId(null);
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

  async function handleRemoveParticipant(targetUserId: string) {
    if (!activeChat) return;
    try {
      await apiFetch(`/chats/${activeChat.id}`, {
        method: 'PATCH',
        json: { action: 'remove_participant', targetUserId },
      });
      success('Participant removed');
      void loadConversation(activeChat.id, threadSearchOpen ? threadSearchQ : '');
    } catch (err) {
      error('Could not remove participant', err instanceof Error ? err.message : undefined);
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
    try {
      const res = await apiFetch<{ id: string }>('/chats', {
        method: 'POST',
        json: { type: 'group', groupName: groupName.trim(), memberIds: selectedMembers },
      });
      setNewChatOpen(false);
      setGroupName('');
      setSelectedMembers([]);
      success('Group created!');
      router.push(`/messenger/c/${res.id}`);
    } catch (err) {
      error('Failed to create group', err instanceof Error ? err.message : undefined);
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

  const renderMessageBody = (m: ChatMessage, variant: 'desktop' | 'mobile-mine' | 'mobile-other') => {
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
        <div className="inline-flex items-center gap-1.5 rounded-full bg-fill-qt border border-bord-card px-3 py-1 text-cap-s text-lab-sc">
          {m.content === 'user_initiated_video_call' ? (
            <Video className="h-3.5 w-3.5 text-brand-900 shrink-0" />
          ) : (
            <Phone className="h-3.5 w-3.5 text-brand-900 shrink-0" />
          )}
          <span>{label}</span>
        </div>
      );
    }

    const mediaUrl = m.media?.publicUrl || m.media?.url;
    const isDesktop = variant === 'desktop';
    const boxClass = isDesktop
      ? 'bg-fill-qt border-bord-card text-lab-pr'
      : variant === 'mobile-mine'
        ? 'bg-bg-pr/70 border-bord-pr text-lab-pr'
        : 'bg-fill-qt border-bord-card text-lab-pr';

    const totalPollVotes = m.poll
      ? m.poll.options.reduce((sum, opt) => sum + (opt.voterIds?.length || 0), 0)
      : 0;

    return (
      <>
        {m.forwardedFromId && (
          <div className="inline-flex items-center gap-1 text-[11px] font-medium text-lab-sc">
            <Forward className="h-3 w-3" />
            <span>Forwarded</span>
          </div>
        )}

        {m.type === 'sticker' && m.stickerUrl && (
          <div className="inline-block py-0.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.stickerUrl}
              alt="Sticker"
              loading="lazy"
              decoding="async"
              className="h-28 w-28 object-contain"
            />
          </div>
        )}

        {m.type === 'poll' && m.poll && (
          <div
            className={cn(
              'rounded-2xl border p-3 space-y-2 w-full max-w-full sm:w-80 text-left',
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
            <p className="text-[11px] text-lab-sc">
              {totalPollVotes} {totalPollVotes === 1 ? 'vote' : 'votes'} · Tap an option to vote
            </p>
          </div>
        )}

        {m.type === 'location' && m.location && (
          <a
            href={`https://www.google.com/maps?q=${encodeURIComponent(`${m.location.lat},${m.location.lng}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex items-center gap-2.5 rounded-xl px-3 py-2.5 border transition-opacity hover:opacity-90 w-full max-w-full sm:w-72',
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
        )}

        {mediaUrl && (
          <>
            {(m.type === 'image' || m.type === 'gif') && (
              <div className="relative inline-block max-w-full rounded-xl overflow-hidden border border-bord-card">
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
                    className="max-h-72 max-w-full object-cover"
                  />
                </button>
                {m.type === 'gif' && <GiphyAttribution className="absolute bottom-2 left-2 z-10" />}
              </div>
            )}

            {(m.type === 'video' || m.type === 'video_circle') && (
              <video
                src={mediaUrl}
                controls
                playsInline
                className="rounded-xl max-h-72 max-w-full bg-black border border-bord-card"
              />
            )}

            {m.type === 'audio' && (
              <div className="space-y-1 w-[210px] sm:w-[260px] max-w-full">
                <audio src={mediaUrl} controls className="w-full h-9 max-w-full" />
                {m.media?.durationSeconds ? (
                  <p className="text-[11px] text-lab-sc">
                    Voice note · {Math.floor(m.media.durationSeconds / 60)}:
                    {String(Math.floor(m.media.durationSeconds % 60)).padStart(2, '0')}
                  </p>
                ) : null}
              </div>
            )}

            {m.type !== 'image' &&
              m.type !== 'gif' &&
              m.type !== 'video' &&
              m.type !== 'video_circle' &&
              m.type !== 'audio' && (
                <a
                  href={mediaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={m.media?.filename}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl px-3 py-2 border text-cap-l transition-opacity hover:opacity-90 w-full max-w-full md:max-w-sm min-w-0 overflow-hidden',
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
              )}
          </>
        )}

        {m.content && (
          <div className="space-y-1 min-w-0 max-w-full">
            <p className="text-par-n text-lab-pr whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
              {msgTranslations[m.id] || m.content}
            </p>
            {msgTranslations[m.id] && (
              <button
                type="button"
                onClick={() => setMsgTranslations((prev) => ({ ...prev, [m.id]: null }))}
                className="text-[10px] text-lab-sc underline cursor-pointer"
              >
                Translated · Show original
              </button>
            )}
          </div>
        )}

        {m.linkSnapshot?.url && (
          <a
            href={m.linkSnapshot.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'block rounded-xl p-2.5 border text-left transition-opacity hover:opacity-90 w-full max-w-full md:max-w-md min-w-0 overflow-hidden',
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
        )}

        {m.contextRef?.title && (() => {
          const refHref =
            m.contextRef.kind === 'product'
              ? `/marketplace/product/${encodeURIComponent(m.contextRef.hashId || m.contextRef.id)}`
              : '/jobs';
          return (
            <Link
              href={refHref}
              className={cn(
                'flex items-center gap-2.5 rounded-xl p-2 border transition-opacity hover:opacity-90 w-full max-w-full md:max-w-md min-w-0 overflow-hidden text-left',
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
          );
        })()}
      </>
    );
  };

  return (
    <div
      className={cn(
        'flex overflow-hidden bg-bg-pr w-full',
        activeChatId ? 'h-[100dvh]' : 'h-[calc(100dvh-7rem)] md:h-screen'
      )}
    >
      {/* Desktop Far-Left Vertical Action Bar (matches PHP MessengerActionBar.vue) */}
      <aside className="hidden md:flex w-16 shrink-0 border-r border-bord-pr bg-bg-pr flex-col items-center justify-between py-5">
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

        <div className="flex flex-col items-center gap-3">
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

      {/* Left Conversation List (matches PHP MessengerNavbar.vue + HistoryList) */}
      <div
        className={cn(
          'w-full md:w-[320px] lg:w-[360px] shrink-0 md:border-r border-bord-pr flex flex-col bg-bg-pr min-w-0',
          activeChatId ? 'hidden md:flex' : 'flex'
        )}
      >
        <div className="px-4 pt-3.5 pb-0 border-b border-bord-pr space-y-3 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Link
                href="/"
                className="inline-flex items-center justify-center size-8 rounded-full text-lab-sc hover:text-lab-pr hover:bg-fill-fv transition-colors shrink-0"
                title="Back to Home"
                aria-label="Back to Home"
              >
                <ArrowLeft className="size-4" />
              </Link>
              <h1 className="text-title-3 font-bold text-lab-pr truncate">Messages</h1>
            </div>
            <button
              type="button"
              onClick={() => setNewChatOpen(true)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-lab-pr text-bg-pr text-cap-l font-semibold hover:opacity-90 transition-opacity cursor-pointer shrink-0"
            >
              <Plus className="h-3.5 w-3.5" /> New
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-lab-tr" />
            <input
              type="search"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search conversations..."
              className="w-full h-9 rounded-full bg-fill-qt border border-transparent focus:border-bord-pr pl-9 pr-3 text-[16px] md:text-par-n text-lab-pr placeholder:text-lab-tr focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-4 -mx-4 px-2">
            {(
              [
                { key: 'chats', label: 'Chats' },
                { key: 'groups', label: 'Groups' },
                { key: 'invites', label: inviteCount > 0 ? `Invites (${inviteCount})` : 'Invites' },
                { key: 'archive', label: 'Archive' },
              ] as const
            ).map((item) => {
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={cn(
                    'py-2.5 text-center text-cap-l font-medium border-b-2 transition-colors truncate px-1 cursor-pointer',
                    active
                      ? 'border-brand-900 text-brand-900 font-semibold'
                      : 'border-transparent text-lab-sc hover:text-lab-pr'
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-bord-pr">
          {loadingList && <p className="p-4 text-center text-lab-sc text-par-n">Loading...</p>}

          {!loadingList && tab === 'invites' && invites.length === 0 && (
            <p className="p-6 text-center text-lab-sc text-par-n">No pending group invitations.</p>
          )}

          {tab === 'invites' &&
            invites.map((inv) => (
              <div key={inv._id} className="p-4 space-y-2">
                <p className="text-par-n font-semibold text-lab-pr">
                  {inv.chatId?.group?.name || 'Group Chat'}
                </p>
                <p className="text-cap-l text-lab-sc">
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
            <p className="p-6 text-center text-lab-sc text-par-n">
              {tab === 'groups' ? 'No group chats yet.' : 'No conversations yet.'}
            </p>
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
                    'flex items-center gap-3 p-3.5 hover:bg-fill-pr transition-colors',
                    activeChatId === c.id && 'bg-fill-sc'
                  )}
                >
                  <Avatar src={avatarSrc} alt={title} online={isOnline} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-par-n font-bold text-lab-pr truncate">{title}</p>
                      <span className="text-cap-s text-lab-tr shrink-0">
                        {formatRelativeTime(c.lastActivity, locale)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-cap-l text-lab-sc truncate">
                        {c.lastMessagePreview || 'No messages yet'}
                      </p>
                      {c.unreadCount > 0 && (
                        <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-brand-900 text-white text-cap-s font-bold flex items-center justify-center">
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
        </div>
      </div>

      {/* Right Active Thread */}
      <div
        className={cn(
          'flex-1 flex flex-col bg-bg-pr min-w-0 max-w-full overflow-x-hidden',
          activeChatId ? 'fixed inset-0 z-[60] md:static md:inset-auto md:z-auto' : 'hidden md:flex'
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
                  className="md:hidden p-1.5 rounded-full text-lab-pr hover:bg-fill-sc shrink-0"
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
              <div className="h-16 px-3 sm:px-6 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Link
                    href="/messenger"
                    className="md:hidden p-1.5 rounded-full text-lab-pr hover:bg-fill-sc shrink-0"
                    aria-label="Back to Messenger"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Link>

                  <button
                    type="button"
                    onClick={() =>
                      activeChat.type === 'group' ? setGroupInfoOpen(true) : setDirectInfoOpen(true)
                    }
                    className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
                  >
                    <Avatar
                      src={activeAvatar}
                      alt={activeTitle}
                      online={activeChat.type === 'direct' ? interlocutorOnline : false}
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="text-par-l font-bold text-lab-pr truncate">{activeTitle}</p>
                      {typingUsers.length > 0 ? (
                        <p className="text-cap-s text-green-600 font-medium animate-pulse truncate">
                          {activeChat.type === 'group' ? `${typingNames} typing...` : 'typing...'}
                        </p>
                      ) : activeChat.type === 'group' ? (
                        <p className="text-cap-s text-lab-sc truncate">
                          {activeChat.participants?.length || 0} members
                        </p>
                      ) : interlocutorOnline ? (
                        <p className="text-cap-s text-green-600 font-medium truncate">Online</p>
                      ) : (
                        <p className="text-cap-s text-lab-sc truncate">
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

                <div className="flex items-center gap-1 shrink-0 relative">
                  <button
                    type="button"
                    onClick={() => handleStartCall('audio')}
                    className={cn(
                      'p-2 rounded-full text-lab-sc hover:bg-fill-sc cursor-pointer transition-colors',
                      (callMode === 'audio' || activeCall?.audioOnly) &&
                        'bg-green-600/15 text-green-600 ring-1 ring-green-600/40'
                    )}
                    title={activeCall?.audioOnly ? 'Join active audio call' : 'Start audio call'}
                    aria-label="Audio call"
                  >
                    <Phone className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStartCall('video')}
                    className={cn(
                      'p-2 rounded-full text-lab-sc hover:bg-fill-sc cursor-pointer transition-colors',
                      (callMode === 'video' || (activeCall && !activeCall.audioOnly)) &&
                        'bg-brand-900/15 text-brand-900 ring-1 ring-brand-900/40'
                    )}
                    title={
                      activeCall && !activeCall.audioOnly ? 'Join active video call' : 'Start video call'
                    }
                    aria-label="Video call"
                  >
                    <Video className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setChatMuted((prev) => !prev)}
                    className={cn(
                      'hidden sm:inline-flex p-2 rounded-full text-lab-sc hover:bg-fill-sc cursor-pointer',
                      chatMuted && 'text-red-500 bg-fill-sc'
                    )}
                    title={chatMuted ? 'Unmute chat sounds' : 'Mute chat sounds'}
                    aria-label={chatMuted ? 'Unmute chat sounds' : 'Mute chat sounds'}
                  >
                    {chatMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setThreadSearchOpen((prev) => {
                        if (prev) setThreadSearchQ('');
                        return !prev;
                      });
                    }}
                    className={cn(
                      'p-2 rounded-full text-lab-sc hover:bg-fill-sc cursor-pointer',
                      threadSearchOpen && 'bg-fill-sc text-lab-pr'
                    )}
                    title="Search messages"
                    aria-label="Search messages"
                  >
                    <Search className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      activeChat.type === 'group' ? setGroupInfoOpen(true) : setDirectInfoOpen(true)
                    }
                    className="p-2 rounded-full text-lab-sc hover:bg-fill-sc cursor-pointer"
                    title="Conversation info"
                    aria-label="Conversation info"
                  >
                    <Info className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setThreadMenuOpen((prev) => !prev)}
                    className="p-2 rounded-full text-lab-sc hover:bg-fill-sc cursor-pointer"
                    title="Conversation options"
                    aria-label="Conversation options"
                  >
                    <MoreHorizontal className="h-5 w-5" />
                  </button>

                  {threadMenuOpen && (
                    <div className="absolute right-0 top-11 z-30 w-48 rounded-2xl border border-bord-pr bg-bg-pr shadow-lg py-1.5">
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
                  )}
                </div>
              </div>

              {threadSearchOpen && (
                <div className="px-4 pb-3">
                  <div className="relative">
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

            {/* Active incoming/ongoing call join strip */}
            {activeCall && !callMode && (
              <div className="px-4 py-2 border-b border-bord-pr bg-green-600/10 flex items-center justify-between gap-3 shrink-0">
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
                <div className="px-3 sm:px-4 py-2 border-b border-bord-card bg-fill-qt flex items-center justify-between gap-2 shrink-0">
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
                      <p className="text-[11px] font-bold text-brand-900 truncate">
                        Pinned Message {pinnedMessages.length > 1 ? `(${safePinIdx + 1}/${pinnedMessages.length})` : ''}
                      </p>
                      <p className="text-cap-l text-lab-pr truncate">
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
            )}

            {/* Messages Timeline (PHP ChatOverview + Desktop Grouped ChatMessage + Mobile Bubbles) */}
            <div
              className={cn(
                'flex-1 overflow-y-auto overflow-x-hidden py-3 px-3 px-safe md:px-0 md:py-4 space-y-2.5 md:space-y-0.5',
                callMode && !showChatInCall && 'hidden'
              )}
            >
              {!loadingThread && !threadSearchQ && (
                <div className="border-b border-bord-card px-4 py-7 mb-3 text-center">
                  <div className="flex justify-center mb-3">
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
                        <div className="mt-3">
                          <Link
                            href={`/@${interlocutor.username}`}
                            className="inline-flex items-center rounded-full border border-bord-pr px-4 py-1.5 text-cap-l font-medium text-lab-pr hover:bg-fill-fv transition-colors"
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
                <div className="space-y-4 animate-pulse py-2 px-2 md:px-5">
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
                const isCompacted =
                  !showDateDivider &&
                  Boolean(prevMsg) &&
                  !prevMsg?.isDeleted &&
                  prevSenderId === currSenderId &&
                  timeDiffMs >= 0 &&
                  timeDiffMs < 180_000;
                const senderName =
                  `${m.sender?.firstName || ''} ${m.sender?.lastName || ''}`.trim() ||
                  (m.sender?.username ? `@${m.sender.username}` : 'User');

                return (
                  <React.Fragment key={m.id}>
                    <span id={`msg-${m.id}`} className="sr-only" />
                    {showDateDivider && (
                      <div className="flex justify-center py-3">
                        <span className="px-3 py-1 rounded-full bg-fill-sc text-cap-s text-lab-sc font-medium">
                          {formatDateDivider(m.createdAt, locale)}
                        </span>
                      </div>
                    )}

                    {/* DESKTOP MESSAGE ROW (matches PHP desktop ChatMessage.vue) */}
                    <div
                      onDoubleClick={() => {
                        if (m.isDeleted) return;
                        setReplyTo(m);
                        messageInputRef.current?.focus();
                      }}
                      className={cn(
                        'hidden md:flex items-start gap-3 px-5 hover:bg-fill-fv transition-colors group relative',
                        isCompacted ? 'py-0.5' : 'pt-2.5 pb-1'
                      )}
                    >
                      {isCompacted ? (
                        <div className="w-[38px] shrink-0 text-[10px] text-lab-tr opacity-0 group-hover:opacity-100 select-none text-right pt-1 tabular-nums">
                          {formatMessageTime(m.createdAt, locale)}
                        </div>
                      ) : (
                        <div className="shrink-0 mt-0.5">
                          <Avatar src={m.sender?.avatar} alt={m.sender?.username} size="sm" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0 space-y-1">
                        {!isCompacted && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-par-n font-bold text-lab-pr truncate">{senderName}</span>
                            <span className="text-cap-s text-lab-tr shrink-0">
                              {formatMessageTime(m.createdAt, locale)}
                            </span>
                            {mine &&
                              (readByOther ? (
                                <CheckCheck className="h-3 w-3 text-brand-900 shrink-0" />
                              ) : (
                                <Check className="h-3 w-3 text-lab-tr shrink-0" />
                              ))}
                          </div>
                        )}

                        {m.parentId && !m.isDeleted && (
                          <div className="rounded-r-lg border-l-2 border-brand-900 bg-fill-qt px-2.5 py-1 text-cap-l text-lab-sc max-w-lg">
                            <p className="text-cap-s font-semibold text-lab-pr truncate">
                              {m.parentId.senderId?.firstName || m.parentId.senderId?.username || 'Reply'}
                            </p>
                            <p className="truncate">{getMessagePreviewLabel(m.parentId)}</p>
                          </div>
                        )}

                        <div className="space-y-1.5">{renderMessageBody(m, 'desktop')}</div>

                        {m.reactionSummary && m.reactionSummary.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {m.reactionSummary.map((rs) => (
                              <button
                                key={rs.unifiedId}
                                type="button"
                                onClick={() => handleToggleReaction(m.id, rs.unifiedId, rs.nativeSymbol)}
                                className="inline-flex items-center gap-1 rounded-full bg-fill-qt border border-bord-card px-2 py-0.5 text-cap-s text-lab-pr hover:bg-fill-sc cursor-pointer"
                              >
                                <span>{rs.nativeSymbol}</span>
                                <span className="font-semibold text-lab-sc">{rs.count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {!m.isDeleted && m.type !== 'system' && (
                        <div className="absolute -top-3 right-5 z-10 flex items-center gap-0.5 rounded-full border border-bord-pr bg-bg-pr px-1.5 py-0.5 shadow-sm opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => setReactionPickerMsgId((prev) => (prev === m.id ? null : m.id))}
                            className="p-1 rounded-full text-lab-sc hover:text-lab-pr hover:bg-fill-fv cursor-pointer"
                            title="React"
                          >
                            <Smile className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReplyTo(m);
                              messageInputRef.current?.focus();
                            }}
                            className="p-1 rounded-full text-lab-sc hover:text-lab-pr hover:bg-fill-fv cursor-pointer"
                            title="Reply"
                          >
                            <CornerUpLeft className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handlePinToggle(m.id)}
                            className={cn(
                              'p-1 rounded-full hover:bg-fill-fv cursor-pointer',
                              pinnedMessages.some((pm) => pm.id === m.id)
                                ? 'text-brand-900'
                                : 'text-lab-sc hover:text-lab-pr'
                            )}
                            title={
                              pinnedMessages.some((pm) => pm.id === m.id) ? 'Unpin message' : 'Pin message'
                            }
                          >
                            {pinnedMessages.some((pm) => pm.id === m.id) ? (
                              <PinOff className="h-3.5 w-3.5" />
                            ) : (
                              <Pin className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setForwardMsg(m);
                              setForwardTargets([]);
                            }}
                            className="p-1 rounded-full text-lab-sc hover:text-lab-pr hover:bg-fill-fv cursor-pointer"
                            title="Forward message"
                          >
                            <Forward className="h-3.5 w-3.5" />
                          </button>
                          {!mine && m.content?.trim() && (
                            <button
                              type="button"
                              disabled={translatingMsgId === m.id}
                              onClick={() => void handleTranslateMessage(m)}
                              className="p-1 rounded-full text-lab-sc hover:text-lab-pr hover:bg-fill-fv cursor-pointer disabled:opacity-50"
                              title={msgTranslations[m.id] ? 'Show original' : 'Translate message'}
                            >
                              <Languages className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {mine && (
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setDeleteMenuMsgId((prev) => (prev === m.id ? null : m.id))}
                                className="p-1 rounded-full text-lab-sc hover:text-red-600 hover:bg-fill-fv cursor-pointer"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                              {deleteMenuMsgId === m.id && (
                                <div className="absolute right-0 top-7 z-20 w-40 rounded-xl border border-bord-pr bg-bg-pr shadow-lg py-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteMessage(m.id, 'global')}
                                    className="w-full px-3 py-1.5 text-left text-cap-l text-red-600 hover:bg-fill-pr cursor-pointer"
                                  >
                                    Delete for everyone
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteMessage(m.id, 'local')}
                                    className="w-full px-3 py-1.5 text-left text-cap-l text-lab-pr hover:bg-fill-pr cursor-pointer"
                                  >
                                    Delete for me
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {reactionPickerMsgId === m.id && (
                            <div className="absolute right-0 top-8 z-20 flex items-center gap-1 rounded-full border border-bord-pr bg-bg-pr px-2 py-1 shadow-lg">
                              {CHAT_REACTIONS.map((r) => (
                                <button
                                  key={r.unifiedId}
                                  type="button"
                                  onClick={() => handleToggleReaction(m.id, r.unifiedId, r.nativeSymbol)}
                                  className="h-7 w-7 rounded-full hover:bg-fill-sc flex items-center justify-center text-base cursor-pointer"
                                >
                                  {r.nativeSymbol}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* MOBILE BUBBLE ROW (matches PHP mobile ChatMessage.vue) */}
                    <div
                      className={cn(
                        'flex md:hidden w-full min-w-0 items-end gap-1.5 group relative',
                        mine ? 'justify-end' : 'justify-start'
                      )}
                    >
                      {!mine && <Avatar src={m.sender?.avatar} alt={m.sender?.username} size="xs" />}

                      <div className={cn('min-w-0 max-w-[82%] overflow-hidden space-y-1', mine && 'items-end flex flex-col')}>
                        <div
                          className={cn(
                            'w-fit max-w-full min-w-0 overflow-hidden rounded-2xl px-3 py-2 space-y-1.5 relative border',
                            mine
                              ? 'bg-fill-qt border-fill-fv text-lab-pr rounded-br-sm'
                              : 'bg-bg-pr border-bord-pr text-lab-pr rounded-bl-sm'
                          )}
                        >
                          {!mine && activeChat.type === 'group' && (
                            <p className="text-cap-s font-bold text-lab-sc truncate">@{m.sender?.username}</p>
                          )}

                          {m.parentId && !m.isDeleted && (
                            <div className="max-w-full min-w-0 overflow-hidden rounded-lg px-2 py-1 border-l-2 border-brand-900 bg-bg-pr/70 text-cap-l text-lab-sc">
                              <p className="text-cap-s font-semibold text-lab-pr truncate">
                                {m.parentId.senderId?.firstName || m.parentId.senderId?.username || 'Reply'}
                              </p>
                              <p className="truncate">{getMessagePreviewLabel(m.parentId)}</p>
                            </div>
                          )}

                          {renderMessageBody(m, mine ? 'mobile-mine' : 'mobile-other')}

                          <div className="flex items-center justify-end gap-1 text-[10px] text-lab-sc">
                            <span>{formatMessageTime(m.createdAt, locale)}</span>
                            {mine &&
                              (readByOther ? (
                                <CheckCheck className="h-3 w-3 text-brand-900" />
                              ) : (
                                <Check className="h-3 w-3 text-lab-sc" />
                              ))}
                          </div>

                          {reactionPickerMsgId === m.id && (
                            <div
                              className={cn(
                                'absolute bottom-full mb-1.5 z-20 flex items-center gap-1 rounded-full border border-bord-pr bg-bg-pr px-2 py-1 shadow-lg',
                                mine ? 'right-0' : 'left-0'
                              )}
                            >
                              {CHAT_REACTIONS.map((r) => (
                                <button
                                  key={r.unifiedId}
                                  type="button"
                                  onClick={() => handleToggleReaction(m.id, r.unifiedId, r.nativeSymbol)}
                                  className="h-7 w-7 rounded-full hover:bg-fill-sc flex items-center justify-center text-base cursor-pointer"
                                >
                                  {r.nativeSymbol}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {m.reactionSummary && m.reactionSummary.length > 0 && (
                          <div className={cn('flex flex-wrap gap-1', mine ? 'justify-end' : 'justify-start')}>
                            {m.reactionSummary.map((rs) => (
                              <button
                                key={rs.unifiedId}
                                type="button"
                                onClick={() => handleToggleReaction(m.id, rs.unifiedId, rs.nativeSymbol)}
                                className="inline-flex items-center gap-1 rounded-full bg-fill-qt border border-bord-card px-2 py-0.5 text-cap-s text-lab-pr hover:bg-fill-sc cursor-pointer"
                              >
                                <span>{rs.nativeSymbol}</span>
                                <span className="font-semibold text-lab-sc">{rs.count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {!m.isDeleted && m.type !== 'system' && (
                        <button
                          type="button"
                          onClick={() => setMobileActionMsg(m)}
                          className="md:hidden self-center p-1 rounded-full text-lab-tr hover:bg-fill-sc shrink-0"
                          aria-label="Message actions"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}

              {typingUsers.length > 0 && (
                <div className="flex items-end gap-2 justify-start px-1 md:px-5 py-1">
                  <Avatar
                    src={typingUsers[0]?.avatar || activeAvatar}
                    alt={typingUsers[0]?.username || 'Typing'}
                    size="xs"
                  />
                  <div className="rounded-2xl rounded-bl-sm bg-fill-qt border border-bord-card px-3.5 py-2.5 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-lab-sc animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-lab-sc animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-lab-sc animate-bounce" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {(!callMode || showChatInCall) && (
              <>
            {/* Reply Preview Banner */}
            {replyTo && (
              <div className="px-4 py-2 border-t border-bord-pr bg-fill-qt flex items-center justify-between gap-3">
                <div className="min-w-0 border-l-2 border-brand-900 pl-2.5">
                  <p className="text-cap-s font-bold text-brand-900 truncate">
                    Replying to {replyTo.sender?.firstName || replyTo.sender?.username || 'Message'}
                  </p>
                  <p className="text-cap-l text-lab-sc truncate">{getMessagePreviewLabel(replyTo)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className="p-1 rounded-full text-lab-sc hover:bg-fill-sc cursor-pointer shrink-0"
                  aria-label="Cancel reply"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Upload Progress Bar */}
            {uploadingMedia && (
              <div className="px-4 py-1.5 border-t border-bord-pr bg-fill-qt flex items-center gap-3">
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
            )}

            {showGifPicker && !recording && (
              <div className="md:px-3 md:py-2 md:border-t md:border-bord-pr md:bg-bg-pr shrink-0">
                <GiphyPicker
                  onSelect={(url) => void handleSendGif(url)}
                  onClose={() => setShowGifPicker(false)}
                />
              </div>
            )}

            {showStickerPicker && !recording && (
              <div className="md:px-3 md:py-2 md:border-t md:border-bord-pr md:bg-bg-pr shrink-0">
                <StickerEmojiPicker
                  onSelectEmoji={(emoji) => {
                    setMsgText((prev) => prev + emoji);
                    messageInputRef.current?.focus();
                  }}
                  onSelectSticker={(stickerUrl) => void handleSendSticker(stickerUrl)}
                  onClose={() => setShowStickerPicker(false)}
                />
              </div>
            )}

            {/* Composer (matches PHP ChatForm + AudioRecorder.vue) */}
            {recording ? (
              <div className="px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pb-safe-standalone border-t border-bord-pr flex items-center justify-between gap-3 bg-bg-pr shrink-0">
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
            ) : (
              <div className="px-2.5 px-safe sm:px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] pb-safe-standalone border-t border-bord-pr bg-bg-pr shrink-0">
                <form
                  onSubmit={handleSendText}
                  className="flex items-center gap-0.5 sm:gap-1.5 min-w-0 max-w-full rounded-3xl border border-bord-pr bg-fill-qt md:bg-bg-pr px-2 sm:px-3 py-1"
                >
                  <label
                    className={cn(
                      'p-1 sm:p-1.5 rounded-full text-lab-sc hover:text-lab-pr hover:bg-fill-fv cursor-pointer shrink-0',
                      msgText.trim() && 'hidden sm:inline-flex'
                    )}
                    title="Send photo or video"
                  >
                    <ImageIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                    <input
                      type="file"
                      accept="image/*,video/*"
                      disabled={uploadingMedia}
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </label>

                  <label
                    className={cn(
                      'p-1 sm:p-1.5 rounded-full text-lab-sc hover:text-lab-pr hover:bg-fill-fv cursor-pointer shrink-0',
                      msgText.trim() && 'hidden sm:inline-flex'
                    )}
                    title="Attach file or audio"
                  >
                    <Paperclip className="h-4 w-4 sm:h-5 sm:w-5" />
                    <input
                      type="file"
                      accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar"
                      disabled={uploadingMedia}
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </label>

                  <button
                    type="button"
                    disabled={uploadingMedia}
                    onClick={() => {
                      setShowGifPicker(false);
                      setShowStickerPicker((v) => !v);
                    }}
                    className={cn(
                      'p-1 sm:p-1.5 rounded-full hover:bg-fill-fv cursor-pointer disabled:opacity-50 shrink-0',
                      msgText.trim() && 'hidden sm:inline-flex',
                      showStickerPicker ? 'text-brand-900 bg-fill-pr' : 'text-lab-sc hover:text-lab-pr'
                    )}
                    title="Emoji & Stickers"
                  >
                    <Smile className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>

                  <button
                    type="button"
                    disabled={uploadingMedia}
                    onClick={() => {
                      setShowStickerPicker(false);
                      setShowGifPicker((v) => !v);
                    }}
                    className={cn(
                      'p-1 sm:p-1.5 rounded-full hover:bg-fill-fv cursor-pointer disabled:opacity-50 shrink-0',
                      msgText.trim() && 'hidden sm:inline-flex',
                      showGifPicker ? 'text-brand-900 bg-fill-pr' : 'text-lab-sc hover:text-lab-pr'
                    )}
                    title="Send GIF"
                  >
                    <Film className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>

                  <button
                    type="button"
                    disabled={uploadingMedia || sending}
                    onClick={() => {
                      setPollQuestion('');
                      setPollOptions(['', '']);
                      setPollModalOpen(true);
                    }}
                    className={cn(
                      'p-1 sm:p-1.5 rounded-full text-lab-sc hover:text-lab-pr hover:bg-fill-fv cursor-pointer disabled:opacity-50 shrink-0',
                      msgText.trim() && 'hidden sm:inline-flex'
                    )}
                    title="Create Poll"
                  >
                    <BarChart2 className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>

                  <button
                    type="button"
                    disabled={uploadingMedia || sendingLocation}
                    onClick={() => void handleShareLocation()}
                    className={cn(
                      'p-1 sm:p-1.5 rounded-full text-lab-sc hover:text-lab-pr hover:bg-fill-fv cursor-pointer disabled:opacity-50 shrink-0',
                      msgText.trim() && 'hidden sm:inline-flex'
                    )}
                    title="Share Location"
                  >
                    <MapPin className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>

                  <button
                    type="button"
                    disabled={uploadingMedia}
                    onClick={startVoiceRecording}
                    className={cn(
                      'p-1 sm:p-1.5 rounded-full text-lab-sc hover:text-lab-pr hover:bg-fill-fv cursor-pointer disabled:opacity-50 shrink-0',
                      msgText.trim() && 'hidden sm:inline-flex'
                    )}
                    title="Record voice note"
                  >
                    <Mic className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>

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
                    className="flex-1 min-w-[80px] bg-transparent border-0 px-2 py-1.5 text-[16px] md:text-par-n text-lab-pr placeholder:text-lab-tr focus:outline-none"
                  />

                  <button
                    type="submit"
                    disabled={sending || uploadingMedia || !msgText.trim()}
                    aria-label="Send message"
                    className={cn(
                      'inline-flex items-center justify-center rounded-full px-2.5 py-1.5 text-cap-l font-semibold transition-colors shrink-0',
                      msgText.trim() && !sending && !uploadingMedia
                        ? 'text-brand-900 hover:bg-fill-fv cursor-pointer'
                        : 'text-lab-tr cursor-not-allowed opacity-60'
                    )}
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </div>
            )}
              </>
            )}
          </>
        )}
      </div>

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
            <Input
              label="Group Name"
              placeholder="Design & Engineering"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
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

      {/* Group Info & Participants Modal */}
      {activeChat?.type === 'group' && (
        <Modal
          open={groupInfoOpen}
          onClose={() => setGroupInfoOpen(false)}
          title={activeChat.group?.name || 'Group Info'}
        >
          <div className="space-y-4">
            {activeChat.group?.description && (
              <p className="text-par-n text-lab-sc">{activeChat.group.description}</p>
            )}

            <div>
              <p className="text-cap-l font-bold text-lab-pr mb-2">
                Members ({activeChat.participants?.length || 0})
              </p>
              <div className="max-h-52 overflow-y-auto space-y-2">
                {(activeChat.participants || []).map((p) => {
                  const participantId = String(p.user._id);
                  const canRemove = myParticipantRole === 'owner' && participantId !== user.id;
                  return (
                    <div
                      key={participantId}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-bord-pr p-2.5"
                    >
                      <Link
                        href={`/${p.user.username}`}
                        className="flex items-center gap-2.5 min-w-0"
                        onClick={() => setGroupInfoOpen(false)}
                      >
                        <Avatar src={p.user.avatar} alt={p.user.username} size="sm" />
                        <div className="min-w-0">
                          <p className="text-par-n font-semibold text-lab-pr truncate">
                            {p.user.firstName} {p.user.lastName}
                          </p>
                          <p className="text-cap-s text-lab-sc truncate">
                            @{p.user.username} {p.role === 'owner' ? '· Owner' : ''}
                          </p>
                        </div>
                      </Link>
                      {canRemove && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveParticipant(participantId)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-bord-pr">
              <Input
                label="Invite people"
                placeholder="Search username or name..."
                value={inviteUserQuery}
                onChange={(e) => setInviteUserQuery(e.target.value)}
              />
              <div className="max-h-40 overflow-y-auto space-y-1.5">
                {inviteUserResults.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-bord-pr p-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar src={u.avatar} alt={u.username} size="sm" />
                      <span className="text-par-n text-lab-pr truncate">@{u.username}</span>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => handleInviteToGroup(u.id)}>
                      <UserPlus className="h-3.5 w-3.5" /> Invite
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {myParticipantRole !== 'owner' && (
              <Button
                type="button"
                variant="danger"
                className="w-full"
                onClick={() => handleChatAction('leave_group')}
              >
                <LogOut className="h-4 w-4" /> Leave Group
              </Button>
            )}
          </div>
        </Modal>
      )}

      {/* Direct Chat Info Sheet Modal (PHP ChatInfoSheet parity) */}
      {activeChat?.type === 'direct' && (
        <Modal
          open={directInfoOpen}
          onClose={() => setDirectInfoOpen(false)}
          title="Conversation Info"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-fill-qt">
              <Avatar src={activeAvatar} alt={activeTitle} online={interlocutorOnline} size="md" />
              <div className="min-w-0">
                <p className="text-par-l font-bold text-lab-pr truncate">{activeTitle}</p>
                {interlocutor?.username && (
                  <p className="text-cap-l text-lab-sc truncate">@{interlocutor.username}</p>
                )}
              </div>
            </div>

            <div className="divide-y divide-bord-pr rounded-2xl border border-bord-pr overflow-hidden">
              {interlocutor?.username && (
                <Link
                  href={`/${interlocutor.username}`}
                  onClick={() => setDirectInfoOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-par-n text-lab-pr hover:bg-fill-pr"
                >
                  <ExternalLink className="h-4 w-4 text-lab-sc" />
                  View profile
                </Link>
              )}
              <button
                type="button"
                onClick={() => {
                  setDirectInfoOpen(false);
                  setThreadSearchOpen(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-par-n text-lab-pr hover:bg-fill-pr cursor-pointer"
              >
                <Search className="h-4 w-4 text-lab-sc" />
                Search messages
              </button>
              <button
                type="button"
                onClick={() => {
                  setDirectInfoOpen(false);
                  void handleChatAction(isArchivedChat ? 'unarchive' : 'archive');
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-par-n text-lab-pr hover:bg-fill-pr cursor-pointer"
              >
                <Archive className="h-4 w-4 text-lab-sc" />
                {isArchivedChat ? 'Unarchive conversation' : 'Archive conversation'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDirectInfoOpen(false);
                  void handleChatAction('clear');
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-par-n text-lab-pr hover:bg-fill-pr cursor-pointer"
              >
                <X className="h-4 w-4 text-lab-sc" />
                Clear history
              </button>
              <button
                type="button"
                onClick={() => {
                  setDirectInfoOpen(false);
                  void handleChatAction('delete');
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-par-n text-red-600 hover:bg-fill-pr cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
                Delete conversation
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Mobile Touch Message Action Sheet Modal */}
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
                    onClick={() => {
                      const target = mobileActionMsg;
                      setMobileActionMsg(null);
                      void handleTranslateMessage(target);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-par-n text-lab-pr hover:bg-fill-pr cursor-pointer"
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
