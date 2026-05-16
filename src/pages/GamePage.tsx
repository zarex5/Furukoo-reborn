import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../lib/socket';
import { useChatMessages } from '../lib/chatStore';
import { Board } from '../components/Board';
import { PlayerPanel } from '../components/PlayerPanel';
import { PlayersBox, ChatBox, type OnlineUser } from '../components/RightPanel';
import { ResizableSplit } from '../components/ResizableSplit';
import { FurukooLogo } from '../components/FurukooLogo';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { DarkToggle } from '../components/DarkToggle';
import { useDarkMode } from '../lib/darkMode';
import type { SlotId, Player, BoardState } from '../types';
import { slotKey } from '../types';
import { legalMoves, applyMove, INITIAL_TIME_MS } from '../gameLogic';
import { useMemo } from 'react';

interface GameMeta {
  red:   { username: string; elo: number };
  black: { username: string; elo: number };
  eloInfo: {
    red:   { win: number; draw: number; loss: number };
    black: { win: number; draw: number; loss: number };
  };
}

interface GameOver {
  winner: Player | 'draw';
  reason: string;
  winnerName: string | null;
  redDelta: number; blackDelta: number;
  newRedElo: number; newBlackElo: number;
}

const fmtDelta = (n: number) => (n >= 0 ? '+' : '') + n;

function buildHistoryFromMoves(finalState: BoardState): BoardState[] {
  const moves = finalState.moves;
  const initial: BoardState = {
    pieces: {}, currentPlayer: 'red',
    redPlaced: 0, blackPlaced: 0, phase: 'placement',
    redTimeMs: INITIAL_TIME_MS, blackTimeMs: INITIAL_TIME_MS,
    moves: [], winner: null, resignedBy: null, drawnBy: null,
    disconnectedColor: null, disconnectedAt: null,
  };
  const history: BoardState[] = [initial];
  let state = initial;
  for (const move of moves) {
    state = applyMove(state, move.to, move.from ?? null);
    history.push(state);
  }
  // Replace the last entry with the real final state (has accurate times/winner)
  history[history.length - 1] = finalState;
  return history;
}

