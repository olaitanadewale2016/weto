export type TicTacToeDifficulty = 'easy' | 'medium' | 'hard';
export type WinDiagonal = 'main' | 'anti';

export interface MatrixSizeOption {
  size: 3 | 4 | 5;
  title: string;
}

export interface GameRoundOption {
  digit: 1 | 3 | 5 | 7;
  name: string;
}

export interface TicTacToeSkinCatalogItem {
  id: string;
  name: string;
  skinX: string;
  skinO: string;
  price: number;
}

export interface TicTacToeShopCatalogItem {
  id: string;
  title: string;
  coins: number;
  priceNgn: number;
  priceUsd: number;
  type: 'purchase' | 'rewardedAd';
  artwork: string;
}

export interface MoreGameCatalogItem {
  name: string;
  url: string;
  image: string;
}

export interface BoardWinResult {
  winnerMark: 'X' | 'O';
  row: number | null;
  col: number | null;
  diagonal: WinDiagonal | null;
  cells: Array<[number, number]>;
}

export const TICTACTOE_STARTING_COINS = 500;
export const TICTACTOE_SKIN_PRICE = 500;
export const TICTACTOE_SCORE_WIN = 10;
export const TICTACTOE_SCORE_DRAW = 5;
export const TICTACTOE_SCORE_LOSS = 0;
export const TICTACTOE_SEARCH_TIMEOUT_SECONDS = 60;

export const TICTACTOE_FEES = [10, 25, 50, 100] as const;

export const TICTACTOE_MATRIX_SIZES: MatrixSizeOption[] = [
  { size: 3, title: 'Classic Mode (3x3)' },
  { size: 4, title: 'Advanced Mode (4x4)' },
  { size: 5, title: 'Expert Mode (5x5)' },
];

export const TICTACTOE_ROUNDS: GameRoundOption[] = [
  { digit: 1, name: 'One' },
  { digit: 3, name: 'Three' },
  { digit: 5, name: 'Five' },
  { digit: 7, name: 'Seven' },
];

export const TICTACTOE_SKINS: TicTacToeSkinCatalogItem[] = [
  {
    id: 'cross',
    name: 'Dora Cross',
    skinX: 'default_cross',
    skinO: 'default_circle',
    price: 0,
  },
  {
    id: 'enhance',
    name: 'Dora Enhance',
    skinX: 'enhance_plus',
    skinO: 'enhance_circle',
    price: TICTACTOE_SKIN_PRICE,
  },
  {
    id: 'box',
    name: 'Dora Box',
    skinX: 'box',
    skinO: 'default_circle',
    price: TICTACTOE_SKIN_PRICE,
  },
  {
    id: 'pentagon',
    name: 'Dora Pentagon',
    skinX: 'pentagon',
    skinO: 'default_circle',
    price: TICTACTOE_SKIN_PRICE,
  },
  {
    id: 'hex',
    name: 'Dora Hex',
    skinX: 'hex',
    skinO: 'default_circle',
    price: TICTACTOE_SKIN_PRICE,
  },
  {
    id: 'shield',
    name: 'Dora Shield',
    skinX: 'shield',
    skinO: 'default_circle',
    price: TICTACTOE_SKIN_PRICE,
  },
  {
    id: 'pyramid',
    name: 'Dora Pyramid',
    skinX: 'pyramid',
    skinO: 'default_circle',
    price: TICTACTOE_SKIN_PRICE,
  },
  {
    id: 'crystal',
    name: 'Dora Crystal',
    skinX: 'crystal',
    skinO: 'default_circle',
    price: TICTACTOE_SKIN_PRICE,
  },
  {
    id: 'offer',
    name: 'Dora Offer',
    skinX: 'star',
    skinO: 'default_circle',
    price: 0,
  },
];

