'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  Minimize2,
  Monitor,
  MonitorOff,
  PhoneOff,
  Settings,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';
import type { Socket } from 'socket.io-client';

export interface CallParticipantMeta {
  userId: string;
  user?: {
    _id: string;
    username: string;
    firstName: string;
    lastName: string;
    avatar: string;
  } | null;
  muted: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
  remoteMutedByAdmin?: boolean;
}

export interface ActiveCallSnapshot {
  id: string;
  callUuid: string;
  chatId: string;
  chatType: 'direct' | 'group';
  initiatorId: string;
  audioOnly: boolean;
  status: string;
  participants: CallParticipantMeta[];
  signals?: Array<{
    id: string;
    fromUserId: string;
    toUserId: string;
    kind: 'offer' | 'answer' | 'ice';
    payload: unknown;
    createdAt?: string;
  }>;
}

interface VideoCallStageProps {
  chatId: string;
  chatType: 'direct' | 'group';
  audioOnly: boolean;
  currentUser: {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
  };
  isGroupAdmin?: boolean;
  socket: Socket | null;
  chatWindowVisible: boolean;
  minimized?: boolean;
  onToggleChatWindow: () => void;
  onToggleMinimize?: () => void;
  onExit: () => void;
}

/** Exact Grupo Pro `.toggle_push_to_talk > svg.non_active` from layouts/chat_page/middle.php */
function GrupoPttInactiveIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 470 470" fill="currentColor" className={className} aria-hidden="true">
      <g fillRule="evenodd">
        <g transform="translate(85.333333, 18.666667)">
          <path d="M206.413257,215.447893 L206.413257,130.666667 C206.413257,99.7915733 181.28835,74.6666667 150.413257,74.666667 C119.538163,74.6666667 94.4132566,99.7915733 94.4132566,130.666667 L94.4132566,250.096427 C84.0473899,241.401173 71.1085099,236.468907 57.5200299,236.468907 C41.3429632,236.468907 25.8116566,243.323093 14.9470166,255.281493 C-6.06205009,278.304853 -4.69501009,313.828267 17.6045099,335.429973 C17.6330966,335.45856 17.6435499,335.48992 17.6721366,335.518507 L112,426.666667 L320,426.666667 L320,250.666667 L206.413257,215.447893 Z M277.333333,384 C277.333333,384 128.393387,384 128,384 C128,384 53.2621099,313.552 45.9912832,306.927147 C37.7177899,299.39072 37.1202432,286.573013 44.6579499,278.29696 C52.1969366,270.023467 65.0146432,269.4272 73.2894166,276.963627 C78.8286166,282.010453 115.241417,312 115.241417,312 L131.74659,303.46624 L131.74659,130.666667 C131.74659,120.356693 140.104563,112 150.413257,112 C160.72323,112 169.079923,120.356693 169.079923,130.666667 L169.079923,248.541653 L277.333333,282.666667 L277.333333,384 Z M24.1438166,163.708373 C21.3728299,153.1328 19.7465899,142.098987 19.7465899,130.666667 C19.7465899,58.6250667 78.3612032,7.10542736e-15 150.413257,7.10542736e-15 C222.46531,7.10542736e-15 281.079923,58.6250667 281.079923,130.666667 C281.079923,142.098987 279.453683,153.1328 276.682697,163.708373 L236.211443,149.69792 C237.574643,143.552 238.413257,137.218773 238.413257,130.666667 C238.413257,82.1431467 198.936777,42.6666667 150.413257,42.6666667 C101.889737,42.6666667 62.4132566,82.1431467 62.4132566,130.666667 C62.4132566,137.218773 63.2518699,143.552 64.6150699,149.69792 L24.1438166,163.708373 Z" />
        </g>
      </g>
    </svg>
  );
}

/** Exact Grupo Pro `.toggle_push_to_talk > svg.active` from layouts/chat_page/middle.php */
function GrupoPttActiveIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="0.168" aria-hidden="true">
      <path d="M18.3569 1.61412C18.57 1.25893 19.0307 1.14376 19.3859 1.35687L19 1.99999C19.3859 1.35687 19.3855 1.35667 19.3859 1.35687L19.3873 1.35771L19.3888 1.35866L19.3925 1.36091L19.4021 1.36683C19.4095 1.3714 19.4187 1.37724 19.4297 1.38436C19.4517 1.39859 19.4808 1.41797 19.516 1.4426C19.5863 1.49182 19.6813 1.56232 19.7926 1.65508C20.0147 1.84016 20.3052 2.11666 20.5945 2.49271C21.1773 3.25044 21.75 4.40734 21.75 5.99999C21.75 7.59265 21.1773 8.74954 20.5945 9.50727C20.3052 9.88332 20.0147 10.1598 19.7926 10.3449C19.6813 10.4377 19.5863 10.5082 19.516 10.5574C19.4808 10.582 19.4517 10.6014 19.4297 10.6156C19.4187 10.6227 19.4095 10.6286 19.4021 10.6332L19.3925 10.6391L19.3888 10.6413L19.3873 10.6423C19.3869 10.6425 19.3859 10.6431 19 9.99999L19.3859 10.6431C19.0307 10.8562 18.57 10.741 18.3569 10.3859C18.1447 10.0322 18.258 9.57386 18.6097 9.35958L18.6152 9.35604C18.6225 9.35133 18.6363 9.34219 18.6558 9.32854C18.6949 9.30119 18.7562 9.25607 18.8324 9.19258C18.9853 9.06516 19.1948 8.86666 19.4055 8.59271C19.8227 8.05044 20.25 7.20734 20.25 5.99999C20.25 4.79264 19.8227 3.94954 19.4055 3.40727C19.1948 3.13332 18.9853 2.93482 18.8324 2.80741C18.7562 2.74391 18.6949 2.69879 18.6558 2.67145C18.6363 2.6578 18.6225 2.64866 18.6152 2.64394L18.6097 2.64041C18.258 2.42613 18.1447 1.96781 18.3569 1.61412Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M10 1.24999C7.37665 1.24999 5.25 3.37664 5.25 5.99999C5.25 8.62334 7.37665 10.75 10 10.75C12.6234 10.75 14.75 8.62334 14.75 5.99999C14.75 3.37664 12.6234 1.24999 10 1.24999ZM6.75 5.99999C6.75 4.20507 8.20507 2.74999 10 2.74999C11.7949 2.74999 13.25 4.20507 13.25 5.99999C13.25 7.79492 11.7949 9.24999 10 9.24999C8.20507 9.24999 6.75 7.79492 6.75 5.99999Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M10 12.25C7.96067 12.25 6.07752 12.7207 4.67815 13.5204C3.3 14.3079 2.25 15.5101 2.25 17C2.25 18.4899 3.3 19.6921 4.67815 20.4796C6.07752 21.2792 7.96067 21.75 10 21.75C12.0393 21.75 13.9225 21.2792 15.3219 20.4796C16.7 19.6921 17.75 18.4899 17.75 17C17.75 15.5101 16.7 14.3079 15.3219 13.5204C13.9225 12.7207 12.0393 12.25 10 12.25ZM3.75 17C3.75 16.2807 4.26701 15.4829 5.42236 14.8227C6.55649 14.1747 8.17334 13.75 10 13.75C11.8267 13.75 13.4435 14.1747 14.5776 14.8227C15.733 15.4829 16.25 16.2807 16.25 17C16.25 17.7193 15.733 18.517 14.5776 19.1772C13.4435 19.8253 11.8267 20.25 10 20.25C8.17334 20.25 6.55649 19.8253 5.42236 19.1772C4.26701 18.517 3.75 17.7193 3.75 17Z" fill="currentColor" />
      <path d="M17.3859 3.35687C17.0307 3.14376 16.57 3.25893 16.3569 3.61412L16.6051 4.63761L16.6129 4.64293C16.6246 4.65113 16.6468 4.66735 16.6761 4.69178C16.7353 4.74107 16.8198 4.82082 16.9055 4.93227C17.0727 5.14954 17.25 5.49264 17.25 5.99999C17.25 6.50734 17.0727 6.85044 16.9055 7.06771C16.8198 7.17916 16.7353 7.25891 16.6761 7.3082C16.6468 7.33263 16.6246 7.34885 16.6129 7.35705L16.6051 7.36237C16.257 7.57782 16.1456 8.0337 16.3569 8.38586C16.57 8.74105 17.0307 8.85622 17.3859 8.64311L17 7.99999C17.3859 8.64311 17.3855 8.64331 17.3859 8.64311L17.3872 8.6423L17.3887 8.64144L17.3918 8.63951L17.3993 8.63492L17.4185 8.6227C17.4332 8.61321 17.4515 8.60096 17.4731 8.5859C17.516 8.55582 17.572 8.51423 17.6364 8.46053C17.7647 8.35357 17.9302 8.19582 18.0945 7.98227C18.4273 7.54954 18.75 6.89264 18.75 5.99999C18.75 5.10734 18.4273 4.45044 18.0945 4.01771C17.9302 3.80416 17.7647 3.64641 17.6364 3.53945C17.572 3.48576 17.516 3.44416 17.4731 3.41408C17.4515 3.39902 17.4332 3.38678 17.4185 3.37728L17.3993 3.36507L17.3918 3.36047L17.3887 3.35855L17.3872 3.35768C17.3869 3.35748 17.3859 3.35687 17 3.99999L17.3859 3.35687Z" fill="currentColor" />
    </svg>
  );
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

