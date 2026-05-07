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
    if (bc > 0 && oc > 0) continue;
    if (bc === 4) return 1e8;
    if (oc === 4) return -1e8;
    if (bc === 3) score += 600;
    else if (bc === 2) score += 40;
    else if (bc === 1) score += 4;
    if (oc === 3) score -= 800;
    else if (oc === 2) score -= 50;
    else if (oc === 1) score -= 5;
  }
  return score;
}

// Fast score for move ordering: mutate pieces in-place, score, then undo.
// Only evaluates squares touching the moved slot (and vacated slot) — O(1) squares.
function fastScore(pieces, to, from, color) {
  const opp = color === 'red' ? 'black' : 'red';
  const tk = slotKey(to);
  const fk = from ? slotKey(from) : null;

  // Apply
  const prevTo   = pieces[tk];
  const prevFrom = fk ? pieces[fk] : undefined;
  if (fk) delete pieces[fk];
  pieces[tk] = color;

  let score = 0;
  for (const i of (SLOT_TO_SQUARES[tk] || [])) {
    const sq = SQUARE_KEYS[i];
    let bc = 0, oc = 0;
    for (const k of sq) {
      const p = pieces[k];
      if (p === color) bc++;
      else if (p === opp) oc++;
    }
    if (bc === 4) { score = 1e9; break; }
    if (bc > 0 && oc > 0) continue;
    if (bc === 3) score += 600;
    else if (bc === 2) score += 40;
    else if (bc === 1) score += 4;
    if (oc === 3) score -= 800;
    else if (oc === 2) score -= 50;
  }

  // Check vacated slot squares (we may have exposed opponent progress)
  if (fk && score < 1e9) {
    for (const i of (SLOT_TO_SQUARES[fk] || [])) {
      const sq = SQUARE_KEYS[i];
      let bc = 0, oc = 0;
      for (const k of sq) {
        const p = pieces[k];
        if (p === color) bc++;
        else if (p === opp) oc++;
      }
      if (bc > 0 && oc > 0) continue;
      if (oc === 3) score -= 800;
      else if (oc === 2) score -= 50;
    }
  }

  // Undo
  if (fk) pieces[fk] = prevFrom;
  if (prevTo === undefined) delete pieces[tk]; else pieces[tk] = prevTo;

  return score;
}

// Fast winner check: only checks squares touching the destination slot.
function checkWinnerFast(pieces, toKey, player) {
  for (const i of (SLOT_TO_SQUARES[toKey] || [])) {
    const sq = SQUARE_KEYS[i];
    if (sq.every(k => pieces[k] === player)) return player;
  }
  return null;
}

// ── Move generation ──────────────────────────────────────────────────────────

function getMoves(pieces, phase, color) {
  const moves = [];
  if (phase === 'placement') {
    for (let i = 0; i < ALL_SLOTS.length; i++) {
      if (!pieces[ALL_SLOT_KEYS[i]]) moves.push({ to: ALL_SLOTS[i], from: null });
    }
  } else {
    for (let i = 0; i < ALL_SLOTS.length; i++) {
      if (pieces[ALL_SLOT_KEYS[i]] === color) {
        for (const dest of legalMoves(ALL_SLOTS[i], pieces)) {
          moves.push({ to: dest, from: ALL_SLOTS[i] });
        }
      }
    }
  }
  return moves;
}

// ── Minimax with alpha-beta (mutable pieces + undo/redo) ─────────────────────

let _searchDeadline = 0;

