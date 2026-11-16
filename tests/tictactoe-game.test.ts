import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import {
  checkBoardWin,
  computeRankKey,
  getBestDoraMove,
  isBoardFull,
  TICTACTOE_MORE_GAMES,
  TICTACTOE_SHOP_ITEMS,
  turnDurationFor,
} from '@/lib/tictactoe-ai';

const mockUser1Id = new Types.ObjectId('661111111111111111111111');
const mockUser2Id = new Types.ObjectId('662222222222222222222222');

let currentAuthUser = {
  _id: mockUser1Id,
  username: 'player_one',
  firstName: 'Player',
  lastName: 'One',
  avatar: '/assets/avatars/default-avatar.png',
  verified: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const findOneProfileMock = vi.fn();
const createProfileMock = vi.fn();
const findOneAndUpdateProfileMock = vi.fn();
const updateOneProfileMock = vi.fn();

const findMatchMock = vi.fn();
const findOneMatchMock = vi.fn();
const findByIdMatchMock = vi.fn();
const findOneAndUpdateMatchMock = vi.fn();
const createMatchMock = vi.fn();

const createHistoryMock = vi.fn();

vi.mock('@/lib/db', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth/session', () => ({
  requireAuth: vi.fn().mockImplementation(async () => ({
    user: currentAuthUser,
  })),
  getOptionalAuth: vi.fn().mockImplementation(async () => ({
    user: currentAuthUser,
  })),
}));

vi.mock('@/services/notification.service', () => ({
  dispatchNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/models/TicTacToe', () => ({
  GameProfile: {
    findOne: (...args: unknown[]) => findOneProfileMock(...args),
    create: (...args: unknown[]) => createProfileMock(...args),
    findOneAndUpdate: (...args: unknown[]) => findOneAndUpdateProfileMock(...args),
    updateOne: (...args: unknown[]) => updateOneProfileMock(...args),
  },
  TicTacToeMatch: {
    find: (...args: unknown[]) => findMatchMock(...args),
    findOne: (...args: unknown[]) => findOneMatchMock(...args),
    findById: (...args: unknown[]) => findByIdMatchMock(...args),
    findOneAndUpdate: (...args: unknown[]) => findOneAndUpdateMatchMock(...args),
    create: (...args: unknown[]) => createMatchMock(...args),
  },
  TicTacToeHistory: {
    create: (...args: unknown[]) => createHistoryMock(...args),
  },
}));