function ParticipantMediaTile({
  stream,
  isLocal,
  displayName,
  avatar,
  audioOnly,
  muted,
  cameraEnabled,
  screenSharing,
  isSpeaking,
  isPinned,
  volume,
  onVolumeChange,
  onTogglePin,
  canAdminMute,
  onAdminRemoteMute,
}: {
  stream: MediaStream | null;
  isLocal: boolean;
  displayName: string;
  avatar?: string;
  audioOnly: boolean;
  muted: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
  isSpeaking: boolean;
  isPinned: boolean;
  volume?: number;
  onVolumeChange?: (val: number) => void;
  onTogglePin: () => void;
  canAdminMute?: boolean;
  onAdminRemoteMute?: (nextMuted: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const hasLiveVideo =
    !audioOnly &&
    Boolean(stream) &&
    stream!.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled) &&
    (cameraEnabled || screenSharing);

  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      v.srcObject = stream || null;
      if (stream) {
        v.muted = isLocal;
        if (!isLocal && typeof volume === 'number') {
          v.volume = Math.max(0, Math.min(1, volume / 100));
        }
        v.play().catch(() => undefined);
      }
    }
    const a = audioRef.current;
    if (a && !isLocal) {
      a.srcObject = stream || null;
      if (stream) {
        a.muted = false;
        if (typeof volume === 'number') {
          a.volume = Math.max(0, Math.min(1, volume / 100));
        }
        a.play().catch(() => undefined);
      }
    }

    return () => {
      if (v) v.srcObject = null;
      if (a) a.srcObject = null;
    };
  }, [stream, isLocal, volume, hasLiveVideo]);

  useEffect(() => {
    if (isLocal || typeof volume !== 'number') return;
    const normalized = Math.max(0, Math.min(1, volume / 100));
    if (videoRef.current) videoRef.current.volume = normalized;
    if (audioRef.current) audioRef.current.volume = normalized;
  }, [volume, isLocal]);

  return (
    <div
      className={cn(
        'relative rounded-xl overflow-hidden bg-[#1e1d1d] border transition-all flex items-center justify-center group',
        isSpeaking
          ? 'border-2 border-[#26C6DA] shadow-[0_0_14px_rgba(38,198,218,0.4)]'
          : 'border-white/10',
        isPinned ? 'w-full h-full min-h-[240px]' : 'aspect-video min-h-[150px]'
      )}
    >
      {audioOnly && !isLocal && <audio ref={audioRef} autoPlay playsInline className="hidden" />}

      {hasLiveVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={cn(
            'w-full h-full bg-[#1e1d1d] block',
            screenSharing ? 'object-contain' : 'object-cover',
            isLocal && !screenSharing && 'scale-x-[-1]'
          )}
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
          {!audioOnly && !isLocal && <audio ref={audioRef} autoPlay playsInline className="hidden" />}
          <div
            className={cn(
              'rounded-full p-1 transition-all',
              isSpeaking ? 'ring-3 ring-[#26C6DA]/70 scale-105' : ''
            )}
          >
            <Avatar src={avatar} alt={displayName} size="lg" />
          </div>
          {audioOnly && (
            <span className="text-[11px] text-white/55">
              {muted ? 'Muted' : isSpeaking ? 'Speaking' : 'Connected'}
            </span>
          )}
        </div>
      )}

      {/* Grupo-style Crisp Floating Name Tag & Subtle Hover Controls */}
      <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-1 pointer-events-auto">
          {!isLocal && typeof volume === 'number' && onVolumeChange && (
            <div className="hidden sm:flex items-center gap-1 rounded-md bg-black/60 backdrop-blur-xs px-1.5 py-1 text-white opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => onVolumeChange(volume === 0 ? 100 : 0)}
                className="cursor-pointer"
                aria-label={volume === 0 ? 'Unmute participant volume' : 'Mute participant volume'}
              >
                {volume === 0 ? <VolumeX className="size-3.5 text-red-400" /> : <Volume2 className="size-3.5" />}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => onVolumeChange(Number(e.target.value))}
                className="w-12 accent-white cursor-pointer"
                aria-label={`Volume for ${displayName}`}
              />
            </div>
          )}

          {!isLocal && canAdminMute && onAdminRemoteMute && (
            <button
              type="button"
              onClick={() => onAdminRemoteMute(!muted)}
              title={muted ? 'Allow mic' : 'Mute participant'}
              className="rounded-md bg-black/60 hover:bg-black/80 p-1 text-white cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {muted ? <Mic className="size-3.5 text-green-400" /> : <MicOff className="size-3.5 text-red-400" />}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onTogglePin}
          title={isPinned ? 'Exit spotlight view' : 'Expand to spotlight'}
          aria-label={isPinned ? 'Exit spotlight view' : 'Expand to spotlight'}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-md bg-white/95 hover:bg-white text-black px-2 py-0.5 text-[11px] font-semibold shadow-sm max-w-[70%] truncate cursor-pointer"
        >
          {muted ? (
            <MicOff className="size-3 text-red-600 shrink-0" />
          ) : (
            <Mic className={cn('size-3 shrink-0', isSpeaking ? 'text-[#0288D1]' : 'text-zinc-700')} />
          )}
          <span className="truncate">{displayName}</span>
          {screenSharing && (
            <span className="ml-0.5 rounded bg-brand-900 text-white px-1 py-0.2 text-[9px] uppercase">
              Screen
            </span>
          )}
          {isPinned ? (
            <Minimize2 className="size-3 shrink-0 text-zinc-600" />
          ) : (
            <Maximize2 className="size-3 shrink-0 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </button>
      </div>
    </div>
  );
}

/** Keeps remote peer audio tracks audible even when the call stage is minimized to a compact bar */
function MinimizedAudioSink({ stream, volume }: { stream: MediaStream; volume: number }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    a.srcObject = stream;
    a.muted = false;
    a.volume = Math.max(0, Math.min(1, volume / 100));
    a.play().catch(() => undefined);
    return () => {
      a.srcObject = null;
    };
  }, [stream, volume]);
  return <audio ref={ref} autoPlay playsInline className="hidden" />;
}

