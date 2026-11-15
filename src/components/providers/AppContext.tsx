'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  };
  logos: {
    light: string;
    dark: string;
    favicon?: string;
    watermark?: string;
  };
  verification?: {
    serviceUrl: string;
  };
  giphyEnabled?: boolean;
  translationEnabled?: boolean;
  ipGeoEnabled?: boolean;
  attributionEnabled?: boolean;
}

export interface BootstrapData {
  config: BootstrapConfig;
  currencies: CurrencyItem[];
  locales: LocaleItem[];
  user: BootstrapUser | null;
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const didInitBootstrapRef = useRef(false);

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
      try {
        sessionStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: next }));
      } catch {
        // ignore storage quota errors
      }
      return next;
    });
  }, []);

  const refreshBootstrap = useCallback(async () => {
    try {
      const data = await apiFetch<BootstrapData>('/bootstrap');
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
      try {
        sessionStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
      } catch {
        // ignore storage quota errors
      }
    } catch {
      // Fallback to default state if API unreachable
    } finally {
      setLoading(false);
    }
  }, [applyLocaleAttrs, applyThemeClass]);

  useEffect(() => {
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
    let shouldRefresh = !initialBootstrap;
    queueMicrotask(() => {
      try {
        const cachedRaw = sessionStorage.getItem(BOOTSTRAP_CACHE_KEY);
        if (cachedRaw && !initialBootstrap) {
          const parsed = JSON.parse(cachedRaw) as { ts?: number; data?: BootstrapData };
          const ageMs = typeof parsed?.ts === 'number' ? Date.now() - parsed.ts : Infinity;
          if (parsed?.data && ageMs < 5 * 60_000) {
            setBootstrap(parsed.data);
            setCounters(parsed.data.counters || { unreadNotifications: 0, unreadMessages: 0 });
            const cachedLoc = parsed.data.user?.language || parsed.data.config?.defaultLocale;
            if (cachedLoc) {
              setLocaleState(cachedLoc);
              applyLocaleAttrs(cachedLoc, parsed.data.locales);
            }
            setLoading(false);
            if (ageMs < 20_000) {
              shouldRefresh = false;
            }
          }
        }
      } catch {
        // ignore cache parse errors
      }
      if (shouldRefresh) {
        void refreshBootstrap();
      }
    });
  }, [refreshBootstrap, applyThemeClass, applyLocaleAttrs, initialBootstrap]);

  // Register or unregister PWA service worker matching Admin pwaEnabled setting
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (!bootstrap?.config) return;
    const pwaEnabled = bootstrap.config.pwaEnabled !== false;
    if (pwaEnabled) {
      navigator.serviceWorker.register('/pwa/service-worker.js').catch(() => undefined);
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

  // Firebase Auth ID token sync
  useEffect(() => {
    if (!isFirebaseClientConfigured()) return;
    try {
      const auth = getFirebaseClientAuth();
      const unsub = onIdTokenChanged(auth, async (fbUser) => {
        if (fbUser && !bootstrap?.user) {
          try {
            const idToken = await fbUser.getIdToken();
            await apiFetch('/auth/session', { method: 'POST', json: { idToken } });
            await refreshBootstrap();
          } catch {
            // session sync deferred to explicit login
          }
        }
      });
      return () => unsub();
    } catch {
      return undefined;
    }
  }, [bootstrap?.user, refreshBootstrap]);

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
      setBootstrap((prev) =>
        prev && prev.user ? { ...prev, user: { ...prev.user, theme: next } } : prev
      );
      try {
        sessionStorage.removeItem(BOOTSTRAP_CACHE_KEY);
      } catch {
        // ignore
      }
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
      setBootstrap((prev) =>
        prev && prev.user ? { ...prev, user: { ...prev.user, language: normalized } } : prev
      );
      try {
        localStorage.setItem('cp_locale', normalized);
        sessionStorage.removeItem(BOOTSTRAP_CACHE_KEY);
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
    try {
      sessionStorage.removeItem(BOOTSTRAP_CACHE_KEY);
    } catch {
      // ignore
    }
    socket?.disconnect();
    setBootstrap((prev) => (prev ? { ...prev, user: null } : null));
    router.push('/auth/login');
  }, [socket, router]);

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
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
