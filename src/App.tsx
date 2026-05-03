import { useState, useEffect, useCallback, useRef } from 'react';
import { Board } from './components/Board';
import { PlayerPanel } from './components/PlayerPanel';
import { FurukooLogo } from './components/FurukooLogo';
import type { SlotId, Player, BoardState } from './types';
import { slotKey } from './types';
import {
  createInitialState,
  applyMove,
  legalMoves,
  PIECES_PER_PLAYER,
} from './gameLogic';

export default function App() {
  const [isDark, setIsDark] = useState(false);
  const [redName, setRedName] = useState('Player 1');
  const [blackName, setBlackName] = useState('Player 2');

  // Full history of states (index 0 = initial)
  const [history, setHistory] = useState<BoardState[]>([createInitialState()]);
  // Which state we're currently viewing
  const [viewIndex, setViewIndex] = useState(0);
  // Selected slot for movement
  const [selectedSlot, setSelectedSlot] = useState<SlotId | null>(null);

  const isViewingCurrent = viewIndex === history.length - 1;
  const currentState = history[history.length - 1];
  const viewedState = history[viewIndex];

  // Timer: tick every 100ms when game is live
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef<number>(Date.now());

  const gameOver =
    currentState.winner !== null ||
    currentState.resignedBy !== null ||
    currentState.redTimeMs <= 0 ||
    currentState.blackTimeMs <= 0;

  const timerWinner: Player | null =
    currentState.redTimeMs <= 0
      ? 'black'
      : currentState.blackTimeMs <= 0
      ? 'red'
      : null;

  useEffect(() => {
    if (gameOver) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;

      setHistory((prev) => {
        const last = prev[prev.length - 1];
        if (last.winner || last.resignedBy) return prev;
        const updated: BoardState = {
          ...last,
          redTimeMs:
            last.currentPlayer === 'red'
              ? Math.max(0, last.redTimeMs - elapsed)
              : last.redTimeMs,
          blackTimeMs:
            last.currentPlayer === 'black'
              ? Math.max(0, last.blackTimeMs - elapsed)
              : last.blackTimeMs,
        };
        return [...prev.slice(0, -1), updated];
      });
    }, 100);

    lastTickRef.current = Date.now();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameOver, currentState.currentPlayer]);

  const handleSlotClick = useCallback(
    (slot: SlotId) => {
      if (!isViewingCurrent || gameOver) return;
      const state = currentState;
      const key = slotKey(slot);

      if (state.phase === 'placement') {
        if (state.pieces[key]) return;
        const newState = applyMove(state, slot, null);
        setHistory((prev) => [...prev, newState]);
        setViewIndex((i) => i + 1);
        return;
      }

      // Movement phase
      if (selectedSlot) {
        const selectedKey = slotKey(selectedSlot);
        if (selectedKey === key) {
          setSelectedSlot(null);
          return;
        }
        const legal = legalMoves(selectedSlot, state.pieces);
        if (legal.some((s) => slotKey(s) === key)) {
          const newState = applyMove(state, slot, selectedSlot);
          setHistory((prev) => [...prev, newState]);
          setViewIndex((i) => i + 1);
          setSelectedSlot(null);
          return;
        }
        if (state.pieces[key] === state.currentPlayer) {
          setSelectedSlot(slot);
          return;
        }
        setSelectedSlot(null);
        return;
      }

      if (state.pieces[key] === state.currentPlayer) {
        setSelectedSlot(slot);
      }
    },
    [currentState, selectedSlot, isViewingCurrent, gameOver]
  );

  const handleResign = () => {
    if (gameOver) return;
    const state = currentState;
    const newState: BoardState = {
      ...state,
      resignedBy: state.currentPlayer,
      winner: state.currentPlayer === 'red' ? 'black' : 'red',
    };
    setHistory((prev) => [...prev, newState]);
    setViewIndex((i) => i + 1);
    setSelectedSlot(null);
  };

  const handleNavFirst = () => { setViewIndex(0); setSelectedSlot(null); };
  const handleNavPrev = () => { setViewIndex((i) => Math.max(0, i - 1)); setSelectedSlot(null); };
  const handleNavNext = () => { setViewIndex((i) => Math.min(history.length - 1, i + 1)); setSelectedSlot(null); };
  const handleNavCurrent = () => { setViewIndex(history.length - 1); setSelectedSlot(null); };

  const handleNewGame = () => {
    setHistory([createInitialState()]);
    setViewIndex(0);
    setSelectedSlot(null);
  };

  function getPlayerLastMove(player: Player) {
    const playerMoves = currentState.moves.filter((m) => m.player === player);
    if (playerMoves.length === 0) return { move: null, idx: 0 };
    return { move: playerMoves[playerMoves.length - 1], idx: playerMoves.length };
  }

  const redLastMove = getPlayerLastMove('red');
  const blackLastMove = getPlayerLastMove('black');

  const effectiveWinner = currentState.winner ?? timerWinner;
  const winnerName =
    effectiveWinner === 'red' ? redName : effectiveWinner === 'black' ? blackName : null;

  let statusMsg = '';
  if (effectiveWinner) {
    if (currentState.resignedBy) {
      statusMsg = `${effectiveWinner === 'red' ? blackName : redName} resigned. ${winnerName} wins!`;
    } else if (timerWinner) {
      statusMsg = `Time's up! ${winnerName} wins!`;
    } else {
      statusMsg = `${winnerName} wins by completing a square!`;
    }
  } else if (currentState.phase === 'placement') {
    const player = currentState.currentPlayer;
    const placed = player === 'red' ? currentState.redPlaced : currentState.blackPlaced;
    statusMsg = `${player === 'red' ? redName : blackName}: place piece ${placed + 1} of ${PIECES_PER_PLAYER}`;
  } else {
    statusMsg = `${currentState.currentPlayer === 'red' ? redName : blackName}'s turn to move`;
  }

  const boardDisabled = !isViewingCurrent || gameOver;

  const btnBase = `px-2 py-0.5 rounded text-base disabled:opacity-30 transition
    bg-slate-200 text-slate-700 hover:bg-slate-300
    dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600`;

  return (
    <div className={`${isDark ? 'dark' : ''} min-h-screen`}>
    <div className="min-h-screen bg-slate-100 text-slate-800 dark:bg-gray-950 dark:text-white flex flex-col items-center py-2 gap-1.5 relative">
      {/* Dark mode toggle — top right */}
      <button
        onClick={() => setIsDark((d) => !d)}
        className="absolute top-2 right-3 text-lg select-none"
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >{isDark ? '☀️' : '🌙'}</button>

      <FurukooLogo className={isDark ? 'text-fuchsia-400' : 'text-fuchsia-600'} />

      {/* Player name inputs */}
      <div className="flex gap-4 items-center">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" />
          <input
            className="bg-white text-slate-800 border border-slate-300 rounded px-2 py-0.5 text-xs font-mono w-28 focus:outline-none focus:border-cyan-500 dark:bg-gray-800 dark:text-white dark:border-gray-600"
            value={redName}
            onChange={(e) => setRedName(e.target.value)}
          />
        </div>
        <span className="text-slate-400 dark:text-gray-500 text-xs">vs</span>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: '#1e293b', border: '1.5px solid #475569' }} />
          <input
            className="bg-white text-slate-800 border border-slate-300 rounded px-2 py-0.5 text-xs font-mono w-28 focus:outline-none focus:border-cyan-500 dark:bg-gray-800 dark:text-white dark:border-gray-600"
            value={blackName}
            onChange={(e) => setBlackName(e.target.value)}
          />
        </div>
      </div>

      {/* Navigation + Resign */}
      <div className="flex gap-1.5 items-center">
        <button onClick={handleNavFirst}   disabled={viewIndex === 0}                 className={btnBase} title="First move">⏮</button>
        <button onClick={handleNavPrev}    disabled={viewIndex === 0}                 className={btnBase} title="Previous move">◀</button>
        <button onClick={handleNavNext}    disabled={viewIndex >= history.length - 1} className={btnBase} title="Next move">▶</button>
        <button onClick={handleNavCurrent} disabled={isViewingCurrent}                className={btnBase} title="Current move">⏭</button>
        <button onClick={handleResign} disabled={gameOver}
          className="px-2 py-0.5 rounded text-xs font-bold disabled:opacity-30 transition ml-3 bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-800 dark:text-red-200 dark:hover:bg-red-700"
        >Resign</button>
        {gameOver && (
          <button onClick={handleNewGame}
            className="px-2 py-0.5 rounded text-xs font-bold transition bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-800 dark:text-green-200 dark:hover:bg-green-700"
          >New Game</button>
        )}
      </div>

      {/* Red player panel */}
      <PlayerPanel player="red" name={redName}
        isActive={isViewingCurrent && currentState.currentPlayer === 'red' && !gameOver}
        timeMs={currentState.redTimeMs} lastMove={redLastMove.move} moveIndex={redLastMove.idx} />

      {/* Board */}
      <Board
        pieces={viewedState.pieces} currentPlayer={currentState.currentPlayer}
        selectedSlot={selectedSlot} onSlotClick={handleSlotClick}
        disabled={boardDisabled} phase={currentState.phase} isDark={isDark}
      />

      {/* Black player panel */}
      <PlayerPanel player="black" name={blackName}
        isActive={isViewingCurrent && currentState.currentPlayer === 'black' && !gameOver}
        timeMs={currentState.blackTimeMs} lastMove={blackLastMove.move} moveIndex={blackLastMove.idx} />

      {/* Status — last element */}
      <div className="text-xs font-mono text-center min-h-5">
        {!isViewingCurrent ? (
          <span className="text-yellow-600 dark:text-yellow-400">Viewing move {viewIndex} of {history.length - 1}</span>
        ) : (
          <span className={effectiveWinner ? 'text-green-600 dark:text-green-400 font-bold' : 'text-slate-500 dark:text-gray-400'}>{statusMsg}</span>
        )}
      </div>
    </div>
    </div>
  );
}
