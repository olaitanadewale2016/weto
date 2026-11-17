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
  Radio,
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
  onToggleChatWindow: () => void;
  onExit: () => void;
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
  }, [stream, isLocal, volume]);

  useEffect(() => {
    if (isLocal || typeof volume !== 'number') return;
    const normalized = Math.max(0, Math.min(1, volume / 100));
    if (videoRef.current) videoRef.current.volume = normalized;
    if (audioRef.current) audioRef.current.volume = normalized;
  }, [volume, isLocal]);

  const hasLiveVideo =
    !audioOnly &&
    Boolean(stream) &&
    stream!.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled) &&
    (cameraEnabled || screenSharing);

  return (
    <div
      className={cn(
        'relative rounded-2xl overflow-hidden bg-zinc-900 border transition-all flex items-center justify-center group',
        isSpeaking ? 'border-green-500 ring-2 ring-green-500/40' : 'border-white/10',
        isPinned ? 'w-full h-full min-h-[260px]' : 'aspect-video min-h-[160px]'
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
            'w-full h-full bg-black block',
            screenSharing ? 'object-contain' : 'object-cover',
            isLocal && !screenSharing && 'scale-x-[-1]'
          )}
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2.5 p-4 text-center">
          {!audioOnly && !isLocal && <audio ref={audioRef} autoPlay playsInline className="hidden" />}
          <div
            className={cn(
              'rounded-full p-1 transition-all',
              isSpeaking ? 'ring-4 ring-green-500/60 scale-105' : ''
            )}
          >
            <Avatar src={avatar} alt={displayName} size="xl" />
          </div>
          <p className="text-par-s font-semibold text-white/90 truncate max-w-[180px]">
            {displayName}
          </p>
          {audioOnly && (
            <span className="text-[11px] text-white/60">
              {muted ? 'Muted' : isSpeaking ? 'Speaking...' : 'Audio connected'}
            </span>
          )}
        </div>
      )}

      {/* Bottom Name + Mute + Spotlight Badge */}
      <div className="absolute inset-x-2.5 bottom-2.5 flex items-center justify-between gap-2 pointer-events-none">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/65 backdrop-blur-xs px-2.5 py-1 text-[11px] font-semibold text-white max-w-[70%] truncate">
          {muted ? (
            <MicOff className="size-3 text-red-400 shrink-0" />
          ) : (
            <Mic className={cn('size-3 shrink-0', isSpeaking ? 'text-green-400' : 'text-white/80')} />
          )}
          <span className="truncate">{displayName}</span>
          {screenSharing && (
            <span className="ml-1 rounded bg-brand-900 px-1.5 py-0.5 text-[9px] uppercase tracking-wide">
              Screen
            </span>
          )}
        </span>

        <div className="flex items-center gap-1 pointer-events-auto">
          {!isLocal && typeof volume === 'number' && onVolumeChange && (
            <div className="hidden sm:flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-white">
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
                className="w-14 accent-white cursor-pointer"
                aria-label={`Volume for ${displayName}`}
              />
            </div>
          )}

          {!isLocal && canAdminMute && onAdminRemoteMute && (
            <button
              type="button"
              onClick={() => onAdminRemoteMute(!muted)}
              title={muted ? 'Allow mic' : 'Mute participant'}
              className="rounded-full bg-black/65 hover:bg-black/85 p-1.5 text-white cursor-pointer"
            >
              {muted ? <Mic className="size-3.5 text-green-400" /> : <MicOff className="size-3.5 text-red-400" />}
            </button>
          )}

          <button
            type="button"
            onClick={onTogglePin}
            title={isPinned ? 'Exit spotlight view' : 'Expand to spotlight'}
            aria-label={isPinned ? 'Exit spotlight view' : 'Expand to spotlight'}
            className="rounded-full bg-black/65 hover:bg-black/85 p-1.5 text-white cursor-pointer"
          >
            {isPinned ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
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
  onToggleChatWindow,
  onExit,
}: VideoCallStageProps) {
  const { error, info } = useToast();

  const [callId, setCallId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micMuted, setMicMuted] = useState(chatType === 'group'); // Push-to-talk option or normal
  const [cameraOff, setCameraOff] = useState(audioOnly);
  const [screenSharing, setScreenSharing] = useState(false);
  const [pushToTalkMode, setPushToTalkMode] = useState(false);
  const [pttActive, setPttActive] = useState(false);
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

  const cleanupCall = useCallback(
    async (notifyServer = true) => {
      if (notifyServer) {
        await apiFetch(`/chats/${chatId}/call`, {
          method: 'POST',
          json: { action: 'leave', callId: callIdRef.current || undefined },
        }).catch(() => undefined);
      }

      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;

      for (const pc of peersRef.current.values()) {
        pc.close();
      }
      peersRef.current.clear();
      setLocalStream(null);
      setRemoteStreams({});
    },
    [chatId]
  );

  // Initialize local media, join/start call, and enumerate audio/video devices
  useEffect(() => {
    mountedRef.current = true;
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
          setCameraOff(true);
        }

        if (initStopped || !mountedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;
        setLocalStream(stream);
        setMicMuted(false);

        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
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

        if (!res.activeCall) {
          throw new Error('Could not establish call room.');
        }

        callIdRef.current = res.activeCall.id;
        setCallId(res.activeCall.id);
        setParticipants(res.activeCall.participants || []);
        setConnecting(false);
        await syncPeersWithParticipants(res.activeCall.participants || []);
      } catch (err) {
        if (!mountedRef.current) return;
        error('Unable to start call', err instanceof Error ? err.message : undefined);
        await cleanupCall(false);
        onExitRef.current();
      }
    }

    void init();

    return () => {
      initStopped = true;
      mountedRef.current = false;
      void cleanupCall(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, audioOnly]);

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

  function toggleMic(explicitState?: boolean) {
    const stream = localStreamRef.current;
    if (!stream) return;
    const nextMuted = explicitState !== undefined ? explicitState : !micMuted;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !nextMuted;
    });
    setMicMuted(nextMuted);
    void pushStateUpdate({ muted: nextMuted });
  }

  async function toggleCamera() {
    if (audioOnly) return;
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTracks = stream.getVideoTracks();
    const nextOff = !cameraOff;

    if (videoTracks.length > 0) {
      videoTracks.forEach((t) => {
        t.enabled = !nextOff;
      });
      setCameraOff(nextOff);
      void pushStateUpdate({ cameraEnabled: !nextOff });
    } else if (!nextOff) {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const camTrack = camStream.getVideoTracks()[0];
        if (camTrack) {
          stream.addTrack(camTrack);
          for (const pc of peersRef.current.values()) {
            pc.addTrack(camTrack, stream);
          }
          setLocalStream(new MediaStream(stream.getTracks()));
          setCameraOff(false);
          void pushStateUpdate({ cameraEnabled: true });
        }
      } catch {
        error('Camera access unavailable');
      }
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

  // Push-to-Talk hotkey (`Space` when holding PTT or double-tap) matching Grupo live_kit_video_chat.js
  useEffect(() => {
    if (!pushToTalkMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        setPttActive(true);
        toggleMic(false);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        setPttActive(false);
        toggleMic(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushToTalkMode]);

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

  return (
    <div className="bg-zinc-950 text-white border-b border-white/10 relative flex flex-col max-h-[65vh] min-h-[260px]">
      {/* Call Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/50 border-b border-white/10 text-cap-l">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-green-500 animate-pulse" />
          <span className="font-semibold">
            {connecting
              ? 'Connecting call...'
              : screenSharing
                ? 'Screen Sharing Live'
                : audioOnly
                  ? 'Audio Call'
                  : 'Video Call'}
          </span>
          <span className="text-white/60">· {1 + remoteList.length} in call</span>
        </div>

        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-cap-s text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
          title="Audio & camera settings"
        >
          <Settings className="size-3.5" /> Devices
        </button>
      </div>

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
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
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

      {/* Bottom Floating Controls Dock (matches Grupo middle.php .video_chat_container > .icons) */}
      <div className="flex flex-wrap items-center justify-center gap-2.5 px-4 py-3 bg-black/70 border-t border-white/10">
        <button
          type="button"
          onClick={() => void cleanupCall(true).then(() => onExit())}
          title="Leave Call"
          aria-label="Leave call"
          className="h-10 px-4 rounded-full bg-red-900 hover:opacity-90 text-white font-semibold text-cap-l inline-flex items-center gap-1.5 cursor-pointer"
        >
          <PhoneOff className="size-4" />
          <span className="hidden sm:inline">Leave</span>
        </button>

        <button
          type="button"
          onClick={() => (screenSharing ? void stopScreenShare() : void startScreenShare())}
          title={screenSharing ? 'Stop sharing screen' : 'Share your screen'}
          aria-label={screenSharing ? 'Stop sharing screen' : 'Share your screen'}
          className={cn(
            'size-10 rounded-full flex items-center justify-center transition-colors cursor-pointer',
            screenSharing
              ? 'bg-brand-900 text-white'
              : 'bg-white/10 hover:bg-white/20 text-white'
          )}
        >
          {screenSharing ? <MonitorOff className="size-4" /> : <Monitor className="size-4" />}
        </button>

        {!pushToTalkMode ? (
          <button
            type="button"
            onClick={() => toggleMic()}
            title={micMuted ? 'Unmute microphone' : 'Mute microphone'}
            aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
            className={cn(
              'size-10 rounded-full flex items-center justify-center transition-colors cursor-pointer',
              micMuted ? 'bg-red-900/80 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
            )}
          >
            {micMuted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </button>
        ) : (
          <button
            type="button"
            onMouseDown={() => {
              setPttActive(true);
              toggleMic(false);
            }}
            onMouseUp={() => {
              setPttActive(false);
              toggleMic(true);
            }}
            onMouseLeave={() => {
              if (pttActive) {
                setPttActive(false);
                toggleMic(true);
              }
            }}
            onTouchStart={() => {
              setPttActive(true);
              toggleMic(false);
            }}
            onTouchEnd={() => {
              setPttActive(false);
              toggleMic(true);
            }}
            title="Hold to talk (or hold Space)"
            className={cn(
              'h-10 px-3.5 rounded-full inline-flex items-center gap-1.5 text-cap-l font-semibold transition-colors cursor-pointer select-none',
              pttActive ? 'bg-green-900 text-white' : 'bg-white/15 text-white/90 hover:bg-white/25'
            )}
          >
            <Radio className="size-4" /> Hold to Talk
          </button>
        )}

        {chatType === 'group' && (
          <button
            type="button"
            onClick={() => {
              const nextPtt = !pushToTalkMode;
              setPushToTalkMode(nextPtt);
              if (nextPtt) {
                toggleMic(true);
              } else {
                toggleMic(false);
              }
            }}
            title={pushToTalkMode ? 'Switch to open mic' : 'Enable Push-to-Talk'}
            className={cn(
              'h-10 px-3 rounded-full text-cap-s font-semibold transition-colors cursor-pointer',
              pushToTalkMode ? 'bg-brand-900 text-white' : 'bg-white/10 hover:bg-white/20 text-white/80'
            )}
          >
            PTT
          </button>
        )}

        {!audioOnly && (
          <button
            type="button"
            onClick={() => void toggleCamera()}
            title={cameraOff ? 'Turn camera on' : 'Turn camera off'}
            aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
            className={cn(
              'size-10 rounded-full flex items-center justify-center transition-colors cursor-pointer',
              cameraOff ? 'bg-red-900/80 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
            )}
          >
            {cameraOff ? <VideoOff className="size-4" /> : <Video className="size-4" />}
          </button>
        )}

        <button
          type="button"
          onClick={onToggleChatWindow}
          title={chatWindowVisible ? 'Hide chat below call' : 'Show chat below call'}
          aria-label="Toggle chat window"
          className={cn(
            'size-10 rounded-full flex items-center justify-center transition-colors cursor-pointer',
            chatWindowVisible ? 'bg-brand-900 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
          )}
        >
          <MessageSquare className="size-4" />
        </button>
      </div>
    </div>
  );
}
