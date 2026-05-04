import type { SlotId, Player, BoardState, Move } from './types';
import { slotKey } from './types';

export const INITIAL_TIME_MS = 5 * 60 * 1000;
export const TIME_BONUS_MS = 3 * 1000;
export const PIECES_PER_PLAYER = 7;


/**
 * Returns adjacent slot IDs for movement.
 *
 * Board geometry:
 * - 6 vertical lines (1V-6V), 7 slots each (1 = above 1H, 7 = below 6H)
 * - 6 horizontal lines (1H-6H), 7 slots each (1 = left of 1V, 7 = right of 6V)
 *
 * Slots are edge segments between grid intersections.
 * kV slot s: segment between (s-1)H and sH intersections on line kV
 *   - s=1: above 1H (no upper junction)
 *   - s=7: below 6H (no lower junction)
 * jH slot k: segment between (k-1)V and kV on line jH
 *   - k=1: left of 1V (no left junction)
 *   - k=7: right of 6V (no right junction)
 */
export function adjacentSlots(s: SlotId): SlotId[] {
  const result: SlotId[] = [];

  if (s.type === 'V') {
    const { line: k, slot: pos } = s;
    // Slide up / down along same V line
    if (pos > 1) result.push({ type: 'V', line: k, slot: pos - 1 });
    if (pos < 7) result.push({ type: 'V', line: k, slot: pos + 1 });
    // Slide left / right to same slot on adjacent V line
    if (k > 1) result.push({ type: 'V', line: k - 1, slot: pos });
    if (k < 6) result.push({ type: 'V', line: k + 1, slot: pos });
    // Pivot at upper junction (pos-1)H  (exists when pos >= 2)
    if (pos >= 2) {
      result.push({ type: 'H', line: pos - 1, slot: k });
      result.push({ type: 'H', line: pos - 1, slot: k + 1 });
    }
    // Pivot at lower junction pos-H  (exists when pos <= 6)
    if (pos <= 6) {
      result.push({ type: 'H', line: pos, slot: k });
      result.push({ type: 'H', line: pos, slot: k + 1 });
    }
  } else {
    // Horizontal
    const { line: j, slot: pos } = s;
    // Slide left / right along same H line
    if (pos > 1) result.push({ type: 'H', line: j, slot: pos - 1 });
    if (pos < 7) result.push({ type: 'H', line: j, slot: pos + 1 });
    // Slide up / down to same slot on adjacent H line
    if (j > 1) result.push({ type: 'H', line: j - 1, slot: pos });
    if (j < 6) result.push({ type: 'H', line: j + 1, slot: pos });
    // Pivot at left junction (pos-1)V  (exists when pos >= 2)
    if (pos >= 2) {
      result.push({ type: 'V', line: pos - 1, slot: j });
      result.push({ type: 'V', line: pos - 1, slot: j + 1 });
    }
    // Pivot at right junction pos-V  (exists when pos <= 6)
    if (pos <= 6) {
      result.push({ type: 'V', line: pos, slot: j });
      result.push({ type: 'V', line: pos, slot: j + 1 });
    }
  }

  // Filter out-of-bounds (H slots go 1-7, V slots go 1-7; lines 1-6)
  return result.filter(
    (a) => a.line >= 1 && a.line <= 6 && a.slot >= 1 && a.slot <= 7
  );
}

/**
 * Legal move destinations for a piece at `from` given current pieces map.
 * Destinations must be unoccupied and adjacent.
 */
export function legalMoves(from: SlotId, pieces: Record<string, Player>): SlotId[] {
  return adjacentSlots(from).filter((s) => !pieces[slotKey(s)]);
}

/**
 * The 25 closed squares on the board.
 * Square (j, k): bounded by jH, (j+1)H, kV, (k+1)V
 * - top:    jH slot k+1
 * - bottom: (j+1)H slot k+1
 * - left:   kV slot j+1
 * - right:  (k+1)V slot j+1
 */
export function allSquares(): Array<[SlotId, SlotId, SlotId, SlotId]> {
  const squares: Array<[SlotId, SlotId, SlotId, SlotId]> = [];
  for (let j = 1; j <= 5; j++) {
    for (let k = 1; k <= 5; k++) {
      squares.push([
        { type: 'H', line: j, slot: k + 1 },     // top
        { type: 'H', line: j + 1, slot: k + 1 }, // bottom
        { type: 'V', line: k, slot: j + 1 },      // left
        { type: 'V', line: k + 1, slot: j + 1 },  // right
      ]);
    }
  }
  return squares;
}

/** Check if a player has completed any square */
export function checkWinner(pieces: Record<string, Player>): Player | null {
  for (const [a, b, c, d] of allSquares()) {
    const pa = pieces[slotKey(a)];
    if (!pa) continue;
    if (pa === pieces[slotKey(b)] && pa === pieces[slotKey(c)] && pa === pieces[slotKey(d)]) {
      return pa;
    }
  }
  return null;
}

/** Which squares are complete for each player */
export function completedSquares(pieces: Record<string, Player>): {
  red: Array<[SlotId, SlotId, SlotId, SlotId]>;
  black: Array<[SlotId, SlotId, SlotId, SlotId]>;
} {
  const red: Array<[SlotId, SlotId, SlotId, SlotId]> = [];
  const black: Array<[SlotId, SlotId, SlotId, SlotId]> = [];
  for (const sq of allSquares()) {
    const [a, b, c, d] = sq;
    const pa = pieces[slotKey(a)];
    if (!pa) continue;
    if (pa === pieces[slotKey(b)] && pa === pieces[slotKey(c)] && pa === pieces[slotKey(d)]) {
      if (pa === 'red') red.push(sq);
      else black.push(sq);
    }
  }
  return { red, black };
}

export function applyMove(state: BoardState, to: SlotId, from: SlotId | null): BoardState {
  const newPieces = { ...state.pieces };
  const toKey = slotKey(to);
  const player = state.currentPlayer;

  if (from) {
    delete newPieces[slotKey(from)];
  }
  newPieces[toKey] = player;

  const bonusMs = TIME_BONUS_MS;
  const newRedTime = player === 'red' ? state.redTimeMs + bonusMs : state.redTimeMs;
  const newBlackTime = player === 'black' ? state.blackTimeMs + bonusMs : state.blackTimeMs;

  const newMoves: Move[] = [...state.moves, { player, from, to }];

  const newRedPlaced = player === 'red' ? state.redPlaced + (from ? 0 : 1) : state.redPlaced;
  const newBlackPlaced = player === 'black' ? state.blackPlaced + (from ? 0 : 1) : state.blackPlaced;

  const newPhase =
    newRedPlaced >= PIECES_PER_PLAYER && newBlackPlaced >= PIECES_PER_PLAYER
      ? 'movement'
      : 'placement';

  const winner = checkWinner(newPieces);
  const nextPlayer: Player = player === 'red' ? 'black' : 'red';

  return {
    ...state,
    pieces: newPieces,
    currentPlayer: nextPlayer,
    redPlaced: newRedPlaced,
    blackPlaced: newBlackPlaced,
    phase: newPhase,
    redTimeMs: newRedTime,
    blackTimeMs: newBlackTime,
    moves: newMoves,
    winner,
  };
}

export function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

