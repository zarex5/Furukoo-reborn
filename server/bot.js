'use strict';

const { slotKey, legalMoves, allSquares, positionKey, PIECES_PER_PLAYER } = require('./gameLogic');

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

// ── Level → search parameters ─────────────────────────────────────────────────
//
// level 1 — plays a square but doesn't look ahead more than 2 steps
// level 10 — maximum strength (deep minimax, no random errors)
//
const LEVEL_PARAMS = {
  1:  { maxMovementDepth: 1, maxPlacementDepth: 1, searchTimeMs:  200, errorRate: 0.50, thinkMinMs:  300, thinkMaxMs:  800 },
  2:  { maxMovementDepth: 1, maxPlacementDepth: 1, searchTimeMs:  300, errorRate: 0.35, thinkMinMs:  300, thinkMaxMs:  900 },
  3:  { maxMovementDepth: 1, maxPlacementDepth: 2, searchTimeMs:  400, errorRate: 0.25, thinkMinMs:  300, thinkMaxMs: 1000 },
  4:  { maxMovementDepth: 2, maxPlacementDepth: 2, searchTimeMs:  600, errorRate: 0.18, thinkMinMs:  350, thinkMaxMs: 1100 },
  5:  { maxMovementDepth: 2, maxPlacementDepth: 2, searchTimeMs:  800, errorRate: 0.15, thinkMinMs:  400, thinkMaxMs: 1200 },
  6:  { maxMovementDepth: 3, maxPlacementDepth: 2, searchTimeMs: 1200, errorRate: 0.10, thinkMinMs:  400, thinkMaxMs: 1400 },
  7:  { maxMovementDepth: 3, maxPlacementDepth: 3, searchTimeMs: 1800, errorRate: 0.06, thinkMinMs:  500, thinkMaxMs: 1500 },
  8:  { maxMovementDepth: 4, maxPlacementDepth: 3, searchTimeMs: 2500, errorRate: 0.03, thinkMinMs:  500, thinkMaxMs: 1800 },
  9:  { maxMovementDepth: 4, maxPlacementDepth: 4, searchTimeMs: 3000, errorRate: 0.01, thinkMinMs:  600, thinkMaxMs: 1900 },
  10: { maxMovementDepth: 5, maxPlacementDepth: 4, searchTimeMs: 3500, errorRate: 0.00, thinkMinMs:  600, thinkMaxMs: 2000 },
};

// ── Seed configs — used only if the bot account doesn't exist in DB yet ───────
//
// Only username, initialElo, and level are needed here.
// Search parameters are derived at runtime from LEVEL_PARAMS[level].
//
const BOT_CONFIGS = [
  { username: 'Machine',   initialElo: 1500, level: 10 },
  { username: 'Automaton', initialElo: 1200, level: 5  },
];

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

