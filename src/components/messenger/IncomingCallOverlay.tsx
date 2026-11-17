'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { apiFetch } from '@/lib/api-client';
import type { Socket } from 'socket.io-client';

export interface IncomingCallData {
  callId: string;
  callUuid?: string;
  chatId: string;
  chatType?: string;
  audioOnly: boolean;
  caller: {
    id: string;
    username: string;
    name: string;
    avatar: string;
  };
}

interface IncomingCallOverlayProps {
  userId?: string | null;
  socket: Socket | null;
}

/**
 * Global incoming audio/video call banner + ringtone matching Grupo Pro
 * (`layouts/chat_page/body.php` `.call_notification` + `assets/files/defaults/call_notification.mp3`).
 */
export function IncomingCallOverlay({ userId, socket }: IncomingCallOverlayProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const dismissedIdsRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopRingtone = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  const checkIncoming = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiFetch<{ incomingCall: IncomingCallData | null }>('/calls/incoming');
      const call = res.incomingCall;
      if (!call) {
        setIncomingCall(null);
        stopRingtone();
        return;
      }
      if (dismissedIdsRef.current.has(call.callId)) return;
      if (pathname === `/messenger/c/${call.chatId}` && window.location.search.includes('answerCall')) {
        return;
      }
      setIncomingCall(call);
    } catch {
      // Ignore background poll error
    }
  }, [userId, pathname, stopRingtone]);

  // Listen for Socket.IO instant incoming call & end events
  useEffect(() => {
    if (!socket || !userId) return;

    const onIncoming = (payload: IncomingCallData) => {
      if (!payload?.callId || dismissedIdsRef.current.has(payload.callId)) return;
      setIncomingCall(payload);
    };
    const onEnded = (payload: { callId?: string; chatId?: string }) => {
      setIncomingCall((prev) => {
        if (!prev) return null;
        if (payload.callId && prev.callId !== payload.callId) return prev;
        if (payload.chatId && prev.chatId !== payload.chatId) return prev;
        stopRingtone();
        return null;
      });
    };

    socket.on('chat:call:incoming', onIncoming);
    socket.on('chat:call:ended', onEnded);
    return () => {
      socket.off('chat:call:incoming', onIncoming);
      socket.off('chat:call:ended', onEnded);
    };
  }, [socket, userId, stopRingtone]);

  // Listen for Firestore/FCM bridged custom call events
  useEffect(() => {
    if (!userId) return;
    const onBridge = (ev: Event) => {
      const detail = (ev as CustomEvent<Record<string, unknown>>).detail || {};
      const eventType = String(detail.lastEventType || detail.type || '');
      if (eventType === 'chat:call:incoming' || eventType === 'CHAT_CALL') {
        void checkIncoming();
      } else if (eventType === 'chat:call:ended') {
        const callId = detail.callId ? String(detail.callId) : undefined;
        setIncomingCall((prev) => {
          if (!prev) return null;
          if (!callId || prev.callId === callId) {
            stopRingtone();
            return null;
          }
          return prev;
        });
      }
    };
    window.addEventListener('weto:call-event', onBridge);
    return () => window.removeEventListener('weto:call-event', onBridge);
  }, [userId, checkIncoming, stopRingtone]);

  // Fallback polling for incoming calls every 4.5s (100% serverless-compatible)
  useEffect(() => {
    if (!userId) return;
    const initTimer = setTimeout(() => {
      void checkIncoming();
    }, 800);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void checkIncoming();
      }
    }, 4500);
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [userId, checkIncoming]);

  // Play / stop ringtone + auto-dismiss timeout (45s matching Grupo call timeout)
  useEffect(() => {
    if (!incomingCall) {
      stopRingtone();
      return;
    }
    if (!audioRef.current) {
      const audio = new Audio('/assets/sounds/calls/call_notification.mp3');
      audio.loop = true;
      audio.volume = 0.75;
      audioRef.current = audio;
    }
    audioRef.current.play().catch(() => {
      // Browser autoplay may require prior interaction
    });

    const autoHide = setTimeout(() => {
      dismissedIdsRef.current.add(incomingCall.callId);
      setIncomingCall(null);
      stopRingtone();
    }, 45000);

    return () => {
      clearTimeout(autoHide);
      stopRingtone();
    };
  }, [incomingCall, stopRingtone]);

  if (!incomingCall) return null;

  async function handleAccept() {
    if (!incomingCall) return;
    const targetChatId = incomingCall.chatId;
    const mode = incomingCall.audioOnly ? 'audio' : 'video';
    dismissedIdsRef.current.add(incomingCall.callId);
    stopRingtone();
    setIncomingCall(null);
    router.push(`/messenger/c/${targetChatId}?answerCall=${mode}`);
  }

  async function handleReject() {
    if (!incomingCall) return;
    const call = incomingCall;
    dismissedIdsRef.current.add(call.callId);
    stopRingtone();
    setIncomingCall(null);
    try {
      await apiFetch(`/chats/${call.chatId}/call`, {
        method: 'POST',
        json: { action: 'reject', callId: call.callId },
      });
    } catch {
      // ignore
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Incoming call notification"
      className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-[360px] z-[95] rounded-2xl border border-bord-pr bg-bg-pr/95 backdrop-blur-md shadow-2xl p-4 flex items-center gap-3.5 animate-in fade-in slide-in-from-bottom-4"
    >
      <div className="relative shrink-0">
        <Avatar src={incomingCall.caller.avatar} alt={incomingCall.caller.name} size="md" />
        <span className="absolute -bottom-0.5 -right-0.5 size-5 rounded-full bg-green-900 text-white flex items-center justify-center ring-2 ring-bg-pr animate-pulse">
          {incomingCall.audioOnly ? <Phone className="size-3" /> : <Video className="size-3" />}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-par-n font-bold text-lab-pr truncate">{incomingCall.caller.name}</p>
        <p className="text-cap-s text-lab-sc truncate">
          {incomingCall.audioOnly ? 'Incoming audio call...' : 'Incoming video call...'}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => void handleReject()}
          aria-label="Decline call"
          title="Decline"
          className="size-10 rounded-full bg-red-900 text-white flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer"
        >
          <PhoneOff className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => void handleAccept()}
          aria-label="Join call"
          title="Join"
          className="size-10 rounded-full bg-green-900 text-white flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer"
        >
          {incomingCall.audioOnly ? <Phone className="size-4" /> : <Video className="size-4" />}
        </button>
      </div>
    </div>
  );
}
