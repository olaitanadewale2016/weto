import { Schema, model, models, Document, Types } from 'mongoose';

export interface IGameProfileDocument extends Document {
  userId: Types.ObjectId;
  coins: number;
  score: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesDrawn: number;
  activeSkinId: string;
  ownedSkinIds: string[];
  dailyAdWatches: number;
  lastAdWatchDate: string;
  rankKey: number;
  createdAt: Date;
  updatedAt: Date;
}

const GameProfileSchema = new Schema<IGameProfileDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    coins: { type: Number, default: 500, min: 0 },
    score: { type: Number, default: 0, min: 0, index: true },
    matchesPlayed: { type: Number, default: 0, min: 0 },
    matchesWon: { type: Number, default: 0, min: 0 },
    matchesDrawn: { type: Number, default: 0, min: 0 },
    activeSkinId: { type: String, default: 'cross' },
    ownedSkinIds: { type: [String], default: ['cross', 'offer'] },
    dailyAdWatches: { type: Number, default: 0 },
    lastAdWatchDate: { type: String, default: '' },
    rankKey: { type: Number, default: 0, index: true },
  },
  { timestamps: true }
);

GameProfileSchema.index({ score: -1, rankKey: -1 });

export interface ITicTacToePlayerSlot {
  userId: string;
  username: string;
  name: string;
  avatar: string;
  skinX: string;
  skinO: string;
  activeSkinType: 'X' | 'O';
  roundWins: number;
}

export interface ITicTacToeCell {
  playerId: string;
  mark: '' | 'X' | 'O';
  skin: string;
}

export interface ITicTacToeMatchDocument extends Document {
  gameKey: string;
  status: 'waiting' | 'inProgress' | 'completed' | 'closed';
  matrixSize: 3 | 4 | 5;
  rounds: 1 | 3 | 5 | 7;
  currentRound: number;
  entryFee: number;
  isPrivateInvite: boolean;
  invitedUserId?: Types.ObjectId | null;
  player1: ITicTacToePlayerSlot;
  player2?: ITicTacToePlayerSlot | null;
  board: ITicTacToeCell[][];
  currentTurn: 'player1' | 'player2';
  turnStartedAt: Date;
  result: 'notDeclared' | 'player1' | 'player2' | 'draw';
  lastRoundWinner?: 'player1' | 'player2' | 'draw' | null;
  winningLine?: {
    row: number | null;
    col: number | null;
    diagonal: 'main' | 'anti' | null;
    mark: 'X' | 'O';
  } | null;
  settled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PlayerSlotSchema = new Schema<ITicTacToePlayerSlot>(
  {
    userId: { type: String, required: true },
    username: { type: String, required: true },
    name: { type: String, required: true },
    avatar: { type: String, default: '/assets/avatars/default-avatar.png' },
    skinX: { type: String, default: 'default_cross' },
    skinO: { type: String, default: 'default_circle' },
    activeSkinType: { type: String, enum: ['X', 'O'], default: 'X' },
    roundWins: { type: Number, default: 0 },
  },
  { _id: false }
);

const TicTacToeMatchSchema = new Schema<ITicTacToeMatchDocument>(
  {
    gameKey: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ['waiting', 'inProgress', 'completed', 'closed'],
      default: 'waiting',
      index: true,
    },
    matrixSize: { type: Number, enum: [3, 4, 5], default: 3 },
    rounds: { type: Number, enum: [1, 3, 5, 7], default: 1 },
    currentRound: { type: Number, default: 0 },
    entryFee: { type: Number, default: 10, min: 0 },
    isPrivateInvite: { type: Boolean, default: false, index: true },
    invitedUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    player1: { type: PlayerSlotSchema, required: true },
    player2: { type: PlayerSlotSchema, default: null },
    board: { type: Schema.Types.Mixed, required: true },
    currentTurn: { type: String, enum: ['player1', 'player2'], default: 'player1' },
    turnStartedAt: { type: Date, default: Date.now },
    result: {
      type: String,
      enum: ['notDeclared', 'player1', 'player2', 'draw'],
      default: 'notDeclared',
    },
    lastRoundWinner: {
      type: String,
      enum: ['player1', 'player2', 'draw', null],
      default: null,
    },
    winningLine: {
      type: Schema.Types.Mixed,
      default: null,
    },
    settled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Compound index for fast matchmaking lookup
TicTacToeMatchSchema.index({
  status: 1,
  isPrivateInvite: 1,
  entryFee: 1,
  matrixSize: 1,
  rounds: 1,
  createdAt: 1,
});

export interface ITicTacToeHistoryDocument extends Document {
  userId: Types.ObjectId;
  matchId?: Types.ObjectId | null;
  gameKey?: string;
  opponentName: string;
  status: 'won' | 'lost' | 'tie' | 'quited';
  amount: number;
  mode: 'multiplayer' | 'solo';
  createdAt: Date;
}

const TicTacToeHistorySchema = new Schema<ITicTacToeHistoryDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    matchId: { type: Schema.Types.ObjectId, ref: 'TicTacToeMatch', default: null },
    gameKey: { type: String, default: '' },
    opponentName: { type: String, default: 'Opponent' },
    status: {
      type: String,
      enum: ['won', 'lost', 'tie', 'quited'],
      required: true,
    },
    amount: { type: Number, required: true },
    mode: { type: String, enum: ['multiplayer', 'solo'], default: 'multiplayer' },
  },
  { timestamps: true }
);

TicTacToeHistorySchema.index({ userId: 1, createdAt: -1 });

export const GameProfile =
  models.GameProfile || model<IGameProfileDocument>('GameProfile', GameProfileSchema);
export const TicTacToeMatch =
  models.TicTacToeMatch || model<ITicTacToeMatchDocument>('TicTacToeMatch', TicTacToeMatchSchema);
export const TicTacToeHistory =
  models.TicTacToeHistory ||
  model<ITicTacToeHistoryDocument>('TicTacToeHistory', TicTacToeHistorySchema);