function minimax(pieces, redPlaced, blackPlaced, phase, color, depth, alpha, beta, botColor) {
  if (depth === 0 || Date.now() > _searchDeadline) {
    return evaluate(pieces, botColor);
  }

  const moves = getMoves(pieces, phase, color);
  if (!moves.length) return evaluate(pieces, botColor);

  // Order moves by fast score (best first)
  const opp = color === 'red' ? 'black' : 'red';
  moves.sort((a, b) => fastScore(pieces, b.to, b.from, color) - fastScore(pieces, a.to, a.from, color));

  const max = color === botColor;
  let best = max ? -Infinity : Infinity;
  const nextColor = opp;

  for (const m of moves) {
    if (Date.now() > _searchDeadline) break;

    const tk = slotKey(m.to);
    const fk = m.from ? slotKey(m.from) : null;
    const prevTo   = pieces[tk];
    const prevFrom = fk ? pieces[fk] : undefined;

    // Apply
    if (fk) delete pieces[fk];
    pieces[tk] = color;

    const nrp = color === 'red'   ? redPlaced   + (m.from ? 0 : 1) : redPlaced;
    const nbp = color === 'black' ? blackPlaced + (m.from ? 0 : 1) : blackPlaced;
    const nphase = (nrp >= PIECES_PER_PLAYER && nbp >= PIECES_PER_PLAYER) ? 'movement' : 'placement';

    const winner = checkWinnerFast(pieces, tk, color);

    let score;
    if (winner) {
      score = winner === botColor ? 1e7 + depth * 10 : -1e7 - depth * 10;
    } else {
      score = minimax(pieces, nrp, nbp, nphase, nextColor, depth - 1, alpha, beta, botColor);
    }

    // Undo
    if (fk) pieces[fk] = prevFrom;
    if (prevTo === undefined) delete pieces[tk]; else pieces[tk] = prevTo;

    if (max) {
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
  const { pieces, currentPlayer, redPlaced, blackPlaced, phase } = game;

  const moves = getMoves(pieces, phase, botColor);
  if (!moves.length) return null;

  // Order by fast score
  moves.sort((a, b) => fastScore(pieces, b.to, b.from, botColor) - fastScore(pieces, a.to, a.from, botColor));

  // Immediate win? Take it.
  if (fastScore(pieces, moves[0].to, moves[0].from, botColor) >= 1e9) return moves[0];

  const maxDepth  = phase === 'placement' ? 4 : 5;
  const timeLimitMs = 3500;
  _searchDeadline = Date.now() + timeLimitMs;

  let bestMove = moves[0];

  // Iterative deepening: each completed depth updates bestMove
  for (let depth = 1; depth <= maxDepth; depth++) {
    if (Date.now() > _searchDeadline) break;

    let depthBest = -Infinity;
    let depthBestMove = moves[0];
    const opp = botColor === 'red' ? 'black' : 'red';

    for (const m of moves) {
      if (Date.now() > _searchDeadline) break;

      const tk = slotKey(m.to);
      const fk = m.from ? slotKey(m.from) : null;
      const prevTo   = pieces[tk];
      const prevFrom = fk ? pieces[fk] : undefined;

      if (fk) delete pieces[fk];
      pieces[tk] = botColor;

      const nrp = botColor === 'red'   ? redPlaced   + (m.from ? 0 : 1) : redPlaced;
      const nbp = botColor === 'black' ? blackPlaced + (m.from ? 0 : 1) : blackPlaced;
      const nphase = (nrp >= PIECES_PER_PLAYER && nbp >= PIECES_PER_PLAYER) ? 'movement' : 'placement';
      const winner = checkWinnerFast(pieces, tk, botColor);

      let score;
      if (winner) {
        score = 1e7 + depth * 10;
      } else {
        score = minimax(pieces, nrp, nbp, nphase, opp, depth - 1, -Infinity, Infinity, botColor);
      }

      if (fk) pieces[fk] = prevFrom;
      if (prevTo === undefined) delete pieces[tk]; else pieces[tk] = prevTo;

      if (score > depthBest) {
        depthBest = score;
        depthBestMove = m;
      }
    }

    // Only commit full-depth result
    if (Date.now() <= _searchDeadline || depth === 1) {
      bestMove = depthBestMove;
    }

    if (depthBest >= 1e7) break; // Forced win found
  }

  return bestMove;
}

// ── Bot state ─────────────────────────────────────────────────────────────────

let _sharedState = null;
let _api = null;

let botUser = null;
let botGameId = null;
let botColor = null;
let botMoveTimer = null;

const BOT_USERNAME = 'Machine';
const BOT_SOCKET_ID = '__bot__machine__';
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
  // Work on a mutable copy for the search (the search restores it after each branch)
  const piecesCopy = { ...game.pieces };
  const searchGame = { ...game, pieces: piecesCopy };
  const move = chooseBestMove(searchGame, botColor);
  console.log(`[Bot] depth search ${Date.now() - t0}ms → ${move ? slotKey(move.to) : 'null'}`);

  if (!move) return;
  _api.botMove(botGameId, move.to, move.from);
}

function onBotGameStarted(gameId, color, game) {
  botGameId = gameId;
  botColor = color;
  const { connectedUsers } = _sharedState;
  const entry = connectedUsers.get(BOT_SOCKET_ID);
  if (entry) {
    entry.gameId = gameId;
    entry.gameColor = game.color;
    entry.spectating = false;
    entry.reviewing = false;
  }
  console.log(`[Bot] Game ${gameId} — playing as ${color}`);
  if (game.currentPlayer === botColor) scheduleBotMove();
}

function onGameState(gameId, game) {
  if (gameId !== botGameId || !game || game.winner) return;
  if (game.currentPlayer !== botColor) return;
  scheduleBotMove();
}

function onBotGameEnded(newElo) {
  if (botMoveTimer) { clearTimeout(botMoveTimer); botMoveTimer = null; }
  botGameId = null;
  botColor = null;

  if (botUser && newElo != null) botUser.elo = newElo;

  const { connectedUsers } = _sharedState;
  const entry = connectedUsers.get(BOT_SOCKET_ID);
  if (entry) {
    entry.gameId = null; entry.gameColor = null;
    entry.spectating = false; entry.reviewing = false;
    if (botUser) entry.elo = botUser.elo;
  }

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