describe('Tic-Tac-Toe Engine, Dora AI & Multiplayer Settlement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentAuthUser = {
      _id: mockUser1Id,
      username: 'player_one',
      firstName: 'Player',
      lastName: 'One',
      avatar: '/assets/avatars/default-avatar.png',
      verified: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
  });

  it('scales turn duration and leaderboard rankKey exactly like Flutter AppSettings & leaderboard_ranking.dart', () => {
    expect(turnDurationFor(3)).toBe(20);
    expect(turnDurationFor(4)).toBe(30);
    expect(turnDurationFor(5)).toBe(40);

    const earlier = new Date('2026-01-01T00:00:00Z');
    const later = new Date('2026-06-01T00:00:00Z');
    // Higher score always beats lower score
    expect(computeRankKey(20, later)).toBeGreaterThan(computeRankKey(10, earlier));
    // Equal score: earlier joiner gets higher rankKey
    expect(computeRankKey(20, earlier)).toBeGreaterThan(computeRankKey(20, later));
  });

  it('detects row, column, main diagonal, and anti-diagonal wins across 3x3, 4x4, and 5x5 boards', () => {
    const rowWin3 = [
      ['X', 'X', 'X'],
      ['O', '', 'O'],
      ['', '', ''],
    ];
    expect(checkBoardWin(rowWin3)).toEqual({
      winnerMark: 'X',
      row: 0,
      col: null,
      diagonal: null,
      cells: [
        [0, 0],
        [0, 1],
        [0, 2],
      ],
    });

    const antiDiag4 = [
      ['', '', '', 'O'],
      ['', '', 'O', ''],
      ['', 'O', '', ''],
      ['O', '', '', ''],
    ];
    expect(checkBoardWin(antiDiag4)?.winnerMark).toBe('O');
    expect(checkBoardWin(antiDiag4)?.diagonal).toBe('anti');
    expect(isBoardFull(antiDiag4)).toBe(false);
  });

  it('Dora AI takes immediate wins and blocks opponent threats on 3x3, 4x4, and 5x5 boards', () => {
    // Immediate win on 3x3 row 1
    const winBoard = [
      ['O', '', 'O'],
      ['X', 'X', ''],
      ['', '', ''],
    ];
    const winMove = getBestDoraMove(winBoard, 3, 'hard', 'X', 'O');
    expect(winMove).toEqual({ row: 1, col: 2, index: 5 });

    // Immediate block on 4x4 column 0
    const blockBoard4 = [
      ['O', '', '', ''],
      ['O', 'X', '', ''],
      ['O', '', 'X', ''],
      ['', '', '', ''],
    ];
    const blockMove = getBestDoraMove(blockBoard4, 4, 'medium', 'X', 'O');
    expect(blockMove).toEqual({ row: 3, col: 0, index: 12 });
  });

  it('pairs two players in online matchmaking and settles 2x coin pot on final winning move', async () => {
    findMatchMock.mockReturnValue({
      limit: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    });

    // Player 1 matchmakes -> hosts a waiting match (entryFee: 25)
    findOneProfileMock.mockResolvedValueOnce({
      _id: new Types.ObjectId(),
      userId: mockUser1Id,
      coins: 500,
      score: 0,
      activeSkinId: 'cross',
      ownedSkinIds: ['cross'],
      createdAt: new Date(),
    });
    findOneAndUpdateProfileMock.mockResolvedValueOnce({
      userId: mockUser1Id,
      coins: 475,
    });
    findOneAndUpdateMatchMock.mockResolvedValueOnce(null); // no existing waiting match
    const matchId = new Types.ObjectId('663333333333333333333333');
    createMatchMock.mockResolvedValueOnce({
      _id: matchId,
      gameKey: 'ROOM25AA',
      status: 'waiting',
      matrixSize: 3,
      rounds: 1,
      currentRound: 0,
      entryFee: 25,
      player1: {
        userId: String(mockUser1Id),
        username: 'player_one',
        name: 'Player One',
        skinX: 'default_cross',
        skinO: 'default_circle',
        activeSkinType: 'X',
        roundWins: 0,
      },
      player2: null,
    });

    const { POST } = await import('@/app/api/v1/games/tictactoe/route');
    const reqHost = new NextRequest('http://localhost:3000/api/v1/games/tictactoe', {
      method: 'POST',
      body: JSON.stringify({
        action: 'matchmake',
        entryFee: 25,
        matrixSize: 3,
        rounds: 1,
      }),
    });
    const resHost = await POST(reqHost);
    const jsonHost = await resHost.json();
    expect(resHost.status).toBe(200);
    expect(jsonHost.data.status).toBe('waiting');
    expect(jsonHost.data.coins).toBe(475);

    // Now Player 1 makes the winning move on (0, 2) to complete row 0
    const liveMatchDoc = {
      _id: matchId,
      gameKey: 'ROOM25AA',
      status: 'inProgress',
      matrixSize: 3,
      rounds: 1,
      currentRound: 0,
      entryFee: 25,
      settled: false,
      currentTurn: 'player1',
      player1: {
        userId: String(mockUser1Id),
        username: 'player_one',
        name: 'Player One',
        skinX: 'default_cross',
        skinO: 'default_circle',
        activeSkinType: 'X',
        roundWins: 0,
      },
      player2: {
        userId: String(mockUser2Id),
        username: 'player_two',
        name: 'Player Two',
        skinX: 'default_cross',
        skinO: 'default_circle',
        activeSkinType: 'O',
        roundWins: 0,
      },
      board: [
        [
          { playerId: String(mockUser1Id), mark: 'X', skin: 'default_cross' },
          { playerId: String(mockUser1Id), mark: 'X', skin: 'default_cross' },
          { playerId: '', mark: '', skin: '' },
        ],
        [
          { playerId: String(mockUser2Id), mark: 'O', skin: 'default_circle' },
          { playerId: String(mockUser2Id), mark: 'O', skin: 'default_circle' },
          { playerId: '', mark: '', skin: '' },
        ],
        [
          { playerId: '', mark: '', skin: '' },
          { playerId: '', mark: '', skin: '' },
          { playerId: '', mark: '', skin: '' },
        ],
      ],
      winningLine: null,
      lastRoundWinner: null,
      markModified: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };

    findOneProfileMock
      .mockResolvedValueOnce({
        _id: new Types.ObjectId(),
        userId: mockUser1Id,
        coins: 475,
        score: 0,
        activeSkinId: 'cross',
        ownedSkinIds: ['cross'],
        createdAt: new Date(),
      })
      .mockResolvedValueOnce({
        _id: new Types.ObjectId(),
        userId: mockUser1Id,
        coins: 475,
        score: 0,
        createdAt: new Date(),
      })
      .mockResolvedValueOnce({
        _id: new Types.ObjectId(),
        userId: mockUser2Id,
        coins: 475,
        score: 0,
        createdAt: new Date(),
      })
      .mockResolvedValueOnce({
        _id: new Types.ObjectId(),
        userId: mockUser1Id,
        coins: 525,
        score: 10,
        activeSkinId: 'cross',
        ownedSkinIds: ['cross'],
        createdAt: new Date(),
      });

    findOneMatchMock.mockResolvedValueOnce(liveMatchDoc);
    findOneAndUpdateMatchMock.mockResolvedValueOnce({
      ...liveMatchDoc,
      status: 'completed',
      result: 'player1',
      settled: true,
    });
    updateOneProfileMock.mockResolvedValue({});
    createHistoryMock.mockResolvedValue({});

    const reqMove = new NextRequest('http://localhost:3000/api/v1/games/tictactoe', {
      method: 'POST',
      body: JSON.stringify({
        action: 'move',
        gameKey: 'ROOM25AA',
        row: 0,
        col: 2,
      }),
    });
    const resMove = await POST(reqMove);
    const jsonMove = await resMove.json();

    expect(resMove.status).toBe(200);
    expect(jsonMove.data.match.status).toBe('completed');
    expect(jsonMove.data.match.result).toBe('player1');
    expect(jsonMove.data.coins).toBe(525); // 475 + (2 * 25 pot) = 525
    expect(createHistoryMock).toHaveBeenCalledTimes(2);
  });

  it('enforces purchase-only shop items (no free ad coins) and includes More Games catalog', async () => {
    expect(TICTACTOE_SHOP_ITEMS.length).toBeGreaterThanOrEqual(6);
    expect(TICTACTOE_SHOP_ITEMS.every((item) => item.type === 'purchase' && item.priceNgn > 0)).toBe(
      true
    );
    expect(TICTACTOE_MORE_GAMES.map((g) => g.name)).toEqual([
      'Hextris',
      'Clumsy Bird',
      'Pacman',
    ]);

    findOneProfileMock.mockResolvedValueOnce({
      _id: new Types.ObjectId(),
      userId: mockUser1Id,
      coins: 500,
      score: 0,
      activeSkinId: 'cross',
      ownedSkinIds: ['cross'],
      createdAt: new Date(),
    });

    const { POST } = await import('@/app/api/v1/games/tictactoe/route');
    const reqAd = new NextRequest('http://localhost:3000/api/v1/games/tictactoe', {
      method: 'POST',
      body: JSON.stringify({ action: 'claim_ad_reward' }),
    });
    const resAd = await POST(reqAd);
    expect(resAd.status).toBe(422);
  });
});
