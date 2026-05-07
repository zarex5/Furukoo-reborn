'use strict';

const { slotKey, legalMoves, allSquares, checkWinner, PIECES_PER_PLAYER } = require('./gameLogic');

// ── Pre-computed constants ────────────────────────────────────────────────────

const SQUARES = allSquares(); // 25 squares
const SQUARE_KEYS = SQUARES.map(sq => sq.map(slotKey));

const ALL_SLOTS = [];
for (let line = 1; line <= 6; line++) {
  for (let slot = 1; slot <= 7; slot++) {
    ALL_SLOTS.push({ type: 'V', line, slot });
    ALL_SLOTS.push({ type: 'H', line, slot });
  }
}
const ALL_SLOT_KEYS = ALL_SLOTS.map(slotKey);

// For each slot, which squares (by index) does it belong to?
const SLOT_TO_SQUARES = {};
for (const key of ALL_SLOT_KEYS) SLOT_TO_SQUARES[key] = [];
for (let i = 0; i < SQUARE_KEYS.length; i++) {
  for (const k of SQUARE_KEYS[i]) SLOT_TO_SQUARES[k].push(i);
}

// ── Lightweight state transition (no Date.now overhead) ──────────────────────

function simApply(s, to, from) {
  const pieces = { ...s.pieces };
  const player = s.currentPlayer;
  const toKey = slotKey(to);
  if (from) delete pieces[slotKey(from)];
  pieces[toKey] = player;

  const redPlaced   = player === 'red'   ? s.redPlaced   + (from ? 0 : 1) : s.redPlaced;
  const blackPlaced = player === 'black' ? s.blackPlaced + (from ? 0 : 1) : s.blackPlaced;
  const phase = (redPlaced >= PIECES_PER_PLAYER && blackPlaced >= PIECES_PER_PLAYER) ? 'movement' : 'placement';

  return {
    pieces,
    currentPlayer: player === 'red' ? 'black' : 'red',
    redPlaced, blackPlaced, phase,
    winner: checkWinner(pieces),
  };
}

// ── Evaluation: positive = good for botColor ─────────────────────────────────

function evaluate(pieces, botColor) {
  const opp = botColor === 'red' ? 'black' : 'red';
  let score = 0;
  for (const sq of SQUARE_KEYS) {
    let bc = 0, oc = 0;
    for (const k of sq) {
      const p = pieces[k];
      if (p === botColor) bc++;
      else if (p === opp) oc++;
    }
    if (bc > 0 && oc > 0) continue; // contested
    if (bc === 4) return 1e8;
    if (oc === 4) return -1e8;
    if (bc === 3) score += 600;
    else if (bc === 2) score += 40;
    else if (bc === 1) score += 4;
    if (oc === 3) score -= 800; // blocking opponent 3-sided is more urgent
    else if (oc === 2) score -= 50;
    else if (oc === 1) score -= 5;
  }
  return score;
}

// ── Move generation ──────────────────────────────────────────────────────────

function getMoves(s, color) {
  const moves = [];
  if (s.phase === 'placement') {
    for (let i = 0; i < ALL_SLOTS.length; i++) {
      if (!s.pieces[ALL_SLOT_KEYS[i]]) {
        moves.push({ to: ALL_SLOTS[i], from: null });
      }
    }
  } else {
    for (let i = 0; i < ALL_SLOTS.length; i++) {
      if (s.pieces[ALL_SLOT_KEYS[i]] === color) {
        for (const dest of legalMoves(ALL_SLOTS[i], s.pieces)) {
          moves.push({ to: dest, from: ALL_SLOTS[i] });
        }
      }
    }
  }
  return moves;
}

// Quick score for move ordering — only checks squares touching the moved slot
function quickScore(pieces, to, from, color) {
  const opp = color === 'red' ? 'black' : 'red';
  const np = { ...pieces };
  if (from) delete np[slotKey(from)];
  const toKey = slotKey(to);
  np[toKey] = color;

  // Immediate win?
  for (const i of SLOT_TO_SQUARES[toKey] || []) {
    const sq = SQUARE_KEYS[i];
    if (sq.every(k => np[k] === color)) return 1e9;
  }

  // Opponent was about to win — how many 4-side threats did we block/create?
  return evaluate(np, color);
}

