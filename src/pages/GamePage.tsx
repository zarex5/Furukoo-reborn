import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../lib/socket';
import { Board } from '../components/Board';
import { PlayerPanel } from '../components/PlayerPanel';
import { PlayersBox, ChatBox, type OnlineUser, type ChatMsg } from '../components/RightPanel';
import { ResizableSplit } from '../components/ResizableSplit';
import { FurukooLogo } from '../components/FurukooLogo';
import { ConnectionBanner } from '../components/ConnectionBanner';
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
const fmtDelta = (n: number) => (n >= 0 ? '+' : '') + n;

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

  // History navigation
  const [stateHistory, setStateHistory] = useState<BoardState[]>([]);
  const [viewIndex,    setViewIndex]    = useState(-1); // -1 = latest

  // Local timer
  const [displayedState, setDisplayedState] = useState<BoardState | null>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef(Date.now());

  const addMsg = useCallback((m: Omit<ChatMsg, 'id'>) => {
    setMessages(prev => [...prev.slice(-199), { ...m, id: mkId() }]);
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !gameId) return;

    // Emit game:join now if already connected, and again on every (re)connect
    // so a page refresh or network blip never leaves the player stuck.
    const joinGame = () => socket.emit('game:join', gameId);
    socket.on('connect', joinGame);
    if (socket.connected) joinGame();

    const onStarted = (data: { red: GameMeta['red']; black: GameMeta['black']; eloInfo: GameMeta['eloInfo'] }) => {
      setGameMeta({ red: data.red, black: data.black, eloInfo: data.eloInfo });
      let color: Player | null = null;
      if (user?.username === data.red.username)   color = 'red';
      if (user?.username === data.black.username) color = 'black';
      setMyColor(color);
    };

    const onState = (g: BoardState) => {
      setGameState(g);
      setDisplayedState(g);
      setStateHistory(prev => [...prev, g]);
      setViewIndex(-1);
      lastTickRef.current = Date.now();
    };

    const onOver = (data: GameOver) => {
      setGameOver(data);
      if (user?.username === gameMeta?.red.username)   updateElo(data.newRedElo);
      if (user?.username === gameMeta?.black.username) updateElo(data.newBlackElo);
    };

    const onHistory = ({ messages }: { messages: Omit<ChatMsg, 'id'>[] }) =>
      setMessages(messages.map(m => ({ ...m, id: mkId() })));
    const onLobby = ({ users }: { users: OnlineUser[] }) => setLobbyUsers(users);
    const onChat  = (m: { type: 'system' | 'user'; username?: string; text: string; spectator?: boolean }) => addMsg(m);
    const onError = ({ message }: { message: string }) => { addMsg({ type: 'system', text: `Error: ${message}` }); navigate('/'); };

    socket.on('game:history', onHistory);
    socket.on('game:started', onStarted);
    socket.on('game:state',   onState);
    socket.on('game:over',    onOver);
    socket.on('lobby:state',  onLobby);
    socket.on('chat:game',    onChat);
    socket.on('game:error',   onError);

    return () => {
      socket.off('connect',      joinGame);
      socket.off('game:history', onHistory);
      socket.off('game:started', onStarted);
      socket.off('game:state',   onState);
      socket.off('game:over',    onOver);
      socket.off('lobby:state',  onLobby);
      socket.off('chat:game',    onChat);
      socket.off('game:error',   onError);
      socket.emit('game:leave', gameId);
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

  // History navigation
  const histLen  = stateHistory.length;
  const curIdx   = viewIndex === -1 ? histLen - 1 : viewIndex;
  const navFirst = () => histLen > 0 && setViewIndex(0);
  const navPrev  = () => setViewIndex(Math.max(0, curIdx - 1));
  const navNext  = () => { const ni = curIdx + 1; setViewIndex(ni >= histLen ? -1 : ni); };
  const navLast  = () => setViewIndex(-1);
  const isAtLatest = viewIndex === -1;
  const showPulse  = !isAtLatest && gameState?.currentPlayer === myColor && !gameOver;

  const viewedState = (viewIndex !== -1 && stateHistory[viewIndex]) ? stateHistory[viewIndex] : displayedState;

  const handleResign  = () => getSocket()?.emit('game:resign', { gameId });
  const handleSend    = (text: string) => getSocket()?.emit('game:chat', { gameId, text });
  const handleBack    = () => navigate('/');
  const handleSpectate = (gid: string) => navigate(`/game/${gid}`);

  if (!gameState || !gameMeta || !displayedState) {
    return (
      <div className={`${isDark ? 'dark' : ''} min-h-screen`}>
        <div className="min-h-screen bg-slate-100 dark:bg-gray-950 flex items-center justify-center text-slate-500 dark:text-gray-400 font-mono text-sm">
          Connecting to game…
        </div>
      </div>
    );
  }

  const redName      = gameMeta.red.username;
  const blackName    = gameMeta.black.username;
  const isSpectating = myColor === null;
  const boardDisabled = isSpectating || gameState.currentPlayer !== myColor || !!gameOver || viewIndex !== -1;

  const lastRedMove   = [...(viewedState?.moves ?? [])].reverse().find(m => m.player === 'red')   ?? null;
  const lastBlackMove = [...(viewedState?.moves ?? [])].reverse().find(m => m.player === 'black') ?? null;
  const redMoveIdx    = (viewedState?.moves ?? []).filter(m => m.player === 'red').length;
  const blackMoveIdx  = (viewedState?.moves ?? []).filter(m => m.player === 'black').length;

  const navBtnCls = 'px-2 py-0.5 rounded text-xs font-mono font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 disabled:opacity-30 transition';

  return (
    <div className={`${isDark ? 'dark' : ''} min-h-screen`}>
    <div className="min-h-screen bg-slate-100 dark:bg-gray-950 text-slate-800 dark:text-white flex flex-col">

      {/* Top bar — compact */}
      <div className="flex items-center gap-2 px-3 py-1 bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-700">
        <FurukooLogo />
        <div className="flex gap-2 ml-auto items-center">
          <span className="text-xs font-mono text-slate-400 dark:text-gray-500">
            {isSpectating
              ? `Spectating ${redName} vs ${blackName}`
              : `Playing against ${myColor === 'red' ? blackName : redName}`}
          </span>
          {isSpectating || gameOver
            ? <button onClick={handleBack}
                className="px-3 py-0.5 rounded text-xs font-bold bg-violet-600 text-white hover:bg-violet-700 transition">
                Back to Lobby
              </button>
            : <button onClick={handleResign}
                className="px-3 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 transition">
                Resign
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

      <ConnectionBanner />

      {/* Game over banner */}
      {gameOver && (
        <div className="mx-4 mt-2 px-4 py-1.5 rounded-lg bg-green-100 dark:bg-green-900/40 border border-green-300 dark:border-green-700 text-xs font-mono text-center">
          <span className="font-bold text-green-800 dark:text-green-300">{gameOver.winnerName} wins</span>
          {gameOver.reason === 'resign'     && ' (by resignation)'}
          {gameOver.reason === 'timeout'    && ' (on time)'}
          {gameOver.reason === 'disconnect' && ' (opponent disconnected)'}
          {'  ·  '}
          {redName}: <span className={gameOver.redDelta >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{fmtDelta(gameOver.redDelta)}</span> → {gameOver.newRedElo}
          {'  ·  '}
          {blackName}: <span className={gameOver.blackDelta >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{fmtDelta(gameOver.blackDelta)}</span> → {gameOver.newBlackElo}
        </div>
      )}

      {/* Disconnect countdown banner */}
      {!gameOver && displayedState?.disconnectedColor && displayedState.disconnectedAt && (
        <div className="mx-4 mt-2 px-4 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 text-xs font-mono text-center animate-pulse">
          <span className="font-bold text-amber-800 dark:text-amber-300">
            {displayedState.disconnectedColor === 'red' ? redName : blackName}
          </span>
          {' disconnected — '}
          <span className="font-bold text-amber-700 dark:text-amber-400">
            {Math.max(0, Math.ceil((60_000 - (Date.now() - displayedState.disconnectedAt)) / 1000))}s
          </span>
          {' to reconnect'}
        </div>
      )}

      {/* Main content — board 66% / right panel 34% */}
      <div className="flex flex-1 min-h-0 p-2 gap-2">

        {/* Board area */}
        <div className="flex flex-col gap-1.5 flex-none">
          <PlayerPanel player="red" name={redName}
            isActive={(viewedState ?? displayedState).currentPlayer === 'red' && !gameOver}
            timeMs={(viewedState ?? displayedState).redTimeMs}
            lastMove={lastRedMove} moveIndex={redMoveIdx} />
          <Board
            pieces={(viewedState ?? displayedState).pieces}
            currentPlayer={gameState.currentPlayer}
            selectedSlot={selectedSlot}
            onSlotClick={handleSlotClick}
            disabled={boardDisabled}
            phase={gameState.phase}
            isDark={isDark}
          />
          <PlayerPanel player="black" name={blackName}
            isActive={(viewedState ?? displayedState).currentPlayer === 'black' && !gameOver}
            timeMs={(viewedState ?? displayedState).blackTimeMs}
            lastMove={lastBlackMove} moveIndex={blackMoveIdx} />

          {/* History nav */}
          <div className="flex items-center gap-1">
            <button className={navBtnCls} onClick={navFirst} disabled={curIdx === 0} title="First move">⏮</button>
            <button className={navBtnCls} onClick={navPrev}  disabled={curIdx === 0} title="Previous move">◀</button>
            <button className={navBtnCls} onClick={navNext}  disabled={isAtLatest}   title="Next move">▶</button>
            <button
              className={`${navBtnCls} ${showPulse ? 'animate-pulse ring-2 ring-violet-400' : ''}`}
              onClick={navLast} disabled={isAtLatest} title="Latest move"
            >⏭</button>
            {!isAtLatest && (
              <span className="text-xs font-mono text-slate-400 dark:text-gray-500 ml-1">
                {curIdx + 1}/{histLen}
              </span>
            )}
          </div>

          {/* ELO preview */}
          {!gameOver && !isSpectating && myColor && gameMeta.eloInfo && (
            <div className="text-xs font-mono text-slate-400 dark:text-gray-500 text-center">
              win {fmtDelta(gameMeta.eloInfo[myColor].win)} / draw {fmtDelta(gameMeta.eloInfo[myColor].draw)} / loss {fmtDelta(gameMeta.eloInfo[myColor].loss)}
            </div>
          )}
        </div>

        {/* Right panel: players + chat */}
        <div className="flex-1 min-w-0 min-h-0">
          <ResizableSplit
            direction="vertical"
            initialFirstPct={40}
            first={<PlayersBox users={lobbyUsers} myUsername={user?.username ?? ''} gamePlayers={{ red: redName, black: blackName }} onSpectate={handleSpectate} />}
            second={<ChatBox messages={messages} onSend={handleSend} myUsername={user?.username ?? ''} />}
          />
        </div>

      </div>
    </div>
    </div>
  );
}