export const TICTACTOE_SHOP_ITEMS: TicTacToeShopCatalogItem[] = [
  {
    id: 'watch_ad_50',
    title: '50 Free Coins',
    coins: 50,
    priceNgn: 0,
    priceUsd: 0,
    type: 'rewardedAd',
    artwork: '/assets/games/tictactoe/png/ads.png',
  },
  {
    id: 'coins_100',
    title: '100 Coins',
    coins: 100,
    priceNgn: 500,
    priceUsd: 0.99,
    type: 'purchase',
    artwork: '/assets/games/tictactoe/svg/coin_stack_small.svg',
  },
  {
    id: 'coins_200',
    title: '200 Coins',
    coins: 200,
    priceNgn: 900,
    priceUsd: 1.79,
    type: 'purchase',
    artwork: '/assets/games/tictactoe/svg/coin_stack_medium.svg',
  },
  {
    id: 'coins_500',
    title: '500 Coins',
    coins: 500,
    priceNgn: 2000,
    priceUsd: 3.99,
    type: 'purchase',
    artwork: '/assets/games/tictactoe/svg/coin_stack_large.svg',
  },
  {
    id: 'coins_1000',
    title: '1,000 Coins',
    coins: 1000,
    priceNgn: 3500,
    priceUsd: 6.99,
    type: 'purchase',
    artwork: '/assets/games/tictactoe/svg/coin_bag_small.svg',
  },
  {
    id: 'coins_5000',
    title: '5,000 Coins',
    coins: 5000,
    priceNgn: 15000,
    priceUsd: 24.99,
    type: 'purchase',
    artwork: '/assets/games/tictactoe/svg/coin_bag_large.svg',
  },
];

export const TICTACTOE_MORE_GAMES: MoreGameCatalogItem[] = [
  {
    name: 'Hextris',
    url: 'https://hextris.io/',
    image: '/assets/games/tictactoe/svg/skins/hex.svg',
  },
  {
    name: 'Clumsy Bird',
    url: 'https://ellisonleao.github.io/clumsy-bird/',
    image: '/assets/games/tictactoe/svg/dora_1.svg',
  },
  {
    name: 'Pacman',
    url: 'https://pacman.platzh1rsch.ch/',
    image: '/assets/games/tictactoe/svg/skins/default_circle.svg',
  },
];

export function getSkinAssetPath(skinKey?: string | null): string {
  const clean = (skinKey || 'default_cross').replace(/\.svg$/i, '');
  return `/assets/games/tictactoe/svg/skins/${clean}.svg`;
}

export function getSkinById(skinId?: string | null): TicTacToeSkinCatalogItem {
  return (
    TICTACTOE_SKINS.find((s) => s.id === skinId) ||
    TICTACTOE_SKINS[0]
  );
}

/**
 * Matches Flutter `AppSettings.turnDurationFor(boardSize)`:
 * 3x3 -> 20s, 4x4 -> 30s, 5x5 -> 40s.
 */
export function turnDurationFor(boardSize: number): number {
  const steps = Math.max(0, boardSize - 3);
  return 20 + steps * 10;
}

/**
 * Matches Flutter `leaderboard_ranking.dart`:
 * Packs `score` (primary descending) and `createdAt` (tiebreaker ascending)
 * into a single sortable number.
 */
export function computeRankKey(score: number, createdAt?: Date | string | number): number {
  const safeScore = Math.max(0, Math.floor(score || 0));
  const tsMs = createdAt ? new Date(createdAt).getTime() : Date.now();
  const createdSeconds = Math.max(0, Math.floor((Number.isFinite(tsMs) ? tsMs : Date.now()) / 1000));
  return safeScore * 4_000_000_000 - createdSeconds;
}

/**
 * Evaluates rows, columns, and both main & anti diagonals of an NxN board.
 */
export function checkBoardWin(board: string[][]): BoardWinResult | null {
  const n = board.length;
  if (n === 0) return null;

  // Check rows
  for (let r = 0; r < n; r++) {
    const first = board[r]?.[0];
    if (first === 'X' || first === 'O') {
      let win = true;
      const cells: Array<[number, number]> = [];
      for (let c = 0; c < n; c++) {
        if (board[r]?.[c] !== first) {
          win = false;
          break;
        }
        cells.push([r, c]);
      }
      if (win) {
        return { winnerMark: first, row: r, col: null, diagonal: null, cells };
      }
    }
  }

  // Check columns
  for (let c = 0; c < n; c++) {
    const first = board[0]?.[c];
    if (first === 'X' || first === 'O') {
      let win = true;
      const cells: Array<[number, number]> = [];
      for (let r = 0; r < n; r++) {
        if (board[r]?.[c] !== first) {
          win = false;
          break;
        }
        cells.push([r, c]);
      }
      if (win) {
        return { winnerMark: first, row: null, col: c, diagonal: null, cells };
      }
    }
  }

  // Check main diagonal (top-left -> bottom-right)
  const mainFirst = board[0]?.[0];
  if (mainFirst === 'X' || mainFirst === 'O') {
    let win = true;
    const cells: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      if (board[i]?.[i] !== mainFirst) {
        win = false;
        break;
      }
      cells.push([i, i]);
    }
    if (win) {
      return { winnerMark: mainFirst, row: null, col: null, diagonal: 'main', cells };
    }
  }

  // Check anti-diagonal (top-right -> bottom-left)
  const antiFirst = board[0]?.[n - 1];
  if (antiFirst === 'X' || antiFirst === 'O') {
    let win = true;
    const cells: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      if (board[i]?.[n - 1 - i] !== antiFirst) {
        win = false;
        break;
      }
      cells.push([i, n - 1 - i]);
    }
    if (win) {
      return { winnerMark: antiFirst, row: null, col: null, diagonal: 'anti', cells };
    }
  }

  return null;
}

