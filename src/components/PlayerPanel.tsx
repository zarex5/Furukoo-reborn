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
  if (!move || idx === 0) return '001. -------';
  const n = String(idx).padStart(3, '0');
  const to = `${move.to.line}${move.to.type}${move.to.slot}`;
  if (!move.from) return `${n}. 000-${to}`;
  const from = `${move.from.line}${move.from.type}${move.from.slot}`;
  return `${n}. ${from}-${to}`;
}

export const PlayerPanel: React.FC<Props> = ({ player, name, isActive, timeMs, lastMove, moveIndex }) => {
  const isRed = player === 'red';
  const borderColor = isRed ? 'border-red-400 dark:border-red-500' : 'border-slate-400 dark:border-gray-600';
  const wrapBg = isActive
    ? 'bg-white dark:bg-gray-800 border-2'
    : 'bg-slate-50 dark:bg-gray-900';
  const cell = 'px-2 py-0.5 rounded text-xs font-mono text-center border';

  const nameCls = isActive
    ? 'bg-cyan-50 text-cyan-800 border-cyan-400 dark:bg-cyan-900 dark:text-cyan-200 dark:border-cyan-500'
    : 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600';

  const moveCls = 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600';

  const timeCls = timeMs < 60000
    ? 'bg-red-50 text-red-700 border-red-400 dark:bg-red-900 dark:text-red-300 dark:border-red-500'
    : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600';

  return (
    <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border ${borderColor} ${wrapBg}`}>
      <div
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={isRed ? { background: '#ef4444' } : { background: '#1e293b', border: '1.5px solid #475569' }}
      />
      <div className={`w-28 ${cell} font-bold ${nameCls}`}>{name}</div>
      <div className={`w-40 ${cell} ${moveCls}`}>{formatMoveInfo(lastMove, moveIndex)}</div>
      <div className={`w-24 ${cell} font-bold ${timeCls}`}>{formatTime(timeMs)}</div>
    </div>
  );
};