/**
 * Full Grupo Pro Video Call + Audio Call + Screen Sharing Stage
 * (`layouts/chat_page/middle.php` + `live_kit_video_chat.js` + `agora_video_chat.js` parity)
 * backed by native WebRTC PeerConnection + dual Socket.IO / MongoDB signaling.
 */
export function VideoCallStage({
  chatId,
  chatType,
  audioOnly,
  currentUser,
  isGroupAdmin = false,
  socket,
  chatWindowVisible,
  minimized = false,
  onToggleChatWindow,
  onToggleMinimize,
  onExit,
}: VideoCallStageProps) {
  const { error, info } = useToast();

  const [callId, setCallId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micMuted, setMicMuted] = useState(chatType === 'group');
  const [cameraOff, setCameraOff] = useState(audioOnly);
  const [screenSharing, setScreenSharing] = useState(false);
  const [pushToTalkMode, setPushToTalkMode] = useState(chatType === 'group');
  const [pttActive, setPttActive] = useState(false);
  const [pttLocked, setPttLocked] = useState(false);
  const [pinnedUserId, setPinnedUserId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [selectedCamId, setSelectedCamId] = useState<string>('');
  const [participants, setParticipants] = useState<CallParticipantMeta[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [remoteVolumes, setRemoteVolumes] = useState<Record<string, number>>({});
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());

  const callIdRef = useRef<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const processedSignalIdsRef = useRef<Set<string>>(new Set());
  const lastSignalIsoRef = useRef<string>('');
  const mountedRef = useRef(true);
  const exitedRef = useRef(false);
  const pttLastTapRef = useRef<number>(0);
  const pttKeyHeldRef = useRef<boolean>(false);
  const onExitRef = useRef(onExit);

  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  const sendSignal = useCallback(
    async (toUserId: string, kind: 'offer' | 'answer' | 'ice', payload: unknown) => {
      const activeCallId = callIdRef.current;
      if (!activeCallId) return;
      socket?.emit('chat:call:signal', {
        chatId,
        callId: activeCallId,
        toUserId,
        kind,
        payload,
      });
      await apiFetch(`/chats/${chatId}/call`, {
        method: 'POST',
        json: {
          action: 'signal',
          callId: activeCallId,
          toUserId,
          kind,
          payload,
        },
      }).catch(() => undefined);
    },
    [chatId, socket]
  );

  const pushStateUpdate = useCallback(
    async (patch: { muted?: boolean; cameraEnabled?: boolean; screenSharing?: boolean }) => {
      const activeCallId = callIdRef.current;
      if (!activeCallId) return;
      socket?.emit('chat:call:state', {
        chatId,
        callId: activeCallId,
        ...patch,
      });
      await apiFetch(`/chats/${chatId}/call`, {
        method: 'POST',
        json: {
          action: 'state',
          callId: activeCallId,
          ...patch,
        },
      }).catch(() => undefined);
    },
    [chatId, socket]
  );

  const getOrCreatePeer = useCallback(
    (peerUserId: string) => {
      const existing = peersRef.current.get(peerUserId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      const local = localStreamRef.current;
      if (local) {
        local.getTracks().forEach((track) => {
          pc.addTrack(track, local);
        });
      }

      const inboundStream = new MediaStream();
      pc.ontrack = (ev) => {
        if (ev.streams && ev.streams[0]) {
          setRemoteStreams((prev) => ({ ...prev, [peerUserId]: ev.streams[0] }));
        } else if (ev.track) {
          inboundStream.addTrack(ev.track);
          setRemoteStreams((prev) => ({ ...prev, [peerUserId]: inboundStream }));
        }
      };

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          void sendSignal(peerUserId, 'ice', ev.candidate.toJSON());
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          peersRef.current.delete(peerUserId);
          setRemoteStreams((prev) => {
            const next = { ...prev };
            delete next[peerUserId];
            return next;
          });
        }
      };

      peersRef.current.set(peerUserId, pc);
      return pc;
    },
    [sendSignal]
  );

  const handleIncomingSignal = useCallback(
    async (signal: {
      id?: string;
      fromUserId: string;
      kind: 'offer' | 'answer' | 'ice';
      payload: unknown;
    }) => {
      if (!signal?.fromUserId || signal.fromUserId === currentUser.id) return;
      if (signal.id && processedSignalIdsRef.current.has(signal.id)) return;
      if (signal.id) processedSignalIdsRef.current.add(signal.id);

      const pc = getOrCreatePeer(signal.fromUserId);
      try {
        if (signal.kind === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.payload as RTCSessionDescriptionInit));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal(signal.fromUserId, 'answer', answer);
        } else if (signal.kind === 'answer') {
          if (pc.signalingState !== 'stable') {
            await pc.setRemoteDescription(
              new RTCSessionDescription(signal.payload as RTCSessionDescriptionInit)
            );
          }
        } else if (signal.kind === 'ice') {
          await pc.addIceCandidate(new RTCIceCandidate(signal.payload as RTCIceCandidateInit));
        }
      } catch {
        // Ignore transient race conditions on ICE before remote description
      }
    },
    [currentUser.id, getOrCreatePeer, sendSignal]
  );

  const syncPeersWithParticipants = useCallback(
    async (list: CallParticipantMeta[]) => {
      const remoteIds = new Set(
        list.map((p) => p.userId).filter((id) => id && id !== currentUser.id)
      );

      // Clean up peers who left
      for (const [uid, pc] of peersRef.current.entries()) {
        if (!remoteIds.has(uid)) {
          pc.close();
          peersRef.current.delete(uid);
          setRemoteStreams((prev) => {
            const next = { ...prev };
            delete next[uid];
            return next;
          });
        }
      }

      // Deterministic caller-offer rule to prevent WebRTC offer glare
      for (const uid of remoteIds) {
        if (!peersRef.current.has(uid)) {
          const pc = getOrCreatePeer(uid);
          if (currentUser.id < uid) {
            try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              await sendSignal(uid, 'offer', offer);
            } catch {
              // Ignore
            }
          }
        }
      }
    },
    [currentUser.id, getOrCreatePeer, sendSignal]
  );

  const stopAllMediaSync = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        // ignore
      }
    });
    screenStreamRef.current = null;

    localStreamRef.current?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        // ignore
      }
    });
    localStreamRef.current = null;

    for (const pc of peersRef.current.values()) {
      pc.getSenders().forEach((sender) => {
        if (sender.track) {
          try {
            sender.track.stop();
          } catch {
            // ignore
          }
        }
      });
      pc.close();
    }
    peersRef.current.clear();
    setLocalStream(null);
    setRemoteStreams({});
  }, []);

  const cleanupCall = useCallback(
    async (notifyServer = true) => {
      const leavingCallId = callIdRef.current;
      callIdRef.current = null;

      // Immediately release hardware camera & microphone BEFORE network I/O
      stopAllMediaSync();

      if (notifyServer) {
        await apiFetch(`/chats/${chatId}/call`, {
          method: 'POST',
          json: { action: 'leave', callId: leavingCallId || undefined },
          keepalive: true,
        }).catch(() => undefined);
      }
    },
    [chatId, stopAllMediaSync]
  );

  const handleHangup = useCallback(() => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    const leavingCallId = callIdRef.current;
    callIdRef.current = null;

    // Instant hardware camera/mic cut at 0ms
    stopAllMediaSync();
    onExitRef.current();

    void apiFetch(`/chats/${chatId}/call`, {
      method: 'POST',
      json: { action: 'leave', callId: leavingCallId || undefined },
      keepalive: true,
    }).catch(() => undefined);
  }, [chatId, stopAllMediaSync]);

  // Initialize local media, join/start call, and enumerate audio/video devices
  useEffect(() => {
    mountedRef.current = true;
    exitedRef.current = false;
    let initStopped = false;

    async function init() {
      try {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera and microphone access requires HTTPS.');
        }

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: audioOnly ? false : { facingMode: 'user' },
          });
        } catch {
          // Graceful fallback to audio-only if webcam isn't attached
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          if (mountedRef.current && !initStopped) {
            setCameraOff(true);
          }
        }

        if (initStopped || !mountedRef.current || exitedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        // In group calls, start with PTT muted by default (Grupo mute_users_during_call/PTT parity)
        const startMuted = chatType === 'group';
        stream.getAudioTracks().forEach((t) => {
          t.enabled = !startMuted;
        });

        localStreamRef.current = stream;
        setLocalStream(stream);
        setMicMuted(startMuted);
        setPushToTalkMode(chatType === 'group');

        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (initStopped || !mountedRef.current || exitedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          localStreamRef.current = null;
          return;
        }

        const mics = devices.filter((d) => d.kind === 'audioinput');
        const cams = devices.filter((d) => d.kind === 'videoinput');
        setAudioInputs(mics);
        setVideoInputs(cams);
        const activeAudioTrack = stream.getAudioTracks()[0];
        const activeVideoTrack = stream.getVideoTracks()[0];
        if (activeAudioTrack) {
          setSelectedMicId(activeAudioTrack.getSettings().deviceId || mics[0]?.deviceId || '');
        }
        if (activeVideoTrack) {
          setSelectedCamId(activeVideoTrack.getSettings().deviceId || cams[0]?.deviceId || '');
        }

        const res = await apiFetch<{ activeCall: ActiveCallSnapshot | null }>(
          `/chats/${chatId}/call`,
          {
            method: 'POST',
            json: { action: 'start', audioOnly },
          }
        );

        if (initStopped || !mountedRef.current || exitedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          localStreamRef.current = null;
          if (res.activeCall?.id) {
            void apiFetch(`/chats/${chatId}/call`, {
              method: 'POST',
              json: { action: 'leave', callId: res.activeCall.id },
              keepalive: true,
            }).catch(() => undefined);
          }
          return;
        }

        if (!res.activeCall) {
          throw new Error('Could not establish call room.');
        }

        callIdRef.current = res.activeCall.id;
        setCallId(res.activeCall.id);
        setParticipants(res.activeCall.participants || []);
        setConnecting(false);
        await syncPeersWithParticipants(res.activeCall.participants || []);
      } catch (err) {
        if (!mountedRef.current || exitedRef.current) return;
        error('Unable to start call', err instanceof Error ? err.message : undefined);
        await cleanupCall(false);
        onExitRef.current();
      }
    }

    void init();

    return () => {
      initStopped = true;
      mountedRef.current = false;
      stopAllMediaSync();
      if (!exitedRef.current) {
        exitedRef.current = true;
        void cleanupCall(true);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, audioOnly, chatType]);

  // Socket.IO realtime call signal & status listener
  useEffect(() => {
    if (!socket || !callId) return;

    const onSignal = (payload: {
      chatId?: string;
      fromUserId: string;
      kind: 'offer' | 'answer' | 'ice';
      payload: unknown;
    }) => {
      if (payload.chatId && payload.chatId !== chatId) return;
      void handleIncomingSignal(payload);
    };

    const onEnded = (payload: { chatId?: string; reason?: string }) => {
      if (payload.chatId && payload.chatId !== chatId) return;
      if (payload.reason === 'rejected') {
        info('Call declined');
      }
      void cleanupCall(false).then(() => onExitRef.current());
    };

    const onRemoteMute = (payload: { chatId?: string; muted?: boolean }) => {
      if (payload.chatId && payload.chatId !== chatId) return;
      const forceMuted = payload.muted !== false;
      localStreamRef.current?.getAudioTracks().forEach((t) => {
        t.enabled = !forceMuted;
      });
      setMicMuted(forceMuted);
      info(forceMuted ? 'You were muted by a group admin' : 'Your microphone was enabled');
    };

    socket.on('chat:call:signal', onSignal);
    socket.on('chat:call:ended', onEnded);
    socket.on('chat:call:remote_mute', onRemoteMute);
    return () => {
      socket.off('chat:call:signal', onSignal);
      socket.off('chat:call:ended', onEnded);
      socket.off('chat:call:remote_mute', onRemoteMute);
    };
  }, [socket, callId, chatId, handleIncomingSignal, cleanupCall, info]);

  // Fast signaling & participant heartbeat polling (works on pure Vercel AND strengthens Socket.IO)
  useEffect(() => {
    if (!callId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const qs = lastSignalIsoRef.current
          ? `?after=${encodeURIComponent(lastSignalIsoRef.current)}`
          : '';
        const res = await apiFetch<{ activeCall: ActiveCallSnapshot | null }>(
          `/chats/${chatId}/call${qs}`
        );
        if (cancelled) return;
        const call = res.activeCall;
        if (!call) {
          await cleanupCall(false);
          onExitRef.current();
          return;
        }
        setParticipants(call.participants || []);

        const meRemote = call.participants.find((p) => p.userId === currentUser.id);
        if (meRemote?.remoteMutedByAdmin && !micMuted) {
          localStreamRef.current?.getAudioTracks().forEach((t) => {
            t.enabled = false;
          });
          setMicMuted(true);
        }

        await syncPeersWithParticipants(call.participants || []);

        if (call.signals && call.signals.length > 0) {
          for (const s of call.signals) {
            await handleIncomingSignal(s);
            if (s.createdAt) {
              lastSignalIsoRef.current = s.createdAt;
            }
          }
        }
      } catch {
        // ignore transient poll hiccup
      }
    };

    const interval = setInterval(() => void poll(), socket ? 3500 : 1200);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    callId,
    chatId,
    socket,
    currentUser.id,
    micMuted,
    cleanupCall,
    syncPeersWithParticipants,
    handleIncomingSignal,
  ]);

  // Active speaker audio level detector matching Grupo `activeSpeakersChanged`
  useEffect(() => {
    if (typeof window === 'undefined' || !localStream) return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioCtx();
    } catch {
      return;
    }

    const analysers: Array<{ userId: string; analyser: AnalyserNode; source: MediaStreamAudioSourceNode }> = [];
    const registerStream = (uid: string, stream: MediaStream) => {
      if (stream.getAudioTracks().length === 0 || !ctx) return;
      try {
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analysers.push({ userId: uid, analyser, source });
      } catch {
        // ignore
      }
    };

    registerStream(currentUser.id, localStream);
    for (const [uid, rStream] of Object.entries(remoteStreams)) {
      registerStream(uid, rStream);
    }

    const buf = new Uint8Array(128);
    const timer = setInterval(() => {
      const nextSpeaking = new Set<string>();
      for (const item of analysers) {
        item.analyser.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i += 1) sum += buf[i];
        const avg = sum / buf.length;
        if (avg > 14 && (item.userId !== currentUser.id || !micMuted)) {
          nextSpeaking.add(item.userId);
        }
      }
      setSpeakingUsers(nextSpeaking);
    }, 350);

    return () => {
      clearInterval(timer);
      analysers.forEach((a) => a.source.disconnect());
      void ctx?.close().catch(() => undefined);
    };
  }, [localStream, remoteStreams, currentUser.id, micMuted]);

  const toggleMic = useCallback(
    (explicitState?: boolean) => {
      const stream = localStreamRef.current;
      if (!stream) return;
      const nextMuted = explicitState !== undefined ? explicitState : !micMuted;
      stream.getAudioTracks().forEach((t) => {
        t.enabled = !nextMuted;
      });
      setMicMuted(nextMuted);
      void pushStateUpdate({ muted: nextMuted });
    },
    [micMuted, pushStateUpdate]
  );

  async function toggleCamera() {
    if (audioOnly) return;
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTracks = stream.getVideoTracks();
    const nextOff = !cameraOff;

    if (nextOff) {
      // Stop hardware camera tracks immediately so the camera LED turns off right away
      videoTracks.forEach((t) => {
        stream.removeTrack(t);
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      for (const pc of peersRef.current.values()) {
        for (const sender of pc.getSenders()) {
          if (sender.track?.kind === 'video') {
            await sender.replaceTrack(null).catch(() => undefined);
          }
        }
      }
      setLocalStream(new MediaStream(stream.getTracks()));
      setCameraOff(true);
      void pushStateUpdate({ cameraEnabled: false });
      return;
    }

    try {
      const camStream = await navigator.mediaDevices.getUserMedia({
        video: selectedCamId ? { deviceId: { exact: selectedCamId } } : { facingMode: 'user' },
      });
      const camTrack = camStream.getVideoTracks()[0];
      if (!camTrack) return;

      if (exitedRef.current || !mountedRef.current) {
        camTrack.stop();
        return;
      }

      stream.getVideoTracks().forEach((t) => {
        stream.removeTrack(t);
        t.stop();
      });
      stream.addTrack(camTrack);

      for (const pc of peersRef.current.values()) {
        const videoSender = pc.getSenders().find((s) => s.track === null || s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(camTrack).catch(() => undefined);
        } else {
          pc.addTrack(camTrack, stream);
        }
      }
      setLocalStream(new MediaStream(stream.getTracks()));
      setCameraOff(false);
      void pushStateUpdate({ cameraEnabled: true });
    } catch {
      error('Camera access unavailable');
    }
  }

  const stopScreenShare = useCallback(async () => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setScreenSharing(false);

    if (audioOnly) {
      for (const pc of peersRef.current.values()) {
        for (const sender of pc.getSenders()) {
          if (sender.track?.kind === 'video') {
            await sender.replaceTrack(null).catch(() => undefined);
          }
        }
      }
      setCameraOff(true);
      void pushStateUpdate({ screenSharing: false, cameraEnabled: false });
      return;
    }

    try {
      const camStream = await navigator.mediaDevices.getUserMedia({
        video: selectedCamId ? { deviceId: { exact: selectedCamId } } : { facingMode: 'user' },
      });
      const camTrack = camStream.getVideoTracks()[0];
      const baseStream = localStreamRef.current;
      if (camTrack && baseStream) {
        baseStream.getVideoTracks().forEach((t) => {
          baseStream.removeTrack(t);
          t.stop();
        });
        baseStream.addTrack(camTrack);
        for (const pc of peersRef.current.values()) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) {
            await sender.replaceTrack(camTrack);
          } else {
            pc.addTrack(camTrack, baseStream);
          }
        }
        setLocalStream(new MediaStream(baseStream.getTracks()));
        setCameraOff(false);
        void pushStateUpdate({ screenSharing: false, cameraEnabled: true });
      }
    } catch {
      setCameraOff(true);
      void pushStateUpdate({ screenSharing: false, cameraEnabled: false });
    }
  }, [audioOnly, selectedCamId, pushStateUpdate]);

  async function startScreenShare() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      error('Screen sharing is not supported on this browser.');
      return;
    }
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) return;

      screenStreamRef.current = displayStream;
      const baseStream = localStreamRef.current || new MediaStream();
      baseStream.getVideoTracks().forEach((t) => {
        baseStream.removeTrack(t);
        t.stop();
      });
      baseStream.addTrack(screenTrack);
      localStreamRef.current = baseStream;

      for (const pc of peersRef.current.values()) {
        const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(screenTrack);
        } else {
          pc.addTrack(screenTrack, baseStream);
        }
      }

      setLocalStream(new MediaStream(baseStream.getTracks()));
      setScreenSharing(true);
      setCameraOff(false);
      void pushStateUpdate({ screenSharing: true, cameraEnabled: true });

      screenTrack.onended = () => {
        void stopScreenShare();
      };
    } catch {
      // User cancelled screen share prompt
    }
  }

  async function switchDevice(kind: 'audio' | 'video', deviceId: string) {
    const baseStream = localStreamRef.current;
    if (!baseStream) return;
    try {
      if (kind === 'audio') {
        const nextStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } },
        });
        const nextTrack = nextStream.getAudioTracks()[0];
        if (!nextTrack) return;
        nextTrack.enabled = !micMuted;
        baseStream.getAudioTracks().forEach((t) => {
          baseStream.removeTrack(t);
          t.stop();
        });
        baseStream.addTrack(nextTrack);
        for (const pc of peersRef.current.values()) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
          if (sender) await sender.replaceTrack(nextTrack);
        }
        setSelectedMicId(deviceId);
      } else {
        const nextStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
        });
        const nextTrack = nextStream.getVideoTracks()[0];
        if (!nextTrack) return;
        nextTrack.enabled = !cameraOff;
        baseStream.getVideoTracks().forEach((t) => {
          baseStream.removeTrack(t);
          t.stop();
        });
        baseStream.addTrack(nextTrack);
        for (const pc of peersRef.current.values()) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) await sender.replaceTrack(nextTrack);
        }
        setSelectedCamId(deviceId);
        setScreenSharing(false);
      }
      setLocalStream(new MediaStream(baseStream.getTracks()));
    } catch {
      error(`Could not switch ${kind === 'audio' ? 'microphone' : 'camera'}`);
    }
  }

  const handlePttDoubleToggle = useCallback(() => {
    setPushToTalkMode(true);
    setPttLocked((prevLocked) => {
      const nextLocked = !prevLocked;
      setPttActive(nextLocked);
      toggleMic(!nextLocked);
      return nextLocked;
    });
  }, [toggleMic]);

  const handlePttPressStart = useCallback(
    (isTouch: boolean) => {
      setPushToTalkMode(true);
      if (isTouch) {
        const now = Date.now();
        const delta = now - pttLastTapRef.current;
        pttLastTapRef.current = now;
        if (delta > 0 && delta < 300) {
          handlePttDoubleToggle();
          return;
        }
      }
      if (!pttLocked) {
        setPttActive(true);
        toggleMic(false);
      }
    },
    [pttLocked, handlePttDoubleToggle, toggleMic]
  );

  const handlePttPressEnd = useCallback(() => {
    if (!pttLocked) {
      setPttActive(false);
      toggleMic(true);
    }
  }, [pttLocked, toggleMic]);

  // Full Grupo Push-to-Talk hotkey (`Space` hold or double-tap lock) matching middle.js + live_kit_video_chat.js
  useEffect(() => {
    if (!pushToTalkMode && chatType !== 'group') return;

    const isEditableTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !pttKeyHeldRef.current && !isEditableTarget(e.target)) {
        e.preventDefault();
        pttKeyHeldRef.current = true;
        handlePttPressStart(false);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && pttKeyHeldRef.current && !isEditableTarget(e.target)) {
        e.preventDefault();
        pttKeyHeldRef.current = false;
        handlePttPressEnd();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      pttKeyHeldRef.current = false;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [pushToTalkMode, chatType, handlePttPressStart, handlePttPressEnd]);

  const remoteList = participants.filter((p) => p.userId !== currentUser.id);
  const pinnedTarget =
    pinnedUserId && pinnedUserId !== currentUser.id
      ? remoteList.find((p) => p.userId === pinnedUserId) || null
      : null;

  const handleAdminRemoteMute = useCallback(
    (targetUserId: string, nextMuted: boolean) => {
      void apiFetch(`/chats/${chatId}/call`, {
        method: 'POST',
        json: {
          action: 'remote_mute',
          callId: callIdRef.current,
          targetUserId,
          muted: nextMuted,
        },
      });
    },
    [chatId]
  );

  if (minimized) {
    return (
      <div className="h-14 shrink-0 bg-[#161515] border-b border-white/10 px-3 sm:px-4 flex items-center justify-between gap-2 text-white">
        {remoteList.map((p) => {
          const rs = remoteStreams[p.userId];
          return rs ? (
            <MinimizedAudioSink key={p.userId} stream={rs} volume={remoteVolumes[p.userId] ?? 100} />
          ) : null;
        })}
        <button
          type="button"
          onClick={() => onToggleMinimize?.()}
          className="flex items-center gap-2 min-w-0 text-left cursor-pointer hover:opacity-90"
          title="Expand call view"
        >
          <span className="size-2.5 rounded-full bg-[#26C6DA] animate-pulse shrink-0" />
          <span className="text-par-s font-semibold truncate">
            {connecting ? 'Connecting...' : screenSharing ? 'Screen Share' : audioOnly ? 'Audio Call' : 'Video Call'}
          </span>
          <span className="text-cap-s text-white/60 shrink-0">· {1 + remoteList.length}</span>
          {pttActive && (
            <span className="rounded-full bg-[#03A9F4] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shrink-0">
              {pttLocked ? 'PTT Locked' : 'Talking'}
            </span>
          )}
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setPttLocked(false);
              setPttActive(false);
              toggleMic();
            }}
            title={micMuted ? 'Unmute microphone' : 'Mute microphone'}
            aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
            className={cn(
              'size-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer',
              micMuted ? 'bg-red-900/90 text-white' : 'bg-white/10 hover:bg-white/20 text-[#e7e7e7]'
            )}
          >
            {micMuted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </button>

          {!audioOnly && (
            <button
              type="button"
              onClick={() => void toggleCamera()}
              title={cameraOff ? 'Turn camera on' : 'Turn camera off'}
              aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
              className={cn(
                'size-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer',
                cameraOff ? 'bg-red-900/90 text-white' : 'bg-white/10 hover:bg-white/20 text-[#e7e7e7]'
              )}
            >
              {cameraOff ? <VideoOff className="size-4" /> : <Video className="size-4" />}
            </button>
          )}

          {onToggleMinimize && (
            <button
              type="button"
              onClick={onToggleMinimize}
              title="Expand call view"
              aria-label="Expand call view"
              className="size-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <Maximize2 className="size-4" />
            </button>
          )}

          <button
            type="button"
            onClick={handleHangup}
            title="Leave Call"
            aria-label="Leave call"
            className="size-8 rounded-lg bg-[#d40000] hover:bg-[#b80000] text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <PhoneOff className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'bg-black text-white relative flex flex-col overflow-hidden transition-all',
        chatWindowVisible ? 'h-[48%] min-h-[250px] shrink-0 border-b border-white/10' : 'flex-1 min-h-0'
      )}
    >
      {/* Subtle Overlaid Live Status Pill (matches Grupo clean stage feel) */}
      <div className="pointer-events-none absolute top-3 left-3 z-20 flex items-center gap-2 rounded-full bg-black/55 backdrop-blur-xs border border-white/10 px-3 py-1 text-[11px] font-medium text-white/90">
        <span className="size-2 rounded-full bg-[#26C6DA] animate-pulse" />
        <span>
          {connecting
            ? 'Connecting...'
            : screenSharing
              ? 'Screen Share'
              : audioOnly
                ? 'Audio Call'
                : 'Video Call'}
        </span>
        <span className="text-white/55">· {1 + remoteList.length}</span>
      </div>

      {/* Top-Right Minimize Call Button */}
      {onToggleMinimize && (
        <button
          type="button"
          onClick={onToggleMinimize}
          title="Minimize call"
          aria-label="Minimize call"
          className="absolute top-3 right-3 z-20 size-8 rounded-full bg-black/55 hover:bg-black/80 backdrop-blur-xs border border-white/10 text-white/90 flex items-center justify-center transition-colors cursor-pointer"
        >
          <Minimize2 className="size-4" />
        </button>
      )}

      {/* Device Settings Modal/Overlay (matches Grupo .video_chat_settings_box) */}
      {settingsOpen && (
        <div className="absolute inset-x-4 top-12 z-30 rounded-2xl border border-white/15 bg-zinc-900 p-4 shadow-2xl space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-par-n font-bold">Call Device Settings</h4>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="p-1 rounded-full hover:bg-white/10 cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-cap-s text-white/70 mb-1">Microphone</label>
              <select
                value={selectedMicId}
                onChange={(e) => void switchDevice('audio', e.target.value)}
                className="w-full rounded-xl bg-zinc-800 border border-white/15 px-3 py-2 text-par-s text-white"
              >
                {audioInputs.map((d, idx) => (
                  <option key={d.deviceId || idx} value={d.deviceId}>
                    {d.label || `Microphone ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>
            {!audioOnly && (
              <div>
                <label className="block text-cap-s text-white/70 mb-1">Camera</label>
                <select
                  value={selectedCamId}
                  onChange={(e) => void switchDevice('video', e.target.value)}
                  className="w-full rounded-xl bg-zinc-800 border border-white/15 px-3 py-2 text-par-s text-white"
                >
                  {videoInputs.map((d, idx) => (
                    <option key={d.deviceId || idx} value={d.deviceId}>
                      {d.label || `Camera ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Video / Audio Grid + Optional Pinned Full View */}
      <div className="flex-1 overflow-y-auto p-3 pb-20 space-y-2.5">
        {pinnedUserId ? (
          <div className="flex flex-col gap-2.5 h-full">
            <div className="flex-1 min-h-[220px]">
              {pinnedUserId === currentUser.id ? (
                <ParticipantMediaTile
                  stream={localStream}
                  isLocal
                  displayName="You"
                  avatar={currentUser.avatar}
                  audioOnly={audioOnly && !screenSharing}
                  muted={micMuted}
                  cameraEnabled={!cameraOff}
                  screenSharing={screenSharing}
                  isSpeaking={speakingUsers.has(currentUser.id)}
                  isPinned
                  onTogglePin={() => setPinnedUserId(null)}
                />
              ) : pinnedTarget ? (
                <ParticipantMediaTile
                  stream={remoteStreams[pinnedTarget.userId] || null}
                  isLocal={false}
                  displayName={
                    `${pinnedTarget.user?.firstName || ''} ${pinnedTarget.user?.lastName || ''}`.trim() ||
                    `@${pinnedTarget.user?.username || 'user'}`
                  }
                  avatar={pinnedTarget.user?.avatar}
                  audioOnly={audioOnly && !pinnedTarget.screenSharing}
                  muted={pinnedTarget.muted}
                  cameraEnabled={pinnedTarget.cameraEnabled}
                  screenSharing={pinnedTarget.screenSharing}
                  isSpeaking={speakingUsers.has(pinnedTarget.userId)}
                  isPinned
                  volume={remoteVolumes[pinnedTarget.userId] ?? 100}
                  onVolumeChange={(v) =>
                    setRemoteVolumes((prev) => ({ ...prev, [pinnedTarget.userId]: v }))
                  }
                  onTogglePin={() => setPinnedUserId(null)}
                  canAdminMute={isGroupAdmin}
                  onAdminRemoteMute={(nextMuted) =>
                    handleAdminRemoteMute(pinnedTarget.userId, nextMuted)
                  }
                />
              ) : null}
            </div>

            {/* Filmstrip of other participants */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {pinnedUserId !== currentUser.id && (
                <ParticipantMediaTile
                  stream={localStream}
                  isLocal
                  displayName="You"
                  avatar={currentUser.avatar}
                  audioOnly={audioOnly && !screenSharing}
                  muted={micMuted}
                  cameraEnabled={!cameraOff}
                  screenSharing={screenSharing}
                  isSpeaking={speakingUsers.has(currentUser.id)}
                  isPinned={false}
                  onTogglePin={() => setPinnedUserId(currentUser.id)}
                />
              )}
              {remoteList
                .filter((p) => p.userId !== pinnedUserId)
                .map((p) => {
                  const name =
                    `${p.user?.firstName || ''} ${p.user?.lastName || ''}`.trim() ||
                    `@${p.user?.username || 'user'}`;
                  return (
                    <ParticipantMediaTile
                      key={p.userId}
                      stream={remoteStreams[p.userId] || null}
                      isLocal={false}
                      displayName={name}
                      avatar={p.user?.avatar}
                      audioOnly={audioOnly && !p.screenSharing}
                      muted={p.muted}
                      cameraEnabled={p.cameraEnabled}
                      screenSharing={p.screenSharing}
                      isSpeaking={speakingUsers.has(p.userId)}
                      isPinned={false}
                      volume={remoteVolumes[p.userId] ?? 100}
                      onVolumeChange={(v) =>
                        setRemoteVolumes((prev) => ({ ...prev, [p.userId]: v }))
                      }
                      onTogglePin={() => setPinnedUserId(p.userId)}
                      canAdminMute={isGroupAdmin}
                      onAdminRemoteMute={(nextMuted) => handleAdminRemoteMute(p.userId, nextMuted)}
                    />
                  );
                })}
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'grid gap-2.5',
              remoteList.length === 0
                ? 'grid-cols-1 max-w-md mx-auto'
                : remoteList.length === 1
                  ? 'grid-cols-1 sm:grid-cols-2'
                  : 'grid-cols-2 lg:grid-cols-3'
            )}
          >
            {remoteList.map((p) => {
              const name =
                `${p.user?.firstName || ''} ${p.user?.lastName || ''}`.trim() ||
                `@${p.user?.username || 'user'}`;
              return (
                <ParticipantMediaTile
                  key={p.userId}
                  stream={remoteStreams[p.userId] || null}
                  isLocal={false}
                  displayName={name}
                  avatar={p.user?.avatar}
                  audioOnly={audioOnly && !p.screenSharing}
                  muted={p.muted}
                  cameraEnabled={p.cameraEnabled}
                  screenSharing={p.screenSharing}
                  isSpeaking={speakingUsers.has(p.userId)}
                  isPinned={false}
                  volume={remoteVolumes[p.userId] ?? 100}
                  onVolumeChange={(v) =>
                    setRemoteVolumes((prev) => ({ ...prev, [p.userId]: v }))
                  }
                  onTogglePin={() => setPinnedUserId(p.userId)}
                  canAdminMute={isGroupAdmin}
                  onAdminRemoteMute={(nextMuted) => handleAdminRemoteMute(p.userId, nextMuted)}
                />
              );
            })}

            <ParticipantMediaTile
              stream={localStream}
              isLocal
              displayName="You"
              avatar={currentUser.avatar}
              audioOnly={audioOnly && !screenSharing}
              muted={micMuted}
              cameraEnabled={!cameraOff}
              screenSharing={screenSharing}
              isSpeaking={speakingUsers.has(currentUser.id)}
              isPinned={false}
              onTogglePin={() => setPinnedUserId(currentUser.id)}
            />
          </div>
        )}
      </div>

      {/* Floating Grupo-Style Bottom Controls Dock */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center gap-2 px-2 py-1.5 rounded-xl bg-[#161515]/85 backdrop-blur-md border border-white/10 shadow-2xl">
        <button
          type="button"
          onClick={handleHangup}
          title="Leave Call"
          aria-label="Leave call"
          className="size-9 rounded-lg bg-[#d40000] hover:bg-[#b80000] text-white inline-flex items-center justify-center transition-colors cursor-pointer"
        >
          <PhoneOff className="size-4" />
        </button>

        <button
          type="button"
          onClick={() => (screenSharing ? void stopScreenShare() : void startScreenShare())}
          title={screenSharing ? 'Stop sharing screen' : 'Share your screen'}
          aria-label={screenSharing ? 'Stop sharing screen' : 'Share your screen'}
          className={cn(
            'size-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer',
            screenSharing
              ? 'bg-[#03A9F4] text-white'
              : 'bg-white/10 hover:bg-white/20 text-[#e7e7e7]'
          )}
        >
          {screenSharing ? <MonitorOff className="size-4" /> : <Monitor className="size-4" />}
        </button>

        <button
          type="button"
          onClick={() => {
            setPttLocked(false);
            setPttActive(false);
            toggleMic();
          }}
          title={micMuted ? 'Unmute microphone' : 'Mute microphone'}
          aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
          className={cn(
            'size-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer',
            micMuted ? 'bg-red-900/90 text-white' : 'bg-white/10 hover:bg-white/20 text-[#e7e7e7]'
          )}
        >
          {micMuted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
        </button>

        {chatType === 'group' && (
          <button
            type="button"
            onMouseDown={() => handlePttPressStart(false)}
            onMouseUp={handlePttPressEnd}
            onMouseLeave={handlePttPressEnd}
            onTouchStart={() => handlePttPressStart(true)}
            onTouchEnd={handlePttPressEnd}
            onTouchCancel={handlePttPressEnd}
            onDoubleClick={handlePttDoubleToggle}
            title="Push to Talk (Hold or double-tap to lock, or hold Space)"
            aria-label="Push to Talk"
            className={cn(
              'size-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer select-none touch-manipulation',
              pttActive || pttLocked
                ? 'bg-[#03A9F4] text-white'
                : 'bg-white/10 hover:bg-white/20 text-[#e7e7e7]'
            )}
          >
            {pttActive || pttLocked ? (
              <GrupoPttActiveIcon className="size-[19px]" />
            ) : (
              <GrupoPttInactiveIcon className="size-[19px]" />
            )}
          </button>
        )}

        {!audioOnly && (
          <button
            type="button"
            onClick={() => void toggleCamera()}
            title={cameraOff ? 'Turn camera on' : 'Turn camera off'}
            aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
            className={cn(
              'size-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer',
              cameraOff ? 'bg-red-900/90 text-white' : 'bg-white/10 hover:bg-white/20 text-[#e7e7e7]'
            )}
          >
            {cameraOff ? <VideoOff className="size-4" /> : <Video className="size-4" />}
          </button>
        )}

        <button
          type="button"
          onClick={onToggleChatWindow}
          title={chatWindowVisible ? 'Hide chat' : 'Show chat alongside call'}
          aria-label="Toggle chat window"
          className={cn(
            'size-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer',
            chatWindowVisible ? 'bg-[#03A9F4] text-white' : 'bg-white/10 hover:bg-white/20 text-[#e7e7e7]'
          )}
        >
          <MessageSquare className="size-4" />
        </button>

        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          title="Audio & camera settings"
          aria-label="Call settings"
          className={cn(
            'size-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer',
            settingsOpen ? 'bg-white/25 text-white' : 'bg-white/10 hover:bg-white/20 text-[#e7e7e7]'
          )}
        >
          <Settings className="size-4" />
        </button>
      </div>
    </div>
  );
}
