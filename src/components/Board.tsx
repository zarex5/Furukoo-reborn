import React from 'react';
import type { SlotId, Player } from '../types';
import { slotKey } from '../types';
import { legalMoves, completedSquares } from '../gameLogic';

interface Props {
  pieces: Record<string, Player>;
  currentPlayer: Player;
  selectedSlot: SlotId | null;
  onSlotClick: (s: SlotId) => void;
  disabled: boolean;
  phase: 'placement' | 'movement';
  isDark: boolean;
}

/**
 * Board geometry:
 * - 6 V lines at columns 1-6 (CSS col-index), 7 slots per V line
 * - 6 H lines at rows 1-6 (CSS row-index), 7 slots per H line
 *
 * Visual grid: 13 columns × 13 rows (alternating "line" and "gap" positions)
 * - V lines are at odd columns: col 1,3,5,7,9,11  → visual col index 2k-1 for k=1..6
 * - H lines are at odd rows:    row 1,3,5,7,9,11  → visual row index 2j-1 for j=1..6
 * - Slot positions on V line k:
 *   slot 1 = above row 1 → visual row 0 (above grid, so we add a row 0)
 *   Actually we extend the grid: use rows 0..12
 *   slot s on kV → visual row: s*2 - 2  (s=1 → row 0, s=7 → row 12)
 *   Wait: the 6 H lines occupy visual rows 1,3,5,7,9,11 (0-indexed in a 13-row grid)
 *   Slots between H lines and at edges:
 *     kV slot 1: above 1H → visual row 0
 *     kV slot 2: between 1H (row 1) and 2H (row 3) → visual row 2
 *     kV slot s: visual row (s-1)*2
 *     kV slot 7: below 6H → visual row 12
 *
 *   kV line is at visual col (k-1)*2 + 1 = 2k-1 (1-indexed in 13-col grid → 0-indexed: 2k-2)
 *   Hmm, let me use 0-indexed for the 13×13 grid (rows 0..12, cols 0..12):
 *     V line k occupies column 2*(k-1)   for k=1..6  → cols 0,2,4,6,8,10
 *     H line j occupies row    2*(j-1)   for j=1..6  → rows 0,2,4,6,8,10
 *
 *   Slot positions (center of slot):
 *     kV slot s → col 2*(k-1), row 2*(s-1) - 1  ... hmm this puts slot 1 at row -1
 *
 * Let me use a simpler approach with offsets:
 *   Grid has 13 rows and 13 columns (0..12):
 *     H lines at visual rows: 1, 3, 5, 7, 9, 11  (j=1..6: row = 2*j-1)
 *     V lines at visual cols: 1, 3, 5, 7, 9, 11  (k=1..6: col = 2*k-1)
 *
 *   V slots on line k (col = 2k-1):
 *     slot 1: above 1H → between visual row -1 and row 1 → center at row 0
 *     slot 2: between 1H (row 1) and 2H (row 3) → center at row 2
 *     slot s: center at visual row 2*(s-1)  (s=1→0, s=2→2, ..., s=7→12)
 *
 *   H slots on line j (row = 2j-1):
 *     slot 1: left of 1V → center at col 0
 *     slot k: center at visual col 2*(k-1)
 *
 * So the visual grid is 13×13 (rows 0..12, cols 0..12)
 * We'll use a CSS grid with 13 columns and 13 rows, each CELL_SIZE wide/tall.
 * Intersections (corners of squares) are at odd rows AND odd cols: (2j-1, 2k-1)
 * V-slot cells are at even rows and odd cols: (2*(s-1), 2*(k)-1)
 *   → 2*(s-1) is even for s=1..7, and col = 2k-1 is odd for k=1..6
 * H-slot cells are at odd rows and even cols: (2*(j-1), 2*(k-1))...
 *   wait: slot center at col 2*(k-1) is even, row 2*(j-1) — but H line is at row 2j-1 (ODD)
 *
 * Something's off. Let me redo:
 *   H line j occupies visual ROW 2j-1 (odd: 1,3,5,7,9,11 for j=1..6)
 *   H slot k on line j: center at (row = 2j-1, col = 2*(k-1)) [even col]
 *     slot 1: col 0; slot 7: col 12
 *
 *   V line k occupies visual COL 2k-1 (odd: 1,3,5,7,9,11 for k=1..6)
 *   V slot s on line k: center at (row = 2*(s-1), col = 2k-1) [even row]
 *     slot 1: row 0; slot 7: row 12
 *
 *   Intersections at (row=2j-1, col=2k-1) — odd row AND odd col
 *   V slots at (row=even, col=odd)
 *   H slots at (row=odd, col=even)
 *   Empty corners at (row=even, col=even) — these are "outside" the lines
 *
 * This gives us a clean separation!
 */

