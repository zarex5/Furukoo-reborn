import React, { useRef, useState, useEffect } from 'react';
import type { Player, Move } from '../types';
import { formatTime } from '../gameLogic';

interface Props {
  player: Player;
  name: string;
  isActive: boolean;
  timeMs: number;
  lastMove: Move | null;
  moveIndex: number;
  isWinner?: boolean;
  compact?: boolean;
  showPulse?: boolean;
  phase?: 'placement' | 'movement';
  piecesPlaced?: number;
  isDark?: boolean;
}

function formatMoveInfo(move: Move | null, idx: number): string {
  if (!move || idx === 0) return '001. -------';
  const n = String(idx).padStart(3, '0');
  const to = `${move.to.line}${move.to.type}${move.to.slot}`;
  if (!move.from) return `${n}. 000-${to}`;
  const from = `${move.from.line}${move.from.type}${move.from.slot}`;
  return `${n}. ${from}-${to}`;
}

function PlacementTracker({ player, piecesPlaced, isDark }: { player: Player; piecesPlaced: number; isDark: boolean }) {
  const isRed = player === 'red';
  const prevRef = useRef(piecesPlaced);
  const [showStrike, setShowStrike] = useState(false);

  useEffect(() => {
    if (piecesPlaced === 7 && prevRef.current !== 7) setShowStrike(true);
    prevRef.current = piecesPlaced;
  }, [piecesPlaced]);

  const pieceColor = isRed ? '#ef4444' : (isDark ? '#1e293b' : '#334155');
  const pieceBorder = isRed ? '#b91c1c' : (isDark ? '#475569' : '#64748b');
  const emptyColor = isDark ? '#374151' : '#e2e8f0';
  const emptyBorder = isDark ? '#6b7280' : '#94a3b8';
  const lineColor = isDark ? '#6b7280' : '#94a3b8';

  return (
    <div className="relative flex items-center gap-0.5 justify-center px-1">
      {Array.from({ length: 7 }, (_, i) => {
        const hasPiece = i >= piecesPlaced;
        return (
          <div
            key={i}
            style={{
              width: 8, height: 12,
              borderRadius: 2,
              background: hasPiece ? pieceColor : emptyColor,
              border: `1px solid ${hasPiece ? pieceBorder : emptyBorder}`,
              flexShrink: 0,
            }}
          />
        );
      })}
      {showStrike && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 4,
            height: 2,
            background: lineColor,
            animation: 'strike 300ms ease-out forwards',
            width: 0,
            transform: 'translateY(-50%)',
          }}
        />
      )}
    </div>
  );
}

export const PlayerPanel: React.FC<Props> = ({
  player, name, isActive, timeMs, lastMove, moveIndex,
  isWinner, compact = false, showPulse = false,
  phase, piecesPlaced = 0, isDark = false,
}) => {
  const isRed = player === 'red';
  const borderColor = isRed ? 'border-red-400 dark:border-red-500' : 'border-slate-400 dark:border-gray-600';
  const wrapBg = isActive
    ? 'bg-white dark:bg-gray-800'
    : 'bg-slate-50 dark:bg-gray-900 opacity-40';
  const cell = 'px-2 py-0.5 rounded text-xs font-mono text-center border';

  const nameCls = isActive
    ? 'bg-cyan-50 text-cyan-800 border-cyan-400 dark:bg-cyan-900 dark:text-cyan-200 dark:border-cyan-500'
    : 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600';

  const moveCls = 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600';

  const timeCls = timeMs < 60000
    ? 'bg-red-50 text-red-700 border-red-400 dark:bg-red-900 dark:text-red-300 dark:border-red-500'
    : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600';

  const activeStyle: React.CSSProperties = isActive
    ? { boxShadow: 'inset 0 0 0 2px #22d3ee' }
    : {};

  const pulseClass = showPulse ? 'animate-pulse' : '';

  const moveCell = phase === 'placement'
    ? <div className={`w-40 ${cell} ${moveCls} overflow-hidden`}><PlacementTracker player={player} piecesPlaced={piecesPlaced} isDark={isDark} /></div>
    : <div className={`w-40 ${cell} ${moveCls}`}>{formatMoveInfo(lastMove, moveIndex)}</div>;

  const moveCellCompact = phase === 'placement'
    ? <div className={`w-28 flex-shrink-0 ${cell} ${moveCls} overflow-hidden`}><PlacementTracker player={player} piecesPlaced={piecesPlaced} isDark={isDark} /></div>
    : <div className={`w-28 flex-shrink-0 ${cell} ${moveCls} truncate`}>{formatMoveInfo(lastMove, moveIndex)}</div>;

  if (compact) {
    return (
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border ${borderColor} ${wrapBg} ${pulseClass}`}
        style={activeStyle}
      >
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={isRed ? { background: '#ef4444' } : { background: '#1e293b', border: '1.5px solid #475569' }}
        />
        <div className={`flex-1 min-w-0 ${cell} font-bold ${nameCls} truncate`}>
          {isWinner && <span className="mr-1">👑</span>}{name}
        </div>
        {moveCellCompact}
        <div className={`w-20 flex-shrink-0 ${cell} font-bold ${timeCls}`}>{formatTime(timeMs)}</div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1 rounded-lg border ${borderColor} ${wrapBg} ${pulseClass}`}
      style={activeStyle}
    >
      <div
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={isRed ? { background: '#ef4444' } : { background: '#1e293b', border: '1.5px solid #475569' }}
      />
      <div className={`w-28 ${cell} font-bold ${nameCls}`}>
        {isWinner && <span className="mr-1">👑</span>}{name}
      </div>
      {moveCell}
      <div className={`w-24 ${cell} font-bold ${timeCls}`}>{formatTime(timeMs)}</div>
    </div>
  );
};
