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

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center py-6 gap-4">
      <FurukooLogo className="text-fuchsia-400" />

      {/* Player name inputs */}
      <div className="flex gap-6 items-center">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-red-500" />
          <input
            className="bg-gray-800 text-white border border-gray-600 rounded px-3 py-1 text-sm font-mono w-32 focus:outline-none focus:border-cyan-500"
            value={redName}
            onChange={(e) => setRedName(e.target.value)}
          />
        </div>
        <span className="text-gray-500 text-sm">vs</span>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-gray-400 border border-gray-500" />
          <input
            className="bg-gray-800 text-white border border-gray-600 rounded px-3 py-1 text-sm font-mono w-32 focus:outline-none focus:border-cyan-500"
            value={blackName}
            onChange={(e) => setBlackName(e.target.value)}
          />
        </div>
      </div>

      {/* Navigation + Resign */}
      <div className="flex gap-2 items-center">
        <button
          onClick={handleNavFirst}
          disabled={viewIndex === 0}
          className="px-3 py-1 rounded bg-gray-700 text-gray-200 text-lg disabled:opacity-30 hover:bg-gray-600 transition"
          title="First move"
        >⏮</button>
        <button
          onClick={handleNavPrev}
          disabled={viewIndex === 0}
          className="px-3 py-1 rounded bg-gray-700 text-gray-200 text-lg disabled:opacity-30 hover:bg-gray-600 transition"
          title="Previous move"
        >◀</button>
        <button
          onClick={handleNavNext}
          disabled={viewIndex >= history.length - 1}
          className="px-3 py-1 rounded bg-gray-700 text-gray-200 text-lg disabled:opacity-30 hover:bg-gray-600 transition"
          title="Next move"
        >▶</button>
        <button
          onClick={handleNavCurrent}
          disabled={isViewingCurrent}
          className="px-3 py-1 rounded bg-gray-700 text-gray-200 text-lg disabled:opacity-30 hover:bg-gray-600 transition"
          title="Current move"
        >⏭</button>
        <button
          onClick={handleResign}
          disabled={gameOver}
          className="px-4 py-1 rounded bg-red-800 text-red-200 text-sm font-bold disabled:opacity-30 hover:bg-red-700 transition ml-4"
        >Resign</button>
        {gameOver && (
          <button
            onClick={handleNewGame}
            className="px-4 py-1 rounded bg-green-800 text-green-200 text-sm font-bold hover:bg-green-700 transition ml-2"
          >New Game</button>
        )}
      </div>

      {/* Red player panel */}
      <PlayerPanel
        player="red"
        name={redName}
        isActive={isViewingCurrent && currentState.currentPlayer === 'red' && !gameOver}
        timeMs={currentState.redTimeMs}
        lastMove={redLastMove.move}
        moveIndex={redLastMove.idx}
      />

      {/* Board */}
      <Board
        pieces={viewedState.pieces}
        currentPlayer={currentState.currentPlayer}
        selectedSlot={selectedSlot}
        onSlotClick={handleSlotClick}
        disabled={boardDisabled}
        phase={currentState.phase}
      />

      {/* Status */}
      <div className="text-sm font-mono text-center min-h-6">
        {!isViewingCurrent ? (
          <span className="text-yellow-400">
            Viewing move {viewIndex} of {history.length - 1}
          </span>
        ) : (
          <span className={effectiveWinner ? 'text-green-400 font-bold text-base' : 'text-gray-400'}>
            {statusMsg}
          </span>
        )}
      </div>

      {/* Black player panel */}
      <PlayerPanel
        player="black"
        name={blackName}
        isActive={isViewingCurrent && currentState.currentPlayer === 'black' && !gameOver}
        timeMs={currentState.blackTimeMs}
        lastMove={blackLastMove.move}
        moveIndex={blackLastMove.idx}
      />
    </div>
  );
}
