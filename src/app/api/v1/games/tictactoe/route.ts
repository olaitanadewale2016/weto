import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { getOptionalAuth, requireAuth } from '@/lib/auth/session';
import { apiError, apiSuccess, NotFoundError, ValidationError } from '@/lib/api-response';
import {
  GameProfile,
  IGameProfileDocument,
  ITicTacToeCell,
  ITicTacToeMatchDocument,
  TicTacToeHistory,
  TicTacToeMatch,
} from '@/models/TicTacToe';
import { User } from '@/models/User';
import { Wallet, WalletTransaction } from '@/models/Finance';
import { ensureWallet } from '@/services/wallet.service';
import { TransactionDirection, TransactionStatus, TransactionType } from '@/types/enums';
import { dispatchNotification } from '@/services/notification.service';
import {
  checkBoardWin,
  computeRankKey,
  getSkinById,
  isBoardFull,
  TICTACTOE_FEES,
  TICTACTOE_MORE_GAMES,
  TICTACTOE_SCORE_DRAW,
  TICTACTOE_SCORE_WIN,
  TICTACTOE_SHOP_ITEMS,
  TICTACTOE_SKINS,
  TICTACTOE_STARTING_COINS,
  turnDurationFor,
} from '@/lib/tictactoe-ai';

function createBlankBoard(size: number): ITicTacToeCell[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({
      playerId: '',
      mark: '',
      skin: '',
    }))
  );
}

