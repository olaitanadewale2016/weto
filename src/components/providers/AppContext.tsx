'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { onIdTokenChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';
import { apiFetch } from '@/lib/api-client';
import {
  getFirebaseClientAuth,
  getFirebaseClientFirestore,
  getFirebaseClientMessaging,
  isFirebaseClientConfigured,
  markFirestoreDisabled,
} from '@/lib/firebase/client';
import { getDictionary, isRtlLocale } from '@/lib/i18n';
import { publicEnv } from '@/lib/env';
import { useToast } from './ToastProvider';
import { NetworkStatusBar } from '@/components/layout/NetworkStatusBar';
import { PwaInstallPrompt } from '@/components/pwa/PwaInstallPrompt';
import { IncomingCallOverlay } from '@/components/messenger/IncomingCallOverlay';

export interface BootstrapUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string;
  cover?: string;
  bio?: string;
  verified: boolean;
  isMasterAccount?: boolean;
  role: string;
  status: string;
  type: string;
  theme: 'light' | 'dark';
  language: string;
  country?: string | null;
  city?: string | null;
  onboardingStep?: string;
  publicationsCount: number;
  followersCount: number;
  followingCount: number;
  tips?: Record<string, boolean>;
}

export interface CurrencyItem {
  code: string;
  alpha3Code?: string;
  name: string;
  symbol: string;
  symbolNative?: string;
  isDefault?: boolean;
  exchangeRate?: number;
}

export interface LocaleItem {
  code: string;
  alpha2Code?: string;
  name: string;
  nativeName?: string;
  direction?: 'ltr' | 'rtl';
  isRtl?: boolean;
  isDefault?: boolean;
}

export interface BootstrapConfig {
  appName: string;
  appDescription: string;
  defaultCurrency: string;
  defaultLocale: string;
  defaultTheme: 'light' | 'dark';
  pwaEnabled?: boolean;
  features: {
    marketplace: boolean;
    jobs: boolean;
    ads: boolean;
    wallet: boolean;
    stories: boolean;
    businessAccounts: boolean;
    aiTranslation: boolean;
    aiComposeEnabled?: boolean;
  };
  logos: {
    light: string;
    dark: string;
    favicon?: string;
    watermark?: string;
  };
  brand?: {
    darkThemeEnabled: boolean;
    imagesWatermarkEnabled: boolean;
    videosWatermarkEnabled: boolean;
    defaultTheme: 'light' | 'dark';
    logoLightUrl: string;
    logoDarkUrl: string;
    faviconUrl: string;
    watermarkUrl: string;
  };
  verification?: {
    serviceUrl: string;
  };
  ads?: {
    billingModel?: string;
    pricePerView: number;
    pricePerClick?: number;
    minBudget: number;
    defaultBudget: number;
    refreshIntervalMinutes?: number;
  };
  promotions?: {
    enabled: boolean;
    price3d: number;
    price7d: number;
    price14d: number;
  };
  giphyEnabled?: boolean;
  translationEnabled?: boolean;
  ipGeoEnabled?: boolean;
  attributionEnabled?: boolean;
}

export interface PreviousAccountSummary {
  id: string;
  username: string;
  fullName: string;
  avatar?: string;
  isMaster?: boolean;
}

export interface CommunityGroupSummary {
  id: string;
  name: string;
  description: string;
  avatar: string;
  category: string;
  verified: boolean;
  isPinned: boolean;
  isPasswordProtected: boolean;
  isPaid?: boolean;
  entryPrice?: number;
  membersCount: number;
  isJoined: boolean;
}

export interface BootstrapData {
  config: BootstrapConfig;
  currencies: CurrencyItem[];
  locales: LocaleItem[];
  communityGroups?: CommunityGroupSummary[];
  user: BootstrapUser | null;
  previousAccount?: PreviousAccountSummary | null;
  counters: {
    unreadNotifications: number;
    unreadMessages: number;
  };
}