const CELL = 28; // px per grid cell

const GRID_CELLS = 13; // 0..12

const LONG = 44;  // slot long side (4:1 ratio)
const SHORT = 11; // slot short side
// Slots overhang the board TOTAL by this much on each edge (LONG/2 - CELL/2)
const OVERHANG = Math.round(LONG / 2 - CELL / 2); // = 8

function vSlotPos(k: number, s: number) {
  // col = 2k-1, row = 2*(s-1)
  return { cx: (2 * k - 1) * CELL + CELL / 2, cy: 2 * (s - 1) * CELL + CELL / 2 };
}

function hSlotPos(j: number, k: number) {
  // row = 2j-1, col = 2*(k-1)
  return { cx: 2 * (k - 1) * CELL + CELL / 2, cy: (2 * j - 1) * CELL + CELL / 2 };
}

function intersectionPos(j: number, k: number) {
  // row = 2j-1, col = 2k-1
  return { x: (2 * k - 1) * CELL + CELL / 2, y: (2 * j - 1) * CELL + CELL / 2 };
}

const TOTAL = GRID_CELLS * CELL;

export const Board: React.FC<Props> = ({
  pieces,
  currentPlayer,
  selectedSlot,
  onSlotClick,
  disabled,
  phase,
  isDark,
}) => {
  const C = isDark ? {
    emptyFill: '#4b5563', emptyStroke: '#6b7280', labelFill: '#d1d5db',
    redSquare: 'rgba(239,68,68,0.25)', blackSquare: 'rgba(55,65,81,0.5)',
  } : {
    emptyFill: '#e2e8f0', emptyStroke: '#94a3b8', labelFill: '#475569',
    redSquare: 'rgba(239,68,68,0.18)', blackSquare: 'rgba(15,23,42,0.15)',
  };
  const legalDests = React.useMemo(() => {
    if (!selectedSlot || disabled) return new Set<string>();
    return new Set(legalMoves(selectedSlot, pieces).map(slotKey));
  }, [selectedSlot, pieces, disabled]);

  const { red: redSquares, black: blackSquares } = React.useMemo(
    () => completedSquares(pieces),
    [pieces]
  );

  const redSquareKeys = new Set(
    redSquares.map((sq) => sq.map(slotKey).join('|'))
  );
  const blackSquareKeys = new Set(
    blackSquares.map((sq) => sq.map(slotKey).join('|'))
  );

  function squareFill(j: number, k: number): string | null {
    const key = [
      slotKey({ type: 'H', line: j, slot: k + 1 }),
      slotKey({ type: 'H', line: j + 1, slot: k + 1 }),
      slotKey({ type: 'V', line: k, slot: j + 1 }),
      slotKey({ type: 'V', line: k + 1, slot: j + 1 }),
    ].join('|');
    if (redSquareKeys.has(key)) return C.redSquare;
    if (blackSquareKeys.has(key)) return C.blackSquare;
    return null;
  }

  function renderSlot(slotId: SlotId) {
    const key = slotKey(slotId);
    const owner = pieces[key];
    const isSelected = selectedSlot && slotKey(selectedSlot) === key;
    const isLegal = legalDests.has(key);
    const isClickable =
      !disabled &&
      (isLegal ||
        isSelected ||
        (owner === currentPlayer && phase === 'movement') ||
        (phase === 'placement' && !owner));

    let pos: { cx: number; cy: number };
    if (slotId.type === 'V') {
      pos = vSlotPos(slotId.line, slotId.slot);
    } else {
      pos = hSlotPos(slotId.line, slotId.slot);
    }

    let fillId: string;
    if (isSelected) fillId = 'url(#g-sel)';
    else if (isLegal) fillId = 'url(#g-leg)';
    else if (owner === 'red') fillId = 'url(#g-red)';
    else if (owner === 'black') fillId = isDark ? 'url(#g-blk-d)' : 'url(#g-blk-l)';
    else fillId = isDark ? 'url(#g-empty-d)' : 'url(#g-empty-l)';

    let strokeColor = C.emptyStroke;
    if (isSelected) strokeColor = '#d97706';
    else if (isLegal) strokeColor = '#16a34a';
    else if (owner === 'red') strokeColor = '#b91c1c';
    else if (owner === 'black') strokeColor = isDark ? '#374151' : '#334155';

    const label = `${slotId.line}${slotId.type}${slotId.slot}`;
    const isV = slotId.type === 'V';

    const rr = Math.round(SHORT / 2);
    const rw = isV ? SHORT : LONG;
    const rh = isV ? LONG : SHORT;

    return (
      <rect
        key={key}
        x={pos.cx - rw / 2}
        y={pos.cy - rh / 2}
        width={rw}
        height={rh}
        rx={rr}
        ry={rr}
        fill={fillId}
        stroke={strokeColor}
        strokeWidth={1.5}
        style={{ cursor: isClickable ? 'pointer' : 'default' }}
        onClick={isClickable ? () => onSlotClick(slotId) : undefined}
      >
        <title>{label}</title>
      </rect>
    );
  }

  // Collect all slots
  const slots: SlotId[] = [];
  for (let line = 1; line <= 6; line++) {
    for (let slot = 1; slot <= 7; slot++) {
      slots.push({ type: 'V', line, slot });
      slots.push({ type: 'H', line, slot });
    }
  }

  // Label offsets — board content starts at (LPAD, TPAD) inside the SVG
  const LPAD = 38; // left padding: OVERHANG(8) + label area + gap
  const TPAD = 20; // top padding: OVERHANG(8) + label height + gap
  // Add OVERHANG on right+bottom so last slots aren't clipped
  const SVG_W = LPAD + TOTAL + OVERHANG + 2;
  const SVG_H = TPAD + TOTAL + OVERHANG + 2;

  // H-line j slot center y (relative to board origin)
  const hLabelY = (j: number) => (2 * j - 1) * CELL + CELL / 2;
  // V-line k slot center x (relative to board origin)
  const vLabelX = (k: number) => (2 * k - 1) * CELL + CELL / 2;

  return (
    <svg
      width={SVG_W}
      height={SVG_H}
      style={{ display: 'block' }}
    >
      <defs>
        {/* Empty slots: gently darker center, lighter edge */}
        <radialGradient id="g-empty-l" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#c8d5e0" />
          <stop offset="100%" stopColor="#e8eff5" />
        </radialGradient>
        <radialGradient id="g-empty-d" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#4a5568" />
          <stop offset="100%" stopColor="#6b7280" />
        </radialGradient>
        {/* Colored pieces: moderate highlight center */}
        <radialGradient id="g-red" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#fca5a5" />
          <stop offset="100%" stopColor="#dc2626" />
        </radialGradient>
        <radialGradient id="g-blk-l" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#94a3b8" />
          <stop offset="55%" stopColor="#475569" />
          <stop offset="100%" stopColor="#0f172a" />
        </radialGradient>
        <radialGradient id="g-blk-d" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#6b7280" />
          <stop offset="55%" stopColor="#374151" />
          <stop offset="100%" stopColor="#030712" />
        </radialGradient>
        <radialGradient id="g-sel" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#fffbeb" />
          <stop offset="55%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#d97706" />
        </radialGradient>
        <radialGradient id="g-leg" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#f0fdf4" />
          <stop offset="55%" stopColor="#86efac" />
          <stop offset="100%" stopColor="#16a34a" />
        </radialGradient>
      </defs>

      {/* H labels — right-aligned just before the board */}
      {Array.from({ length: 6 }, (_, ji) => {
        const j = ji + 1;
        return (
          <text
            key={`hlabel-${j}`}
            x={LPAD - OVERHANG - 4}
            y={TPAD + hLabelY(j)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={10}
            fontFamily="monospace"
            fontWeight="bold"
            fill={C.labelFill}
          >{j}H</text>
        );
      })}

      {/* V labels — centred above each V line */}
      {Array.from({ length: 6 }, (_, ki) => {
        const k = ki + 1;
        return (
          <text
            key={`vlabel-${k}`}
            x={LPAD + vLabelX(k)}
            y={TPAD - OVERHANG - 4}
            textAnchor="middle"
            dominantBaseline="auto"
            fontSize={10}
            fontFamily="monospace"
            fontWeight="bold"
            fill={C.labelFill}
          >{k}V</text>
        );
      })}

      {/* Board group, offset by (LPAD, TPAD) */}
      <g transform={`translate(${LPAD},${TPAD})`}>
        {/* Squares highlights */}
        {Array.from({ length: 5 }, (_, jj) =>
          Array.from({ length: 5 }, (_, kk) => {
            const j = jj + 1, k = kk + 1;
            const fill = squareFill(j, k);
            if (!fill) return null;
            const topLeft = intersectionPos(j, k);
            const bottomRight = intersectionPos(j + 1, k + 1);
            return (
              <rect
                key={`sq-${j}-${k}`}
                x={topLeft.x}
                y={topLeft.y}
                width={bottomRight.x - topLeft.x}
                height={bottomRight.y - topLeft.y}
                fill={fill}
              />
            );
          })
        )}

        {/* Slots */}
        {slots.map(renderSlot)}
      </g>
    </svg>
  );
};