function generateGameKey(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function ensureGameProfile(
  userId: Types.ObjectId,
  userCreatedAt?: Date
): Promise<IGameProfileDocument> {
  let profile = await GameProfile.findOne({ userId });
  if (!profile) {
    profile = await GameProfile.create({
      userId,
      coins: TICTACTOE_STARTING_COINS,
      score: 0,
      matchesPlayed: 0,
      matchesWon: 0,
      matchesDrawn: 0,
      activeSkinId: 'cross',
      ownedSkinIds: ['cross', 'offer'],
      rankKey: computeRankKey(0, userCreatedAt || new Date()),
    });
  }
  return profile;
}

async function refundStaleWaitingMatches(): Promise<void> {
  const cutoff = new Date(Date.now() - 65_000);
  const staleMatches = await TicTacToeMatch.find({
    status: 'waiting',
    settled: false,
    createdAt: { $lt: cutoff },
  })
    .limit(20)
    .lean();

  for (const m of staleMatches) {
    const closed = await TicTacToeMatch.findOneAndUpdate(
      { _id: m._id, status: 'waiting', settled: false },
      { $set: { status: 'closed', settled: true } },
      { new: true }
    );
    if (closed && closed.entryFee > 0 && Types.ObjectId.isValid(closed.player1.userId)) {
      await GameProfile.updateOne(
        { userId: new Types.ObjectId(closed.player1.userId) },
        { $inc: { coins: closed.entryFee } }
      );
    }
  }
}

async function settleMultiplayerMatch(params: {
  match: ITicTacToeMatchDocument;
  outcome: 'player1' | 'player2' | 'draw';
  forfeitedBy?: 'player1' | 'player2' | null;
}): Promise<ITicTacToeMatchDocument> {
  const { match, outcome, forfeitedBy } = params;

  const claimed = await TicTacToeMatch.findOneAndUpdate(
    { _id: match._id, settled: false },
    {
      $set: {
        status: 'completed',
        result: outcome,
        settled: true,
      },
    },
    { new: true }
  );

  if (!claimed) {
    const existing = await TicTacToeMatch.findById(match._id);
    return existing || match;
  }

  const fee = Math.max(0, Number(claimed.entryFee || 0));
  const p1Id = Types.ObjectId.isValid(claimed.player1.userId)
    ? new Types.ObjectId(claimed.player1.userId)
    : null;
  const p2Id =
    claimed.player2?.userId && Types.ObjectId.isValid(claimed.player2.userId)
      ? new Types.ObjectId(claimed.player2.userId)
      : null;

  const updatePlayerStats = async (
    uid: Types.ObjectId | null,
    coinCredit: number,
    scoreDelta: number,
    won: boolean,
    drawn: boolean
  ) => {
    if (!uid) return;
    const prof = await ensureGameProfile(uid);
    const nextScore = (prof.score || 0) + scoreDelta;
    const nextRankKey = computeRankKey(nextScore, prof.createdAt);
    await GameProfile.updateOne(
      { _id: prof._id },
      {
        $inc: {
          coins: coinCredit,
          score: scoreDelta,
          matchesPlayed: 1,
          matchesWon: won ? 1 : 0,
          matchesDrawn: drawn ? 1 : 0,
        },
        $set: { rankKey: nextRankKey },
      }
    );
  };

  if (outcome === 'draw') {
    await Promise.all([
      updatePlayerStats(p1Id, fee, TICTACTOE_SCORE_DRAW, false, true),
      updatePlayerStats(p2Id, fee, TICTACTOE_SCORE_DRAW, false, true),
    ]);
    await Promise.all([
      p1Id
        ? TicTacToeHistory.create({
            userId: p1Id,
            matchId: claimed._id,
            gameKey: claimed.gameKey,
            opponentName: claimed.player2?.name || 'Opponent',
            status: 'tie',
            amount: 0,
            mode: 'multiplayer',
          })
        : null,
      p2Id
        ? TicTacToeHistory.create({
            userId: p2Id,
            matchId: claimed._id,
            gameKey: claimed.gameKey,
            opponentName: claimed.player1.name,
            status: 'tie',
            amount: 0,
            mode: 'multiplayer',
          })
        : null,
    ]);
  } else {
    const p1Won = outcome === 'player1';
    await Promise.all([
      updatePlayerStats(
        p1Id,
        p1Won ? fee * 2 : 0,
        p1Won ? TICTACTOE_SCORE_WIN : 0,
        p1Won,
        false
      ),
      updatePlayerStats(
        p2Id,
        !p1Won ? fee * 2 : 0,
        !p1Won ? TICTACTOE_SCORE_WIN : 0,
        !p1Won,
        false
      ),
    ]);

    await Promise.all([
      p1Id
        ? TicTacToeHistory.create({
            userId: p1Id,
            matchId: claimed._id,
            gameKey: claimed.gameKey,
            opponentName: claimed.player2?.name || 'Opponent',
            status: p1Won ? 'won' : forfeitedBy === 'player1' ? 'quited' : 'lost',
            amount: p1Won ? fee : -fee,
            mode: 'multiplayer',
          })
        : null,
      p2Id
        ? TicTacToeHistory.create({
            userId: p2Id,
            matchId: claimed._id,
            gameKey: claimed.gameKey,
            opponentName: claimed.player1.name,
            status: !p1Won ? 'won' : forfeitedBy === 'player2' ? 'quited' : 'lost',
            amount: !p1Won ? fee : -fee,
            mode: 'multiplayer',
          })
        : null,
    ]);
  }

  return claimed;
}

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const authCtx = await getOptionalAuth(req);
    const url = new URL(req.url);
    const gameKey = url.searchParams.get('gameKey');
    const daysParam = url.searchParams.get('days');

    let profile: IGameProfileDocument | null = null;
    let userRank: number | null = null;

    if (authCtx?.user) {
      profile = await ensureGameProfile(authCtx.user._id, authCtx.user.createdAt);
      if (profile.score > 0) {
        const higherCount = await GameProfile.countDocuments({
          score: { $gt: 0 },
          rankKey: { $gt: profile.rankKey },
        });
        userRank = higherCount + 1;
      }
    }

    // If polling a specific active/waiting match, return it fast
    if (gameKey) {
      let match = await TicTacToeMatch.findOne({ gameKey: gameKey.toUpperCase() });
      if (!match) throw new NotFoundError('Game match not found.');

      // Auto-settle if inProgress and turn timer expired (+3s grace)
      if (match.status === 'inProgress' && !match.settled && match.turnStartedAt) {
        const limitSec = turnDurationFor(match.matrixSize) + 3;
        const elapsedSec = (Date.now() - new Date(match.turnStartedAt).getTime()) / 1000;
        if (elapsedSec >= limitSec) {
          const winnerSlot = match.currentTurn === 'player1' ? 'player2' : 'player1';
          match = await settleMultiplayerMatch({
            match,
            outcome: winnerSlot,
            forfeitedBy: match.currentTurn,
          });
          if (authCtx?.user) {
            profile = await ensureGameProfile(authCtx.user._id, authCtx.user.createdAt);
          }
        }
      }

      return apiSuccess({
        match,
        profile: profile
          ? {
              coins: profile.coins,
              score: profile.score,
              matchesPlayed: profile.matchesPlayed,
              matchesWon: profile.matchesWon,
              matchesDrawn: profile.matchesDrawn,
              activeSkinId: profile.activeSkinId,
              ownedSkinIds: profile.ownedSkinIds,
              rank: userRank,
            }
          : null,
      });
    }

    // Full Game Hub bootstrap: Leaderboard + History + Catalogs
    const topProfiles = await GameProfile.find({ score: { $gt: 0 } })
      .sort({ score: -1, rankKey: -1 })
      .limit(50)
      .populate('userId', 'username firstName lastName avatar verified')
      .lean();

    const leaderboard = topProfiles.map((p, index) => {
      const u = p.userId as {
        _id?: unknown;
        username?: string;
        firstName?: string;
        lastName?: string;
        avatar?: string;
        verified?: boolean;
      } | null;
      const displayName =
        `${u?.firstName || ''} ${u?.lastName || ''}`.trim() || u?.username || 'Player';
      return {
        rank: index + 1,
        userId: String(u?._id || p.userId),
        username: u?.username || 'player',
        name: displayName,
        avatar: u?.avatar || '/assets/avatars/default-avatar.png',
        verified: Boolean(u?.verified),
        score: p.score,
        matchesPlayed: p.matchesPlayed,
        matchesWon: p.matchesWon,
      };
    });

    let history: unknown[] = [];
    let walletBalance = 0;
    if (authCtx?.user) {
      const historyFilter: Record<string, unknown> = { userId: authCtx.user._id };
      if (daysParam === '7' || daysParam === '30') {
        const cutoff = new Date(Date.now() - Number(daysParam) * 86_400_000);
        historyFilter.createdAt = { $gte: cutoff };
      }
      const [histRows, userWallet] = await Promise.all([
        TicTacToeHistory.find(historyFilter).sort({ createdAt: -1 }).limit(50).lean(),
        ensureWallet(authCtx.user._id),
      ]);
      history = histRows;
      walletBalance = userWallet?.balance || 0;
    }

    return apiSuccess({
      profile: profile
        ? {
            coins: profile.coins,
            score: profile.score,
            matchesPlayed: profile.matchesPlayed,
            matchesWon: profile.matchesWon,
            matchesDrawn: profile.matchesDrawn,
            activeSkinId: profile.activeSkinId,
            ownedSkinIds: profile.ownedSkinIds,
            walletBalance,
            rank: userRank,
          }
        : {
            coins: TICTACTOE_STARTING_COINS,
            score: 0,
            matchesPlayed: 0,
            matchesWon: 0,
            matchesDrawn: 0,
            activeSkinId: 'cross',
            ownedSkinIds: ['cross', 'offer'],
            walletBalance: 0,
            rank: null,
          },
      leaderboard,
      history,
      skins: TICTACTOE_SKINS,
      shop: TICTACTOE_SHOP_ITEMS,
      moreGames: TICTACTOE_MORE_GAMES,
    });
  } catch (err) {
    return apiError(err);
  }
}