export function isBoardFull(board: string[][]): boolean {
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (!board[r][c]) return false;
    }
  }
  return true;
}

const WIN_SCORE = 1_000_000;

function findLineMoveInDirection(
  board: string[][],
  startX: number,
  startY: number,
  dirX: number,
  dirY: number,
  boardSize: number,
  mark: string
): { row: number; col: number } | null {
  let markCount = 0;
  let emptyCell: { row: number; col: number } | null = null;

  for (let i = 0; i < boardSize; i++) {
    const x = startX + i * dirX;
    const y = startY + i * dirY;
    const cell = board[x]?.[y] || '';
    if (cell === mark) {
      markCount++;
    } else if (cell === '') {
      emptyCell = { row: x, col: y };
    }
  }

  if (markCount === boardSize - 1 && emptyCell) {
    return emptyCell;
  }
  return null;
}

function findLineMove(
  board: string[][],
  boardSize: number,
  mark: string
): { row: number; col: number } | null {
  for (let i = 0; i < boardSize; i++) {
    const rowMove = findLineMoveInDirection(board, i, 0, 0, 1, boardSize, mark);
    if (rowMove) return rowMove;

    const colMove = findLineMoveInDirection(board, 0, i, 1, 0, boardSize, mark);
    if (colMove) return colMove;
  }

  const diag1Move = findLineMoveInDirection(board, 0, 0, 1, 1, boardSize, mark);
  if (diag1Move) return diag1Move;

  return findLineMoveInDirection(board, 0, boardSize - 1, 1, -1, boardSize, mark);
}

function getRandomMove(
  board: string[][],
  boardSize: number
): { row: number; col: number } | null {
  const available: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      if (!board[r]?.[c]) {
        available.push({ row: r, col: c });
      }
    }
  }
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

function takeCenter(
  board: string[][],
  boardSize: number
): { row: number; col: number } | null {
  const mid = Math.floor(boardSize / 2);
  if (boardSize % 2 === 1 && !board[mid]?.[mid]) {
    return { row: mid, col: mid };
  }
  return null;
}

function takeStrategicPosition(
  board: string[][],
  boardSize: number
): { row: number; col: number } | null {
  const mid = Math.floor(boardSize / 2);
  const candidates = [
    { row: 0, col: 0 },
    { row: 0, col: boardSize - 1 },
    { row: boardSize - 1, col: 0 },
    { row: boardSize - 1, col: boardSize - 1 },
    { row: 0, col: mid },
    { row: boardSize - 1, col: mid },
    { row: mid, col: 0 },
    { row: mid, col: boardSize - 1 },
  ];
  for (const pos of candidates) {
    if (!board[pos.row]?.[pos.col]) return pos;
  }
  return null;
}

function searchDepthForBoard(n: number): number {
  if (n === 3) return 9;
  if (n === 4) return 4;
  return 3;
}

function linePotential(count: number): number {
  let weight = 1;
  for (let i = 1; i < count; i++) {
    weight *= 10;
  }
  return weight;
}

function evaluateLineScore(
  board: string[][],
  n: number,
  sx: number,
  sy: number,
  dx: number,
  dy: number,
  aiMark: string,
  humanMark: string
): number {
  let mine = 0;
  let theirs = 0;
  for (let k = 0; k < n; k++) {
    const c = board[sx + k * dx]?.[sy + k * dy] || '';
    if (c === aiMark) mine++;
    else if (c === humanMark) theirs++;
  }
  if (mine > 0 && theirs > 0) return 0;
  if (mine > 0) return linePotential(mine);
  if (theirs > 0) return -linePotential(theirs);
  return 0;
}

