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
  responsive?: boolean;
  /** Fill parent container, maintaining aspect ratio (for desktop game layout). */
  fit?: boolean;
  /** Unique prefix for SVG gradient IDs — prevents conflicts when multiple boards are in the DOM. */
  uid?: string;
  /** When set, pieces of this color gently pulse to hint the player it's their turn. */
  pulsePieceColor?: Player | null;
  /** Last move played — used for slot highlights and 600ms piece animation. */
  lastMove?: { from: SlotId | null; to: SlotId } | null;
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
 *   slot 1 = above row 1 → between visual row -1 and row 1 → center at row 0
 *   slot s on kV → visual row: 2*(s-1)  (s=1 → row 0, s=7 → row 12)
 *
 *   H slots on line j (row = 2j-1):
 *     slot k: center at visual col 2*(k-1)
 *
 * So the visual grid is 13×13 (rows 0..12, cols 0..12)
 * We'll use a CSS grid with 13 columns and 13 rows, each CELL_SIZE wide/tall.
 * Intersections (corners of squares) are at odd rows AND odd cols: (2j-1, 2k-1)
 * V-slot cells are at even rows and odd cols: (2*(s-1), 2*(k)-1)
 * H-slot cells are at odd rows and even cols
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

function slotPos(id: SlotId) {
  return id.type === 'V' ? vSlotPos(id.line, id.slot) : hSlotPos(id.line, id.slot);
}

const TOTAL = GRID_CELLS * CELL;

interface MovingPiece {
  player: Player;
  toSlotKey: string;
  fromCx: number; fromCy: number;
  toCx: number; toCy: number;
  isFromV: boolean;
  isToV: boolean;
  fromAngle: number;
}

