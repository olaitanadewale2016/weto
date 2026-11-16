'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Home,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  Users,
  Volume2,
  VolumeX,
  Wallet,
  X,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useApp } from '@/components/providers/AppContext';
import { useToast } from '@/components/providers/ToastProvider';
import { resolveMediaUrl } from '@/lib/media-url';
import {
  BoardWinResult,
  checkBoardWin,
  GameRoundOption,
  getBestDoraMove,
  getSkinAssetPath,
  getSkinById,
  isBoardFull,
  MatrixSizeOption,
  MoreGameCatalogItem,
  TICTACTOE_FEES,
  TICTACTOE_MATRIX_SIZES,
  TICTACTOE_MORE_GAMES,
  TICTACTOE_ROUNDS,
  TICTACTOE_SEARCH_TIMEOUT_SECONDS,
  TICTACTOE_SHOP_ITEMS,
  TICTACTOE_SKINS,
  TicTacToeDifficulty,
  TicTacToeShopCatalogItem,
  TicTacToeSkinCatalogItem,
  turnDurationFor,
} from '@/lib/tictactoe-ai';
import { cn } from '@/lib/utils';

type ScreenView =
  | 'home'
  | 'connection'
  | 'maze'
  | 'leaderboard'
  | 'skins'
  | 'shop'
  | 'history'
  | 'settings'
  | 'howToPlay'
  | 'moreGames';

type GameModeType = 'offline' | 'multiplayer' | 'passNPlay';

interface PlayerSlot {
  userId: string;
  username: string;
  name: string;
  avatar: string;
  skinX: string;
  skinO: string;
  activeSkinType: 'X' | 'O';
  roundWins: number;
}

interface BoardCell {
  playerId: string;
  mark: '' | 'X' | 'O';
  skin: string;
}

interface OnlineMatchData {
  _id: string;
  gameKey: string;
  status: 'waiting' | 'inProgress' | 'completed' | 'closed';
  matrixSize: 3 | 4 | 5;
  rounds: 1 | 3 | 5 | 7;
  currentRound: number;
  entryFee: number;
  isPrivateInvite: boolean;
  player1: PlayerSlot;
  player2?: PlayerSlot | null;
  board: BoardCell[][];
  currentTurn: 'player1' | 'player2';
  turnStartedAt: string;
  result: 'notDeclared' | 'player1' | 'player2' | 'draw';
  lastRoundWinner?: 'player1' | 'player2' | 'draw' | null;
  winningLine?: {
    row: number | null;
    col: number | null;
    diagonal: 'main' | 'anti' | null;
    mark: 'X' | 'O';
  } | null;
  settled: boolean;
}

interface GameProfileData {
  coins: number;
  score: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesDrawn: number;
  activeSkinId: string;
  ownedSkinIds: string[];
  walletBalance?: number;
  rank: number | null;
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  name: string;
  avatar: string;
  verified?: boolean;
  score: number;
  matchesPlayed: number;
  matchesWon: number;
}

interface HistoryEntry {
  _id: string;
  opponentName: string;
  status: 'won' | 'lost' | 'tie' | 'quited';
  amount: number;
  mode: 'multiplayer' | 'solo';
  createdAt: string;
}

function formatCompactCoins(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.max(0, Math.floor(n || 0)));
}

function createEmptyBoard(size: number): BoardCell[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ playerId: '', mark: '', skin: '' }))
  );
}

/**
 * Exact Flutter `InnerShadowContainer` (`inner_shadow.dart`)
 */
function InnerShadowContainer({
  children,
  className,
  highlight = false,
}: {
  children: React.ReactNode;
  className?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-[10px] border border-[#5A5A5A]/70 transition-colors',
        highlight ? 'bg-[#00A8CA]/25' : 'bg-[#242424]',
        className
      )}
      style={{
        boxShadow:
          'inset 0 2px 4px rgba(0,0,0,0.65), inset 0 -1px 2px rgba(255,255,255,0.06), 0 4px 10px rgba(0,0,0,0.35)',
      }}
    >
      {children}
    </div>
  );
}

/**
 * Exact Flutter `HomeCard` with custom sloped `HomeCardShapeBorder` (`home_card.dart` & `home_card_shape.dart`)
 */
function HomeModeCard({
  reverse,
  image,
  title,
  subTitle,
  onPlay,
  secondaryActionLabel,
  onSecondaryAction,
}: {
  reverse: boolean;
  image: string;
  title: string;
  subTitle: string;
  onPlay: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}) {
  return (
    <div
      onClick={onPlay}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPlay();
        }
      }}
      className="relative w-full select-none cursor-pointer group transition-transform active:scale-[0.99]"
    >
      {/* Sloped SVG Shape matching HomeCardShapeBorder */}
      <svg
        viewBox="0 0 400 164"
        preserveAspectRatio="none"
        className={cn(
          'w-full h-[164px] sm:h-[176px] block drop-shadow-[0_6px_12px_rgba(0,0,0,0.45)]',
          reverse && '-scale-x-100'
        )}
      >
        <defs>
          <linearGradient id="homeCardFill" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.10)" />
            <stop offset="100%" stopColor="rgba(36,36,36,0.92)" />
          </linearGradient>
        </defs>
        <path
          d="M 2,58 Q 2,44 16,47 L 382,22 Q 398,21 398,37 L 398,144 Q 398,160 382,160 L 18,160 Q 2,160 2,144 Z"
          fill="url(#homeCardFill)"
          stroke="#5A5A5A"
          strokeWidth="1.5"
        />
      </svg>

      {/* Content Row */}
      <div
        className={cn(
          'absolute inset-0 flex items-end justify-between px-4 sm:px-6 pb-3.5 pt-2',
          reverse ? 'flex-row-reverse' : 'flex-row'
        )}
      >
        {/* Dora Character Illustration */}
        <div className="shrink-0 -mt-3 sm:-mt-5 pointer-events-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt={title}
            className="h-[138px] sm:h-[149px] w-auto object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.5)] group-hover:scale-105 transition-transform duration-300"
          />
        </div>

        {/* Title, Subtitle & Play Now Button */}
        <div
          className={cn(
            'flex-1 min-w-0 flex flex-col justify-end pt-8 sm:pt-10 px-2 sm:px-4',
            reverse ? 'items-start text-left' : 'items-end text-right'
          )}
        >
          <h3 className="text-lg sm:text-xl font-extrabold tracking-wide text-white uppercase leading-tight line-clamp-1">
            {title}
          </h3>
          <p className="text-xs sm:text-sm text-white/75 mt-0.5 mb-2.5 line-clamp-2 leading-snug">
            {subTitle}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {secondaryActionLabel && onSecondaryAction && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSecondaryAction();
                }}
                className="h-8 px-3.5 rounded-lg border border-[#00A8CA] bg-[#00A8CA]/20 hover:bg-[#00A8CA]/35 text-white text-xs font-bold tracking-wide transition-colors cursor-pointer"
              >
                {secondaryActionLabel}
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPlay();
              }}
              className="h-8 px-5 rounded-lg bg-[#F0842A] hover:bg-[#f59342] text-white text-xs sm:text-sm font-bold shadow-[0_3px_0_#b35c12] active:translate-y-0.5 transition-all cursor-pointer"
            >
              Play Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Exact Flutter `CustomDialogBox` (`custom_dialog_box.dart`) with dotted inner border
 */