const actionSchema = z.object({
  action: z.enum([
    'matchmake',
    'create_invite',
    'join_invite',
    'close_waiting',
    'move',
    'timeout',
    'forfeit',
    'record_solo',
    'buy_skin',
    'equip_skin',
    'claim_ad_reward',
    'buy_coins_wallet',
  ]),
  entryFee: z.number().int().min(0).optional(),
  matrixSize: z.union([z.literal(3), z.literal(4), z.literal(5)]).optional(),
  rounds: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(7)]).optional(),
  gameKey: z.string().optional(),
  targetUsername: z.string().optional(),
  row: z.number().int().min(0).max(4).optional(),
  col: z.number().int().min(0).max(4).optional(),
  soloResult: z.enum(['won', 'lost', 'tie']).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  skinId: z.string().optional(),
  shopItemId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { user } = await requireAuth(req);
    const body = actionSchema.parse(await req.json());
    const profile = await ensureGameProfile(user._id, user.createdAt);
    const activeSkin = getSkinById(profile.activeSkinId);
    const userDisplayName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username;

    // 1. Online Random Matchmaking (Escrow + Pair or Host)
    if (body.action === 'matchmake') {
      await refundStaleWaitingMatches();
      const fee = body.entryFee ?? TICTACTOE_FEES[0];
      const matrixSize = body.matrixSize ?? 3;
      const rounds = body.rounds ?? 1;

      const debited = await GameProfile.findOneAndUpdate(
        { userId: user._id, coins: { $gte: fee } },
        { $inc: { coins: -fee } },
        { new: true }
      );
      if (!debited) {
        throw new ValidationError(`Not enough coins. You need ${fee} coins to play.`);
      }

      // Try to join an existing waiting match with identical settings
      const joinedMatch = await TicTacToeMatch.findOneAndUpdate(
        {
          status: 'waiting',
          isPrivateInvite: false,
          entryFee: fee,
          matrixSize,
          rounds,
          'player1.userId': { $ne: String(user._id) },
        },
        {
          $set: {
            status: 'inProgress',
            turnStartedAt: new Date(),
            player2: {
              userId: String(user._id),
              username: user.username,
              name: userDisplayName,
              avatar: user.avatar || '/assets/avatars/default-avatar.png',
              skinX: activeSkin.skinX,
              skinO: activeSkin.skinO,
              activeSkinType: 'O',
              roundWins: 0,
            },
          },
        },
        { sort: { createdAt: 1 }, new: true }
      );

      if (joinedMatch) {
        return apiSuccess({
          status: 'matched',
          match: joinedMatch,
          coins: debited.coins,
        });
      }

      // Otherwise host a new waiting match
      const hostedMatch = await TicTacToeMatch.create({
        gameKey: generateGameKey(),
        status: 'waiting',
        matrixSize,
        rounds,
        currentRound: 0,
        entryFee: fee,
        isPrivateInvite: false,
        player1: {
          userId: String(user._id),
          username: user.username,
          name: userDisplayName,
          avatar: user.avatar || '/assets/avatars/default-avatar.png',
          skinX: activeSkin.skinX,
          skinO: activeSkin.skinO,
          activeSkinType: 'X',
          roundWins: 0,
        },
        player2: null,
        board: createBlankBoard(matrixSize),
        currentTurn: 'player1',
        turnStartedAt: new Date(),
        result: 'notDeclared',
        settled: false,
      });

      return apiSuccess({
        status: 'waiting',
        match: hostedMatch,
        coins: debited.coins,
      });
    }

    // 2. Create Private Friend Challenge Room
    if (body.action === 'create_invite') {
      const fee = body.entryFee ?? 10;
      const matrixSize = body.matrixSize ?? 3;
      const rounds = body.rounds ?? 1;

      const debited = await GameProfile.findOneAndUpdate(
        { userId: user._id, coins: { $gte: fee } },
        { $inc: { coins: -fee } },
        { new: true }
      );
      if (!debited) {
        throw new ValidationError(`Not enough coins. You need ${fee} coins to host this challenge.`);
      }

      let invitedUserId: Types.ObjectId | null = null;
      if (body.targetUsername) {
        const cleanUname = body.targetUsername.replace(/^@/, '').trim();
        const targetUser = await User.findOne({
          username: { $regex: new RegExp(`^${cleanUname}$`, 'i') },
        })
          .select('_id username')
          .lean();
        if (targetUser?._id) {
          invitedUserId = new Types.ObjectId(String(targetUser._id));
        }
      }

      const gameKey = generateGameKey();
      const hostedMatch = await TicTacToeMatch.create({
        gameKey,
        status: 'waiting',
        matrixSize,
        rounds,
        currentRound: 0,
        entryFee: fee,
        isPrivateInvite: true,
        invitedUserId,
        player1: {
          userId: String(user._id),
          username: user.username,
          name: userDisplayName,
          avatar: user.avatar || '/assets/avatars/default-avatar.png',
          skinX: activeSkin.skinX,
          skinO: activeSkin.skinO,
          activeSkinType: 'X',
          roundWins: 0,
        },
        player2: null,
        board: createBlankBoard(matrixSize),
        currentTurn: 'player1',
        turnStartedAt: new Date(),
        result: 'notDeclared',
        settled: false,
      });

      if (invitedUserId && String(invitedUserId) !== String(user._id)) {
        await dispatchNotification({
          recipientId: invitedUserId,
          actorId: user._id,
          type: 'GAME_INVITE',
          title: 'Tic-Tac-Toe Challenge!',
          message: `@${user.username} challenged you to a ${matrixSize}x${matrixSize} Tic-Tac-Toe match (${fee} coins stake)!`,
          actionUrl: `/games?invite=${gameKey}`,
        });
      }

      return apiSuccess({
        status: 'waiting',
        match: hostedMatch,
        coins: debited.coins,
      });
    }

    // 3. Join Friend Challenge Room by gameKey
    if (body.action === 'join_invite') {
      if (!body.gameKey) throw new ValidationError('gameKey is required.');
      const targetKey = body.gameKey.trim().toUpperCase();
      const existing = await TicTacToeMatch.findOne({ gameKey: targetKey });
      if (!existing) throw new NotFoundError('Challenge room not found.');

      if (existing.status === 'inProgress' &&
        (existing.player1.userId === String(user._id) ||
          existing.player2?.userId === String(user._id))) {
        return apiSuccess({ status: 'matched', match: existing, coins: profile.coins });
      }

      if (existing.status !== 'waiting') {
        throw new ValidationError('This challenge room is no longer available.');
      }

      if (existing.player1.userId === String(user._id)) {
        return apiSuccess({ status: 'waiting', match: existing, coins: profile.coins });
      }

      const fee = existing.entryFee || 0;
      const debited = await GameProfile.findOneAndUpdate(
        { userId: user._id, coins: { $gte: fee } },
        { $inc: { coins: -fee } },
        { new: true }
      );
      if (!debited) {
        throw new ValidationError(`Not enough coins. You need ${fee} coins to accept this challenge.`);
      }

      const joined = await TicTacToeMatch.findOneAndUpdate(
        { _id: existing._id, status: 'waiting' },
        {
          $set: {
            status: 'inProgress',
            turnStartedAt: new Date(),
            player2: {
              userId: String(user._id),
              username: user.username,
              name: userDisplayName,
              avatar: user.avatar || '/assets/avatars/default-avatar.png',
              skinX: activeSkin.skinX,
              skinO: activeSkin.skinO,
              activeSkinType: 'O',
              roundWins: 0,
            },
          },
        },
        { new: true }
      );

      if (!joined) {
        // Refund if someone else joined simultaneously
        await GameProfile.updateOne({ userId: user._id }, { $inc: { coins: fee } });
        throw new ValidationError('Challenge room was already joined by another player.');
      }

      return apiSuccess({
        status: 'matched',
        match: joined,
        coins: debited.coins,
      });
    }

    // 4. Cancel / Close Waiting Match (Atomic Refund)
    if (body.action === 'close_waiting') {
      if (!body.gameKey) throw new ValidationError('gameKey is required.');
      const closed = await TicTacToeMatch.findOneAndUpdate(
        {
          gameKey: body.gameKey.toUpperCase(),
          status: 'waiting',
          settled: false,
          'player1.userId': String(user._id),
        },
        { $set: { status: 'closed', settled: true } },
        { new: true }
      );

      let nextCoins = profile.coins;
      if (closed && closed.entryFee > 0) {
        const updatedProf = await GameProfile.findOneAndUpdate(
          { userId: user._id },
          { $inc: { coins: closed.entryFee } },
          { new: true }
        );
        if (updatedProf) nextCoins = updatedProf.coins;
      }

      return apiSuccess({ closed: Boolean(closed), coins: nextCoins });
    }

    // 5. Make a Move in Online Multiplayer
    if (body.action === 'move') {
      if (!body.gameKey || body.row === undefined || body.col === undefined) {
        throw new ValidationError('gameKey, row, and col are required.');
      }

      const match = await TicTacToeMatch.findOne({ gameKey: body.gameKey.toUpperCase() });
      if (!match) throw new NotFoundError('Match not found.');
      if (match.status !== 'inProgress' || match.settled) {
        return apiSuccess({ match });
      }

      const isP1 = match.player1.userId === String(user._id);
      const isP2 = match.player2?.userId === String(user._id);
      if (!isP1 && !isP2) throw new ValidationError('You are not a participant in this match.');

      const mySlot: 'player1' | 'player2' = isP1 ? 'player1' : 'player2';
      if (match.currentTurn !== mySlot) {
        throw new ValidationError('It is not your turn.');
      }

      const r = body.row;
      const c = body.col;
      if (r < 0 || r >= match.matrixSize || c < 0 || c >= match.matrixSize) {
        throw new ValidationError('Move out of bounds.');
      }

      const board: ITicTacToeCell[][] = (match.board as ITicTacToeCell[][]).map(
        (row: ITicTacToeCell[]) => row.map((cell: ITicTacToeCell) => ({ ...cell }))
      );
      if (board[r][c].mark) {
        throw new ValidationError('Tile is already occupied.');
      }

      const myPlayerObj = isP1 ? match.player1 : match.player2!;
      const myMark: 'X' | 'O' = isP1 ? 'X' : 'O';
      const mySkin = isP1 ? myPlayerObj.skinX : myPlayerObj.skinO;

      board[r][c] = {
        playerId: String(user._id),
        mark: myMark,
        skin: mySkin,
      };

      const stringBoard = board.map((row) => row.map((cell) => cell.mark || ''));
      const winCheck = checkBoardWin(stringBoard);
      const fullCheck = !winCheck && isBoardFull(stringBoard);

      if (winCheck || fullCheck) {
        if (winCheck) {
          if (mySlot === 'player1') match.player1.roundWins = (match.player1.roundWins || 0) + 1;
          else if (match.player2) match.player2.roundWins = (match.player2.roundWins || 0) + 1;
          match.winningLine = {
            row: winCheck.row,
            col: winCheck.col,
            diagonal: winCheck.diagonal,
            mark: winCheck.winnerMark,
          };
          match.lastRoundWinner = mySlot;
        } else {
          match.winningLine = null;
          match.lastRoundWinner = 'draw';
        }

        const hasMoreRounds = match.currentRound + 1 < match.rounds;
        if (hasMoreRounds) {
          match.currentRound += 1;
          match.board = createBlankBoard(match.matrixSize);
          match.currentTurn = match.currentRound % 2 === 0 ? 'player1' : 'player2';
          match.turnStartedAt = new Date();
          match.markModified('board');
          match.markModified('player1');
          match.markModified('player2');
          await match.save();
          return apiSuccess({ match, roundAdvanced: true });
        }

        // Final round finished -> determine overall match winner across rounds
        match.board = board;
        match.markModified('board');
        match.markModified('player1');
        match.markModified('player2');
        await match.save();

        const p1Wins = match.player1.roundWins || 0;
        const p2Wins = match.player2?.roundWins || 0;
        const finalOutcome: 'player1' | 'player2' | 'draw' =
          p1Wins > p2Wins ? 'player1' : p2Wins > p1Wins ? 'player2' : 'draw';

        const settledMatch = await settleMultiplayerMatch({
          match,
          outcome: finalOutcome,
        });
        const refreshedProfile = await ensureGameProfile(user._id, user.createdAt);
        return apiSuccess({
          match: settledMatch,
          coins: refreshedProfile.coins,
          score: refreshedProfile.score,
        });
      }

      // Normal turn switch
      match.board = board;
      match.currentTurn = mySlot === 'player1' ? 'player2' : 'player1';
      match.turnStartedAt = new Date();
      match.winningLine = null;
      match.markModified('board');
      await match.save();

      return apiSuccess({ match });
    }

    // 6. Timeout / Forfeit
    if (body.action === 'timeout' || body.action === 'forfeit') {
      if (!body.gameKey) throw new ValidationError('gameKey is required.');
      const match = await TicTacToeMatch.findOne({ gameKey: body.gameKey.toUpperCase() });
      if (!match) throw new NotFoundError('Match not found.');
      if (match.status !== 'inProgress' || match.settled) {
        return apiSuccess({ match });
      }

      const isP1 = match.player1.userId === String(user._id);
      const isP2 = match.player2?.userId === String(user._id);
      if (!isP1 && !isP2) throw new ValidationError('Not a participant.');

      const forfeiter: 'player1' | 'player2' =
        body.action === 'forfeit'
          ? isP1
            ? 'player1'
            : 'player2'
          : match.currentTurn;
      const winnerSlot: 'player1' | 'player2' =
        forfeiter === 'player1' ? 'player2' : 'player1';

      const settledMatch = await settleMultiplayerMatch({
        match,
        outcome: winnerSlot,
        forfeitedBy: forfeiter,
      });
      const refreshedProfile = await ensureGameProfile(user._id, user.createdAt);
      return apiSuccess({
        match: settledMatch,
        coins: refreshedProfile.coins,
        score: refreshedProfile.score,
      });
    }

    // 7. Record Solo vs Dora AI Match
    if (body.action === 'record_solo') {
      const resType = body.soloResult || 'tie';
      const diff = body.difficulty || 'medium';
      const coinBonus =
        resType === 'won' ? (diff === 'hard' ? 10 : diff === 'medium' ? 5 : 2) : 0;
      const scoreBonus =
        resType === 'won'
          ? diff === 'hard'
            ? 5
            : 2
          : resType === 'tie'
            ? 1
            : 0;

      const nextScore = (profile.score || 0) + scoreBonus;
      const updated = await GameProfile.findOneAndUpdate(
        { _id: profile._id },
        {
          $inc: {
            coins: coinBonus,
            score: scoreBonus,
            matchesPlayed: 1,
            matchesWon: resType === 'won' ? 1 : 0,
            matchesDrawn: resType === 'tie' ? 1 : 0,
          },
          $set: {
            rankKey: computeRankKey(nextScore, profile.createdAt),
          },
        },
        { new: true }
      );

      await TicTacToeHistory.create({
        userId: user._id,
        opponentName: `Dora AI (${diff})`,
        status: resType,
        amount: coinBonus,
        mode: 'solo',
      });

      return apiSuccess({
        coins: updated?.coins ?? profile.coins + coinBonus,
        score: updated?.score ?? nextScore,
        coinBonus,
        scoreBonus,
      });
    }

    // 8. Buy or Claim Skin
    if (body.action === 'buy_skin') {
      const targetSkin = TICTACTOE_SKINS.find((s) => s.id === body.skinId);
      if (!targetSkin) throw new NotFoundError('Skin not found.');

      if (profile.ownedSkinIds.includes(targetSkin.id)) {
        profile.activeSkinId = targetSkin.id;
        await profile.save();
        return apiSuccess({
          coins: profile.coins,
          activeSkinId: profile.activeSkinId,
          ownedSkinIds: profile.ownedSkinIds,
        });
      }

      const updated = await GameProfile.findOneAndUpdate(
        { userId: user._id, coins: { $gte: targetSkin.price } },
        {
          $inc: { coins: -targetSkin.price },
          $addToSet: { ownedSkinIds: targetSkin.id },
          $set: { activeSkinId: targetSkin.id },
        },
        { new: true }
      );

      if (!updated) {
        throw new ValidationError(
          `Not enough coins. You need ${targetSkin.price} coins to unlock ${targetSkin.name}.`
        );
      }

      return apiSuccess({
        coins: updated.coins,
        activeSkinId: updated.activeSkinId,
        ownedSkinIds: updated.ownedSkinIds,
      });
    }

    // 9. Equip Owned Skin
    if (body.action === 'equip_skin') {
      const targetSkin = TICTACTOE_SKINS.find((s) => s.id === body.skinId);
      if (!targetSkin) throw new NotFoundError('Skin not found.');
      if (!profile.ownedSkinIds.includes(targetSkin.id) && targetSkin.price > 0) {
        throw new ValidationError('You must unlock this skin before equipping it.');
      }

      const updated = await GameProfile.findOneAndUpdate(
        { userId: user._id },
        {
          $addToSet: { ownedSkinIds: targetSkin.id },
          $set: { activeSkinId: targetSkin.id },
        },
        { new: true }
      );

      return apiSuccess({
        coins: updated?.coins ?? profile.coins,
        activeSkinId: updated?.activeSkinId ?? targetSkin.id,
        ownedSkinIds: updated?.ownedSkinIds ?? profile.ownedSkinIds,
      });
    }

    // 10. Free ad coin rewards are disabled — coins must be purchased
    if (body.action === 'claim_ad_reward') {
      throw new ValidationError(
        'Free ad coin rewards are disabled. Please purchase a coin pack in the Shop.'
      );
    }

    // 11. Buy Coin Pack using ColibriPlus Wallet
    if (body.action === 'buy_coins_wallet') {
      const item = TICTACTOE_SHOP_ITEMS.find(
        (i) => i.id === body.shopItemId && i.type === 'purchase'
      );
      if (!item) throw new NotFoundError('Coin pack not found.');

      const wallet = await ensureWallet(user._id);
      const debitedWallet = await Wallet.findOneAndUpdate(
        { _id: wallet._id, balance: { $gte: item.priceNgn } },
        { $inc: { balance: -item.priceNgn } },
        { new: true }
      );

      if (!debitedWallet) {
        throw new ValidationError(
          `Insufficient wallet balance. This pack costs ₦${item.priceNgn.toLocaleString()} (Your wallet: ₦${(wallet.balance || 0).toLocaleString()}).`
        );
      }

      await WalletTransaction.create({
        walletId: wallet._id,
        userId: user._id,
        amount: item.priceNgn,
        commission: 0,
        currency: wallet.currency || 'NGN',
        transactionType: TransactionType.PAYMENT,
        isInternal: true,
        direction: TransactionDirection.OUTGOING,
        status: TransactionStatus.COMPLETED,
        metadata: {
          module: 'tictactoe_shop',
          shopItemId: item.id,
          coinsCredited: item.coins,
        },
      });

      const updatedProfile = await GameProfile.findOneAndUpdate(
        { userId: user._id },
        { $inc: { coins: item.coins } },
        { new: true }
      );

      await TicTacToeHistory.create({
        userId: user._id,
        opponentName: `Shop (${item.title})`,
        status: 'won',
        amount: item.coins,
        mode: 'solo',
      });

      return apiSuccess({
        coins: updatedProfile?.coins ?? profile.coins + item.coins,
        walletBalance: debitedWallet.balance,
        coinsCredited: item.coins,
      });
    }

    throw new ValidationError('Unsupported game action.');
  } catch (err) {
    return apiError(err);
  }
}
