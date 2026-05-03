import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../lib/socket';
import { Board } from '../components/Board';
import { PlayerPanel } from '../components/PlayerPanel';
import { RightPanel, type OnlineUser, type ChatMsg } from '../components/RightPanel';
import { FurukooLogo } from '../components/FurukooLogo';
import type { SlotId, Player, BoardState } from '../types';
import { slotKey } from '../types';
import { legalMoves } from '../gameLogic';

interface GameMeta {
  red:   { username: string; elo: number };
  black: { username: string; elo: number };
  eloInfo: {
    red:   { win: number; draw: number; loss: number };
    black: { win: number; draw: number; loss: number };
  };
}

interface GameOver {
  winner: Player;
  reason: string;
  winnerName: string;
  redDelta: number; blackDelta: number;
  newRedElo: number; newBlackElo: number;
}

let msgId = 0;
const mkId = () => String(++msgId);

export default function GamePage() {
  const { gameId }    = useParams<{ gameId: string }>();
  const { user, updateElo } = useAuth();
  const navigate      = useNavigate();

  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark');
  const toggleDark = () => setIsDark(d => { const n = !d; localStorage.setItem('theme', n ? 'dark' : 'light'); return n; });

  const [gameState,  setGameState]  = useState<BoardState | null>(null);
  const [gameMeta,   setGameMeta]   = useState<GameMeta | null>(null);
  const [gameOver,   setGameOver]   = useState<GameOver | null>(null);
  const [myColor,    setMyColor]    = useState<Player | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotId | null>(null);
  const [lobbyUsers, setLobbyUsers] = useState<OnlineUser[]>([]);
  const [messages,   setMessages]   = useState<ChatMsg[]>([]);

  // Local timer (ticks from last received server state)
  const [displayedState, setDisplayedState] = useState<BoardState | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef(Date.now());

  const addMsg = useCallback((m: Omit<ChatMsg, 'id'>) => {
    setMessages(prev => [...prev.slice(-199), { ...m, id: mkId() }]);
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !gameId) return;

    // Join/rejoin the game room
    socket.emit('game:join', gameId);

    const onStarted = (data: { red: GameMeta['red']; black: GameMeta['black']; eloInfo: GameMeta['eloInfo'] }) => {
      setGameMeta({ red: data.red, black: data.black, eloInfo: data.eloInfo });
      if (user?.username === data.red.username)   setMyColor('red');
      if (user?.username === data.black.username) setMyColor('black');
    };

    const onState = (g: BoardState) => {
      setGameState(g);
      setDisplayedState(g);
      lastTickRef.current = Date.now();
    };

    const onOver = (data: GameOver) => {
      setGameOver(data);
      if (user?.username === gameMeta?.red.username)   updateElo(data.newRedElo);
      if (user?.username === gameMeta?.black.username) updateElo(data.newBlackElo);
    };

    const onLobby = ({ users }: { users: OnlineUser[] }) => setLobbyUsers(users);
    const onChat  = (m: { type: 'system' | 'user'; username?: string; text: string }) => addMsg(m);
    const onError = ({ message }: { message: string }) => { addMsg({ type: 'system', text: `Error: ${message}` }); navigate('/'); };

    socket.on('game:started', onStarted);
    socket.on('game:state',   onState);
    socket.on('game:over',    onOver);
    socket.on('lobby:state',  onLobby);
    socket.on('chat:game',    onChat);
    socket.on('game:error',   onError);

    return () => {
      socket.off('game:started', onStarted);
      socket.off('game:state',   onState);
      socket.off('game:over',    onOver);
      socket.off('lobby:state',  onLobby);
      socket.off('chat:game',    onChat);
      socket.off('game:error',   onError);
    };
  }, [gameId, addMsg, navigate, user?.username]); // eslint-disable-line react-hooks/exhaustive-deps

  // Local timer tick
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!displayedState || displayedState.winner) return;

    timerRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;

      setDisplayedState(prev => {
        if (!prev || prev.winner) return prev;
        const updated: BoardState = {
          ...prev,
          redTimeMs:   prev.currentPlayer === 'red'   ? Math.max(0, prev.redTimeMs   - elapsed) : prev.redTimeMs,
          blackTimeMs: prev.currentPlayer === 'black' ? Math.max(0, prev.blackTimeMs - elapsed) : prev.blackTimeMs,
        };
        // Report own timeout to server
        if (myColor && updated[myColor === 'red' ? 'redTimeMs' : 'blackTimeMs'] <= 0) {
          getSocket()?.emit('game:timeout', { gameId });
        }
        return updated;
      });
    }, 100);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [displayedState?.currentPlayer, !!displayedState?.winner, gameId, myColor]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSlotClick = useCallback((slot: SlotId) => {
    if (!gameState || !myColor || gameState.currentPlayer !== myColor || gameOver) return;
    const socket = getSocket();
    if (!socket) return;
    const key = slotKey(slot);

    if (gameState.phase === 'placement') {
      if (gameState.pieces[key]) return;
      socket.emit('game:move', { gameId, to: slot, from: null });
      return;
    }

    // Movement phase
    if (selectedSlot) {
      const selKey = slotKey(selectedSlot);
      if (selKey === key) { setSelectedSlot(null); return; }
      const legal = legalMoves(selectedSlot, gameState.pieces);
      if (legal.some(s => slotKey(s) === key)) {
        socket.emit('game:move', { gameId, to: slot, from: selectedSlot });
        setSelectedSlot(null);
        return;
      }
      if (gameState.pieces[key] === myColor) { setSelectedSlot(slot); return; }
      setSelectedSlot(null);
      return;
    }
    if (gameState.pieces[key] === myColor) setSelectedSlot(slot);
  }, [gameState, myColor, selectedSlot, gameOver, gameId]);

  const handleResign = () => getSocket()?.emit('game:resign', { gameId });
  const handleSend   = (text: string) => getSocket()?.emit('game:chat', { gameId, text });
  const handleBack   = () => navigate('/');

  if (!gameState || !gameMeta || !displayedState) {
    return (
      <div className={`${isDark ? 'dark' : ''} min-h-screen`}>
        <div className="min-h-screen bg-slate-100 dark:bg-gray-950 flex items-center justify-center text-slate-500 dark:text-gray-400 font-mono text-sm">
          Connecting to game…
        </div>
      </div>
    );
  }

  const redName   = gameMeta.red.username;
  const blackName = gameMeta.black.username;
  const boardDisabled = gameState.currentPlayer !== myColor || !!gameOver;

  const lastRedMove   = [...gameState.moves].reverse().find(m => m.player === 'red')   ?? null;
  const lastBlackMove = [...gameState.moves].reverse().find(m => m.player === 'black') ?? null;
  const redMoveIdx    = gameState.moves.filter(m => m.player === 'red').length;
  const blackMoveIdx  = gameState.moves.filter(m => m.player === 'black').length;

  const fmt = (n: number) => (n >= 0 ? '+' : '') + n;

  return (
    <div className={`${isDark ? 'dark' : ''} min-h-screen`}>
    <div className="min-h-screen bg-slate-100 dark:bg-gray-950 text-slate-800 dark:text-white flex flex-col">

      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-700 flex-wrap">
        <FurukooLogo />
        <span className="text-xs font-mono text-slate-400 dark:text-gray-500 ml-1">
          {redName} vs {blackName}
        </span>
        <div className="flex gap-2 ml-auto items-center">
          {!gameOver
            ? <button onClick={handleResign}
                className="px-3 py-1 rounded text-xs font-bold bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 transition">
                Resign
              </button>
            : <button onClick={handleBack}
                className="px-3 py-1 rounded text-xs font-bold bg-violet-600 text-white hover:bg-violet-700 transition">
                Back to Lobby
              </button>
          }
          <button role="switch" aria-checked={isDark} onClick={toggleDark}
            className="flex items-center gap-1.5 focus:outline-none select-none">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isDark ? '#a78bfa' : '#475569'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
            <span className={`relative inline-block w-8 h-4 rounded-full transition-colors ${isDark ? 'bg-violet-500' : 'bg-slate-300'}`}>
              <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${isDark ? 'translate-x-4' : ''}`} />
            </span>
          </button>
        </div>
      </div>

      {/* Game over banner */}
      {gameOver && (
        <div className="mx-4 mt-3 px-4 py-2 rounded-lg bg-green-100 dark:bg-green-900/40 border border-green-300 dark:border-green-700 text-sm font-mono text-center">
          <span className="font-bold text-green-800 dark:text-green-300">{gameOver.winnerName} wins</span>
          {gameOver.reason === 'resign' && ' (by resignation)'}
          {gameOver.reason === 'timeout' && ' (on time)'}
          {'  ·  '}
          {redName}: <span className={gameOver.redDelta >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{fmt(gameOver.redDelta)}</span> → {gameOver.newRedElo}
          {'  ·  '}
          {blackName}: <span className={gameOver.blackDelta >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{fmt(gameOver.blackDelta)}</span> → {gameOver.newBlackElo}
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 gap-4 p-4 min-h-0 items-start">

        {/* Left: board */}
        <div className="flex flex-col gap-1.5 flex-none">
          <PlayerPanel player="red" name={redName}
            isActive={displayedState.currentPlayer === 'red' && !gameOver}
            timeMs={displayedState.redTimeMs}
            lastMove={lastRedMove} moveIndex={redMoveIdx} />
          <Board
            pieces={displayedState.pieces}
            currentPlayer={gameState.currentPlayer}
            selectedSlot={selectedSlot}
            onSlotClick={handleSlotClick}
            disabled={boardDisabled}
            phase={gameState.phase}
            isDark={isDark}
          />
          <PlayerPanel player="black" name={blackName}
            isActive={displayedState.currentPlayer === 'black' && !gameOver}
            timeMs={displayedState.blackTimeMs}
            lastMove={lastBlackMove} moveIndex={blackMoveIdx} />

          {/* ELO preview */}
          {!gameOver && myColor && gameMeta.eloInfo && (
            <div className="text-xs font-mono text-slate-400 dark:text-gray-500 text-center">
              You ({myColor === 'red' ? redName : blackName}) · win {fmt(gameMeta.eloInfo[myColor].win)} / draw {fmt(gameMeta.eloInfo[myColor].draw)} / loss {fmt(gameMeta.eloInfo[myColor].loss)}
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="flex-1 min-w-0" style={{ minHeight: 460 }}>
          <RightPanel
            users={lobbyUsers} messages={messages} onSend={handleSend}
            myUsername={user?.username ?? ''} isDark={isDark}
            gamePlayers={{ red: redName, black: blackName }}
          />
        </div>
      </div>
    </div>
    </div>
  );
}