function evaluateBoardHeuristic(
  board: string[][],
  n: number,
  aiMark: string,
  humanMark: string
): number {
  let score = 0;
  for (let i = 0; i < n; i++) {
    score += evaluateLineScore(board, n, i, 0, 0, 1, aiMark, humanMark);
    score += evaluateLineScore(board, n, 0, i, 1, 0, aiMark, humanMark);
  }
  score += evaluateLineScore(board, n, 0, 0, 1, 1, aiMark, humanMark);
  score += evaluateLineScore(board, n, 0, n - 1, 1, -1, aiMark, humanMark);
  return score;
}

function minimax(
  board: string[][],
  n: number,
  depth: number,
  isMax: boolean,
  alpha: number,
  beta: number,
  aiMark: string,
  humanMark: string
): number {
  const win = checkBoardWin(board);
  if (win?.winnerMark === aiMark) return WIN_SCORE + depth;
  if (win?.winnerMark === humanMark) return -WIN_SCORE - depth;
  if (isBoardFull(board)) return 0;
  if (depth === 0) return evaluateBoardHeuristic(board, n, aiMark, humanMark);

  if (isMax) {
    let best = -WIN_SCORE * 2;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (board[r][c] !== '') continue;
        board[r][c] = aiMark;
        const val = minimax(board, n, depth - 1, false, alpha, beta, aiMark, humanMark);
        board[r][c] = '';
        if (val > best) best = val;
        if (best > alpha) alpha = best;
        if (beta <= alpha) return best;
      }
    }
    return best;
  } else {
    let best = WIN_SCORE * 2;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (board[r][c] !== '') continue;
        board[r][c] = humanMark;
        const val = minimax(board, n, depth - 1, true, alpha, beta, aiMark, humanMark);
        board[r][c] = '';
        if (val < best) best = val;
        if (best < beta) beta = best;
        if (beta <= alpha) return best;
      }
    }
    return best;
  }
}

/**
 * Exact TypeScript port of Flutter `TicTacToeAI.getBestMove` (`dora_ai.dart`).
 */
export function getBestDoraMove(
  rawBoard: string[][],
  boardSize: number,
  difficulty: TicTacToeDifficulty = 'hard',
  aiMark: 'X' | 'O' = 'X',
  humanMark: 'X' | 'O' = 'O'
): { row: number; col: number; index: number } | null {
  const board = rawBoard.map((row) => row.map((cell) => cell || ''));

  let chosen: { row: number; col: number } | null = null;

  if (difficulty === 'easy') {
    chosen = getRandomMove(board, boardSize);
  } else if (difficulty === 'medium') {
    chosen =
      findLineMove(board, boardSize, aiMark) ||
      findLineMove(board, boardSize, humanMark) ||
      takeCenter(board, boardSize) ||
      takeStrategicPosition(board, boardSize) ||
      getRandomMove(board, boardSize);
  } else {
    // Hard mode: check immediate win/block first, then full alpha-beta minimax
    const immediateWin = findLineMove(board, boardSize, aiMark);
    if (immediateWin) {
      chosen = immediateWin;
    } else {
      const immediateBlock = findLineMove(board, boardSize, humanMark);
      if (immediateBlock) {
        chosen = immediateBlock;
      } else {
        const depth = searchDepthForBoard(boardSize);
        let bestScore = -WIN_SCORE * 2;
        const bestMoves: Array<{ row: number; col: number }> = [];

        for (let r = 0; r < boardSize; r++) {
          for (let c = 0; c < boardSize; c++) {
            if (board[r][c] !== '') continue;
            board[r][c] = aiMark;
            const score = minimax(
              board,
              boardSize,
              depth - 1,
              false,
              -WIN_SCORE * 2,
              WIN_SCORE * 2,
              aiMark,
              humanMark
            );
            board[r][c] = '';

            if (score > bestScore) {
              bestScore = score;
              bestMoves.length = 0;
              bestMoves.push({ row: r, col: c });
            } else if (score === bestScore) {
              bestMoves.push({ row: r, col: c });
            }
          }
        }

        chosen =
          bestMoves.length > 0
            ? bestMoves[Math.floor(Math.random() * bestMoves.length)]
            : getRandomMove(board, boardSize);
      }
    }
  }

  if (!chosen) return null;
  return {
    row: chosen.row,
    col: chosen.col,
    index: chosen.row * boardSize + chosen.col,
  };
}