export default function GamePage() {
  const { gameId }    = useParams<{ gameId: string }>();
  const { user, isMuted, updateElo, soundEnabled, setSoundEnabled } = useAuth();
  const navigate      = useNavigate();

  const { isDark, toggleDark } = useDarkMode();

  const [gameState,  setGameState]  = useState<BoardState | null>(null);
  const [gameMeta,   setGameMeta]   = useState<GameMeta | null>(null);
  const [gameOver,   setGameOver]   = useState<GameOver | null>(null);
  const [myColor,    setMyColor]    = useState<Player | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotId | null>(null);
  const [lobbyUsers, setLobbyUsers] = useState<OnlineUser[]>([]);
  const [myTurnIdleMs, setMyTurnIdleMs] = useState(0);
  const lastMoveTimeRef = useRef<number>(Date.now());
  const prevMovesLengthRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(soundEnabled);
  const messages = useChatMessages();

  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  function playMoveSound(type: 'place' | 'move') {
    if (!soundEnabledRef.current) return;
    try {
      const ctx = audioCtxRef.current ??= new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = type === 'place' ? 800 : 600;
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch { /* AudioContext may be blocked before user gesture */ }
  }

  // History navigation — persisted in sessionStorage so refresh doesn't lose it
  const [stateHistory, setStateHistory] = useState<BoardState[]>(() => {
    try {
      const saved = sessionStorage.getItem(`history:${gameId}`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [viewIndex, setViewIndex] = useState(-1); // -1 = latest

  useEffect(() => {
    if (gameId && stateHistory.length > 0)
      sessionStorage.setItem(`history:${gameId}`, JSON.stringify(stateHistory));
  }, [stateHistory, gameId]);

  // Local timer
  const [displayedState, setDisplayedState] = useState<BoardState | null>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef(Date.now());

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
      setStateHistory(prev => {
        // If the incoming state has moves we haven't seen, rebuild history from scratch
        if (g.moves.length > 0 && prev.length < g.moves.length) {
          return buildHistoryFromMoves(g);
        }
        const last = prev[prev.length - 1];
        if (last && last.moves.length === g.moves.length) return [...prev.slice(0, -1), g];
        return [...prev, g];
      });
      setViewIndex(-1);
      lastTickRef.current = Date.now();
      lastMoveTimeRef.current = Date.now();
      setMyTurnIdleMs(0);
      if (g.moves.length > prevMovesLengthRef.current) {
        const last = g.moves[g.moves.length - 1];
        playMoveSound(last.from ? 'move' : 'place');
      }
      prevMovesLengthRef.current = g.moves.length;
    };

    const onOver = (data: GameOver) => {
      setGameOver(data);
      if (user?.username === gameMeta?.red.username)   updateElo(data.newRedElo);
      if (user?.username === gameMeta?.black.username) updateElo(data.newBlackElo);
    };

    const onLobby = ({ users }: { users: OnlineUser[] }) => setLobbyUsers(users);
    const onError = ({ message: _msg }: { message: string }) => { navigate('/'); };

    socket.on('game:started', onStarted);
    socket.on('game:state',   onState);
    socket.on('game:over',    onOver);
    socket.on('lobby:state',  onLobby);
    socket.on('game:error',   onError);

    return () => {
      socket.off('connect',      joinGame);
      socket.off('game:started', onStarted);
      socket.off('game:state',   onState);
      socket.off('game:over',    onOver);
      socket.off('lobby:state',  onLobby);
      socket.off('game:error',   onError);
      socket.emit('game:leave', gameId);
    };
  }, [gameId, navigate, user?.username]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Idle turn tracker — drives "my turn" pulse after 5s and piece pulse after 15s
  useEffect(() => {
    if (!myColor || gameOver || gameState?.currentPlayer !== myColor || gameState?.winner) {
      setMyTurnIdleMs(0);
      return;
    }
    const id = setInterval(() => setMyTurnIdleMs(Date.now() - lastMoveTimeRef.current), 1000);
    return () => clearInterval(id);
  }, [myColor, gameState?.currentPlayer, !!gameState?.winner, !!gameOver]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const navNext  = () => { const ni = curIdx + 1; setViewIndex(ni >= histLen - 1 ? -1 : ni); };
  const navLast  = () => setViewIndex(-1);
  const isAtLatest = viewIndex === -1;
  const showPulse  = !isAtLatest && !gameOver && gameState?.currentPlayer === myColor;

  const viewedState = (viewIndex !== -1 && stateHistory[viewIndex]) ? stateHistory[viewIndex] : displayedState;

  // Banner: prefer gameOver (has ELO deltas) but fall back to gameState fields for spectators/reviewers
  const resultWinner  = gameOver?.winner  ?? gameState?.winner  ?? null;
  const resultName    = gameOver?.winnerName ?? (resultWinner === 'red' ? gameMeta?.red.username : resultWinner === 'black' ? gameMeta?.black.username : null);
  const resultReason  = gameOver?.reason  ?? (gameState?.resignedBy ? 'resign' : gameState?.drawnBy === 'repetition' ? 'repetition' : null);
  const resultRedDelta   = gameOver?.redDelta   ?? gameState?.redEloDelta   ?? null;
  const resultBlackDelta = gameOver?.blackDelta ?? gameState?.blackEloDelta ?? null;
  const resultRedElo     = gameOver?.newRedElo  ?? gameState?.redEloAfter   ?? null;
  const resultBlackElo   = gameOver?.newBlackElo ?? gameState?.blackEloAfter ?? null;
  const showResult    = !!resultWinner;

  const handleResign  = () => getSocket()?.emit('game:resign', { gameId });
  const handleSend    = (text: string) => getSocket()?.emit('chat:send', { text, origin: gameId });
  const handleBack    = () => navigate('/');
  const handleSpectate = (gid: string) => navigate(`/game/${gid}`);

  if (!gameState || !gameMeta || !displayedState) {
    return (
      <div className={`${isDark ? 'dark' : ''} h-screen overflow-hidden`}>
        <div className="h-full bg-slate-100 dark:bg-gray-950 flex items-center justify-center text-slate-500 dark:text-gray-400 font-mono text-sm">
          Connecting to game…
        </div>
      </div>
    );
  }

  const redName      = gameMeta.red.username;
  const blackName    = gameMeta.black.username;
  const isSpectating = myColor === null || !!gameState.winner;
  const boardDisabled = isSpectating || gameState.currentPlayer !== myColor || !!gameOver || viewIndex !== -1;

  const lastRedMove   = [...(viewedState?.moves ?? [])].reverse().find(m => m.player === 'red')   ?? null;
  const lastBlackMove = [...(viewedState?.moves ?? [])].reverse().find(m => m.player === 'black') ?? null;
  const redMoveIdx    = (viewedState?.moves ?? []).filter(m => m.player === 'red').length;
  const blackMoveIdx  = (viewedState?.moves ?? []).filter(m => m.player === 'black').length;

  // Show current player's panel at top; spectators see red on top
  const topPlayer:    Player = myColor ?? 'red';
  const bottomPlayer: Player = topPlayer === 'red' ? 'black' : 'red';

  const activeBoardLastMove = useMemo(() => {
    if (!gameState?.moves.length) return null;
    const last = gameState.moves[gameState.moves.length - 1];
    return { from: last.from ?? null, to: last.to };
  }, [gameState?.moves.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const isMyTurn = !!myColor && !gameOver && gameState?.currentPlayer === myColor;
  const showMyTurnPulse = isMyTurn && myTurnIdleMs > 5000;
  const pulsePieceColor = (isMyTurn && myTurnIdleMs > 15000 && gameState?.phase === 'movement' && isAtLatest)
    ? myColor : null;

  function playerPanelProps(player: Player) {
    const s = viewedState ?? displayedState;
    return {
      player,
      name:         player === 'red' ? redName : blackName,
      isActive:     s.currentPlayer === player && !gameOver,
      timeMs:       player === 'red' ? s.redTimeMs : s.blackTimeMs,
      lastMove:     player === 'red' ? lastRedMove : lastBlackMove,
      moveIndex:    player === 'red' ? redMoveIdx  : blackMoveIdx,
      isWinner:     gameOver?.winner === player,
      showPulse:    player === myColor && showMyTurnPulse,
      phase:        displayedState.phase,
      piecesPlaced: player === 'red' ? displayedState.redPlaced : displayedState.blackPlaced,
      isDark,
    };
  }

  const navBtnCls = 'px-2 py-0.5 rounded text-xs font-mono font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 disabled:opacity-30 transition';

  return (
    <div className={`${isDark ? 'dark' : ''} md:h-screen md:overflow-hidden`}>
    <div className="md:h-full bg-slate-100 dark:bg-gray-950 text-slate-800 dark:text-white flex flex-col">

      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-1 bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-700 flex-none">
        <FurukooLogo />
        <div className="flex gap-2 ml-auto items-center">
          {/* Context label — hidden on very small screens */}
          <span className="hidden sm:inline text-xs font-mono text-slate-400 dark:text-gray-500">
            {!isSpectating
              ? `Playing against ${myColor === 'red' ? blackName : redName}`
              : gameState?.winner || gameOver
                ? `Reviewing ${redName} vs ${blackName}`
                : `Spectating ${redName} vs ${blackName}`}
          </span>
          {isSpectating || gameOver
            ? <button onClick={handleBack} className="px-3 py-0.5 rounded text-xs font-bold bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-700 transition">
                Back to lobby
              </button>
            : <button onClick={handleResign} className="px-3 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 transition">
                Resign
              </button>
          }
          <DarkToggle isDark={isDark} onToggle={toggleDark} />
        </div>
      </div>

      <ConnectionBanner />

      {/* ── Banners (mobile only — desktop version is inside the board panel) ── */}
      {showResult && (
        <div className={`md:hidden mx-3 mt-2 px-4 py-1.5 rounded-lg text-xs font-mono text-center border ${
          resultWinner === 'draw'
            ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700'
            : 'bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700'
        }`}>
          {resultWinner === 'draw'
            ? <span className="font-bold text-amber-800 dark:text-amber-300">Draw</span>
            : <span className="font-bold text-green-800 dark:text-green-300">{resultName} wins</span>
          }
          {resultReason === 'repetition'  && ' — threefold repetition'}
          {resultReason === 'resign'      && ' (by resignation)'}
          {resultReason === 'timeout'     && ' (on time)'}
          {resultReason === 'disconnect'  && ' (opponent disconnected)'}
          {resultRedDelta != null && resultRedElo != null && resultBlackDelta != null && resultBlackElo != null && <>
            {'  ·  '}
            {redName}: <span className={resultRedDelta >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{fmtDelta(resultRedDelta)}</span> → {resultRedElo}
            {'  ·  '}
            {blackName}: <span className={resultBlackDelta >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{fmtDelta(resultBlackDelta)}</span> → {resultBlackElo}
          </>}
        </div>
      )}
      {!gameOver && displayedState?.disconnectedColor && displayedState.disconnectedAt && (
        <div className="mx-3 mt-2 px-4 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 text-xs font-mono text-center animate-pulse">
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

      {/* ── Desktop layout (md+) ─────────────────────────────────────────── */}
      <div className="hidden md:flex flex-1 min-h-0 p-2">
        <ResizableSplit
          direction="horizontal"
          initialFirstPct={66}
          first={
            <div className="h-full flex flex-col overflow-hidden py-2 px-1 gap-2">
              {showResult && (
                <div className={`flex-none mx-4 px-4 py-1.5 rounded-lg text-xs font-mono text-center border ${
                  resultWinner === 'draw'
                    ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700'
                    : 'bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700'
                }`}>
                  {resultWinner === 'draw'
                    ? <span className="font-bold text-amber-800 dark:text-amber-300">Draw</span>
                    : <span className="font-bold text-green-800 dark:text-green-300">{resultName} wins</span>
                  }
                  {resultReason === 'repetition'  && ' — threefold repetition'}
                  {resultReason === 'resign'      && ' (by resignation)'}
                  {resultReason === 'timeout'     && ' (on time)'}
                  {resultReason === 'disconnect'  && ' (opponent disconnected)'}
                  {resultRedDelta != null && resultRedElo != null && resultBlackDelta != null && resultBlackElo != null && <>
                    {'  ·  '}
                    {redName}: <span className={resultRedDelta >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{fmtDelta(resultRedDelta)}</span> → {resultRedElo}
                    {'  ·  '}
                    {blackName}: <span className={resultBlackDelta >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{fmtDelta(resultBlackDelta)}</span> → {resultBlackElo}
                  </>}
                </div>
              )}
              <div className="flex-none flex justify-center">
                <div className="w-full max-w-sm">
                  <PlayerPanel {...playerPanelProps(topPlayer)} />
                </div>
              </div>
              <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden px-6">
                <Board
                  uid="desktop"
                  fit
                  pieces={(viewedState ?? displayedState).pieces}
                  currentPlayer={gameState.currentPlayer}
                  selectedSlot={selectedSlot}
                  onSlotClick={handleSlotClick}
                  disabled={boardDisabled}
                  phase={gameState.phase}
                  isDark={isDark}
                  pulsePieceColor={pulsePieceColor}
                  lastMove={activeBoardLastMove}
                />
              </div>
              <div className="flex-none flex justify-center">
                <div className="w-full max-w-sm">
                  <PlayerPanel {...playerPanelProps(bottomPlayer)} />
                </div>
              </div>
              <div className="flex-none flex items-center justify-center gap-1">
                <button className={navBtnCls} onClick={navFirst} disabled={curIdx === 0} title="First move">{'⏮︎'}</button>
                <button className={navBtnCls} onClick={navPrev}  disabled={curIdx === 0} title="Previous move">{'◀︎'}</button>
                <button className={navBtnCls} onClick={navNext}  disabled={isAtLatest}   title="Next move">{'▶︎'}</button>
                <button className={`${navBtnCls} ${showPulse ? 'animate-pulse ring-2 ring-violet-400' : ''}`} onClick={navLast} disabled={isAtLatest} title="Latest move">{'⏭︎'}</button>
                <span className="text-xs font-mono text-slate-400 dark:text-gray-500 ml-1">{curIdx}/{histLen - 1}</span>
                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`${navBtnCls} ml-2`}
                  title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
                >
                  {soundEnabled ? '🔊' : '🔇'}
                </button>
              </div>
            </div>
          }
          second={
            <div className="h-full flex flex-col min-h-0">
              <ResizableSplit
                direction="vertical"
                initialFirstPct={50}
                first={<div className="h-full"><PlayersBox users={lobbyUsers} myUsername={user?.username ?? ''} gamePlayers={{ red: redName, black: blackName }} onSpectate={handleSpectate} /></div>}
                second={<div className="h-full"><ChatBox messages={messages} onSend={handleSend} myUsername={user?.username ?? ''} origin={gameId ?? ''} muted={isMuted} /></div>}
              />
            </div>
          }
        />
      </div>

      {/* ── Mobile layout (<md) ──────────────────────────────────────────── */}
      <div className="flex md:hidden flex-col pb-4">

        {/* Top player — compact */}
        <div className="mx-3 mt-3">
          <PlayerPanel {...playerPanelProps(topPlayer)} compact />
        </div>

        {/* Board — fills width */}
        <div className="px-3 mt-2">
          <Board
            uid="mobile"
            pieces={(viewedState ?? displayedState).pieces}
            currentPlayer={gameState.currentPlayer}
            selectedSlot={selectedSlot}
            onSlotClick={handleSlotClick}
            disabled={boardDisabled}
            phase={gameState.phase}
            isDark={isDark}
            responsive
          />
        </div>

        {/* Bottom player — compact */}
        <div className="mx-3 mt-2">
          <PlayerPanel {...playerPanelProps(bottomPlayer)} compact />
        </div>

        {/* History nav + sound toggle */}
        <div className="flex items-center justify-center gap-2 mt-3">
          <button className={navBtnCls} onClick={navFirst} disabled={curIdx === 0}>{'⏮︎'}</button>
          <button className={navBtnCls} onClick={navPrev}  disabled={curIdx === 0}>{'◀︎'}</button>
          <button className={navBtnCls} onClick={navNext}  disabled={isAtLatest}>{'▶︎'}</button>
          <button className={`${navBtnCls} ${showPulse ? 'animate-pulse ring-2 ring-violet-400' : ''}`} onClick={navLast} disabled={isAtLatest}>{'⏭︎'}</button>
          <span className="text-xs font-mono text-slate-400 dark:text-gray-500">{curIdx}/{histLen - 1}</span>
          <button onClick={() => setSoundEnabled(!soundEnabled)} className={navBtnCls} title={soundEnabled ? 'Mute' : 'Sound on'}>
            {soundEnabled ? '🔊' : '🔇'}
          </button>
        </div>

        {/* Chat */}
        <div className="mx-3 mt-3 flex flex-col bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl overflow-hidden" style={{ height: 240 }}>
          <ChatBox messages={messages} onSend={handleSend} myUsername={user?.username ?? ''} origin={gameId ?? ''} muted={isMuted} />
        </div>

        {/* Players */}
        <div className="mx-3 mt-3 mb-4 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <PlayersBox users={lobbyUsers} myUsername={user?.username ?? ''} gamePlayers={{ red: redName, black: blackName }} onSpectate={handleSpectate} mobile />
        </div>

      </div>
    </div>
    </div>
  );
}
