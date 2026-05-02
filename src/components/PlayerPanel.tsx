import React from 'react';
import type { Player, Move } from '../types';
import { formatTime } from '../gameLogic';

interface Props {
  player: Player;
  name: string;
  isActive: boolean;
  timeMs: number;
  lastMove: Move | null;
  moveIndex: number; // 1-based index of this player's last move (0 if none)
}

function formatMoveInfo(move: Move | null, idx: number): string {
  if (!move || idx === 0) return '000';
  const n = String(idx).padStart(3, '0');
  if (!move.from) {
    return `${n} ${move.to.line}${move.to.type}${move.to.slot}`;
  }
  const from = `${move.from.line}${move.from.type}${move.from.slot}`;
  const to = `${move.to.line}${move.to.type}${move.to.slot}`;
  return `${n} ${from}-${to}`;
}

export const PlayerPanel: React.FC<Props> = ({
  player,
  name,
  isActive,
  timeMs,
  lastMove,
  moveIndex,
}) => {
  const isRed = player === 'red';
  const borderColor = isRed ? 'border-red-500' : 'border-gray-600';

  return (
    <div className={`flex items-center gap-3 px-4 py-2 rounded-lg border ${borderColor} ${isActive ? 'bg-gray-800 border-2' : 'bg-gray-900'}`}>
      {/* Color indicator */}
      <div
        className={`w-5 h-5 rounded-full flex-shrink-0 ${isRed ? 'bg-red-500' : 'bg-gray-800 border-2 border-gray-400'}`}
      />

      {/* Name — highlighted in cyan if active */}
      <div
        className={`w-32 px-2 py-1 rounded text-sm font-mono text-center font-bold border ${
          isActive ? 'bg-cyan-900 text-cyan-200 border-cyan-500' : 'bg-gray-700 text-gray-300 border-gray-600'
        }`}
      >
        {name}
      </div>

      {/* Last move info */}
      <div className="w-44 px-2 py-1 rounded text-sm font-mono text-center bg-gray-700 text-gray-300 border border-gray-600">
        {formatMoveInfo(lastMove, moveIndex)}
      </div>

      {/* Timer */}
      <div
        className={`w-28 px-2 py-1 rounded text-sm font-mono text-center font-bold border ${
          timeMs < 60000
            ? 'bg-red-900 text-red-300 border-red-500'
            : 'bg-gray-700 text-gray-200 border-gray-600'
        }`}
      >
        {formatTime(timeMs)}
      </div>
    </div>
  );
};