function DoraDialog({
  open,
  title,
  hideCloseButton = false,
  onClose,
  children,
  buttons,
}: {
  open: boolean;
  title: string;
  hideCloseButton?: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  buttons?: Array<{
    title: string;
    icon?: string;
    variant?: 'primary' | 'light';
    disabled?: boolean;
    onClick: () => void;
  }>;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-[370px] rounded-[22px] bg-[#242424] p-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.75)] border border-[#5A5A5A]/50">
        <div className="rounded-[16px] border-2 border-dashed border-[#5A5A5A] bg-[#242424] relative overflow-hidden">
          {!hideCloseButton && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="absolute top-2.5 right-2.5 size-7 rounded-full border border-[#5A5A5A] flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="size-3.5" />
            </button>
          )}

          <div className={cn('pt-4 pb-2.5 px-4 text-center', !hideCloseButton && ' pt-5')}>
            <h3 className="text-lg font-bold text-white tracking-wide">{title}</h3>
            <div className="mt-2.5 mx-2 h-[1px] bg-[#5A5A5A]/70" />
          </div>

          <div className="px-5 py-3 text-white">{children}</div>

          {buttons && buttons.length > 0 && (
            <div className="p-5 pt-3 flex items-center gap-3">
              {buttons.map((btn, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={btn.disabled}
                  onClick={btn.onClick}
                  className={cn(
                    'flex-1 h-10 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50',
                    btn.variant === 'light'
                      ? 'bg-white text-[#242424] hover:bg-white/90 shadow-[0_3px_0_#9ca3af]'
                      : 'bg-[#F0842A] text-white hover:bg-[#f59342] shadow-[0_3px_0_#b35c12]'
                  )}
                >
                  {btn.icon && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={btn.icon} alt="" className="size-3.5 object-contain" />
                  )}
                  <span>{btn.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Exact Flutter `ProfileCard` (`profile_card.dart`) with dotted dividers
 */
function DoraProfileCard({
  username,
  email,
  avatar,
  coins,
  rank,
  score,
  played,
  wins,
  showCoin = true,
  customBottom,
}: {
  username: string;
  email?: string;
  avatar: string;
  coins: number;
  rank: number | null;
  score: number;
  played: number;
  wins: number;
  showCoin?: boolean;
  customBottom?: React.ReactNode;
}) {
  return (
    <InnerShadowContainer className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-13 rounded-xl overflow-hidden border border-[#5A5A5A] bg-[#161719] shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveMediaUrl(avatar) || '/assets/games/tictactoe/png/guest.png'}
              alt={username}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <p className="text-base font-bold text-white truncate">{username}</p>
            {email && <p className="text-xs text-white/60 truncate">{email}</p>}
          </div>
        </div>

        {showCoin && (
          <div className="px-3 py-1.5 rounded-lg border border-[#F0842A] bg-[#F0842A]/15 flex items-center gap-2 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/games/tictactoe/png/coin.png"
              alt="Coins"
              className="size-5 object-contain"
            />
            <span className="text-sm font-bold text-white">{coins}</span>
          </div>
        )}
      </div>

      <div className="my-3.5 border-t border-dashed border-[#5A5A5A]" />

      {customBottom ? (
        customBottom
      ) : (
        <div className="grid grid-cols-4 divide-x divide-dashed divide-[#5A5A5A] text-center">
          <div className="px-1">
            <p className="text-xs text-white/70">Rank</p>
            <p className="text-base font-bold text-white mt-1">
              {rank && score > 0 ? `#${rank}` : '-'}
            </p>
          </div>
          <div className="px-1">
            <p className="text-xs text-white/70">Score</p>
            <p className="text-base font-bold text-white mt-1">{score}</p>
          </div>
          <div className="px-1">
            <p className="text-xs text-white/70">Played</p>
            <p className="text-base font-bold text-white mt-1">{played}</p>
          </div>
          <div className="px-1">
            <p className="text-xs text-white/70">Wins</p>
            <p className="text-base font-bold text-white mt-1">{wins}</p>
          </div>
        </div>
      )}
    </InnerShadowContainer>
  );
}

export function TicTacToeArena() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteKeyParam = searchParams.get('invite');
  const challengeUserParam = searchParams.get('challenge');

  const { user } = useApp();
  const { success, error, info } = useToast();
  const arenaRootRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Navigation & catalog state
  const [view, setView] = useState<ScreenView>('home');
  const [profile, setProfile] = useState<GameProfileData>({
    coins: 500,
    score: 0,
    matchesPlayed: 0,
    matchesWon: 0,
    matchesDrawn: 0,
    activeSkinId: 'cross',
    ownedSkinIds: ['cross', 'offer'],
    walletBalance: 0,
    rank: null,
  });
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyFilterDays, setHistoryFilterDays] = useState<'all' | '7' | '30'>('all');
  const [skinsCatalog, setSkinsCatalog] = useState<TicTacToeSkinCatalogItem[]>(TICTACTOE_SKINS);
  const [shopCatalog, setShopCatalog] = useState<TicTacToeShopCatalogItem[]>(TICTACTOE_SHOP_ITEMS);
  const [moreGamesCatalog, setMoreGamesCatalog] =
    useState<MoreGameCatalogItem[]>(TICTACTOE_MORE_GAMES);
  const [activeIframeGame, setActiveIframeGame] = useState<MoreGameCatalogItem | null>(null);
  const [iframeLoading, setIframeLoading] = useState(false);
  const [iframeReloadKey, setIframeReloadKey] = useState(0);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return;
    try {
      if (!document.fullscreenElement && arenaRootRef.current?.requestFullscreen) {
        await arenaRootRef.current.requestFullscreen();
      } else if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // ignore if browser blocks fullscreen
    }
  }, []);

  const handleExitToApp = useCallback(() => {
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }
    router.push('/');
  }, [router]);

  // Sound state & refs (`sound_service.dart` parity)
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('ttt_sound') !== '0';
  });
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);

  const playSoundEffect = useCallback(
    (kind: 'click' | 'win') => {
      if (!soundOn || typeof window === 'undefined') return;
      try {
        const src =
          kind === 'click'
            ? '/assets/games/tictactoe/music/click.mp3'
            : '/assets/games/tictactoe/music/wingame.mp3';
        const audio = new Audio(src);
        audio.volume = kind === 'click' ? 0.65 : 0.85;
        audio.play().catch(() => undefined);
      } catch {
        // ignore audio restriction
      }
    },
    [soundOn]
  );

  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('ttt_sound', next ? '1' : '0');
      } catch {
        // ignore
      }
      if (!next && bgMusicRef.current) {
        bgMusicRef.current.pause();
      } else if (next && view === 'maze' && bgMusicRef.current) {
        bgMusicRef.current.play().catch(() => undefined);
      }
      return next;
    });
  }, [view]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (view === 'maze' && soundOn) {
      if (!bgMusicRef.current) {
        bgMusicRef.current = new Audio('/assets/games/tictactoe/music/music.mp3');
        bgMusicRef.current.loop = true;
        bgMusicRef.current.volume = 0.25;
      }
      bgMusicRef.current.play().catch(() => undefined);
    } else if (bgMusicRef.current) {
      bgMusicRef.current.pause();
    }
    return () => {
      bgMusicRef.current?.pause();
    };
  }, [view, soundOn]);

  // Setup Dialogs State
  const [pendingMode, setPendingMode] = useState<GameModeType | null>(null);
  const [difficultyDialogOpen, setDifficultyDialogOpen] = useState(false);
  const [entryFeeDialogOpen, setEntryFeeDialogOpen] = useState(false);
  const [matrixSizeDialogOpen, setMatrixSizeDialogOpen] = useState(false);
  const [skinConfirmTarget, setSkinConfirmTarget] =
    useState<TicTacToeSkinCatalogItem | null>(null);

  const [selectedDifficulty, setSelectedDifficulty] =
    useState<TicTacToeDifficulty>('medium');
  const [selectedEntryFee, setSelectedEntryFee] = useState<number>(10);
  const [selectedRound, setSelectedRound] = useState<GameRoundOption>(TICTACTOE_ROUNDS[0]);
  const [selectedMatrixSize, setSelectedMatrixSize] = useState<MatrixSizeOption>(
    TICTACTOE_MATRIX_SIZES[0]
  );
  const [isFriendChallengeMode, setIsFriendChallengeMode] = useState(false);
  const [friendUsernameInput, setFriendUsernameInput] = useState('');
  const [joinRoomCodeInput, setJoinRoomCodeInput] = useState('');

  // Active Game / Maze State
  const [gameMode, setGameMode] = useState<GameModeType>('offline');
  const [boardSize, setBoardSize] = useState<3 | 4 | 5>(3);
  const [board, setBoard] = useState<BoardCell[][]>(() => createEmptyBoard(3));
  const [player1, setPlayer1] = useState<PlayerSlot>({
    userId: 'p1',
    username: 'you',
    name: 'You',
    avatar: '/assets/games/tictactoe/png/guest.png',
    skinX: 'default_cross',
    skinO: 'default_circle',
    activeSkinType: 'X',
    roundWins: 0,
  });
  const [player2, setPlayer2] = useState<PlayerSlot>({
    userId: 'dora',
    username: 'dora',
    name: 'Dora',
    avatar: '/assets/games/tictactoe/svg/dora.svg',
    skinX: 'default_cross',
    skinO: 'default_circle',
    activeSkinType: 'O',
    roundWins: 0,
  });
  const [currentTurn, setCurrentTurn] = useState<'player1' | 'player2'>('player1');
  const [turnDuration, setTurnDuration] = useState<number>(20);
  const [turnTimeLeft, setTurnTimeLeft] = useState<number>(20);
  const [currentRoundNumber, setCurrentRoundNumber] = useState<number>(1);
  const [totalRoundsCount, setTotalRoundsCount] = useState<number>(1);
  const [winningLine, setWinningLine] = useState<BoardWinResult | null>(null);
  const [gameEndedState, setGameEndedState] = useState<{
    type: 'win' | 'draw' | 'nextRound';
    winner?: PlayerSlot | null;
    roundNumber?: number;
  } | null>(null);
  const doraThinking =
    view === 'maze' &&
    gameMode === 'offline' &&
    currentTurn === 'player2' &&
    !winningLine &&
    !gameEndedState;

  // Online Multiplayer State
  const [onlineMatch, setOnlineMatch] = useState<OnlineMatchData | null>(null);
  const [searchTimeLeft, setSearchTimeLeft] = useState<number>(
    TICTACTOE_SEARCH_TIMEOUT_SECONDS
  );
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [busyAction, setBusyAction] = useState(false);

  // Load Hub Data
  const fetchHubData = useCallback(
    async (days: 'all' | '7' | '30' = historyFilterDays) => {
      try {
        const qs = days !== 'all' ? `?days=${days}` : '';
        const data = await apiFetch<{
          profile: GameProfileData;
          leaderboard: LeaderboardEntry[];
          history: HistoryEntry[];
          skins: TicTacToeSkinCatalogItem[];
          shop: TicTacToeShopCatalogItem[];
          moreGames: MoreGameCatalogItem[];
        }>(`/games/tictactoe${qs}`);

        if (data.profile) setProfile(data.profile);
        if (Array.isArray(data.leaderboard)) setLeaderboard(data.leaderboard);
        if (Array.isArray(data.history)) setHistory(data.history);
        if (Array.isArray(data.skins)) setSkinsCatalog(data.skins);
        if (Array.isArray(data.shop)) setShopCatalog(data.shop);
        if (Array.isArray(data.moreGames)) setMoreGamesCatalog(data.moreGames);
      } catch {
        // fallback to defaults
      }
    },
    [historyFilterDays]
  );

  useEffect(() => {
    const id = setTimeout(() => {
      void fetchHubData();
    }, 0);
    return () => clearTimeout(id);
  }, [fetchHubData]);

  // Launch Offline or Pass-N-Play Maze
  const launchLocalMaze = useCallback(
    (mode: 'offline' | 'passNPlay', size: 3 | 4 | 5) => {
      const activeSkin = getSkinById(profile.activeSkinId);
      const myName = user
        ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username
        : 'You';
      const myAvatar = user?.avatar || '/assets/games/tictactoe/png/guest.png';

      const p1: PlayerSlot = {
        userId: user?.id || 'local_p1',
        username: user?.username || 'player1',
        name: mode === 'passNPlay' ? 'User 1' : myName,
        avatar: myAvatar,
        skinX: activeSkin.skinX,
        skinO: activeSkin.skinO,
        activeSkinType: 'O',
        roundWins: 0,
      };

      const p2: PlayerSlot =
        mode === 'offline'
          ? {
              userId: 'dora_ai',
              username: 'dora',
              name: 'Dora',
              avatar: '/assets/games/tictactoe/svg/dora.svg',
              skinX: activeSkin.skinX,
              skinO: activeSkin.skinO,
              activeSkinType: 'X',
              roundWins: 0,
            }
          : {
              userId: 'local_p2',
              username: 'player2',
              name: 'User 2',
              avatar: '/assets/games/tictactoe/png/guest.png',
              skinX: activeSkin.skinX,
              skinO: activeSkin.skinO,
              activeSkinType: 'X',
              roundWins: 0,
            };

      const duration = turnDurationFor(size);
      // Random coin toss for starting player in offline mode (matching offline_game.dart)
      const starter: 'player1' | 'player2' =
        mode === 'offline' && Math.random() < 0.5 ? 'player2' : 'player1';

      setGameMode(mode);
      setBoardSize(size);
      setBoard(createEmptyBoard(size));
      setPlayer1(p1);
      setPlayer2(p2);
      setCurrentTurn(starter);
      setTurnDuration(duration);
      setTurnTimeLeft(duration);
      setCurrentRoundNumber(1);
      setTotalRoundsCount(1);
      setWinningLine(null);
      setGameEndedState(null);
      setOnlineMatch(null);
      setView('maze');
    },
    [profile.activeSkinId, user]
  );

  const launchOnlineMaze = useCallback((match: OnlineMatchData) => {
    const duration = turnDurationFor(match.matrixSize);
    setGameMode('multiplayer');
    setBoardSize(match.matrixSize);
    setBoard(match.board);
    setPlayer1(match.player1);
    setPlayer2(
      match.player2 || {
        userId: 'opponent',
        username: 'opponent',
        name: 'Opponent',
        avatar: '/assets/games/tictactoe/png/guest.png',
        skinX: 'default_cross',
        skinO: 'default_circle',
        activeSkinType: 'O',
        roundWins: 0,
      }
    );
    setCurrentTurn(match.currentTurn);
    setTurnDuration(duration);
    setTurnTimeLeft(duration);
    setCurrentRoundNumber((match.currentRound || 0) + 1);
    setTotalRoundsCount(match.rounds || 1);
    setWinningLine(null);
    setGameEndedState(null);
    setOnlineMatch(match);
    setView('maze');
  }, []);

  // Handle ?challenge=username or ?invite=GAMEKEY URL parameters
  useEffect(() => {
    if (!challengeUserParam) return;
    const id = setTimeout(() => {
      setPendingMode('multiplayer');
      setIsFriendChallengeMode(true);
      setFriendUsernameInput(challengeUserParam);
      setEntryFeeDialogOpen(true);
    }, 0);
    return () => clearTimeout(id);
  }, [challengeUserParam]);

  useEffect(() => {
    if (!inviteKeyParam || !user) return;
    const id = setTimeout(async () => {
      try {
        const res = await apiFetch<{
          status: 'matched' | 'waiting';
          match: OnlineMatchData;
          coins: number;
        }>('/games/tictactoe', {
          method: 'POST',
          json: {
            action: 'join_invite',
            gameKey: inviteKeyParam,
          },
        });
        setProfile((prev) => ({ ...prev, coins: res.coins }));
        setOnlineMatch(res.match);
        if (res.status === 'matched' || res.match.status === 'inProgress') {
          launchOnlineMaze(res.match);
        } else {
          setView('connection');
        }
      } catch (err) {
        error(err instanceof Error ? err.message : 'Unable to join challenge room.');
      }
    }, 100);
    return () => clearTimeout(id);
  }, [inviteKeyParam, user, launchOnlineMaze, error]);

  // Start Matchmaking or Private Friend Challenge
  const startOnlineConnection = useCallback(async () => {
    if (!user) {
      error('Please sign in to play online multiplayer.');
      return;
    }

    setBusyAction(true);
    setConnectionFailed(false);
    setSearchTimeLeft(TICTACTOE_SEARCH_TIMEOUT_SECONDS);

    try {
      if (joinRoomCodeInput.trim()) {
        const res = await apiFetch<{
          status: 'matched' | 'waiting';
          match: OnlineMatchData;
          coins: number;
        }>('/games/tictactoe', {
          method: 'POST',
          json: {
            action: 'join_invite',
            gameKey: joinRoomCodeInput.trim().toUpperCase(),
          },
        });
        setProfile((prev) => ({ ...prev, coins: res.coins }));
        setOnlineMatch(res.match);
        if (res.status === 'matched' || res.match.status === 'inProgress') {
          launchOnlineMaze(res.match);
        } else {
          setView('connection');
        }
        return;
      }

      const res = await apiFetch<{
        status: 'matched' | 'waiting';
        match: OnlineMatchData;
        coins: number;
      }>('/games/tictactoe', {
        method: 'POST',
        json: {
          action: isFriendChallengeMode ? 'create_invite' : 'matchmake',
          entryFee: selectedEntryFee,
          matrixSize: selectedMatrixSize.size,
          rounds: selectedRound.digit,
          targetUsername: isFriendChallengeMode ? friendUsernameInput.trim() : undefined,
        },
      });

      setProfile((prev) => ({ ...prev, coins: res.coins }));
      setOnlineMatch(res.match);

      if (res.status === 'matched' || res.match.status === 'inProgress') {
        launchOnlineMaze(res.match);
      } else {
        setView('connection');
      }
    } catch (err) {
      error(err instanceof Error ? err.message : 'Could not start matchmaking.');
    } finally {
      setBusyAction(false);
    }
  }, [
    user,
    error,
    joinRoomCodeInput,
    isFriendChallengeMode,
    selectedEntryFee,
    selectedMatrixSize.size,
    selectedRound.digit,
    friendUsernameInput,
    launchOnlineMaze,
  ]);

  // ConnectionScreen 60s countdown + polling for opponent join
  useEffect(() => {
    if (view !== 'connection' || !onlineMatch || connectionFailed) return;

    const countdownInterval = setInterval(() => {
      setSearchTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          setConnectionFailed(true);
          void apiFetch<{ closed: boolean; coins: number }>('/games/tictactoe', {
            method: 'POST',
            json: { action: 'close_waiting', gameKey: onlineMatch.gameKey },
          })
            .then((res) => {
              if (typeof res.coins === 'number') {
                setProfile((p) => ({ ...p, coins: res.coins }));
              }
            })
            .catch(() => undefined);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const pollInterval = setInterval(async () => {
      try {
        const res = await apiFetch<{ match: OnlineMatchData }>(
          `/games/tictactoe?gameKey=${encodeURIComponent(onlineMatch.gameKey)}`
        );
        if (res.match.status === 'inProgress' && res.match.player2) {
          clearInterval(countdownInterval);
          clearInterval(pollInterval);
          launchOnlineMaze(res.match);
        } else if (res.match.status === 'closed') {
          setConnectionFailed(true);
        }
      } catch {
        // ignore transient poll error
      }
    }, 1500);

    return () => {
      clearInterval(countdownInterval);
      clearInterval(pollInterval);
    };
  }, [view, onlineMatch, connectionFailed, launchOnlineMaze]);

  // Finish Local Round / Game
  const handleLocalBoardOutcome = useCallback(
    (nextBoard: BoardCell[][], lastMover: 'player1' | 'player2') => {
      const strBoard = nextBoard.map((r) => r.map((c) => c.mark || ''));
      const win = checkBoardWin(strBoard);
      const draw = !win && isBoardFull(strBoard);

      if (win) {
        setWinningLine(win);
        playSoundEffect('win');
        const winnerPlayer = lastMover === 'player1' ? player1 : player2;
        if (gameMode === 'offline' && user) {
          const soloResult = lastMover === 'player1' ? 'won' : 'lost';
          void apiFetch<{ coins: number; score: number }>('/games/tictactoe', {
            method: 'POST',
            json: {
              action: 'record_solo',
              soloResult,
              difficulty: selectedDifficulty,
            },
          })
            .then((res) => {
              setProfile((prev) => ({
                ...prev,
                coins: res.coins,
                score: res.score,
                matchesPlayed: prev.matchesPlayed + 1,
                matchesWon: soloResult === 'won' ? prev.matchesWon + 1 : prev.matchesWon,
              }));
            })
            .catch(() => undefined);
        }
        setTimeout(() => {
          setGameEndedState({ type: 'win', winner: winnerPlayer });
        }, 2200);
        return true;
      }

      if (draw) {
        if (gameMode === 'offline' && user) {
          void apiFetch<{ coins: number; score: number }>('/games/tictactoe', {
            method: 'POST',
            json: {
              action: 'record_solo',
              soloResult: 'tie',
              difficulty: selectedDifficulty,
            },
          })
            .then((res) => {
              setProfile((prev) => ({
                ...prev,
                coins: res.coins,
                score: res.score,
                matchesPlayed: prev.matchesPlayed + 1,
              }));
            })
            .catch(() => undefined);
        }
        setTimeout(() => {
          setGameEndedState({ type: 'draw', winner: null });
        }, 1500);
        return true;
      }

      return false;
    },
    [gameMode, playSoundEffect, player1, player2, selectedDifficulty, user]
  );

  // Dora AI Move Effect in Offline Mode (`offline_game.dart`)
  useEffect(() => {
    if (
      view !== 'maze' ||
      gameMode !== 'offline' ||
      currentTurn !== 'player2' ||
      winningLine ||
      gameEndedState
    ) {
      return;
    }

    const delayMs = 650 + Math.floor(Math.random() * 650);
    const timer = setTimeout(() => {
      const strBoard = board.map((r) => r.map((c) => c.mark || ''));
      const aiMove = getBestDoraMove(strBoard, boardSize, selectedDifficulty, 'X', 'O');
      if (!aiMove) return;

      playSoundEffect('click');
      const nextBoard = board.map((r) => r.map((c) => ({ ...c })));
      nextBoard[aiMove.row][aiMove.col] = {
        playerId: player2.userId,
        mark: 'X',
        skin: player2.skinX,
      };
      setBoard(nextBoard);

      const ended = handleLocalBoardOutcome(nextBoard, 'player2');
      if (!ended) {
        setCurrentTurn('player1');
        setTurnTimeLeft(turnDuration);
      }
    }, delayMs);

    return () => clearTimeout(timer);
  }, [
    view,
    gameMode,
    currentTurn,
    winningLine,
    gameEndedState,
    board,
    boardSize,
    selectedDifficulty,
    playSoundEffect,
    player2,
    handleLocalBoardOutcome,
    turnDuration,
  ]);

  // Turn Countdown Timer on MazeScreen (`maze_screen.dart`)
  useEffect(() => {
    if (view !== 'maze' || winningLine || gameEndedState) return;

    const timer = setInterval(() => {
      setTurnTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (gameMode === 'multiplayer' && onlineMatch) {
            void apiFetch<{ match: OnlineMatchData; coins?: number }>('/games/tictactoe', {
              method: 'POST',
              json: { action: 'timeout', gameKey: onlineMatch.gameKey },
            })
              .then((res) => {
                if (typeof res.coins === 'number') {
                  setProfile((p) => ({ ...p, coins: res.coins! }));
                }
                if (res.match.status === 'completed') {
                  const winPlayer =
                    res.match.result === 'player1' ? res.match.player1 : res.match.player2;
                  setGameEndedState({ type: 'win', winner: winPlayer });
                }
              })
              .catch(() => undefined);
          } else {
            const timeoutWinner = currentTurn === 'player1' ? player2 : player1;
            playSoundEffect('win');
            setGameEndedState({ type: 'win', winner: timeoutWinner });
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [
    view,
    winningLine,
    gameEndedState,
    gameMode,
    onlineMatch,
    currentTurn,
    player1,
    player2,
    playSoundEffect,
  ]);

  // Live Multiplayer Polling during active MazeScreen
  useEffect(() => {
    if (view !== 'maze' || gameMode !== 'multiplayer' || !onlineMatch) return;

    const interval = setInterval(async () => {
      try {
        const res = await apiFetch<{
          match: OnlineMatchData;
          profile?: GameProfileData | null;
        }>(`/games/tictactoe?gameKey=${encodeURIComponent(onlineMatch.gameKey)}`);
        const m = res.match;
        if (!m) return;

        setOnlineMatch(m);
        setBoard(m.board);
        setPlayer1(m.player1);
        if (m.player2) setPlayer2(m.player2);

        if (m.currentTurn !== currentTurn || m.currentRound + 1 !== currentRoundNumber) {
          setCurrentTurn(m.currentTurn);
          const elapsed = Math.floor(
            (Date.now() - new Date(m.turnStartedAt).getTime()) / 1000
          );
          setTurnTimeLeft(Math.max(1, turnDuration - Math.max(0, elapsed)));
        }

        if (m.currentRound + 1 > currentRoundNumber && m.status === 'inProgress') {
          setCurrentRoundNumber(m.currentRound + 1);
          setWinningLine(null);
          const roundWinPlayer =
            m.lastRoundWinner === 'player1'
              ? m.player1
              : m.lastRoundWinner === 'player2'
                ? m.player2
                : null;
          setGameEndedState({
            type: 'nextRound',
            winner: roundWinPlayer,
            roundNumber: m.currentRound + 1,
          });
        }

        if (m.status === 'completed' && !gameEndedState) {
          if (res.profile) {
            setProfile((prev) => ({ ...prev, ...res.profile }));
          }
          if (m.winningLine) {
            setWinningLine({
              winnerMark: m.winningLine.mark,
              row: m.winningLine.row,
              col: m.winningLine.col,
              diagonal: m.winningLine.diagonal,
              cells: [],
            });
          }
          playSoundEffect('win');
          setTimeout(() => {
            if (m.result === 'draw') {
              setGameEndedState({ type: 'draw', winner: null });
            } else {
              const winSlot = m.result === 'player1' ? m.player1 : m.player2;
              setGameEndedState({ type: 'win', winner: winSlot });
            }
          }, 1800);
        }
      } catch {
        // ignore transient poll glitch
      }
    }, 1200);

    return () => clearInterval(interval);
  }, [
    view,
    gameMode,
    onlineMatch,
    currentTurn,
    currentRoundNumber,
    turnDuration,
    gameEndedState,
    playSoundEffect,
  ]);

  // Handle Board Cell Tap
  const handleCellTap = async (row: number, col: number) => {
    if (winningLine || gameEndedState || doraThinking) return;
    const cell = board[row]?.[col];
    if (!cell || cell.mark) return;

    if (gameMode === 'offline') {
      if (currentTurn !== 'player1') return;
      playSoundEffect('click');
      const nextBoard = board.map((r) => r.map((c) => ({ ...c })));
      nextBoard[row][col] = {
        playerId: player1.userId,
        mark: 'O',
        skin: player1.skinO,
      };
      setBoard(nextBoard);
      const ended = handleLocalBoardOutcome(nextBoard, 'player1');
      if (!ended) {
        setCurrentTurn('player2');
        setTurnTimeLeft(turnDuration);
      }
      return;
    }

    if (gameMode === 'passNPlay') {
      playSoundEffect('click');
      const isP1 = currentTurn === 'player1';
      const activePlayer = isP1 ? player1 : player2;
      const nextBoard = board.map((r) => r.map((c) => ({ ...c })));
      nextBoard[row][col] = {
        playerId: activePlayer.userId,
        mark: isP1 ? 'O' : 'X',
        skin: isP1 ? activePlayer.skinO : activePlayer.skinX,
      };
      setBoard(nextBoard);
      const ended = handleLocalBoardOutcome(nextBoard, currentTurn);
      if (!ended) {
        setCurrentTurn(isP1 ? 'player2' : 'player1');
        setTurnTimeLeft(turnDuration);
      }
      return;
    }

    // Online Multiplayer Move
    if (gameMode === 'multiplayer' && onlineMatch && user) {
      const mySlot: 'player1' | 'player2' =
        onlineMatch.player1.userId === user.id ? 'player1' : 'player2';
      if (currentTurn !== mySlot) return;

      playSoundEffect('click');
      // Optimistic cell update
      const myPlayer = mySlot === 'player1' ? player1 : player2;
      const nextBoard = board.map((r) => r.map((c) => ({ ...c })));
      nextBoard[row][col] = {
        playerId: user.id,
        mark: mySlot === 'player1' ? 'X' : 'O',
        skin: mySlot === 'player1' ? myPlayer.skinX : myPlayer.skinO,
      };
      setBoard(nextBoard);

      try {
        const res = await apiFetch<{
          match: OnlineMatchData;
          roundAdvanced?: boolean;
          coins?: number;
          score?: number;
        }>('/games/tictactoe', {
          method: 'POST',
          json: {
            action: 'move',
            gameKey: onlineMatch.gameKey,
            row,
            col,
          },
        });
        const m = res.match;
        setOnlineMatch(m);
        setBoard(m.board);
        setCurrentTurn(m.currentTurn);
        setTurnTimeLeft(turnDuration);

        if (typeof res.coins === 'number') {
          setProfile((prev) => ({
            ...prev,
            coins: res.coins!,
            score: res.score ?? prev.score,
          }));
        }

        if (res.roundAdvanced) {
          setCurrentRoundNumber(m.currentRound + 1);
          const roundWinPlayer =
            m.lastRoundWinner === 'player1'
              ? m.player1
              : m.lastRoundWinner === 'player2'
                ? m.player2
                : null;
          setGameEndedState({
            type: 'nextRound',
            winner: roundWinPlayer,
            roundNumber: m.currentRound + 1,
          });
        } else if (m.status === 'completed') {
          if (m.winningLine) {
            setWinningLine({
              winnerMark: m.winningLine.mark,
              row: m.winningLine.row,
              col: m.winningLine.col,
              diagonal: m.winningLine.diagonal,
              cells: [],
            });
          }
          playSoundEffect('win');
          setTimeout(() => {
            if (m.result === 'draw') {
              setGameEndedState({ type: 'draw', winner: null });
            } else {
              const winSlot = m.result === 'player1' ? m.player1 : m.player2;
              setGameEndedState({ type: 'win', winner: winSlot });
            }
          }, 1800);
        }
      } catch (err) {
        setBoard(onlineMatch.board);
        error(err instanceof Error ? err.message : 'Move failed.');
      }
    }
  };

  // Compute SVG Coordinates for Winning Line (`line_animation.dart` & `board_offsets.dart`)
  const getWinningLineSvgCoords = (win: BoardWinResult, n: number) => {
    const step = 100 / n;
    const half = step / 2;
    if (win.row !== null) {
      const y = win.row * step + half;
      return { x1: 6, y1: y, x2: 94, y2: y };
    }
    if (win.col !== null) {
      const x = win.col * step + half;
      return { x1: x, y1: 6, x2: x, y2: 94 };
    }
    if (win.diagonal === 'main') {
      return { x1: 8, y1: 8, x2: 92, y2: 92 };
    }
    return { x1: 92, y1: 8, x2: 8, y2: 92 };
  };

  // Skin Equip / Buy Handler
  const handleSkinAction = async (skin: TicTacToeSkinCatalogItem) => {
    if (!user) {
      error('Please sign in to customize skins.');
      return;
    }
    const isOwned = profile.ownedSkinIds.includes(skin.id) || skin.price === 0;
    if (isOwned) {
      try {
        const res = await apiFetch<{
          coins: number;
          activeSkinId: string;
          ownedSkinIds: string[];
        }>('/games/tictactoe', {
          method: 'POST',
          json: { action: 'equip_skin', skinId: skin.id },
        });
        setProfile((prev) => ({
          ...prev,
          coins: res.coins,
          activeSkinId: res.activeSkinId,
          ownedSkinIds: res.ownedSkinIds,
        }));
        success(`${skin.name} equipped!`);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to equip skin.');
      }
    } else {
      setSkinConfirmTarget(skin);
    }
  };

  const confirmPurchaseSkin = async () => {
    if (!skinConfirmTarget) return;
    const target = skinConfirmTarget;
    setSkinConfirmTarget(null);
    try {
      const res = await apiFetch<{
        coins: number;
        activeSkinId: string;
        ownedSkinIds: string[];
      }>('/games/tictactoe', {
        method: 'POST',
        json: { action: 'buy_skin', skinId: target.id },
      });
      setProfile((prev) => ({
        ...prev,
        coins: res.coins,
        activeSkinId: res.activeSkinId,
        ownedSkinIds: res.ownedSkinIds,
      }));
      success(`${target.name} unlocked and equipped!`);
    } catch (err) {
      error(err instanceof Error ? err.message : 'Purchase failed.');
    }
  };

  // Shop Handlers (Purchase-Only via Wallet)
  const handleShopItemClick = async (item: TicTacToeShopCatalogItem) => {
    if (!user) {
      error('Please sign in to purchase coins.');
      return;
    }
    setBusyAction(true);
    try {
      const res = await apiFetch<{
        coins: number;
        walletBalance?: number;
        coinsCredited: number;
      }>('/games/tictactoe', {
        method: 'POST',
        json: { action: 'buy_coins_wallet', shopItemId: item.id },
      });
      setProfile((prev) => ({
        ...prev,
        coins: res.coins,
        walletBalance:
          typeof res.walletBalance === 'number' ? res.walletBalance : prev.walletBalance,
      }));
      success(`Purchased ${res.coinsCredited} coins!`);
    } catch (err) {
      error(err instanceof Error ? err.message : 'Purchase failed.');
    } finally {
      setBusyAction(false);
    }
  };

  const myDisplayName = user
    ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username
    : 'Guest Player';
  const myAvatarUrl = user?.avatar || '/assets/games/tictactoe/png/guest.png';

  const handleBackFromSubView = () => {
    if (activeIframeGame) {
      setActiveIframeGame(null);
      return;
    }
    if (view === 'connection' && onlineMatch) {
      void apiFetch('/games/tictactoe', {
        method: 'POST',
        json: { action: 'close_waiting', gameKey: onlineMatch.gameKey },
      })
        .then((res: unknown) => {
          const r = res as { coins?: number };
          if (typeof r?.coins === 'number') {
            setProfile((p) => ({ ...p, coins: r.coins! }));
          }
        })
        .catch(() => undefined);
      setOnlineMatch(null);
    } else if (view === 'maze' && gameMode === 'multiplayer' && onlineMatch?.status === 'inProgress') {
      void apiFetch('/games/tictactoe', {
        method: 'POST',
        json: { action: 'forfeit', gameKey: onlineMatch.gameKey },
      }).catch(() => undefined);
    }
    setView('home');
  };

  const viewTitleMap: Record<ScreenView, string> = {
    home: 'Tic-Tac-Toe Arena',
    connection: 'Matchmaking',
    maze: 'Live Match',
    leaderboard: 'Leaderboard',
    skins: 'Skins',
    shop: 'Coin Shop',
    history: 'Match History',
    settings: 'Game Profile',
    howToPlay: 'How To Play ?',
    moreGames: 'Play More Games',
  };

  return (
    <div
      ref={arenaRootRef}
      className="min-h-dvh w-full text-white flex flex-col select-none relative overflow-x-hidden pb-safe"
      style={{
        background: 'linear-gradient(180deg, #262C30 0%, #161719 100%)',
      }}
    >
      {/* Full-Game Mode Top Navigation Bar — Seamless UX to switch between Game Hub and Social App */}
      <div className="sticky top-0 z-30 pt-safe bg-[#161719]/90 backdrop-blur-md border-b border-[#5A5A5A]/45">
        <div className="max-w-[560px] mx-auto h-12 px-3.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {view === 'home' && !activeIframeGame ? (
              <button
                type="button"
                onClick={handleExitToApp}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[#242424] hover:bg-[#2f353a] border border-[#5A5A5A] text-xs font-bold text-white transition-colors cursor-pointer shrink-0"
                title="Return to Social Feed"
              >
                <ArrowLeft className="size-3.5 text-[#F0842A]" />
                <span>Back to App</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleBackFromSubView}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[#242424] hover:bg-[#2f353a] border border-[#5A5A5A] text-xs font-bold text-white transition-colors cursor-pointer shrink-0"
                >
                  <ArrowLeft className="size-3.5 text-[#00A0FF]" />
                  <span>{activeIframeGame ? 'More Games' : 'Game Hub'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleExitToApp}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full bg-[#242424]/70 hover:bg-[#242424] border border-[#5A5A5A]/70 text-xs font-semibold text-white/80 hover:text-white transition-colors cursor-pointer shrink-0"
                  title="Exit to Social App"
                >
                  <Home className="size-3.5 text-[#F0842A]" />
                  <span className="hidden sm:inline">Exit to App</span>
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/games/tictactoe/svg/dora.svg"
              alt=""
              className="size-5 object-contain shrink-0"
            />
            <span className="text-xs sm:text-sm font-extrabold tracking-wide text-white truncate">
              {activeIframeGame ? activeIframeGame.name : viewTitleMap[view]}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={toggleSound}
              className="size-8 rounded-full bg-[#242424] hover:bg-[#2f353a] border border-[#5A5A5A] flex items-center justify-center text-white transition-colors cursor-pointer"
              title={soundOn ? 'Mute game sound' : 'Unmute game sound'}
            >
              {soundOn ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5 text-white/60" />}
            </button>
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="size-8 rounded-full bg-[#242424] hover:bg-[#2f353a] border border-[#5A5A5A] flex items-center justify-center text-white transition-colors cursor-pointer"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen game mode'}
            >
              {isFullscreen ? (
                <Minimize2 className="size-3.5 text-[#F0842A]" />
              ) : (
                <Maximize2 className="size-3.5 text-[#00A0FF]" />
              )}
            </button>
          </div>
        </div>
      </div>
      {/* =====================================================================
       * 1. HOME SCREEN (`home_screen.dart` + `home_top_bar.dart`)
       * ===================================================================== */}
      {view === 'home' && (
        <div className="w-full max-w-[560px] mx-auto px-4 pt-4 pb-8 flex-1 flex flex-col">
          {/* HomeTopBar */}
          <div className="flex items-center justify-between gap-3 mb-6">
            {/* Profile Avatar Button */}
            <button
              type="button"
              onClick={() => setView('settings')}
              className="size-12 rounded-xl overflow-hidden border-2 border-[#5A5A5A] bg-[#242424] shadow-md hover:border-[#00A0FF] transition-colors shrink-0 cursor-pointer"
              title="Game Profile & Settings"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveMediaUrl(myAvatarUrl) || '/assets/games/tictactoe/png/guest.png'}
                alt={myDisplayName}
                className="w-full h-full object-cover"
              />
            </button>

            {/* Coin Balance Pill (`_buildCoinsCard`) */}
            <button
              type="button"
              onClick={() => setView('shop')}
              className="relative flex-1 max-w-[175px] h-10 flex items-center cursor-pointer group"
              title="Open Coin Shop"
            >
              <InnerShadowContainer className="w-full ml-3 pl-7 pr-2.5 py-1.5 flex items-center justify-between">
                <span className="text-sm font-extrabold text-white truncate">
                  {formatCompactCoins(profile.coins)}
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/assets/games/tictactoe/svg/increment_coin.svg"
                  alt="+"
                  className="size-4.5 object-contain group-hover:scale-110 transition-transform"
                />
              </InnerShadowContainer>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/games/tictactoe/png/coin.png"
                alt="Coins"
                className="size-9 object-contain absolute left-0 top-1/2 -translate-y-1/2 drop-shadow-md"
              />
            </button>

            {/* Leaderboard Pill (`_buildLeaderboardCard`) */}
            <button
              type="button"
              onClick={() => {
                void fetchHubData();
                setView('leaderboard');
              }}
              className="relative flex-1 max-w-[185px] h-10 flex items-center cursor-pointer group"
              title="View Leaderboard"
            >
              <InnerShadowContainer className="w-full mr-3 pl-3.5 pr-9 py-1.5 flex items-center">
                <span className="text-sm font-extrabold text-white truncate">Leaderboard</span>
              </InnerShadowContainer>
              <span className="size-9.5 rounded-full bg-[#F0842A] absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/assets/games/tictactoe/svg/leaderboard_icon.svg"
                  alt="Leaderboard"
                  className="size-5 object-contain"
                />
              </span>
            </button>
          </div>

          {/* Quick Secondary Pill Bar (Skins / History / How to Play / More Games) */}
          <div className="flex items-center justify-between gap-2 mb-5 overflow-x-auto no-scrollbar pb-1">
            {[
              {
                label: 'Skins',
                icon: '/assets/games/tictactoe/svg/skin.svg',
                target: 'skins' as ScreenView,
              },
              {
                label: 'History',
                icon: '/assets/games/tictactoe/svg/history.svg',
                target: 'history' as ScreenView,
              },
              {
                label: 'Shop',
                icon: '/assets/games/tictactoe/svg/shop.svg',
                target: 'shop' as ScreenView,
              },
              {
                label: 'How To Play',
                icon: '/assets/games/tictactoe/svg/how_to_play.svg',
                target: 'howToPlay' as ScreenView,
              },
              {
                label: 'More Games',
                icon: '/assets/games/tictactoe/svg/more_game.svg',
                target: 'moreGames' as ScreenView,
              },
            ].map((nav) => (
              <button
                key={nav.label}
                type="button"
                onClick={() => {
                  if (nav.target === 'history') void fetchHubData();
                  setView(nav.target);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#242424]/90 border border-[#5A5A5A]/70 hover:border-[#F0842A] text-xs font-semibold text-white shrink-0 transition-colors cursor-pointer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={nav.icon} alt="" className="size-3.5 object-contain" />
                <span>{nav.label}</span>
              </button>
            ))}
          </div>

          {/* Three Sloped Game Mode Cards (`HomeCard`) */}
          <div className="space-y-4">
            <HomeModeCard
              reverse={false}
              image="/assets/games/tictactoe/svg/dora_1.svg"
              title="OFFLINE PLAY"
              subTitle="Play with The Clever Fox Dora"
              onPlay={() => {
                setPendingMode('offline');
                setDifficultyDialogOpen(true);
              }}
            />

            <HomeModeCard
              reverse={true}
              image="/assets/games/tictactoe/svg/dora_2.svg"
              title="RANDOM PLAY"
              subTitle="Find your Match Around the World"
              secondaryActionLabel="Challenge Friend"
              onSecondaryAction={() => {
                setPendingMode('multiplayer');
                setIsFriendChallengeMode(true);
                setJoinRoomCodeInput('');
                setEntryFeeDialogOpen(true);
              }}
              onPlay={() => {
                setPendingMode('multiplayer');
                setIsFriendChallengeMode(false);
                setJoinRoomCodeInput('');
                setEntryFeeDialogOpen(true);
              }}
            />

            <HomeModeCard
              reverse={false}
              image="/assets/games/tictactoe/svg/dora_3.svg"
              title="PASS N PLAY"
              subTitle="Pass N Play With your Friend"
              onPlay={() => {
                setPendingMode('passNPlay');
                setMatrixSizeDialogOpen(true);
              }}
            />

            {/* Play More Games Feature Card (`more_games_screen.dart` entry) */}
            <InnerShadowContainer className="p-4 flex items-center justify-between gap-4 border-[#00A0FF]/50">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="size-13 rounded-xl bg-[#161719] border border-[#5A5A5A] flex items-center justify-center shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/assets/games/tictactoe/svg/more_game.svg"
                    alt="More Games"
                    className="size-7 object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-extrabold text-white uppercase tracking-wide truncate">
                    Play More Games
                  </h3>
                  <p className="text-xs text-white/70 truncate">
                    Hextris · Clumsy Bird · Pacman
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setView('moreGames')}
                className="px-4 py-2 rounded-lg font-extrabold text-xs sm:text-sm text-black shrink-0 transition-transform active:scale-95 cursor-pointer"
                style={{
                  background:
                    'linear-gradient(180deg, #8CD5FF 0%, #26AEFF 50%, #0088D9 100%)',
                }}
              >
                Explore
              </button>
            </InnerShadowContainer>
          </div>
        </div>
      )}

      {/* =====================================================================
       * 2. CONNECTION / MATCHMAKING SCREEN (`connection_screen.dart`)
       * ===================================================================== */}
      {view === 'connection' && onlineMatch && (
        <div className="w-full max-w-[520px] mx-auto px-4 py-8 flex-1 flex flex-col items-center justify-between text-center">
          <div className="w-full flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                void apiFetch('/games/tictactoe', {
                  method: 'POST',
                  json: { action: 'close_waiting', gameKey: onlineMatch.gameKey },
                })
                  .then((res: unknown) => {
                    const r = res as { coins?: number };
                    if (typeof r?.coins === 'number') {
                      setProfile((p) => ({ ...p, coins: r.coins! }));
                    }
                  })
                  .catch(() => undefined);
                setOnlineMatch(null);
                setView('home');
              }}
              className="size-9 rounded-full bg-[#242424] border border-[#5A5A5A] flex items-center justify-center text-white hover:bg-white/10 cursor-pointer"
              aria-label="Cancel matchmaking"
            >
              <ArrowLeft className="size-4" />
            </button>
            <span className="text-xs font-semibold uppercase tracking-wider text-white/60">
              Room: {onlineMatch.gameKey}
            </span>
            <div className="size-9" />
          </div>

          <div className="my-4 flex flex-col items-center">
            <h2 className="text-2xl font-extrabold uppercase tracking-wide text-white">
              {onlineMatch.isPrivateInvite ? 'FRIEND CHALLENGE' : 'PLAY WITH RANDOM'}
            </h2>
            <p className="text-sm text-white/75 mt-1">Online Multiplayer</p>

            {/* Dora 4 Mascot */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/games/tictactoe/svg/dora_4.svg"
              alt="Dora Matchmaking"
              className="w-[138px] h-[153px] object-contain my-5 drop-shadow-[0_10px_18px_rgba(0,0,0,0.5)]"
            />

            {/* ConnectionPlayersRow */}
            <div className="flex items-center justify-center gap-6 my-3">
              <div className="flex flex-col items-center gap-1.5">
                <div className="size-16 rounded-2xl overflow-hidden border-2 border-[#00A0FF] bg-[#242424] p-0.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      resolveMediaUrl(onlineMatch.player1.avatar) ||
                      '/assets/games/tictactoe/png/guest.png'
                    }
                    alt={onlineMatch.player1.name}
                    className="w-full h-full object-cover rounded-xl"
                  />
                </div>
                <span className="text-xs font-bold text-white max-w-[100px] truncate">
                  {onlineMatch.player1.name}
                </span>
              </div>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/games/tictactoe/svg/versus.svg"
                alt="VS"
                className="w-8 h-14 object-contain"
              />

              <div className="flex flex-col items-center gap-1.5">
                <div className="size-16 rounded-2xl overflow-hidden border-2 border-dashed border-[#F0842A] bg-[#242424] flex items-center justify-center animate-pulse">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/assets/games/tictactoe/png/guest.png"
                    alt="Searching"
                    className="size-10 object-contain opacity-70"
                  />
                </div>
                <span className="text-xs font-semibold text-white/75">Joining Soon...</span>
              </div>
            </div>

            {/* ConnectionEntryInfo */}
            <div className="grid grid-cols-2 gap-3 w-full max-w-[340px] my-4">
              <InnerShadowContainer className="p-3 text-center">
                <p className="text-xs text-white/65">Entry Coin</p>
                <p className="text-base font-extrabold text-[#F0842A] mt-0.5">
                  {onlineMatch.entryFee} Coins
                </p>
              </InnerShadowContainer>
              <InnerShadowContainer className="p-3 text-center">
                <p className="text-xs text-white/65">Game Mode</p>
                <p className="text-base font-extrabold text-white mt-0.5">
                  {onlineMatch.matrixSize}x{onlineMatch.matrixSize} · {onlineMatch.rounds}R
                </p>
              </InnerShadowContainer>
            </div>

            {/* Share Challenge Link / Room Code */}
            <div className="flex items-center gap-2 my-2">
              <button
                type="button"
                onClick={async () => {
                  const shareUrl = `${window.location.origin}/games?invite=${onlineMatch.gameKey}`;
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    success(`Invite link copied! Room code: ${onlineMatch.gameKey}`);
                  } catch {
                    info(`Room code: ${onlineMatch.gameKey}`);
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#242424] border border-[#00A8CA] text-xs font-bold text-white hover:bg-[#00A8CA]/20 cursor-pointer"
              >
                <Copy className="size-3.5 text-[#00A8CA]" />
                <span>Copy Challenge Link ({onlineMatch.gameKey})</span>
              </button>
            </div>
          </div>

          {/* ConnectionTimer or Retry */}
          <div className="w-full pb-4">
            {connectionFailed ? (
              <div className="space-y-3">
                <p className="text-sm text-white/80">No opponent found. Stake refunded.</p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setView('home')}
                    className="h-10 px-5 rounded-xl border border-[#5A5A5A] bg-[#242424] text-sm font-bold text-white cursor-pointer"
                  >
                    Back Home
                  </button>
                  <button
                    type="button"
                    onClick={() => void startOnlineConnection()}
                    className="h-10 px-6 rounded-xl bg-[#F0842A] text-sm font-bold text-white shadow-[0_3px_0_#b35c12] cursor-pointer"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#242424] border border-[#5A5A5A]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/assets/games/tictactoe/svg/clock.svg"
                    alt="Timer"
                    className="size-4 object-contain"
                  />
                  <span className="text-sm font-bold text-white">00:{String(searchTimeLeft).padStart(2, '0')}</span>
                </div>
                <p className="text-xs text-white/70">Connecting with Opponents...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
       * 3. MAZE GAMEPLAY SCREEN (`maze_screen.dart`)
       * ===================================================================== */}
      {view === 'maze' && (() => {
        const myUserId = user?.id || 'local_p1';
        const isYourMove =
          gameMode === 'passNPlay'
            ? true
            : gameMode === 'offline'
              ? currentTurn === 'player1'
              : (currentTurn === 'player1' && player1.userId === myUserId) ||
                (currentTurn === 'player2' && player2.userId === myUserId);

        const timeProgress = Math.max(0, Math.min(1, turnTimeLeft / Math.max(1, turnDuration)));
        const activePlayerId =
          currentTurn === 'player1' ? player1.userId : player2.userId;

        return (
          <div className="w-full max-w-[520px] mx-auto px-4 pt-4 pb-6 flex-1 flex flex-col justify-between">
            {/* Top Back + GameInformationHeader (`game_information_header.dart`) */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={() => {
                    if (gameMode === 'multiplayer' && onlineMatch && onlineMatch.status === 'inProgress') {
                      void apiFetch('/games/tictactoe', {
                        method: 'POST',
                        json: { action: 'forfeit', gameKey: onlineMatch.gameKey },
                      }).catch(() => undefined);
                    }
                    setView('home');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-white/80 hover:text-white cursor-pointer"
                >
                  <ArrowLeft className="size-4" />
                  <span>Exit Match</span>
                </button>

                {totalRoundsCount > 1 && (
                  <span className="text-sm font-extrabold text-[#F0842A]">
                    Current Round: {currentRoundNumber} / {totalRoundsCount}
                  </span>
                )}
              </div>

              {/* Move Status + Countdown Label */}
              <div className="flex items-center justify-between text-sm font-semibold text-white mb-1.5">
                <span>
                  {gameMode === 'passNPlay'
                    ? `${currentTurn === 'player1' ? player1.name : player2.name}'s Move`
                    : isYourMove
                      ? 'Your move'
                      : doraThinking
                        ? 'Dora is thinking...'
                        : 'Opponent move'}
                </span>
                <span className="font-mono">
                  Time: {String(turnTimeLeft).padStart(3, '0')}
                </span>
              </div>

              {/* Shrinking Color-Lerping Timer Bar */}
              <div className="w-full h-1.5 bg-gray-200/90 rounded-full overflow-hidden mb-4">
                <div
                  className="h-full transition-all duration-1000 ease-linear"
                  style={{
                    width: `${timeProgress * 100}%`,
                    backgroundColor:
                      timeProgress > 0.35 ? '#F0842A' : '#EF4444',
                  }}
                />
              </div>

              {/* Coins / Entry Coin / Sound Toggle Row */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 py-2.5 px-3 rounded-md border border-white/60 text-center text-sm font-bold text-white">
                  Your Coin: {profile.coins}
                </div>

                {gameMode === 'multiplayer' && onlineMatch && (
                  <div className="flex-1 py-2.5 px-3 rounded-md bg-white text-[#242424] text-center text-sm font-bold">
                    Entry Coin: {onlineMatch.entryFee}
                  </div>
                )}

                <button
                  type="button"
                  onClick={toggleSound}
                  className="p-2.5 rounded-md bg-white text-[#242424] hover:bg-white/90 transition-colors cursor-pointer shrink-0"
                  aria-label="Toggle sound"
                >
                  {soundOn ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
                </button>
              </div>
            </div>

            {/* Center Board Grid (`TileBoxWidget` Squircle cells + `AnimatedLine` overlay) */}
            <div className="my-6 flex items-center justify-center">
              <div className="relative w-full max-w-[360px] aspect-square">
                <div
                  className="w-full h-full grid gap-3 sm:gap-4"
                  style={{
                    gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${boardSize}, minmax(0, 1fr))`,
                  }}
                >
                  {board.map((rowCells, rIdx) =>
                    rowCells.map((cell, cIdx) => (
                      <button
                        key={`${rIdx}-${cIdx}`}
                        type="button"
                        onClick={() => void handleCellTap(rIdx, cIdx)}
                        className="relative w-full h-full rounded-[22%] bg-[#242424] border border-[#5A5A5A] flex items-center justify-center p-2.5 transition-transform active:scale-95 cursor-pointer"
                        style={{
                          boxShadow:
                            'inset 0 2px 3px rgba(255,255,255,0.07), 5px 5px 10px rgba(0,0,0,0.45), 3px 3px 8px rgba(0,0,0,0.28)',
                        }}
                      >
                        {cell.mark && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={getSkinAssetPath(
                              cell.skin ||
                                (cell.mark === 'X' ? 'default_cross' : 'default_circle')
                            )}
                            alt={cell.mark}
                            className="w-3/4 h-3/4 object-contain animate-in zoom-in-75 duration-150"
                          />
                        )}
                      </button>
                    ))
                  )}
                </div>

                {/* Winning Line Overlay (`line_animation.dart`) */}
                {winningLine && (() => {
                  const coords = getWinningLineSvgCoords(winningLine, boardSize);
                  const strokeColor =
                    winningLine.winnerMark === 'O' ? '#00A0FF' : '#FF2D95';
                  return (
                    <svg
                      viewBox="0 0 100 100"
                      className="absolute inset-0 w-full h-full pointer-events-none z-10"
                    >
                      <line
                        x1={coords.x1}
                        y1={coords.y1}
                        x2={coords.x2}
                        y2={coords.y2}
                        stroke={strokeColor}
                        strokeWidth="4.5"
                        strokeLinecap="round"
                        style={{
                          filter: `drop-shadow(0 0 8px ${strokeColor})`,
                        }}
                      />
                    </svg>
                  );
                })()}
              </div>
            </div>

            {/* Bottom PlayersProfileWidget (`players_profile_widget.dart`) */}
            <div className="flex items-center justify-between gap-4 pt-2">
              {/* Player 1 */}
              <div className="flex-1 flex items-center gap-2.5 min-w-0">
                <div
                  className={cn(
                    'size-13 rounded-xl overflow-hidden bg-[#242424] p-0.5 shrink-0 transition-all',
                    activePlayerId === player1.userId
                      ? 'ring-2 ring-[#FF2D95] shadow-[0_0_14px_#FF2D95]'
                      : 'border border-[#5A5A5A]'
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      resolveMediaUrl(player1.avatar) ||
                      '/assets/games/tictactoe/png/guest.png'
                    }
                    alt={player1.name}
                    className="w-full h-full object-cover rounded-[10px]"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs text-white/80">
                    <span>Sign:</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getSkinAssetPath(
                        player1.activeSkinType === 'X' ? player1.skinX : player1.skinO
                      )}
                      alt={player1.activeSkinType}
                      className="size-4 object-contain"
                    />
                  </div>
                  <p className="text-sm font-bold text-white truncate">{player1.name}</p>
                </div>
              </div>

              {/* Center VS Icon */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/games/tictactoe/svg/versus.svg"
                alt="VS"
                className="w-7 h-14 object-contain shrink-0"
              />

              {/* Player 2 */}
              <div className="flex-1 flex items-center justify-end gap-2.5 min-w-0 text-right">
                <div className="min-w-0">
                  <div className="flex items-center justify-end gap-1.5 text-xs text-white/80">
                    <span>Sign:</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getSkinAssetPath(
                        player2.activeSkinType === 'X' ? player2.skinX : player2.skinO
                      )}
                      alt={player2.activeSkinType}
                      className="size-4 object-contain"
                    />
                  </div>
                  <p className="text-sm font-bold text-white truncate">{player2.name}</p>
                </div>
                <div
                  className={cn(
                    'size-13 rounded-xl overflow-hidden bg-[#242424] p-0.5 shrink-0 transition-all',
                    activePlayerId === player2.userId
                      ? 'ring-2 ring-[#FF2D95] shadow-[0_0_14px_#FF2D95]'
                      : 'border border-[#5A5A5A]'
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      player2.avatar.startsWith('/assets/games/')
                        ? player2.avatar
                        : resolveMediaUrl(player2.avatar) ||
                          '/assets/games/tictactoe/png/guest.png'
                    }
                    alt={player2.name}
                    className="w-full h-full object-cover rounded-[10px]"
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* =====================================================================
       * 4. LEADERBOARD SCREEN (`leaderboard_screen.dart`)
       * ===================================================================== */}
      {view === 'leaderboard' && (
        <div className="w-full max-w-[560px] mx-auto px-4 py-5 flex-1 flex flex-col">
          <div className="flex items-center gap-3 mb-4">
            <button
              type="button"
              onClick={() => setView('home')}
              className="size-9 rounded-full bg-[#242424] border border-[#5A5A5A] flex items-center justify-center text-white hover:bg-white/10 cursor-pointer"
            >
              <ArrowLeft className="size-4" />
            </button>
            <h2 className="text-xl font-extrabold text-white">Leaderboard</h2>
          </div>

          <DoraProfileCard
            username={myDisplayName}
            email={user?.email}
            avatar={myAvatarUrl}
            coins={profile.coins}
            rank={profile.rank}
            score={profile.score}
            played={profile.matchesPlayed}
            wins={profile.matchesWon}
          />

          <div className="mt-4 space-y-2.5 flex-1 overflow-y-auto">
            {leaderboard.length === 0 ? (
              <InnerShadowContainer className="p-8 text-center text-sm text-white/70">
                No players ranked yet. Win a match to claim #1!
              </InnerShadowContainer>
            ) : (
              leaderboard.map((item) => {
                const isMe = Boolean(user && item.userId === user.id);
                const rankSvg =
                  item.rank === 1
                    ? '/assets/games/tictactoe/svg/rank1.svg'
                    : item.rank === 2
                      ? '/assets/games/tictactoe/svg/rank2.svg'
                      : item.rank === 3
                        ? '/assets/games/tictactoe/svg/rank3.svg'
                        : null;
                return (
                  <InnerShadowContainer
                    key={item.userId}
                    highlight={isMe}
                    className="px-4 py-2.5 flex items-center gap-3.5"
                  >
                    <div className="w-7 flex items-center justify-center shrink-0">
                      {rankSvg ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={rankSvg}
                          alt={`#${item.rank}`}
                          className="w-6 h-9 object-contain"
                        />
                      ) : (
                        <span className="text-sm font-extrabold text-white">
                          {item.rank}
                        </span>
                      )}
                    </div>

                    <div className="size-10 rounded-full overflow-hidden bg-[#161719] border border-[#5A5A5A] shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={
                          resolveMediaUrl(item.avatar) ||
                          '/assets/games/tictactoe/png/guest.png'
                        }
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{item.name}</p>
                      <p className="text-xs text-white/60 truncate">@{item.username}</p>
                    </div>

                    <span className="text-base font-extrabold text-[#F0842A] shrink-0">
                      {item.score}
                    </span>
                  </InnerShadowContainer>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
       * 5. SKINS SCREEN (`skins_screen.dart` & `skin_tile.dart`)
       * ===================================================================== */}
      {view === 'skins' && (
        <div className="w-full max-w-[560px] mx-auto px-4 py-5 flex-1 flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setView('home')}
                className="size-9 rounded-full bg-[#242424] border border-[#5A5A5A] flex items-center justify-center text-white hover:bg-white/10 cursor-pointer"
              >
                <ArrowLeft className="size-4" />
              </button>
              <h2 className="text-xl font-extrabold text-white">Skins</h2>
            </div>

            <div className="px-3 py-1.5 rounded-lg bg-[#242424] border border-[#5A5A5A] flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/games/tictactoe/png/coin.png"
                alt="Coins"
                className="size-4.5 object-contain"
              />
              <span className="text-sm font-bold text-white">{profile.coins}</span>
            </div>
          </div>

          <div className="space-y-3">
            {skinsCatalog.map((skin) => {
              const isOwned =
                profile.ownedSkinIds.includes(skin.id) || skin.price === 0;
              const isActive = profile.activeSkinId === skin.id;

              return (
                <div key={skin.id} className="flex items-center gap-3 h-14">
                  <InnerShadowContainer className="flex-1 h-full px-4 flex items-center gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getSkinAssetPath(skin.skinX)}
                      alt="X"
                      className="size-7 object-contain shrink-0"
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getSkinAssetPath(skin.skinO)}
                      alt="O"
                      className="size-7 object-contain shrink-0"
                    />
                    <span className="text-base font-extrabold text-white truncate">
                      {skin.name}
                    </span>
                  </InnerShadowContainer>

                  <button
                    type="button"
                    disabled={isActive}
                    onClick={() => void handleSkinAction(skin)}
                    className={cn(
                      'w-32 h-full rounded-[10px] font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0',
                      isActive
                        ? 'bg-[#00A8CA] text-white cursor-default'
                        : isOwned
                          ? 'bg-[#F0842A] hover:bg-[#f59342] text-white shadow-[0_3px_0_#b35c12]'
                          : 'bg-[#242424] border border-[#F0842A] text-white hover:bg-[#F0842A]/20'
                    )}
                  >
                    {isActive ? (
                      <>
                        <Check className="size-4" />
                        <span>Active</span>
                      </>
                    ) : isOwned ? (
                      <span>Use Now</span>
                    ) : (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/assets/games/tictactoe/png/coin.png"
                          alt=""
                          className="size-4 object-contain"
                        />
                        <span>{skin.price}</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =====================================================================
       * 6. SHOP SCREEN (`shop_screen.dart` & `shop_item_card.dart` — Purchase-Only)
       * ===================================================================== */}
      {view === 'shop' && (
        <div className="w-full max-w-[560px] mx-auto px-4 py-5 flex-1 flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setView('home')}
                className="size-9 rounded-full bg-[#242424] border border-[#5A5A5A] flex items-center justify-center text-white hover:bg-white/10 cursor-pointer"
              >
                <ArrowLeft className="size-4" />
              </button>
              <h2 className="text-xl font-extrabold text-white">Shop</h2>
            </div>

            <div className="px-3 py-1.5 rounded-lg bg-[#242424] border border-[#5A5A5A] flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/games/tictactoe/png/coin.png"
                alt="Coins"
                className="size-4.5 object-contain"
              />
              <span className="text-sm font-bold text-white">{profile.coins}</span>
            </div>
          </div>

          {/* Wallet Balance Banner */}
          <InnerShadowContainer className="p-3.5 mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-9 rounded-lg bg-[#F0842A]/20 border border-[#F0842A]/50 flex items-center justify-center shrink-0">
                <Wallet className="size-4 text-[#F0842A]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-white/65">Your Wallet Balance</p>
                <p className="text-sm font-extrabold text-white truncate">
                  ₦{(profile.walletBalance || 0).toLocaleString()}
                </p>
              </div>
            </div>
            <Link
              href="/wallet"
              className="px-3.5 py-1.5 rounded-lg bg-[#00A8CA] hover:bg-[#00b8de] text-xs font-extrabold text-white shrink-0 transition-colors"
            >
              + Fund Wallet
            </Link>
          </InnerShadowContainer>

          <div className="grid grid-cols-2 gap-4">
            {shopCatalog.map((item) => (
              <InnerShadowContainer
                key={item.id}
                className="overflow-hidden flex flex-col justify-between relative h-56"
              >
                {/* Star group decorations (`shop_item_card.dart`) */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/assets/games/tictactoe/svg/star_group.svg"
                  alt=""
                  className="w-7 h-7 object-contain absolute top-14 left-2.5 opacity-60 pointer-events-none"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/assets/games/tictactoe/svg/star_group.svg"
                  alt=""
                  className="w-7 h-7 object-contain absolute bottom-10 right-1.5 opacity-60 pointer-events-none"
                />

                <div className="w-full bg-[#F0842A] py-2 text-center font-extrabold text-sm text-white">
                  {item.title}
                </div>

                <div className="flex-1 flex items-center justify-center p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.artwork}
                    alt={item.title}
                    className="h-20 w-auto object-contain drop-shadow-md"
                  />
                </div>

                <div className="px-3 pb-3.5 flex justify-center">
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => void handleShopItemClick(item)}
                    className="w-full py-2 px-4 rounded-xl bg-[#F0842A] hover:bg-[#f59342] text-white text-xs sm:text-sm font-extrabold shadow-[0_3px_0_#b35c12] transition-all cursor-pointer disabled:opacity-50"
                  >
                    Buy · ₦{item.priceNgn.toLocaleString()}
                  </button>
                </div>
              </InnerShadowContainer>
            ))}
          </div>
        </div>
      )}

      {/* =====================================================================
       * 7. HISTORY SCREEN (`history_screen.dart`)
       * ===================================================================== */}
      {view === 'history' && (
        <div className="w-full max-w-[560px] mx-auto px-4 py-5 flex-1 flex flex-col">
          <div className="flex items-center gap-3 mb-4">
            <button
              type="button"
              onClick={() => setView('home')}
              className="size-9 rounded-full bg-[#242424] border border-[#5A5A5A] flex items-center justify-center text-white hover:bg-white/10 cursor-pointer"
            >
              <ArrowLeft className="size-4" />
            </button>
            <h2 className="text-xl font-extrabold text-white">History</h2>
          </div>

          <DoraProfileCard
            username={myDisplayName}
            email={user?.email}
            avatar={myAvatarUrl}
            coins={profile.coins}
            rank={profile.rank}
            score={profile.score}
            played={profile.matchesPlayed}
            wins={profile.matchesWon}
            customBottom={
              <div className="grid grid-cols-2 divide-x divide-dashed divide-[#5A5A5A] text-center">
                <div>
                  <p className="text-xs text-white/70">Played</p>
                  <p className="text-base font-bold text-white mt-1">
                    {profile.matchesPlayed}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-white/70">Duration</p>
                  <select
                    value={historyFilterDays}
                    onChange={(e) => {
                      const next = e.target.value as 'all' | '7' | '30';
                      setHistoryFilterDays(next);
                      void fetchHubData(next);
                    }}
                    className="mt-1 bg-transparent text-white font-bold text-sm focus:outline-none cursor-pointer"
                  >
                    <option value="all" className="bg-[#242424]">
                      All
                    </option>
                    <option value="7" className="bg-[#242424]">
                      Last 7 days
                    </option>
                    <option value="30" className="bg-[#242424]">
                      Last 30 days
                    </option>
                  </select>
                </div>
              </div>
            }
          />

          <InnerShadowContainer className="mt-4 px-4 py-2.5 grid grid-cols-3 text-center text-xs sm:text-sm font-bold text-white">
            <span>Transaction</span>
            <span>Status</span>
            <span>Date/Time</span>
          </InnerShadowContainer>

          <InnerShadowContainer className="mt-3 flex-1 divide-y divide-[#5A5A5A]/50 overflow-y-auto">
            {history.length === 0 ? (
              <div className="p-10 text-center text-sm text-white/70">No history found</div>
            ) : (
              history.map((h) => (
                <div
                  key={h._id}
                  className="px-4 py-3 grid grid-cols-3 items-center text-center text-xs sm:text-sm"
                >
                  <span
                    className={cn(
                      'font-extrabold',
                      h.amount > 0
                        ? 'text-emerald-400'
                        : h.amount < 0
                          ? 'text-red-400'
                          : 'text-white/80'
                    )}
                  >
                    {h.amount > 0 ? `+${h.amount}` : h.amount}
                  </span>
                  <div className="flex flex-col items-center">
                    <span className="font-bold text-white capitalize">{h.status}</span>
                    <span className="text-[11px] text-white/55 truncate max-w-[110px]">
                      {h.opponentName}
                    </span>
                  </div>
                  <span className="text-xs text-white/70">
                    {new Date(h.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))
            )}
          </InnerShadowContainer>
        </div>
      )}

      {/* =====================================================================
       * 8. SETTINGS & PROFILE SCREEN (`settings_screen.dart`)
       * ===================================================================== */}
      {view === 'settings' && (
        <div className="w-full max-w-[560px] mx-auto px-4 py-5 flex-1 flex flex-col">
          <div className="flex items-center gap-3 mb-4">
            <button
              type="button"
              onClick={() => setView('home')}
              className="size-9 rounded-full bg-[#242424] border border-[#5A5A5A] flex items-center justify-center text-white hover:bg-white/10 cursor-pointer"
            >
              <ArrowLeft className="size-4" />
            </button>
            <h2 className="text-xl font-extrabold text-white">Game Profile & Settings</h2>
          </div>

          <DoraProfileCard
            username={myDisplayName}
            email={user?.email}
            avatar={myAvatarUrl}
            coins={profile.coins}
            rank={profile.rank}
            score={profile.score}
            played={profile.matchesPlayed}
            wins={profile.matchesWon}
          />

          {/* Sound Toggle Card (`sound_toggle_card.dart`) */}
          <InnerShadowContainer className="mt-4 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-[#5A5A5A]/30 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/assets/games/tictactoe/svg/volume_up.svg"
                  alt="Sound"
                  className="size-5 object-contain"
                />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Sound</p>
                <p className="text-xs text-white/65">
                  {soundOn ? 'Sound Enabled' : 'Sound Disabled'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleSound}
              className={cn(
                'w-12 h-6 rounded-full p-0.5 transition-colors cursor-pointer',
                soundOn ? 'bg-[#F0842A]' : 'bg-[#5A5A5A]'
              )}
            >
              <span
                className={cn(
                  'block size-5 rounded-full bg-white transition-transform',
                  soundOn ? 'translate-x-6' : 'translate-x-0'
                )}
              />
            </button>
          </InnerShadowContainer>

          {/* Menu List (`settings_screen.dart`) */}
          <InnerShadowContainer className="mt-4 divide-y divide-[#5A5A5A]/40 overflow-hidden">
            {[
              {
                title: 'History',
                icon: '/assets/games/tictactoe/svg/history.svg',
                onClick: () => setView('history'),
              },
              {
                title: 'Shop',
                icon: '/assets/games/tictactoe/svg/shop.svg',
                onClick: () => setView('shop'),
              },
              {
                title: 'Skin',
                icon: '/assets/games/tictactoe/svg/skin.svg',
                onClick: () => setView('skins'),
              },
              {
                title: 'Play More Games',
                icon: '/assets/games/tictactoe/svg/more_game.svg',
                onClick: () => setView('moreGames'),
              },
              {
                title: 'How To Play ?',
                icon: '/assets/games/tictactoe/svg/how_to_play.svg',
                onClick: () => setView('howToPlay'),
              },
              {
                title: 'Share Game',
                icon: '/assets/games/tictactoe/svg/share_app.svg',
                onClick: async () => {
                  try {
                    await navigator.clipboard.writeText(`${window.location.origin}/games`);
                    success('Game link copied to clipboard!');
                  } catch {
                    // ignore
                  }
                },
              },
            ].map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={item.onClick}
                className="w-full px-4 py-3.5 flex items-center gap-4 hover:bg-white/5 transition-colors text-left cursor-pointer"
              >
                <div className="size-10 rounded-xl bg-[#5A5A5A]/30 flex items-center justify-center shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.icon} alt="" className="size-5 object-contain" />
                </div>
                <span className="text-sm font-bold text-white flex-1">{item.title}</span>
              </button>
            ))}
          </InnerShadowContainer>
        </div>
      )}

      {/* =====================================================================
       * 9. HOW TO PLAY SCREEN (`how_to_play_screen.dart`)
       * ===================================================================== */}
      {view === 'howToPlay' && (
        <div className="w-full max-w-[560px] mx-auto px-4 py-5 flex-1 flex flex-col">
          <div className="flex items-center gap-3 mb-5">
            <button
              type="button"
              onClick={() => setView('home')}
              className="size-9 rounded-full bg-[#242424] border border-[#5A5A5A] flex items-center justify-center text-white hover:bg-white/10 cursor-pointer"
            >
              <ArrowLeft className="size-4" />
            </button>
            <h2 className="text-xl font-extrabold text-white">How To Play ?</h2>
          </div>

          <InnerShadowContainer className="p-6 flex flex-col items-center text-center space-y-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/games/tictactoe/svg/dora.svg"
              alt="Dora"
              className="w-28 h-28 object-contain"
            />
            <p className="text-sm sm:text-base text-white/90 leading-relaxed">
              The player who succeeds in placing their marks in a full horizontal, vertical, or
              diagonal row wins the game!
            </p>
            <div className="w-full text-left space-y-2 pt-2 border-t border-dashed border-[#5A5A5A] text-xs sm:text-sm text-white/80">
              <p>
                • <strong>Classic Mode (3x3):</strong> Connect 3 marks in a line (20s per turn).
              </p>
              <p>
                • <strong>Advanced Mode (4x4):</strong> Connect 4 marks in a line (30s per turn).
              </p>
              <p>
                • <strong>Expert Mode (5x5):</strong> Connect 5 marks in a line (40s per turn).
              </p>
              <p>
                • <strong>Online Multiplayer:</strong> Stake coins to enter a match—the winner
                claims <strong>2× the entry fee</strong>, and a draw returns each player&apos;s
                stake!
              </p>
            </div>
          </InnerShadowContainer>
        </div>
      )}

      {/* =====================================================================
       * 10. MORE GAMES SCREEN (`more_games_screen.dart` + `game_webview_screen.dart`)
       * ===================================================================== */}
      {view === 'moreGames' && (
        <div className="w-full max-w-[560px] mx-auto px-4 py-5 flex-1 flex flex-col">
          <div className="flex items-center gap-3 mb-5">
            <button
              type="button"
              onClick={() => setView('home')}
              className="size-9 rounded-full bg-[#242424] border border-[#5A5A5A] flex items-center justify-center text-white hover:bg-white/10 cursor-pointer"
            >
              <ArrowLeft className="size-4" />
            </button>
            <h2 className="text-xl font-extrabold text-white">Play More Games</h2>
          </div>

          {moreGamesCatalog.length === 0 ? (
            <InnerShadowContainer className="p-8 text-center text-sm text-white/70">
              No games available yet
            </InnerShadowContainer>
          ) : (
            <div className="space-y-4">
              {moreGamesCatalog.map((g) => (
                <div key={g.name} className="flex items-stretch gap-3">
                  <InnerShadowContainer className="flex-1 px-3 py-2 flex items-center gap-3 min-w-0">
                    <div className="size-14 rounded-[10px] overflow-hidden bg-[#161719] border border-[#5A5A5A] shrink-0 flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={g.image || '/assets/games/tictactoe/svg/more_game.svg'}
                        alt={g.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          if (e.currentTarget.dataset.fallback !== '1') {
                            e.currentTarget.dataset.fallback = '1';
                            e.currentTarget.src = '/assets/games/tictactoe/svg/more_game.svg';
                          }
                        }}
                      />
                    </div>
                    <span className="text-lg font-extrabold text-white truncate">
                      {g.name}
                    </span>
                  </InnerShadowContainer>

                  {/* Exact Flutter `more_games_screen.dart` vertical blue gradient Play Now button */}
                  <button
                    type="button"
                    onClick={() => {
                      setIframeLoading(true);
                      setActiveIframeGame(g);
                    }}
                    className="px-5 rounded-[6px] font-bold text-sm text-black flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer"
                    style={{
                      background:
                        'linear-gradient(180deg, #8CD5FF 0%, #26AEFF 50%, #0088D9 100%)',
                    }}
                  >
                    Play Now
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Embedded WebView / Iframe Screen for More Games (`game_webview_screen.dart`) */}
      {activeIframeGame && (
        <div className="fixed inset-0 z-50 bg-[#161719] flex flex-col pt-safe pb-safe">
          <div className="h-13 px-4 bg-[#242424] border-b border-[#5A5A5A] flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setActiveIframeGame(null)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[#161719] hover:bg-white/10 border border-[#5A5A5A] text-xs font-bold text-white cursor-pointer"
              >
                <ArrowLeft className="size-3.5 text-[#00A0FF]" />
                <span>More Games</span>
              </button>
              <button
                type="button"
                onClick={handleExitToApp}
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full bg-[#161719]/80 hover:bg-white/10 border border-[#5A5A5A]/70 text-xs font-semibold text-white/80 hover:text-white cursor-pointer"
              >
                <Home className="size-3.5 text-[#F0842A]" />
                <span className="hidden sm:inline">Exit to App</span>
              </button>
            </div>

            <span className="text-sm sm:text-base font-extrabold text-white truncate">
              {activeIframeGame.name}
            </span>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIframeLoading(true);
                  setIframeReloadKey((k) => k + 1);
                }}
                className="size-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
                title="Reload game"
              >
                <RefreshCw className="size-4" />
              </button>
              <a
                href={activeIframeGame.url}
                target="_blank"
                rel="noopener noreferrer"
                className="size-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
                title="Open in new tab"
              >
                <ExternalLink className="size-4" />
              </a>
            </div>
          </div>

          <div className="relative flex-1 w-full bg-black">
            {iframeLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#161719]/80 z-10">
                <Loader2 className="size-8 animate-spin text-[#F0842A]" />
              </div>
            )}
            <iframe
              key={`${activeIframeGame.url}-${iframeReloadKey}`}
              src={activeIframeGame.url}
              title={activeIframeGame.name}
              onLoad={() => setIframeLoading(false)}
              className="w-full h-full border-0 bg-black block"
              allow="autoplay; fullscreen; gamepad"
            />
          </div>
        </div>
      )}

      {/* =====================================================================
       * DIALOGS (`DifficultySelectionDialog`, `EntryFeeSelectionDialog`, `MatrixSizeSelectionDialog`, etc.)
       * ===================================================================== */}

      {/* 1. DifficultySelectionDialog (`difficulty_selection_dialog.dart`) */}
      <DoraDialog
        open={difficultyDialogOpen}
        title="Select Difficulty"
        onClose={() => setDifficultyDialogOpen(false)}
        buttons={[
          {
            title: 'Next',
            icon: '/assets/games/tictactoe/svg/next.svg',
            onClick: () => {
              setDifficultyDialogOpen(false);
              setMatrixSizeDialogOpen(true);
            },
          },
        ]}
      >
        <div className="space-y-3 py-2 px-4">
          {(['easy', 'medium', 'hard'] as TicTacToeDifficulty[]).map((diff) => {
            const selected = selectedDifficulty === diff;
            return (
              <button
                key={diff}
                type="button"
                onClick={() => setSelectedDifficulty(diff)}
                className={cn(
                  'w-full h-11 rounded-xl border font-bold text-sm capitalize transition-all cursor-pointer',
                  selected
                    ? 'bg-[#F0842A] border-[#F0842A] text-white shadow-md'
                    : 'bg-[#161719]/70 border-[#5A5A5A] text-white/85 hover:border-white/50'
                )}
              >
                {diff}
              </button>
            );
          })}
        </div>
      </DoraDialog>

      {/* 2. EntryFeeSelectionDialog (`entryfee_selection_dialog.dart`) */}
      <DoraDialog
        open={entryFeeDialogOpen}
        title={isFriendChallengeMode ? 'Challenge a Friend' : 'Play With Random Match'}
        onClose={() => setEntryFeeDialogOpen(false)}
        buttons={[
          {
            title: joinRoomCodeInput.trim() ? 'Join Room' : 'Next',
            icon: '/assets/games/tictactoe/svg/next.svg',
            onClick: () => {
              setEntryFeeDialogOpen(false);
              if (joinRoomCodeInput.trim()) {
                void startOnlineConnection();
              } else {
                setMatrixSizeDialogOpen(true);
              }
            },
          },
        ]}
      >
        <div className="space-y-4 py-1">
          {/* Entry Fee 2x2 Grid */}
          <div>
            <p className="text-xs text-white/70 text-center mb-2">Select Entry Stake (Coins)</p>
            <div className="grid grid-cols-2 gap-3">
              {TICTACTOE_FEES.map((fee) => {
                const selected = selectedEntryFee === fee;
                return (
                  <button
                    key={fee}
                    type="button"
                    onClick={() => setSelectedEntryFee(fee)}
                    className={cn(
                      'h-11 rounded-xl border flex items-center justify-center gap-2 font-extrabold text-sm transition-all cursor-pointer',
                      selected
                        ? 'bg-[#F0842A] border-[#F0842A] text-white shadow-md'
                        : 'bg-[#161719]/70 border-[#5A5A5A] text-white/85 hover:border-white/50'
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/assets/games/tictactoe/png/coin.png"
                      alt=""
                      className="size-5 object-contain"
                    />
                    <span>{fee}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rounds Selection */}
          <div>
            <p className="text-xs text-white/70 text-center mb-2">Best of Rounds</p>
            <div className="grid grid-cols-4 gap-2">
              {TICTACTOE_ROUNDS.map((r) => {
                const selected = selectedRound.digit === r.digit;
                return (
                  <button
                    key={r.digit}
                    type="button"
                    onClick={() => setSelectedRound(r)}
                    className={cn(
                      'h-9 rounded-lg border text-xs font-bold transition-all cursor-pointer',
                      selected
                        ? 'bg-[#00A8CA] border-[#00A8CA] text-white'
                        : 'bg-[#161719]/70 border-[#5A5A5A] text-white/75'
                    )}
                  >
                    {r.digit} {r.digit === 1 ? 'Round' : 'Rounds'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mode Toggle: Random vs Friend Invite vs Room Code */}
          <div className="pt-2 border-t border-dashed border-[#5A5A5A] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsFriendChallengeMode(false)}
                className={cn(
                  'flex-1 py-1.5 rounded-lg text-xs font-bold border cursor-pointer',
                  !isFriendChallengeMode
                    ? 'border-[#F0842A] bg-[#F0842A]/20 text-white'
                    : 'border-[#5A5A5A] text-white/65'
                )}
              >
                Random Match
              </button>
              <button
                type="button"
                onClick={() => setIsFriendChallengeMode(true)}
                className={cn(
                  'flex-1 py-1.5 rounded-lg text-xs font-bold border cursor-pointer flex items-center justify-center gap-1',
                  isFriendChallengeMode
                    ? 'border-[#00A8CA] bg-[#00A8CA]/20 text-white'
                    : 'border-[#5A5A5A] text-white/65'
                )}
              >
                <Users className="size-3.5" />
                <span>Invite Friend</span>
              </button>
            </div>

            {isFriendChallengeMode && (
              <input
                type="text"
                value={friendUsernameInput}
                onChange={(e) => setFriendUsernameInput(e.target.value)}
                placeholder="Friend's @username (optional, sends notification)"
                className="w-full h-9 rounded-lg bg-[#161719] border border-[#5A5A5A] px-3 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-[#00A8CA]"
              />
            )}

            <input
              type="text"
              value={joinRoomCodeInput}
              onChange={(e) => setJoinRoomCodeInput(e.target.value.toUpperCase())}
              placeholder="Or enter a Friend's Room Code to join directly..."
              className="w-full h-9 rounded-lg bg-[#161719] border border-[#5A5A5A] px-3 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-[#F0842A]"
            />
          </div>
        </div>
      </DoraDialog>

      {/* 3. MatrixSizeSelectionDialog (`matrixsize_selection_dialog.dart`) */}
      <DoraDialog
        open={matrixSizeDialogOpen}
        title="Choose Your Game Mode"
        onClose={() => setMatrixSizeDialogOpen(false)}
        buttons={[
          {
            title: 'Start',
            disabled: busyAction,
            onClick: () => {
              setMatrixSizeDialogOpen(false);
              if (pendingMode === 'offline') {
                launchLocalMaze('offline', selectedMatrixSize.size);
              } else if (pendingMode === 'passNPlay') {
                launchLocalMaze('passNPlay', selectedMatrixSize.size);
              } else if (pendingMode === 'multiplayer') {
                void startOnlineConnection();
              }
            },
          },
        ]}
      >
        <div className="space-y-3 py-2 px-3">
          {TICTACTOE_MATRIX_SIZES.map((ms) => {
            const selected = selectedMatrixSize.size === ms.size;
            return (
              <button
                key={ms.size}
                type="button"
                onClick={() => setSelectedMatrixSize(ms)}
                className={cn(
                  'w-full h-11 rounded-xl border font-bold text-sm transition-all cursor-pointer',
                  selected
                    ? 'bg-[#F0842A] border-[#F0842A] text-white shadow-md'
                    : 'bg-[#161719]/70 border-[#5A5A5A] text-white/85 hover:border-white/50'
                )}
              >
                {ms.title}
              </button>
            );
          })}
        </div>
      </DoraDialog>

      {/* 4. Skin Purchase Confirmation Dialog (`skin_confirmation_dialog.dart`) */}
      <DoraDialog
        open={Boolean(skinConfirmTarget)}
        title="Confirm Purchase"
        onClose={() => setSkinConfirmTarget(null)}
        buttons={[
          {
            title: 'Cancel',
            variant: 'light',
            onClick: () => setSkinConfirmTarget(null),
          },
          {
            title: 'Yes, Buy',
            onClick: () => void confirmPurchaseSkin(),
          },
        ]}
      >
        {skinConfirmTarget && (
          <div className="text-center space-y-3 py-2">
            <div className="flex items-center justify-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getSkinAssetPath(skinConfirmTarget.skinX)}
                alt="X"
                className="size-10 object-contain"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getSkinAssetPath(skinConfirmTarget.skinO)}
                alt="O"
                className="size-10 object-contain"
              />
            </div>
            <p className="text-sm text-white/90">
              Buy <strong>{skinConfirmTarget.name}</strong> for{' '}
              <strong>{skinConfirmTarget.price} coins</strong>?
            </p>
          </div>
        )}
      </DoraDialog>

      {/* 5. GameOverDialog / DrawDialog / NextRoundDialog (`game_over_dialog.dart`, `draw_dialog.dart`, `next_round_dialog.dart`) */}
      <DoraDialog
        open={Boolean(gameEndedState)}
        title={
          gameEndedState?.type === 'draw'
            ? "It's a Draw!"
            : gameEndedState?.type === 'nextRound'
              ? `Round ${gameEndedState.roundNumber || currentRoundNumber}`
              : 'Game Over'
        }
        hideCloseButton
        buttons={
          gameEndedState?.type === 'nextRound'
            ? [
                {
                  title: 'Next Round',
                  onClick: () => setGameEndedState(null),
                },
              ]
            : gameMode === 'multiplayer'
              ? [
                  {
                    title: 'OK',
                    onClick: () => {
                      setGameEndedState(null);
                      setOnlineMatch(null);
                      void fetchHubData();
                      setView('home');
                    },
                  },
                ]
              : [
                  {
                    title: 'Cancel',
                    onClick: () => {
                      setGameEndedState(null);
                      void fetchHubData();
                      setView('home');
                    },
                  },
                  {
                    title: 'Restart',
                    variant: 'light',
                    onClick: () => {
                      launchLocalMaze(gameMode, boardSize);
                    },
                  },
                ]
        }
      >
        {gameEndedState && (
          <div className="flex flex-col items-center text-center space-y-3 py-2">
            {gameEndedState.type === 'draw' ? (
              <>
                <div className="flex items-center justify-center gap-4">
                  <div className="size-16 rounded-full border-2 border-dashed border-[#F0842A] p-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        resolveMediaUrl(player1.avatar) ||
                        '/assets/games/tictactoe/png/guest.png'
                      }
                      alt={player1.name}
                      className="w-full h-full object-cover rounded-full"
                    />
                  </div>
                  <div className="size-16 rounded-full border-2 border-dashed border-[#00A0FF] p-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        player2.avatar.startsWith('/assets/games/')
                          ? player2.avatar
                          : resolveMediaUrl(player2.avatar) ||
                            '/assets/games/tictactoe/png/guest.png'
                      }
                      alt={player2.name}
                      className="w-full h-full object-cover rounded-full"
                    />
                  </div>
                </div>
                {gameMode === 'multiplayer' && onlineMatch && (
                  <div className="px-4 py-1.5 rounded-xl border border-[#5A5A5A] text-sm font-bold text-white">
                    Stake returned: {onlineMatch.entryFee} Coins
                  </div>
                )}
              </>
            ) : (
              <>
                {/* DashedAvatarWidget */}
                <div className="size-20 rounded-full border-2 border-dashed border-[#F0842A] p-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      gameEndedState.winner?.avatar?.startsWith('/assets/games/')
                        ? gameEndedState.winner.avatar
                        : resolveMediaUrl(gameEndedState.winner?.avatar) ||
                          '/assets/games/tictactoe/png/guest.png'
                    }
                    alt={gameEndedState.winner?.name || 'Winner'}
                    className="w-full h-full object-cover rounded-full"
                  />
                </div>
                <p className="text-base font-extrabold text-white">
                  {gameEndedState.winner
                    ? `${gameEndedState.winner.name}'s Victory!`
                    : 'Round Tied!'}
                </p>

                {gameMode === 'multiplayer' &&
                  onlineMatch &&
                  gameEndedState.type === 'win' && (
                    <div className="px-4 py-1.5 rounded-xl border border-[#F0842A] bg-[#F0842A]/15 flex items-center gap-2">
                      <span className="text-xs text-white/85">
                        {gameEndedState.winner?.userId === user?.id
                          ? 'Winning price:'
                          : 'You lost:'}
                      </span>
                      <span className="text-base font-extrabold text-[#F0842A]">
                        {gameEndedState.winner?.userId === user?.id
                          ? onlineMatch.entryFee * 2
                          : onlineMatch.entryFee}{' '}
                        Coins
                      </span>
                    </div>
                  )}
              </>
            )}
          </div>
        )}
      </DoraDialog>
    </div>
  );
}
