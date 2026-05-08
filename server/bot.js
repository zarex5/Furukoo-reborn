'use strict';

const { slotKey, legalMoves, allSquares, checkWinner, positionKey, PIECES_PER_PLAYER } = require('./gameLogic');

// ── Pre-computed constants (shared by all bot instances) ─────────────────────

const SQUARES = allSquares();
const SQUARE_KEYS = SQUARES.map(sq => sq.map(slotKey));

const ALL_SLOTS = [];
for (let line = 1; line <= 6; line++) {
  for (let slot = 1; slot <= 7; slot++) {
    ALL_SLOTS.push({ type: 'V', line, slot });
    ALL_SLOTS.push({ type: 'H', line, slot });
  }
}
const ALL_SLOT_KEYS = ALL_SLOTS.map(slotKey);

const SLOT_TO_SQUARES = {};
for (const key of ALL_SLOT_KEYS) SLOT_TO_SQUARES[key] = [];
for (let i = 0; i < SQUARE_KEYS.length; i++) {
  for (const k of SQUARE_KEYS[i]) SLOT_TO_SQUARES[k].push(i);
}

// ── AI: pure functions (no bot-instance state) ────────────────────────────────

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

// Mutate-and-undo scoring for move ordering (only touches affected squares).
function fastScore(pieces, to, from, color) {
  const opp   = color === 'red' ? 'black' : 'red';
  const tk    = slotKey(to);
  const fk    = from ? slotKey(from) : null;
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
      if (p === color) bc++; else if (p === opp) oc++;
    }
    if (bc === 4) { score = 1e9; break; }
    if (bc > 0 && oc > 0) continue;
    if (bc === 3) score += 600; else if (bc === 2) score += 40; else if (bc === 1) score += 4;
    if (oc === 3) score -= 800; else if (oc === 2) score -= 50;
  }
  if (fk && score < 1e9) {
    for (const i of (SLOT_TO_SQUARES[fk] || [])) {
      const sq = SQUARE_KEYS[i];
      let bc = 0, oc = 0;
      for (const k of sq) {
        const p = pieces[k];
        if (p === color) bc++; else if (p === opp) oc++;
      }
      if (bc > 0 && oc > 0) continue;
      if (oc === 3) score -= 800; else if (oc === 2) score -= 50;
    }
  }
  if (fk) pieces[fk] = prevFrom;
  if (prevTo === undefined) delete pieces[tk]; else pieces[tk] = prevTo;
  return score;
}

function checkWinnerFast(pieces, toKey, player) {
  for (const i of (SLOT_TO_SQUARES[toKey] || [])) {
    const sq = SQUARE_KEYS[i];
    if (sq.every(k => pieces[k] === player)) return player;
  }
  return null;
}

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

// Draw = penalised identically to a loss (bot fights draws as hard as losses).
const DRAW_SCORE = -1e7;

// Module-level deadline (safe: JS is single-threaded, searches never overlap).
let _searchDeadline = 0;