export interface SoundbarTrack {
  id: string;
  title: string;
  artist?: string;
  src: string;
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface AppContextValue {
  loading: boolean;
  bootstrap: BootstrapData | null;
  user: BootstrapUser | null;
  theme: 'light' | 'dark';
  locale: string;
  dict: ReturnType<typeof getDictionary>;
  counters: { unreadNotifications: number; unreadMessages: number };
  socket: Socket | null;
  onlineUsers: Set<string>;
  soundbarTrack: SoundbarTrack | null;
  isAudioPlaying: boolean;
  canInstallPwa: boolean;
  isPwaInstalled: boolean;
  isIosDevice: boolean;
  pwaInstallGuideOpen: boolean;
  setPwaInstallGuideOpen: React.Dispatch<React.SetStateAction<boolean>>;
  promptPwaInstall: () => Promise<'accepted' | 'dismissed' | 'guide'>;
  refreshBootstrap: () => Promise<void>;
  updateUserPatch: (patch: Partial<BootstrapUser>) => void;
  setTheme: (next: 'light' | 'dark') => Promise<void>;
  toggleTheme: () => Promise<void>;
  setLocale: (next: string) => Promise<void>;
  setCounters: React.Dispatch<React.SetStateAction<{ unreadNotifications: number; unreadMessages: number }>>;
  playAudio: (track: SoundbarTrack) => void;
  togglePlayAudio: () => void;
  closeSoundbar: () => void;
  enablePushNotifications: () => Promise<boolean>;
  logout: () => Promise<void>;
}

const BOOTSTRAP_CACHE_KEY = 'weto_bootstrap_v1';
const BOOTSTRAP_CACHE_MAX_AGE_MS = 24 * 60 * 60_000;

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function readCachedBootstrap(): { ts: number; data: BootstrapData } | null {
  if (typeof window === 'undefined') return null;
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      const raw = storage.getItem(BOOTSTRAP_CACHE_KEY);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { ts?: number; data?: BootstrapData };
      const ts = typeof parsed?.ts === 'number' ? parsed.ts : 0;
      if (parsed?.data && Date.now() - ts < BOOTSTRAP_CACHE_MAX_AGE_MS) {
        return { ts, data: parsed.data };
      }
    } catch {
      // ignore cache parse/storage errors
    }
  }
  return null;
}

function writeCachedBootstrap(data: BootstrapData) {
  if (typeof window === 'undefined') return;
  const payload = JSON.stringify({ ts: Date.now(), data });
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      storage.setItem(BOOTSTRAP_CACHE_KEY, payload);
    } catch {
      // ignore storage quota errors
    }
  }
}