export const Board: React.FC<Props> = ({
  pieces,
  currentPlayer,
  selectedSlot,
  onSlotClick,
  disabled,
  phase,
  isDark,
  responsive = false,
  fit = false,
  uid = 'b',
  pulsePieceColor = null,
  lastMove = null,
}) => {
  const C = isDark ? {
    emptyFill: '#4b5563', emptyStroke: '#6b7280', labelFill: '#d1d5db',
    redSquare: 'rgba(239,68,68,0.25)', blackSquare: 'rgba(55,65,81,0.5)',
  } : {
    emptyFill: '#e2e8f0', emptyStroke: '#94a3b8', labelFill: '#475569',
    redSquare: 'rgba(239,68,68,0.18)', blackSquare: 'rgba(15,23,42,0.15)',
  };

  // --- 1000ms piece animation (RAF-driven, no SMIL) ---
  const [movingPiece, setMovingPiece] = React.useState<MovingPiece | null>(null);
  const animGRef   = React.useRef<SVGGElement | null>(null);
  const animRafRef = React.useRef<number | null>(null);
  // Tracks keys from the previous effect run; null = never run (first mount).
  const prevKeysRef = React.useRef<{ from: string | null; to: string | null } | null>(null);
  const lastMoveFromKey = lastMove?.from ? slotKey(lastMove.from) : null;
  const lastMoveToKey   = lastMove ? slotKey(lastMove.to) : null;

  React.useEffect(() => {
    const prev = prevKeysRef.current;
    prevKeysRef.current = { from: lastMoveFromKey, to: lastMoveToKey };
    // First mount — board appeared with an existing move; don't animate.
    if (prev === null) return;
    // Keys unchanged (e.g. React StrictMode double-invoke) — nothing to do.
    if (prev.from === lastMoveFromKey && prev.to === lastMoveToKey) return;

    // Cancel any running animation.
    if (animRafRef.current !== null) { cancelAnimationFrame(animRafRef.current); animRafRef.current = null; }

    if (!lastMove?.from) { setMovingPiece(null); return; }
    const owner = pieces[slotKey(lastMove.to)];
    if (!owner) { setMovingPiece(null); return; }

    const fromPos = slotPos(lastMove.from);
    const toPos   = slotPos(lastMove.to);
    const isFromV = lastMove.from.type === 'V';
    const isToV   = lastMove.to.type === 'V';
    // Rotation for H slots: CW (-90) when dy and dx have opposite signs, CCW (+90) when same sign.
    // This satisfies all 8 H↔V combos (up-right CW, up-left CCW, down-right CCW, down-left CW for H→V; mirrored for V→H).
    const dy = toPos.cy - fromPos.cy;
    const dx = toPos.cx - fromPos.cx;
    const hAngle    = (dy * dx < 0) ? -90 : 90;
    const fromAngle = isFromV ? 0 : hAngle;
    const toAngle   = isToV   ? 0 : hAngle;

    // Mount the overlay group at the FROM position; RAF drives translate + rotate.
    setMovingPiece({ player: owner, toSlotKey: slotKey(lastMove.to), fromCx: fromPos.cx, fromCy: fromPos.cy, toCx: toPos.cx, toCy: toPos.cy, isFromV, isToV, fromAngle });

    const DURATION = 1000;
    const isCross = isFromV !== isToV;
    const ROTATE_END = 0.35; // fraction of DURATION spent rotating in-place (cross-orientation only)
    const startTime = performance.now();
    function easeInOut(t: number) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

    function tick(now: number) {
      const g = animGRef.current;
      if (!g) {
        // React hasn't committed the overlay element yet — retry next frame.
        animRafRef.current = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, (now - startTime) / DURATION);

      let cx: number, cy: number, angle: number;
      if (isCross && t < ROTATE_END) {
        // Phase 1 (cross-orientation only): rotate in place at FROM slot
        const t1 = easeInOut(t / ROTATE_END);
        cx    = fromPos.cx;
        cy    = fromPos.cy;
        angle = fromAngle + (toAngle - fromAngle) * t1;
      } else {
        // Phase 2: translate straight from FROM to TO with final orientation
        const raw = isCross ? (t - ROTATE_END) / (1 - ROTATE_END) : t;
        const t2  = easeInOut(raw);
        cx    = fromPos.cx + (toPos.cx - fromPos.cx) * t2;
        cy    = fromPos.cy + (toPos.cy - fromPos.cy) * t2;
        angle = toAngle;
      }

      g.setAttribute('transform', `translate(${cx} ${cy}) rotate(${angle})`);
      if (t < 1) {
        animRafRef.current = requestAnimationFrame(tick);
      } else {
        animRafRef.current = null;
        setMovingPiece(null);
      }
    }
    animRafRef.current = requestAnimationFrame(tick);

    return () => { if (animRafRef.current !== null) { cancelAnimationFrame(animRafRef.current); animRafRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMoveFromKey, lastMoveToKey]);

  // --- Slot highlights (last-move indicator) ---
  const highlightedSlots = React.useMemo(() => {
    if (!lastMove) return new Set<string>();
    const s = new Set([slotKey(lastMove.to)]);
    if (lastMove.from) s.add(slotKey(lastMove.from));
    return s;
  }, [lastMove]);

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
    const isAnimatingDest = movingPiece?.toSlotKey === key;
    // Hide the static piece at the animation destination — the overlay animated piece handles it
    const owner = isAnimatingDest ? undefined : pieces[key];
    const isSelected = selectedSlot && slotKey(selectedSlot) === key;
    const isLegal = legalDests.has(key);
    const isHighlighted = highlightedSlots.has(key);
    const isClickable =
      !disabled &&
      (isLegal ||
        isSelected ||
        (pieces[key] === currentPlayer && phase === 'movement') ||
        (phase === 'placement' && !pieces[key]));

    const pos = slotPos(slotId);

    let fillId: string;
    if (isSelected) fillId = `url(#${uid}-sel)`;
    else if (isLegal) fillId = `url(#${uid}-leg)`;
    else if (owner === 'red') fillId = isHighlighted ? `url(#${uid}-red-hi)` : `url(#${uid}-red)`;
    else if (owner === 'black') fillId = isHighlighted
      ? (isDark ? `url(#${uid}-blk-d-hi)` : `url(#${uid}-blk-l-hi)`)
      : (isDark ? `url(#${uid}-blk-d)` : `url(#${uid}-blk-l)`);
    else if (isHighlighted) fillId = isDark ? `url(#${uid}-hi-d)` : `url(#${uid}-hi-l)`;
    else fillId = isDark ? `url(#${uid}-empty-d)` : `url(#${uid}-empty-l)`;

    let strokeColor = C.emptyStroke;
    if (isSelected) strokeColor = '#d97706';
    else if (isLegal) strokeColor = '#16a34a';

    const strokeWidth = 1;

    const label = `${slotId.line}${slotId.type}${slotId.slot}`;
    const isV = slotId.type === 'V';

    const rr = Math.round(SHORT / 2);
    const rw = isV ? SHORT : LONG;
    const rh = isV ? LONG : SHORT;
    // Expanded hit area on the short axis for easier touch
    const HIT = SHORT + 16;
    const hw = isV ? HIT : LONG;
    const hh = isV ? LONG : HIT;

    return (
      <>
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
          strokeWidth={strokeWidth}
          style={{
            cursor: isClickable ? 'pointer' : 'default',
            animation: (owner === pulsePieceColor && !isSelected) ? 'piece-pulse 1s ease-in-out infinite' : undefined,
          }}
          onClick={isClickable ? () => onSlotClick(slotId) : undefined}
        >
          <title>{label}</title>
        </rect>
        {isClickable && (
          <rect
            key={key + '-hit'}
            x={pos.cx - hw / 2}
            y={pos.cy - hh / 2}
            width={hw}
            height={hh}
            fill="transparent"
            style={{ cursor: 'pointer' }}
            onClick={() => onSlotClick(slotId)}
          />
        )}
      </>
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
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      width={fit ? '100%' : responsive ? '100%' : SVG_W}
      height={fit ? '100%' : responsive ? undefined : SVG_H}
      preserveAspectRatio={fit ? 'xMidYMid meet' : undefined}
      style={{ display: 'block' }}
    >
      <defs>
        {/* Empty slots */}
        <radialGradient id={`${uid}-empty-l`} cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#d8eaf5" />
          <stop offset="100%" stopColor="#f4fafd" />
        </radialGradient>
        <radialGradient id={`${uid}-empty-d`} cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#505e6a" />
          <stop offset="100%" stopColor="#7e96a6" />
        </radialGradient>
        {/* Highlighted empty slot (previous position) — slightly darker than regular empty */}
        <radialGradient id={`${uid}-hi-l`} cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#a8c8e0" />
          <stop offset="100%" stopColor="#daeef8" />
        </radialGradient>
        <radialGradient id={`${uid}-hi-d`} cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#344858" />
          <stop offset="100%" stopColor="#5e7888" />
        </radialGradient>
        {/* Colored pieces */}
        <radialGradient id={`${uid}-red`} cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#fca5a5" />
          <stop offset="100%" stopColor="#dc2626" />
        </radialGradient>
        {/* Highlighted piece (destination) — more clearly brighter than regular */}
        <radialGradient id={`${uid}-red-hi`} cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#fecece" />
          <stop offset="100%" stopColor="#ef4444" />
        </radialGradient>
        <radialGradient id={`${uid}-blk-l`} cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#94a3b8" />
          <stop offset="55%" stopColor="#475569" />
          <stop offset="100%" stopColor="#0f172a" />
        </radialGradient>
        <radialGradient id={`${uid}-blk-l-hi`} cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#c4d8ea" />
          <stop offset="55%" stopColor="#6a8898" />
          <stop offset="100%" stopColor="#1e3048" />
        </radialGradient>
        <radialGradient id={`${uid}-blk-d`} cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#6b7280" />
          <stop offset="55%" stopColor="#374151" />
          <stop offset="100%" stopColor="#030712" />
        </radialGradient>
        <radialGradient id={`${uid}-blk-d-hi`} cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#9298b0" />
          <stop offset="55%" stopColor="#4a5870" />
          <stop offset="100%" stopColor="#08121e" />
        </radialGradient>
        <radialGradient id={`${uid}-sel`} cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#fffbeb" />
          <stop offset="55%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#d97706" />
        </radialGradient>
        <radialGradient id={`${uid}-leg`} cx="50%" cy="50%" r="70%">
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
                rx={6}
                fill={fill}
              />
            );
          })
        )}

        {/* Slots */}
        {slots.map(renderSlot)}

        {/* Animated piece overlay — RAF drives translate+rotate; rect centered at origin */}
        {movingPiece && (() => {
          const rr = Math.round(SHORT / 2);
          const fillId = movingPiece.player === 'red'
            ? `url(#${uid}-red-hi)`
            : isDark ? `url(#${uid}-blk-d-hi)` : `url(#${uid}-blk-l-hi)`;
          const initAngle = movingPiece.fromAngle;
          return (
            <g
              ref={animGRef}
              transform={`translate(${movingPiece.fromCx} ${movingPiece.fromCy}) rotate(${initAngle})`}
              style={{ pointerEvents: 'none' }}
            >
              {/* Rect centered at origin; rotation pivots it around its center */}
              <rect
                x={-SHORT / 2}
                y={-LONG  / 2}
                width={SHORT}
                height={LONG}
                rx={rr}
                ry={rr}
                fill={fillId}
                stroke={C.emptyStroke}
                strokeWidth={1}
              />
            </g>
          );
        })()}
      </g>
    </svg>
  );
};