function minimax(pieces, rp, bp, phase, color, depth, alpha, beta, botColor, posCounts, pathCounts) {
  if (depth === 0 || Date.now() > _searchDeadline) return evaluate(pieces, botColor);

  const moves = getMoves(pieces, phase, color);
  if (!moves.length) return evaluate(pieces, botColor);

  const opp = color === 'red' ? 'black' : 'red';
  moves.sort((a, b) => fastScore(pieces, b.to, b.from, color) - fastScore(pieces, a.to, a.from, color));

  const max = color === botColor;
  let best = max ? -Infinity : Infinity;

  for (const m of moves) {
    if (Date.now() > _searchDeadline) break;

    const tk = slotKey(m.to);
    const fk = m.from ? slotKey(m.from) : null;
    const prevTo   = pieces[tk];
    const prevFrom = fk ? pieces[fk] : undefined;
    if (fk) delete pieces[fk];
    pieces[tk] = color;

    const nrp    = color === 'red'   ? rp + (m.from ? 0 : 1) : rp;
    const nbp    = color === 'black' ? bp + (m.from ? 0 : 1) : bp;
    const nphase = (nrp >= PIECES_PER_PLAYER && nbp >= PIECES_PER_PLAYER) ? 'movement' : 'placement';

    const posKey       = positionKey(pieces, opp);
    const prevPath     = pathCounts[posKey] || 0;
    pathCounts[posKey] = prevPath + 1;
    const total        = (posCounts[posKey] || 0) + pathCounts[posKey];

    let score;
    if (total >= 3) {
      score = DRAW_SCORE;
    } else {
      const winner = checkWinnerFast(pieces, tk, color);
      if (winner) {
        score = winner === botColor ? 1e7 + depth * 10 : -1e7 - depth * 10;
      } else {
        score = minimax(pieces, nrp, nbp, nphase, opp, depth - 1, alpha, beta, botColor, posCounts, pathCounts);
      }
    }

    if (prevPath === 0) delete pathCounts[posKey]; else pathCounts[posKey] = prevPath;
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

/**
 * Choose the best move for `botColor` given the current game state.
 *
 * config fields used here:
 *   maxMovementDepth  — maximum ply depth during movement phase
 *   maxPlacementDepth — maximum ply depth during placement phase
 *   errorRate         — probability [0,1] of returning a random legal move
 *   searchTimeMs      — minimax time budget in ms
 */
function chooseBestMove(game, botColor, config) {
  const { pieces, redPlaced, blackPlaced, phase } = game;
  const posCounts = game.positionCounts || {};

  const moves = getMoves(pieces, phase, botColor);
  if (!moves.length) return null;

  moves.sort((a, b) => fastScore(pieces, b.to, b.from, botColor) - fastScore(pieces, a.to, a.from, botColor));

  // Immediate win — always take it regardless of level
  if (fastScore(pieces, moves[0].to, moves[0].from, botColor) >= 1e9) return moves[0];

  // Random error injection (lower-level bots make occasional bad moves)
  if (config.errorRate > 0 && Math.random() < config.errorRate) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const maxDepth = phase === 'placement' ? config.maxPlacementDepth : config.maxMovementDepth;
  _searchDeadline = Date.now() + config.searchTimeMs;

  let bestMove = moves[0];
  const opp = botColor === 'red' ? 'black' : 'red';

  for (let depth = 1; depth <= maxDepth; depth++) {
    if (Date.now() > _searchDeadline) break;

    let depthBest = -Infinity;
    let depthBestMove = moves[0];
    const pathCounts = {};

    for (const m of moves) {
      if (Date.now() > _searchDeadline) break;

      const tk = slotKey(m.to);
      const fk = m.from ? slotKey(m.from) : null;
      const prevTo   = pieces[tk];
      const prevFrom = fk ? pieces[fk] : undefined;
      if (fk) delete pieces[fk];
      pieces[tk] = botColor;

      const nrp    = botColor === 'red'   ? redPlaced   + (m.from ? 0 : 1) : redPlaced;
      const nbp    = botColor === 'black' ? blackPlaced + (m.from ? 0 : 1) : blackPlaced;
      const nphase = (nrp >= PIECES_PER_PLAYER && nbp >= PIECES_PER_PLAYER) ? 'movement' : 'placement';

      const posKey   = positionKey(pieces, opp);
      const prevPath = pathCounts[posKey] || 0;
      pathCounts[posKey] = prevPath + 1;
      const total = (posCounts[posKey] || 0) + pathCounts[posKey];

      let score;
      if (total >= 3) {
        score = DRAW_SCORE;
      } else {
        const winner = checkWinnerFast(pieces, tk, botColor);
        score = winner
          ? 1e7 + depth * 10
          : minimax(pieces, nrp, nbp, nphase, opp, depth - 1, -Infinity, Infinity, botColor, posCounts, pathCounts);
      }

      if (prevPath === 0) delete pathCounts[posKey]; else pathCounts[posKey] = prevPath;
      if (fk) pieces[fk] = prevFrom;
      if (prevTo === undefined) delete pieces[tk]; else pieces[tk] = prevTo;

      if (score > depthBest) { depthBest = score; depthBestMove = m; }
    }

    if (Date.now() <= _searchDeadline || depth === 1) bestMove = depthBestMove;
    if (depthBest >= 1e7) break;
  }

  return bestMove;
}

// ── Bot configurations ────────────────────────────────────────────────────────
//
// level 1–10: higher = stronger
// searchTimeMs: minimax budget (lower levels cut off sooner — but they also use
//   shallower depth, so they'd finish fast anyway; still cap it for safety)
// errorRate: probability of playing a random legal move (0 = always best)
// thinkMinMs / thinkMaxMs: artificial delay before emitting the move
//
const BOT_CONFIGS = [
  {
    username:          'Machine',
    initialElo:        1500,
    level:             10,
    maxMovementDepth:  5,
    maxPlacementDepth: 4,
    searchTimeMs:      3500,
    errorRate:         0.00,
    thinkMinMs:        600,
    thinkMaxMs:        2000,
  },
  {
    username:          'Automaton',
    initialElo:        1200,
    level:             5,
    maxMovementDepth:  2,
    maxPlacementDepth: 2,
    searchTimeMs:      800,
    errorRate:         0.15,
    thinkMinMs:        400,
    thinkMaxMs:        1400,
  },
];

// ── Bot instance factory ──────────────────────────────────────────────────────

function createBotInstance(config) {
  const SOCKET_ID = `__bot__${config.username.toLowerCase()}__`;

  let _sharedState = null;
  let _api         = null;
  let botUser      = null;
  let botGameId    = null;
  let botColor     = null;
  let moveTimer    = null;

  function scheduleMove() {
    if (moveTimer) clearTimeout(moveTimer);
    const delay = config.thinkMinMs + Math.random() * (config.thinkMaxMs - config.thinkMinMs);
    moveTimer = setTimeout(makeMove, delay);
  }

  function makeMove() {
    moveTimer = null;
    if (!botGameId || !botColor) return;
    const game = _sharedState.activeGames.get(botGameId);
    if (!game || game.winner || game.currentPlayer !== botColor) return;

    const t0 = Date.now();
    const piecesCopy = { ...game.pieces };
    const move = chooseBestMove({ ...game, pieces: piecesCopy }, botColor, config);
    console.log(`[${config.username}] move in ${Date.now() - t0}ms → ${move ? slotKey(move.to) : 'none'}`);

    if (move) _api.botMove(botGameId, move.to, move.from);
  }

  function requeue() {
    if (!botUser || !_sharedState || botGameId) return;
    const { gameProposals } = _sharedState;
    if (gameProposals.has(config.username)) return;
    gameProposals.set(config.username, {
      username:  config.username,
      elo:       botUser.elo,
      eloRange:  _api.getEloRange(botUser.elo),
      isBot:     true,
      botLevel:  config.level,
    });
    _api.broadcastLobby();
    console.log(`[${config.username}] Proposing game (ELO ${botUser.elo})`);
  }

  // ── Public interface ──────────────────────────────────────────────────────

  async function init(sharedState, api, User) {
    _sharedState = sharedState;
    _api         = api;
    try {
      let dbUser = await User.findOne({ username: config.username });
      if (!dbUser) {
        const bcrypt = require('bcryptjs');
        dbUser = await User.create({
          username:     config.username,
          passwordHash: await bcrypt.hash(require('crypto').randomBytes(32).toString('hex'), 10),
          elo:          config.initialElo,
          isBot:        true,
        });
        console.log(`[${config.username}] Account created (ELO ${config.initialElo})`);
      }
      botUser = { userId: dbUser._id.toString(), username: config.username, elo: dbUser.elo };

      sharedState.connectedUsers.set(SOCKET_ID, {
        socketId:   SOCKET_ID,
        userId:     botUser.userId,
        username:   config.username,
        elo:        botUser.elo,
        gameId:     null,
        gameColor:  null,
        spectating: false,
        reviewing:  false,
        isBot:      true,
        botLevel:   config.level,
      });

      // Restore an in-progress game after server restart
      for (const [gameId, game] of sharedState.activeGames) {
        const isRed   = game.red.username   === config.username;
        const isBlack = game.black.username === config.username;
        if (isRed || isBlack) {
          const color = isRed ? 'red' : 'black';
          botGameId = gameId;
          botColor  = color;
          const entry = sharedState.connectedUsers.get(SOCKET_ID);
          if (entry) { entry.gameId = gameId; entry.gameColor = game.color; }
          if (game.currentPlayer === color) scheduleMove();
          console.log(`[${config.username}] Restored game ${gameId} as ${color}`);
          return;
        }
      }

      requeue();
    } catch (err) {
      console.error(`[${config.username}] Init error:`, err.message);
    }
  }

  function onBotGameStarted(gameId, color, game) {
    botGameId = gameId;
    botColor  = color;
    const entry = _sharedState.connectedUsers.get(SOCKET_ID);
    if (entry) { entry.gameId = gameId; entry.gameColor = game.color; entry.spectating = false; entry.reviewing = false; }
    console.log(`[${config.username}] Game ${gameId} — playing as ${color}`);
    if (game.currentPlayer === botColor) scheduleMove();
  }

  function onGameState(gameId, game) {
    if (gameId !== botGameId || !game || game.winner) return;
    if (game.currentPlayer !== botColor) return;
    scheduleMove();
  }

  function onBotGameEnded(newElo) {
    if (moveTimer) { clearTimeout(moveTimer); moveTimer = null; }
    botGameId = null;
    botColor  = null;
    if (botUser && newElo != null) botUser.elo = newElo;
    const entry = _sharedState.connectedUsers.get(SOCKET_ID);
    if (entry) {
      entry.gameId = null; entry.gameColor = null;
      entry.spectating = false; entry.reviewing = false;
      if (botUser) entry.elo = botUser.elo;
    }
    setTimeout(requeue, 3000);
  }

  return {
    init,
    onBotGameStarted,
    onGameState,
    onBotGameEnded,
    get username() { return config.username; },
    get socketId()  { return SOCKET_ID; },
    get level()     { return config.level; },
  };
}

module.exports = { BOT_CONFIGS, createBotInstance };
