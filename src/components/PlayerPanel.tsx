import React from 'react';
import type { Player, Move } from '../types';
import { formatTime } from '../gameLogic';

interface Props {
  player: Player;
  name: string;
  isActive: boolean;
  timeMs: number;
  lastMove: Move | null;
  moveIndex: number;
}

function formatMoveInfo(move: Move | null, idx: number): string {
  if (!move || idx === 0) return '000';
  const n = String(idx).padStart(3, '0');
  const to = `${move.to.line}${move.to.type}${move.to.slot}`;
  if (!move.from) {
    return `${n}. 000-${to}`;
  }
  const from = `${move.from.line}${move.from.type}${move.from.slot}`;
  return `${n}. ${from}-${to}`;
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
  const cell = 'px-2 py-0.5 rounded text-xs font-mono text-center border';

  return (
    <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border ${borderColor} ${isActive ? 'bg-gray-800 border-2' : 'bg-gray-900'}`}>
      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${isRed ? 'bg-red-500' : 'bg-gray-900 border-2 border-gray-400'}`} />

      <div className={`w-28 ${cell} font-bold ${isActive ? 'bg-cyan-900 text-cyan-200 border-cyan-500' : 'bg-gray-700 text-gray-300 border-gray-600'}`}>
        {name}
      </div>

      <div className={`w-40 ${cell} bg-gray-700 text-gray-300 border-gray-600`}>
        {formatMoveInfo(lastMove, moveIndex)}
      </div>

      <div className={`w-24 ${cell} font-bold ${timeMs < 60000 ? 'bg-red-900 text-red-300 border-red-500' : 'bg-gray-700 text-gray-200 border-gray-600'}`}>
        {formatTime(timeMs)}
      </div>
    </div>
  );
};
