export type LineType = 'V' | 'H';
export type Player = 'red' | 'black';

/** A slot on the board: line type, line number (1-6), slot position (1-7) */
export interface SlotId {
  type: LineType;
  line: number; // 1-6
  slot: number; // 1-7
}

export function slotKey(s: SlotId): string {
  return `${s.line}${s.type}${s.slot}`;
}


export type GamePhase = 'placement' | 'movement';

/** One recorded move */
export interface Move {
  player: Player;
  from: SlotId | null; // null during placement
  to: SlotId;
}

/** Snapshot of game state at a given history index */
export interface BoardState {
  /** Map from slotKey → player who owns it */
  pieces: Record<string, Player>;
  currentPlayer: Player;
  /** How many pieces red has placed (0-7) */
  redPlaced: number;
  /** How many pieces black has placed (0-7) */
  blackPlaced: number;
  phase: GamePhase;
  /** Remaining ms for each player */
  redTimeMs: number;
  blackTimeMs: number;
  /** Move list up to this state */
  moves: Move[];
  winner: Player | null;
  resignedBy: Player | null;
  /** Set when a player disconnects mid-game, cleared on reconnect */
  disconnectedColor: Player | null;
  disconnectedAt: number | null; // ms timestamp
}