// ── Minimax with alpha-beta pruning ──────────────────────────────────────────

let _searchDeadline = 0;

function minimax(s, depth, alpha, beta, botColor) {
  if (s.winner) {
    return s.winner === botColor ? 1e7 + depth * 10 : -1e7 - depth * 10;
  }
  if (depth === 0 || Date.now() > _searchDeadline) {
    return evaluate(s.pieces, botColor);
  }

  const color = s.currentPlayer;
  const rawMoves = getMoves(s, color);
  if (!rawMoves.length) return evaluate(s.pieces, botColor);

  // Order by quick score (descending)
  const scored = rawMoves.map(m => ({ m, q: quickScore(s.pieces, m.to, m.from, color) }));
  scored.sort((a, b) => b.q - a.q);

  const maximizing = color === botColor;
  let best = maximizing ? -Infinity : Infinity;

  for (const { m } of scored) {
    const next = simApply(s, m.to, m.from);
    const score = minimax(next, depth - 1, alpha, beta, botColor);
    if (maximizing) {
      if (score > best) best = score;
      if (score > alpha) alpha = score;
    } else {
      if (score < best) best = score;
      if (score < beta) beta = score;
    }
    if (beta <= alpha) break;
  }

  return best;
}

// ── Best move selection with iterative deepening ─────────────────────────────

function chooseBestMove(game, botColor) {
  const s = {
    pieces: game.pieces,
    currentPlayer: game.currentPlayer,
    redPlaced: game.redPlaced,
    blackPlaced: game.blackPlaced,
    phase: game.phase,
    winner: game.winner,
  };

  const moves = getMoves(s, botColor);
  if (!moves.length) return null;

  // Order moves
  const scored = moves.map(m => ({ m, q: quickScore(s.pieces, m.to, m.from, botColor) }));
  scored.sort((a, b) => b.q - a.q);

  // Immediate win? Take it now.
  if (scored[0].q >= 1e9) return scored[0].m;

  const maxDepth = s.phase === 'placement' ? 3 : 5;
  const timeLimitMs = 4000;
  _searchDeadline = Date.now() + timeLimitMs;

  let bestMove = scored[0].m;
  let bestScore = -Infinity;

  // Iterative deepening
  for (let depth = 1; depth <= maxDepth; depth++) {
    if (Date.now() > _searchDeadline) break;

    let depthBest = -Infinity;
    let depthBestMove = scored[0].m;

    for (const { m } of scored) {
      if (Date.now() > _searchDeadline) break;
      const next = simApply(s, m.to, m.from);
      const score = minimax(next, depth - 1, -Infinity, Infinity, botColor);
      if (score > depthBest) {
        depthBest = score;
        depthBestMove = m;
      }
    }

    // Only update if full depth completed (or at least first move done)
    if (depthBest > -Infinity) {
      bestMove = depthBestMove;
      bestScore = depthBest;
    }

    // Stop searching if we found a forced win
    if (bestScore >= 1e7) break;
  }

  return bestMove;
}

// ── Bot state ─────────────────────────────────────────────────────────────────

let _sharedState = null;
let _api = null;

let botUser = null;       // { userId, username: 'Machine', elo }
let botGameId = null;
let botColor = null;
let botMoveTimer = null;

const BOT_USERNAME = 'Machine';
const BOT_SOCKET_ID = '__bot__machine__';
// Base delay range in ms — add randomness to appear more human
const THINK_MIN_MS = 600;
const THINK_MAX_MS = 2000;

function scheduleBotMove() {
  if (botMoveTimer) clearTimeout(botMoveTimer);
  const delay = THINK_MIN_MS + Math.random() * (THINK_MAX_MS - THINK_MIN_MS);
  botMoveTimer = setTimeout(makeBotMove, delay);
}

function makeBotMove() {
  botMoveTimer = null;
  if (!botGameId || !botColor) return;
  const { activeGames } = _sharedState;
  const game = activeGames.get(botGameId);
  if (!game || game.winner || game.currentPlayer !== botColor) return;

  const t0 = Date.now();
  const move = chooseBestMove(game, botColor);
  console.log(`[Bot] Computed move in ${Date.now() - t0}ms: ${JSON.stringify(move)}`);

  if (!move) return;
  _api.botMove(botGameId, move.to, move.from);
}