function chooseBestMove(game, botColor, params) {
  const { pieces, redPlaced, blackPlaced, phase } = game;
  const posCounts = game.positionCounts || {};

  const moves = getMoves(pieces, phase, botColor);
  if (!moves.length) return null;

  moves.sort((a, b) => fastScore(pieces, b.to, b.from, botColor) - fastScore(pieces, a.to, a.from, botColor));

  // Immediate win — always take it regardless of level
  if (fastScore(pieces, moves[0].to, moves[0].from, botColor) >= 1e9) return moves[0];

  // Random error injection (lower-level bots make occasional bad moves)
  if (params.errorRate > 0 && Math.random() < params.errorRate) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const maxDepth = phase === 'placement' ? params.maxPlacementDepth : params.maxMovementDepth;
  _searchDeadline = Date.now() + params.searchTimeMs;

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

// ── Bot instance factory ──────────────────────────────────────────────────────

function createBotInstance(config) {
  // _cfg is live and mutable — admin can update level, enabled, username at runtime
  let _cfg = { enabled: true, ...config };

  let _sharedState = null;
  let _api         = null;
  let botUser      = null;
  let botGameId    = null;
  let botColor     = null;
  let moveTimer    = null;

  function getSocketId() {
    return `__bot__${_cfg.username.toLowerCase().replace(/[^\w]/g, '_')}__`;
  }

  function getParams() {
    return LEVEL_PARAMS[_cfg.level] || LEVEL_PARAMS[5];
  }

  function scheduleMove() {
    if (moveTimer) clearTimeout(moveTimer);
    const p = getParams();
    const delay = p.thinkMinMs + Math.random() * (p.thinkMaxMs - p.thinkMinMs);
    moveTimer = setTimeout(makeMove, delay);
  }

  function makeMove() {
    moveTimer = null;
    if (!botGameId || !botColor) return;
    const game = _sharedState.activeGames.get(botGameId);
    if (!game || game.winner || game.currentPlayer !== botColor) return;

    const t0 = Date.now();
    const piecesCopy = { ...game.pieces };
    const move = chooseBestMove({ ...game, pieces: piecesCopy }, botColor, getParams());
    console.log(`[${_cfg.username}] move in ${Date.now() - t0}ms → ${move ? slotKey(move.to) : 'none'}`);

    if (move) _api.botMove(botGameId, move.to, move.from);
  }

  function requeue() {
    if (!botUser || !_sharedState || botGameId || !_cfg.enabled) return;
    const { gameProposals } = _sharedState;
    if (gameProposals.has(_cfg.username)) return;
    gameProposals.set(_cfg.username, {
      username:  _cfg.username,
      elo:       botUser.elo,
      eloRange:  _api.getEloRange(botUser.elo),
      isBot:     true,
      botLevel:  _cfg.level,
    });
    _api.broadcastLobby();
    console.log(`[${_cfg.username}] Proposing game (ELO ${botUser.elo})`);
  }

  // ── Public interface ──────────────────────────────────────────────────────

  async function init(sharedState, api, User) {
    _sharedState = sharedState;
    _api         = api;
    try {
      let dbUser = await User.findOne({ username: _cfg.username });
      if (!dbUser) {
        const bcrypt = require('bcryptjs');
        dbUser = await User.create({
          username:     _cfg.username,
          passwordHash: await bcrypt.hash(require('crypto').randomBytes(32).toString('hex'), 10),
          elo:          _cfg.initialElo || 1200,
          isBot:        true,
          botLevel:     _cfg.level,
          botEnabled:   true,
        });
        console.log(`[${_cfg.username}] Account created (ELO ${_cfg.initialElo || 1200})`);
      } else {
        // Load persisted level and enabled state from DB
        if (dbUser.botLevel != null) _cfg.level = dbUser.botLevel;
        _cfg.enabled = dbUser.botEnabled !== false;
      }
      botUser = { userId: dbUser._id.toString(), username: _cfg.username, elo: dbUser.elo };

      sharedState.connectedUsers.set(getSocketId(), {
        socketId:   getSocketId(),
        userId:     botUser.userId,
        username:   _cfg.username,
        elo:        botUser.elo,
        gameId:     null,
        gameColor:  null,
        spectating: false,
        reviewing:  false,
        isBot:      true,
        botLevel:   _cfg.level,
      });

      // Restore an in-progress game after server restart
      for (const [gameId, game] of sharedState.activeGames) {
        const isRed   = game.red.username   === _cfg.username;
        const isBlack = game.black.username === _cfg.username;
        if (isRed || isBlack) {
          const color = isRed ? 'red' : 'black';
          botGameId = gameId;
          botColor  = color;
          const entry = sharedState.connectedUsers.get(getSocketId());
          if (entry) { entry.gameId = gameId; entry.gameColor = game.color; }
          if (game.currentPlayer === color) scheduleMove();
          console.log(`[${_cfg.username}] Restored game ${gameId} as ${color}`);
          return;
        }
      }

      requeue();
    } catch (err) {
      console.error(`[${_cfg.username}] Init error:`, err.message);
    }
  }

  function onBotGameStarted(gameId, color, game) {
    botGameId = gameId;
    botColor  = color;
    const entry = _sharedState.connectedUsers.get(getSocketId());
    if (entry) { entry.gameId = gameId; entry.gameColor = game.color; entry.spectating = false; entry.reviewing = false; }
    console.log(`[${_cfg.username}] Game ${gameId} — playing as ${color}`);
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
    const entry = _sharedState.connectedUsers.get(getSocketId());
    if (entry) {
      entry.gameId = null; entry.gameColor = null;
      entry.spectating = false; entry.reviewing = false;
      if (botUser) entry.elo = botUser.elo;
    }
    setTimeout(requeue, 3000);
  }

  // Update runtime config (level, enabled, username) without restarting the instance.
  function updateConfig(updates) {
    const oldUsername  = _cfg.username;
    const oldSocketId  = getSocketId();

    Object.assign(_cfg, updates);

    // Handle rename: move connectedUsers entry to new socket ID
    if (updates.username && updates.username !== oldUsername && _sharedState) {
      const newSocketId = getSocketId();
      const entry = _sharedState.connectedUsers.get(oldSocketId);
      if (entry) {
        entry.username = _cfg.username;
        entry.socketId = newSocketId;
        _sharedState.connectedUsers.delete(oldSocketId);
        _sharedState.connectedUsers.set(newSocketId, entry);
      }
      // Move game proposal if exists
      const prop = _sharedState.gameProposals.get(oldUsername);
      if (prop) {
        _sharedState.gameProposals.delete(oldUsername);
        prop.username = _cfg.username;
        _sharedState.gameProposals.set(_cfg.username, prop);
      }
      if (botUser) botUser.username = _cfg.username;
    }

    // Sync level in connectedUsers + proposal
    if (updates.level !== undefined) {
      const entry = _sharedState?.connectedUsers.get(getSocketId());
      if (entry) entry.botLevel = _cfg.level;
      const prop = _sharedState?.gameProposals.get(_cfg.username);
      if (prop) prop.botLevel = _cfg.level;
    }

    // Sync elo in botUser, connectedUsers, and proposal
    if (updates.elo != null && botUser) {
      botUser.elo = updates.elo;
      const entry = _sharedState?.connectedUsers.get(getSocketId());
      if (entry) entry.elo = updates.elo;
      const prop = _sharedState?.gameProposals.get(_cfg.username);
      if (prop) prop.elo = updates.elo;
    }

    // Enabled → remove proposal; disabled → try to requeue
    if (updates.enabled === false && _sharedState) {
      _sharedState.gameProposals.delete(_cfg.username);
    } else if (updates.enabled === true && !botGameId) {
      requeue();
    }

    _api?.broadcastLobby();
  }

  return {
    init,
    onBotGameStarted,
    onGameState,
    onBotGameEnded,
    updateConfig,
    get username() { return _cfg.username; },
    get socketId()  { return getSocketId(); },
    get level()     { return _cfg.level; },
    get enabled()   { return _cfg.enabled; },
    get inGame()    { return !!botGameId; },
  };
}

module.exports = { BOT_CONFIGS, LEVEL_PARAMS, createBotInstance };