export function clearBootstrapCache() {
  if (typeof window === 'undefined') return;
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      storage.removeItem(BOOTSTRAP_CACHE_KEY);
    } catch {
      // ignore storage errors
    }
  }
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  children,
  initialBootstrap,
}: {
  children: React.ReactNode;
  initialBootstrap?: BootstrapData | null;
}) {
  const router = useRouter();
  const { info, error: showError, success } = useToast();
  const [loading, setLoading] = useState(!initialBootstrap);
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(initialBootstrap ?? null);
  const [theme, setThemeState] = useState<'light' | 'dark'>(
    initialBootstrap?.user?.theme || initialBootstrap?.config?.defaultTheme || 'light'
  );
  const [locale, setLocaleState] = useState<string>(
    initialBootstrap?.user?.language || initialBootstrap?.config?.defaultLocale || 'en'
  );
  const [counters, setCounters] = useState(
    initialBootstrap?.counters || { unreadNotifications: 0, unreadMessages: 0 }
  );
  const [socket, setSocket] = useState<Socket | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [soundbarTrack, setSoundbarTrack] = useState<SoundbarTrack | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);
  const [isIosDevice, setIsIosDevice] = useState(false);
  const [pwaInstallGuideOpen, setPwaInstallGuideOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const didInitBootstrapRef = useRef(false);
  const bootstrapResolvedRef = useRef(Boolean(initialBootstrap));
  const bootstrapUserRef = useRef<BootstrapUser | null>(initialBootstrap?.user ?? null);
  const isLoggingOutRef = useRef(false);

  const applyThemeClass = useCallback((mode: 'light' | 'dark') => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (mode === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      localStorage.setItem('cp_theme', mode);
    } catch {
      // ignore storage errors
    }
  }, []);

  const applyLocaleAttrs = useCallback(
    (nextLocale: string, localesList?: LocaleItem[]) => {
      if (typeof document === 'undefined') return;
      const root = document.documentElement;
      root.lang = nextLocale || 'en';
      root.dir = isRtlLocale(nextLocale, localesList) ? 'rtl' : 'ltr';
    },
    []
  );

  const updateUserPatch = useCallback((patch: Partial<BootstrapUser>) => {
    const cleanPatch = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined)
    ) as Partial<BootstrapUser>;
    setBootstrap((prev) => {
      if (!prev || !prev.user) return prev;
      const next: BootstrapData = {
        ...prev,
        user: { ...prev.user, ...cleanPatch },
      };
      writeCachedBootstrap(next);
      return next;
    });
  }, []);

  const refreshBootstrap = useCallback(async () => {
    try {
      const data = await apiFetch<BootstrapData>('/bootstrap');
      bootstrapUserRef.current = data.user ?? null;
      setBootstrap(data);
      setCounters(data.counters || { unreadNotifications: 0, unreadMessages: 0 });
      const resolvedTheme =
        (typeof window !== 'undefined' && (localStorage.getItem('cp_theme') as 'light' | 'dark' | null)) ||
        data.user?.theme ||
        data.config?.defaultTheme ||
        'light';
      setThemeState(resolvedTheme);
      applyThemeClass(resolvedTheme);

      let savedLocale: string | null = null;
      try {
        savedLocale = typeof window !== 'undefined' ? localStorage.getItem('cp_locale') : null;
      } catch {
        // ignore storage errors
      }
      const nextLocale =
        data.user?.language || savedLocale || data.config?.defaultLocale || 'en';
      setLocaleState(nextLocale);
      applyLocaleAttrs(nextLocale, data.locales);
      writeCachedBootstrap(data);
    } catch {
      // Fallback to default state if API unreachable
    } finally {
      bootstrapResolvedRef.current = true;
      setLoading(false);
    }
  }, [applyLocaleAttrs, applyThemeClass]);

  useIsomorphicLayoutEffect(() => {
    if (didInitBootstrapRef.current) return;
    didInitBootstrapRef.current = true;
    try {
      const savedTheme = localStorage.getItem('cp_theme') as 'light' | 'dark' | null;
      if (savedTheme === 'dark' || savedTheme === 'light') {
        applyThemeClass(savedTheme);
        queueMicrotask(() => setThemeState(savedTheme));
      }
      const resolvedLocale =
        (typeof window !== 'undefined' && localStorage.getItem('cp_locale')) ||
        initialBootstrap?.user?.language ||
        initialBootstrap?.config?.defaultLocale ||
        'en';
      applyLocaleAttrs(resolvedLocale, initialBootstrap?.locales);
    } catch {
      // ignore
    }

    if (initialBootstrap) {
      bootstrapUserRef.current = initialBootstrap.user ?? null;
      bootstrapResolvedRef.current = true;
      return;
    }

    const cached = readCachedBootstrap();
    let shouldRefresh = true;
    if (cached) {
      bootstrapUserRef.current = cached.data.user ?? null;
      setBootstrap(cached.data);
      setCounters(cached.data.counters || { unreadNotifications: 0, unreadMessages: 0 });
      const cachedLoc = cached.data.user?.language || cached.data.config?.defaultLocale;
      if (cachedLoc) {
        setLocaleState(cachedLoc);
        applyLocaleAttrs(cachedLoc, cached.data.locales);
      }
      const hasStoredToken =
        typeof window !== 'undefined' && Boolean(localStorage.getItem('cp_token'));
      // Only mark loading false if we actually have an authenticated cached user, OR if we know there is no stored token
      if (cached.data.user) {
        setLoading(false);
        if (Date.now() - cached.ts < 20_000) {
          bootstrapResolvedRef.current = true;
          shouldRefresh = false;
        }
      } else if (!hasStoredToken) {
        setLoading(false);
      }
    }
    if (shouldRefresh) {
      void refreshBootstrap();
    }
  }, [refreshBootstrap, applyThemeClass, applyLocaleAttrs, initialBootstrap]);

  // Capture browser PWA installability & detect standalone / iOS Safari mode
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const ua = nav.userAgent || '';
    const ios =
      /iphone|ipad|ipod/i.test(ua) ||
      (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1);
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true;

    queueMicrotask(() => {
      setIsIosDevice(ios);
      setIsPwaInstalled(Boolean(standalone));
    });

    const onBeforeInstallPrompt = (ev: Event) => {
      ev.preventDefault();
      setDeferredInstallPrompt(ev as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setDeferredInstallPrompt(null);
      setIsPwaInstalled(true);
      setPwaInstallGuideOpen(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const promptPwaInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'guide'> => {
    if (deferredInstallPrompt) {
      try {
        await deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setDeferredInstallPrompt(null);
          setIsPwaInstalled(true);
          return 'accepted';
        }
        return 'dismissed';
      } catch {
        setPwaInstallGuideOpen(true);
        return 'guide';
      }
    }
    setPwaInstallGuideOpen(true);
    return 'guide';
  }, [deferredInstallPrompt]);

  // Register or unregister PWA service worker matching Admin pwaEnabled setting
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (!bootstrap?.config) return;
    const pwaEnabled = bootstrap.config.pwaEnabled !== false;
    if (pwaEnabled) {
      navigator.serviceWorker
        .register('/pwa/service-worker.js', { updateViaCache: 'none' })
        .catch(() => undefined);
    } else {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
          regs.forEach((reg) => {
            if (reg.active?.scriptURL?.includes('/pwa/service-worker.js')) {
              reg.unregister().catch(() => undefined);
            }
          });
        })
        .catch(() => undefined);
    }
  }, [bootstrap?.config]);

  // Sync browser tab favicon with configured Admin Branding favicon
  useEffect(() => {
    const fav = bootstrap?.config?.logos?.favicon;
    if (!fav || typeof document === 'undefined') return;
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    if (link.getAttribute('href') !== fav) {
      link.href = fav;
    }
  }, [bootstrap?.config?.logos?.favicon]);

  // Firebase Auth ID token sync — persist client token and establish server session if needed
  useEffect(() => {
    if (!isFirebaseClientConfigured()) return;
    try {
      const auth = getFirebaseClientAuth();
      const unsub = onIdTokenChanged(auth, async (fbUser) => {
        if (fbUser) {
          try {
            const idToken = await fbUser.getIdToken();
            try {
              localStorage.setItem('cp_token', idToken);
            } catch {
              // ignore storage errors
            }
            if (!bootstrapUserRef.current && !isLoggingOutRef.current) {
              await apiFetch('/auth/session', { method: 'POST', json: { idToken } });
              await refreshBootstrap();
            }
          } catch {
            // session sync deferred to explicit login
          }
        } else if (!isLoggingOutRef.current) {
          try {
            localStorage.removeItem('cp_token');
          } catch {
            // ignore
          }
        }
      });
      return () => unsub();
    } catch {
      return undefined;
    }
  }, [refreshBootstrap]);

  // Socket.IO connection for logged-in users
  useEffect(() => {
    const userId = bootstrap?.user?.id;
    const rtUrl = publicEnv.realtimeUrl;
    if (!userId || !rtUrl) {
      return;
    }

    let active = true;
    let client: Socket | null = null;

    async function connectSocket() {
      let token: string | undefined;
      if (isFirebaseClientConfigured()) {
        try {
          const auth = getFirebaseClientAuth();
          if (auth.currentUser) {
            token = await auth.currentUser.getIdToken();
          }
        } catch {
          // fallback if no firebase client token
        }
      }

      if (!active) return;

      client = io(rtUrl, {
        transports: ['websocket', 'polling'],
        withCredentials: true,
        auth: { token, userId },
      });

      client.on('connect', () => {
        client?.emit('presence:online');
      });

      client.on('presence:list', (ids: string[]) => {
        setOnlineUsers(new Set(ids));
      });

      client.on('presence:update', (payload: { userId: string; online: boolean }) => {
        setOnlineUsers((prev) => {
          const next = new Set(prev);
          if (payload.online) next.add(payload.userId);
          else next.delete(payload.userId);
          return next;
        });
      });

      client.on('notification:new', (payload: { title?: string; message?: string }) => {
        setCounters((prev) => ({ ...prev, unreadNotifications: prev.unreadNotifications + 1 }));
        if (payload?.title || payload?.message) {
          info(payload.title || 'New notification', payload.message);
        }
        try {
          if (typeof window !== 'undefined' && localStorage.getItem('notificationsSound') === '1') {
            const audio = new Audio('/assets/sounds/notifications/notification-received.mp3');
            audio.volume = 0.6;
            audio.play().catch(() => undefined);
          }
        } catch {
          // ignore audio playback restrictions
        }
      });

      client.on('message:new', (payload: { senderId?: string }) => {
        if (payload?.senderId && payload.senderId !== userId) {
          setCounters((prev) => ({ ...prev, unreadMessages: prev.unreadMessages + 1 }));
        }
      });

      client.on('counter:update', (payload: Partial<{ unreadNotifications: number; unreadMessages: number }>) => {
        setCounters((prev) => ({
          unreadNotifications: payload.unreadNotifications ?? prev.unreadNotifications,
          unreadMessages: payload.unreadMessages ?? prev.unreadMessages,
        }));
      });

      setSocket(client);
    }

    connectSocket();

    return () => {
      active = false;
      client?.disconnect();
      setSocket(null);
    };
  }, [bootstrap?.user?.id, info]);

  // Serverless polling fallback when no external Socket.IO server is configured
  useEffect(() => {
    if (!bootstrap?.user?.id || publicEnv.realtimeUrl) return;
    const syncIfVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshBootstrap();
      }
    };
    const interval = setInterval(syncIfVisible, 30000);
    document.addEventListener('visibilitychange', syncIfVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', syncIfVisible);
    };
  }, [bootstrap?.user?.id, refreshBootstrap]);

  const dispatchRealtimePayload = useCallback(
    (data: Record<string, unknown>, fallbackTitle?: string, fallbackBody?: string) => {
      const eventType = String(data.type || data.lastEventType || '');
      const title = String(data.title || fallbackTitle || 'Weto');
      const body = String(data.message || fallbackBody || '');
      const chatId = data.chatId ? String(data.chatId) : undefined;
      const inActiveChat =
        typeof window !== 'undefined' &&
        Boolean(chatId) &&
        window.location.pathname === `/messenger/c/${chatId}`;

      if (
        eventType === 'CHAT_CALL' ||
        eventType === 'chat:call:incoming' ||
        eventType === 'chat:call:ended'
      ) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('weto:call-event', { detail: data }));
        }
        return;
      }

      if (eventType === 'CHAT_MESSAGE' || eventType === 'chat:inbox:update') {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('weto:chat-event', { detail: data }));
        }
        if (!inActiveChat) {
          setCounters((prev) => ({ ...prev, unreadMessages: prev.unreadMessages + 1 }));
          if (title || body) info(title, body);
        }
        return;
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('weto:notification-event', { detail: data }));
      }
      const unreadRaw = data.unreadNotifications ?? data.unreadCount;
      const parsedUnread = unreadRaw !== undefined ? Number(unreadRaw) : Number.NaN;
      setCounters((prev) => ({
        ...prev,
        unreadNotifications: Number.isFinite(parsedUnread)
          ? parsedUnread
          : prev.unreadNotifications + 1,
      }));
      if (title || body) info(title, body);
    },
    [info]
  );

  const registerFcmDeviceToken = useCallback(async (promptUser: boolean): Promise<boolean> => {
    try {
      if (typeof window === 'undefined' || !('Notification' in window)) return false;
      const permission =
        Notification.permission === 'granted'
          ? 'granted'
          : promptUser
            ? await Notification.requestPermission()
            : 'default';

      if (permission !== 'granted') {
        if (promptUser) showError('Push permission denied');
        return false;
      }

      const messaging = await getFirebaseClientMessaging();
      if (!messaging || !publicEnv.firebase.vapidKey) {
        if (promptUser) showError('FCM VAPID key is not configured');
        return false;
      }

      const swParams = new URLSearchParams({
        apiKey: publicEnv.firebase.apiKey,
        projectId: publicEnv.firebase.projectId,
        messagingSenderId: publicEnv.firebase.messagingSenderId,
        appId: publicEnv.firebase.appId,
      });
      const swReg = await navigator.serviceWorker.register(
        `/firebase-messaging-sw.js?${swParams.toString()}`
      );
      const token = await getToken(messaging, {
        vapidKey: publicEnv.firebase.vapidKey,
        serviceWorkerRegistration: swReg,
      });
      if (!token) return false;

      await apiFetch('/devices', {
        method: 'POST',
        json: { fcmToken: token, enabled: true },
      });
      return true;
    } catch (err) {
      if (promptUser) {
        showError('Failed to enable notifications', err instanceof Error ? err.message : undefined);
      }
      return false;
    }
  }, [showError]);

  // Auto-sync FCM token silently when permission is already granted & listen for foreground/SW events
  useEffect(() => {
    if (!bootstrap?.user?.id || !isFirebaseClientConfigured()) return;
    let unsub: (() => void) | undefined;

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      void registerFcmDeviceToken(false);
    }

    getFirebaseClientMessaging()
      .then((messaging) => {
        if (!messaging) return;
        unsub = onMessage(messaging, (payload) => {
          dispatchRealtimePayload(
            (payload.data || {}) as Record<string, unknown>,
            payload.notification?.title,
            payload.notification?.body
          );
        });
      })
      .catch(() => undefined);

    const onSwMessage = (ev: MessageEvent) => {
      if (ev.data?.type === 'WETO_FCM_EVENT' && ev.data?.data) {
        dispatchRealtimePayload(ev.data.data as Record<string, unknown>);
      }
    };
    navigator.serviceWorker?.addEventListener('message', onSwMessage);

    return () => {
      unsub?.();
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    };
  }, [bootstrap?.user?.id, registerFcmDeviceToken, dispatchRealtimePayload]);

  // Firebase Firestore live user realtime channel (notifications & inbox badges when Firestore is enabled)
  useEffect(() => {
    const userId = bootstrap?.user?.id;
    if (!userId || !isFirebaseClientConfigured()) return;
    const db = getFirebaseClientFirestore();
    if (!db) return;

    let firstSnapshot = true;
    const unsub = onSnapshot(
      doc(db, 'users_realtime', userId),
      (snap) => {
        if (!snap.exists()) {
          firstSnapshot = false;
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        if (typeof data.unreadNotifications === 'number') {
          setCounters((prev) => ({ ...prev, unreadNotifications: data.unreadNotifications as number }));
        }
        if (firstSnapshot) {
          firstSnapshot = false;
          return;
        }
        dispatchRealtimePayload(data);
      },
      () => {
        markFirestoreDisabled();
      }
    );

    return () => unsub();
  }, [bootstrap?.user?.id, dispatchRealtimePayload]);

  const setTheme = useCallback(
    async (next: 'light' | 'dark') => {
      setThemeState(next);
      applyThemeClass(next);
      setBootstrap((prev) => {
        if (!prev || !prev.user) return prev;
        const updated = { ...prev, user: { ...prev.user, theme: next } };
        writeCachedBootstrap(updated);
        return updated;
      });
      if (bootstrap?.user) {
        try {
          await apiFetch('/settings', { method: 'PATCH', json: { section: 'theme', data: { theme: next } } });
        } catch {
          // local preference still persisted
        }
      }
    },
    [applyThemeClass, bootstrap?.user]
  );

  const toggleTheme = useCallback(async () => {
    await setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const setLocale = useCallback(
    async (next: string) => {
      const normalized = (next || 'en').toLowerCase().slice(0, 2);
      setLocaleState(normalized);
      applyLocaleAttrs(normalized, bootstrap?.locales);
      setBootstrap((prev) => {
        if (!prev || !prev.user) return prev;
        const updated = { ...prev, user: { ...prev.user, language: normalized } };
        writeCachedBootstrap(updated);
        return updated;
      });
      try {
        localStorage.setItem('cp_locale', normalized);
      } catch {
        // ignore storage errors
      }
      if (bootstrap?.user) {
        try {
          await apiFetch('/settings', { method: 'PATCH', json: { section: 'language', data: { language: normalized } } });
        } catch {
          // ignore
        }
      }
    },
    [applyLocaleAttrs, bootstrap?.locales, bootstrap?.user]
  );

  const enablePushNotifications = useCallback(async (): Promise<boolean> => {
    const ok = await registerFcmDeviceToken(true);
    if (ok) success('Push notifications enabled');
    return ok;
  }, [registerFcmDeviceToken, success]);

  const logout = useCallback(async () => {
    isLoggingOutRef.current = true;
    try {
      localStorage.removeItem('cp_token');
    } catch {
      // ignore
    }
    try {
      await apiFetch('/auth/session', { method: 'DELETE' });
    } catch {
      // ignore
    }
    if (isFirebaseClientConfigured()) {
      try {
        await signOut(getFirebaseClientAuth());
      } catch {
        // ignore
      }
    }
    bootstrapUserRef.current = null;
    clearBootstrapCache();
    socket?.disconnect();
    setBootstrap((prev) => (prev ? { ...prev, user: null } : null));
    isLoggingOutRef.current = false;
    window.location.assign('/auth/login');
  }, [socket]);

  const playAudio = useCallback((track: SoundbarTrack) => {
    setSoundbarTrack(track);
    setIsAudioPlaying(true);
    if (!audioRef.current) {
      audioRef.current = new Audio(track.src);
      audioRef.current.onended = () => setIsAudioPlaying(false);
    } else if (audioRef.current.src !== track.src) {
      audioRef.current.src = track.src;
    }
    audioRef.current.play().catch(() => setIsAudioPlaying(false));
  }, []);

  const togglePlayAudio = useCallback(() => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play().catch(() => undefined);
      setIsAudioPlaying(true);
    } else {
      audioRef.current.pause();
      setIsAudioPlaying(false);
    }
  }, []);

  const closeSoundbar = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setSoundbarTrack(null);
    setIsAudioPlaying(false);
  }, []);

  useEffect(() => {
    const pauseAll = () => {
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsAudioPlaying(false);
      }
    };
    window.addEventListener('weto:pause-all-audio', pauseAll);
    return () => window.removeEventListener('weto:pause-all-audio', pauseAll);
  }, []);

  const dict = useMemo(() => getDictionary(locale), [locale]);

  const handleNetworkReconnect = useCallback(async () => {
    await refreshBootstrap();
    if (socket && !socket.connected) {
      socket.connect();
    }
  }, [refreshBootstrap, socket]);

  return (
    <AppContext.Provider
      value={{
        loading,
        bootstrap,
        user: bootstrap?.user ?? null,
        theme,
        locale,
        dict,
        counters,
        socket,
        onlineUsers,
        soundbarTrack,
        isAudioPlaying,
        canInstallPwa: Boolean(deferredInstallPrompt),
        isPwaInstalled,
        isIosDevice,
        pwaInstallGuideOpen,
        setPwaInstallGuideOpen,
        promptPwaInstall,
        refreshBootstrap,
        updateUserPatch,
        setTheme,
        toggleTheme,
        setLocale,
        setCounters,
        playAudio,
        togglePlayAudio,
        closeSoundbar,
        enablePushNotifications,
        logout,
      }}
    >
      {children}
      <NetworkStatusBar onReconnect={handleNetworkReconnect} />
      <PwaInstallPrompt />
      <IncomingCallOverlay userId={bootstrap?.user?.id} socket={socket} />
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