// Called when a game involving the bot starts
function onBotGameStarted(gameId, color, game) {
  botGameId = gameId;
  botColor = color;
  const { connectedUsers } = _sharedState;
  const entry = connectedUsers.get(BOT_SOCKET_ID);
  if (entry) { entry.gameId = gameId; entry.gameColor = game.color; entry.spectating = false; entry.reviewing = false; }
  console.log(`[Bot] Game started ${gameId} — playing as ${color}`);
  if (game.currentPlayer === botColor) scheduleBotMove();
}

// Called after each game:state broadcast
function onGameState(gameId, game) {
  if (gameId !== botGameId || !game || game.winner) return;
  if (game.currentPlayer !== botColor) return;
  scheduleBotMove();
}

// Called when bot's game ends
function onBotGameEnded(newElo) {
  if (botMoveTimer) { clearTimeout(botMoveTimer); botMoveTimer = null; }
  botGameId = null;
  botColor = null;

  if (botUser && newElo != null) botUser.elo = newElo;

  // Reset Machine's lobby entry
  const { connectedUsers } = _sharedState;
  const entry = connectedUsers.get(BOT_SOCKET_ID);
  if (entry) {
    entry.gameId = null; entry.gameColor = null;
    entry.spectating = false; entry.reviewing = false;
    if (botUser) entry.elo = botUser.elo;
  }

  // Re-queue after a short pause
  setTimeout(requeue, 3000);
}

function requeue() {
  if (!botUser || !_sharedState || botGameId) return;
  const { gameProposals } = _sharedState;
  if (gameProposals.has(BOT_USERNAME)) return;
  gameProposals.set(BOT_USERNAME, {
    username: BOT_USERNAME,
    elo: botUser.elo,
    eloRange: _api.getEloRange(botUser.elo),
    isBot: true,
  });
  _api.broadcastLobby();
  console.log(`[Bot] Proposing game (ELO ${botUser.elo})`);
}

// ── Initialisation ────────────────────────────────────────────────────────────

async function initBot(sharedState, api, User) {
  _sharedState = sharedState;
  _api = api;

  try {
    let machine = await User.findOne({ username: BOT_USERNAME });
    if (!machine) {
      const bcrypt = require('bcryptjs');
      machine = await User.create({
        username: BOT_USERNAME,
        passwordHash: await bcrypt.hash(require('crypto').randomBytes(32).toString('hex'), 10),
        elo: 1500,
        isBot: true,
      });
      console.log('[Bot] Machine account created (ELO 1500)');
    }
    botUser = { userId: machine._id.toString(), username: BOT_USERNAME, elo: machine.elo };

    // Virtual lobby entry — Machine is always "connected"
    sharedState.connectedUsers.set(BOT_SOCKET_ID, {
      socketId: BOT_SOCKET_ID,
      userId: botUser.userId,
      username: BOT_USERNAME,
      elo: botUser.elo,
      gameId: null, gameColor: null,
      spectating: false, reviewing: false,
      isBot: true,
    });

    // Restore active game after server restart
    for (const [gameId, game] of sharedState.activeGames) {
      if (game.red.username === BOT_USERNAME || game.black.username === BOT_USERNAME) {
        const color = game.red.username === BOT_USERNAME ? 'red' : 'black';
        botGameId = gameId;
        botColor = color;
        const entry = sharedState.connectedUsers.get(BOT_SOCKET_ID);
        if (entry) { entry.gameId = gameId; entry.gameColor = game.color; }
        if (game.currentPlayer === color) scheduleBotMove();
        console.log(`[Bot] Restored game ${gameId} as ${color}`);
        return;
      }
    }

    // No active game — start proposing
    requeue();
  } catch (err) {
    console.error('[Bot] Init error:', err.message);
  }
}

module.exports = {
  initBot,
  onGameState,
  onBotGameStarted,
  onBotGameEnded,
  BOT_USERNAME,
  BOT_SOCKET_ID,
};
