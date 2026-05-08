'use strict';
require('dotenv').config();
const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const { slotKey, legalMoves, applyMove, positionKey, calcEloDelta, eloInfo, getEloRange, INITIAL_TIME_MS } = require('./gameLogic');
const { BOT_CONFIGS, createBotInstance } = require('./bot');

// All bot instances, keyed by username — populated after MongoDB connects
const bots = new Map(); // username → bot instance

// ── App setup ────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  // In production replace '*' with your actual origin, e.g. 'https://furukoo.com'
  cors: { origin: process.env.ALLOWED_ORIGIN || '*' },
});

app.use(express.json());

// ── MongoDB ──────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/furukoo')
  .then(async () => {
    console.log('MongoDB connected');
    await loadActiveGames();
    const sharedState = { connectedUsers, gameProposals, activeGames };
    const api         = { botMove, broadcastLobby, sysChat, getEloRange };
    for (const cfg of BOT_CONFIGS) {
      const inst = createBotInstance(cfg);
      await inst.init(sharedState, api, User);
      bots.set(cfg.username, inst);
    }
  })
  .catch(e => console.error('MongoDB error:', e.message));

const UserSchema = new mongoose.Schema({
  username:     { type: String, unique: true, required: true, trim: true },
  passwordHash: { type: String, required: true },
  elo:          { type: Number, default: 1200 },
  email:        { type: String, trim: true, default: '' },
  guest:        { type: Boolean, default: false },
  isBot:        { type: Boolean, default: false },
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

const M = mongoose.Schema.Types.Mixed;
const GameSchema = new mongoose.Schema({
  gameId:        { type: String, unique: true, required: true, index: true },
  color:         String,
  red:           { userId: String, username: String, elo: Number },
  black:         { userId: String, username: String, elo: Number },
  eloInfo:       M,
  pieces:        { type: M, default: {} },
  currentPlayer: { type: String, default: 'red' },
  redPlaced:     { type: Number, default: 0 },
  blackPlaced:   { type: Number, default: 0 },
  phase:         { type: String, default: 'placement' },
  moves:         { type: M, default: [] },
  winner:        { type: String, default: null },
  resignedBy:    { type: String, default: null },
  drawnBy:       { type: String, default: null },
  positionCounts: { type: M, default: {} },
  redTimeMs:     Number,
  blackTimeMs:   Number,
  lastMoveAt:    { type: Number, default: Date.now },
  startedAt:     { type: Number },
  redEloAfter:   { type: Number },
  blackEloAfter: { type: Number },
  redEloDelta:   { type: Number },
  blackEloDelta: { type: Number },
  durationMs:    { type: Number },
  status:        { type: String, enum: ['active', 'ended'], default: 'active' },
}, { timestamps: true });

const Game = mongoose.model('Game', GameSchema);

const ChatSchema = new mongoose.Schema({
  id:       { type: String, index: true },
  type:     { type: String, required: true },
  username: String,
  text:     { type: String, required: true },
  origin:   { type: String, required: true },
  spectator: Boolean,
}, { timestamps: true });
const Chat = mongoose.model('Chat', ChatSchema);

const EloHistorySchema = new mongoose.Schema({
  userId:   { type: String, required: true },
  username: { type: String, required: true },
  elo:      { type: Number, required: true },
  date:     { type: String, required: true }, // YYYY-MM-DD
}, { timestamps: true });
EloHistorySchema.index({ userId: 1, date: 1 }, { unique: true });
const EloHistory = mongoose.model('EloHistory', EloHistorySchema);

// Fire-and-forget: persist game state after every move or status change
function saveGame(game) {
  Game.findOneAndUpdate(
    { gameId: game.id },
    {
      gameId: game.id, color: game.color,
      red: game.red, black: game.black, eloInfo: game.eloInfo,
      pieces: game.pieces, currentPlayer: game.currentPlayer,
      redPlaced: game.redPlaced, blackPlaced: game.blackPlaced,
      phase: game.phase, moves: game.moves,
      winner: game.winner || null, resignedBy: game.resignedBy || null,
      drawnBy: game.drawnBy || null, positionCounts: game.positionCounts || {},
      redTimeMs: game.redTimeMs, blackTimeMs: game.blackTimeMs,
      lastMoveAt: game.lastMoveAt,
      startedAt: game.startedAt || null,
      status: game.winner ? 'ended' : 'active',
    },
    { upsert: true }
  ).catch(e => console.error('saveGame:', e.message));
}

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET not set — using insecure default. Set this env var in production.');
}
const JWT_SECRET = process.env.JWT_SECRET || 'furukoo-dev-secret';
const sign = (user) => jwt.sign({ userId: user._id.toString(), username: user.username }, JWT_SECRET, { expiresIn: '30d' });

// ── Auth REST ────────────────────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, email } = req.body || {};
    if (!username?.trim() || !password) return res.status(400).json({ error: 'Username and password required' });
    if (username.trim().length < 2)      return res.status(400).json({ error: 'Username must be at least 2 characters' });
    if (!email?.trim())                  return res.status(400).json({ error: 'Email is required' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username: username.trim(), passwordHash, email: email?.trim() || '' });
    res.json({ token: sign(user), username: user.username, elo: user.elo });
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ error: 'Username already taken' });
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/guest', async (req, res) => {
  try {
    const crypto = require('crypto');
    let username, exists;
    do {
      const digits = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
      username = `Guest${digits}`;
      exists = await User.findOne({ username });
    } while (exists);
    const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
    const user = await User.create({ username, passwordHash, guest: true });
    res.json({ token: sign(user), username: user.username, elo: user.elo });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const user = await User.findOne({ username: username?.trim() });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok)   return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ token: sign(user), username: user.username, elo: user.elo });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Profile & Leaderboard REST ───────────────────────────────────────────────

function gamePlayerMeta(g, username) {
  const isRed  = g.red.username === username;
  const color  = isRed ? 'red' : 'black';
  const oColor = isRed ? 'black' : 'red';
  return {
    gameId:        g.gameId,
    opponent:      g[oColor].username,
    result:        g.winner === 'draw' ? 'draw' : g.winner === color ? 'win' : 'loss',
    eloDelta:      isRed ? g.redEloDelta   : g.blackEloDelta,
    eloAfter:      isRed ? g.redEloAfter   : g.blackEloAfter,
    myMoves:       (g.moves || []).filter(m => m.player === color).length,
    opponentMoves: (g.moves || []).filter(m => m.player === oColor).length,
    moveCount:     (g.moves || []).length,
    durationMs:    g.durationMs ?? null,
    date:          g.createdAt,
  };
}

app.get('/api/profile/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const user = await User.findOne({ username }).select('username elo createdAt guest isBot').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [gamesCount, minutesAgg] = await Promise.all([
      Game.countDocuments({
        $or: [{ 'red.username': username }, { 'black.username': username }],
        status: 'ended',
      }),
      Game.aggregate([
        { $match: {
          $or: [{ 'red.username': username }, { 'black.username': username }],
          status: 'ended', durationMs: { $exists: true, $ne: null },
        }},
        { $group: { _id: null, totalMs: { $sum: '$durationMs' } } },
      ]),
    ]);

    res.json({
      username: user.username,
      elo: user.elo,
      isBot: user.isBot || false,
      gamesPlayed: gamesCount,
      minutesPlayed: Math.round((minutesAgg[0]?.totalMs || 0) / 60000),
      joinDate: user.createdAt,
      isGuest: user.guest || false,
    });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const { username } = req.query;

    const users = await User.find({ guest: { $ne: true } })
      .sort({ elo: -1 }).select('username elo').lean();

    const gameCounts = await Game.aggregate([
      { $match: { status: 'ended' } },
      { $project: { usernames: ['$red.username', '$black.username'] } },
      { $unwind: '$usernames' },
      { $group: { _id: '$usernames', count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(gameCounts.map(g => [g._id, g.count]));

    const ranked = users.map((u, i) => ({
      rank: i + 1, username: u.username, elo: u.elo,
      gamesPlayed: countMap[u.username] || 0,
    }));

    const userIdx  = username ? ranked.findIndex(r => r.username === username) : -1;
    const userRank = userIdx + 1;

    let rows, separatorAfter;
    if (!username || userRank === 0 || userRank <= 8) {
      rows = ranked.slice(0, 10);
      separatorAfter = null;
    } else {
      const contextStart = Math.max(5, userIdx - 2);
      const contextEnd   = Math.min(ranked.length, userIdx + 3);
      rows = [...ranked.slice(0, 5), ...ranked.slice(contextStart, contextEnd)];
      separatorAfter = 5;
    }

    res.json({ rows, separatorAfter, userRank });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/profile/:username/elo-history', async (req, res) => {
  try {
    const { username } = req.params;
    const user = await User.findOne({ username }).select('_id createdAt').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const since     = user.createdAt > oneYearAgo ? user.createdAt : oneYearAgo;
    const sinceDate = since.toISOString().slice(0, 10);

    const history = await EloHistory.find({
      userId: user._id.toString(), date: { $gte: sinceDate },
    }).sort({ date: 1 }).select('date elo -_id').lean();

    res.json(history);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/profile/:username/records', async (req, res) => {
  try {
    const { username } = req.params;
    const fields = 'gameId red black moves winner durationMs redEloAfter blackEloAfter redEloDelta blackEloDelta createdAt';
    const games = await Game.find({
      $or: [{ 'red.username': username }, { 'black.username': username }],
      status: 'ended',
    }).select(fields).lean();

    if (!games.length) return res.json({ leastMoves: null, mostMoves: null, shortestGame: null, longestGame: null });

    const metas   = games.map(g => gamePlayerMeta(g, username));
    const byMoves = [...metas].sort((a, b) => a.moveCount - b.moveCount);
    const timed   = metas.filter(g => g.durationMs != null).sort((a, b) => a.durationMs - b.durationMs);

    res.json({
      leastMoves:   byMoves[0]                     ?? null,
      mostMoves:    byMoves[byMoves.length - 1]    ?? null,
      shortestGame: timed[0]                        ?? null,
      longestGame:  timed[timed.length - 1]         ?? null,
    });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/profile/:username/games', async (req, res) => {
  try {
    const { username } = req.params;
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 10;
    const query = {
      $or: [{ 'red.username': username }, { 'black.username': username }],
      status: 'ended',
    };
    const fields = 'gameId red black moves winner durationMs redEloAfter blackEloAfter redEloDelta blackEloDelta createdAt';

    const [total, games] = await Promise.all([
      Game.countDocuments(query),
      Game.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).select(fields).lean(),
    ]);

    res.json({
      games: games.map(g => gamePlayerMeta(g, username)),
      total, page, totalPages: Math.ceil(total / limit),
    });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// ── In-memory state ──────────────────────────────────────────────────────────
// connectedUsers: Map<socketId, { socketId, userId, username, elo, gameId, gameColor }>
const connectedUsers = new Map();
// gameProposals: Map<username, { username, elo, eloRange }>
const gameProposals  = new Map();
// activeGames: Map<gameId, game>
const activeGames    = new Map();
// disconnectTimeouts: Map<"gameId:color", NodeJS.Timeout>
const disconnectTimeouts = new Map();

function lobbySnapshot() {
  return {
    users: Array.from(connectedUsers.values()).map(u => ({
      username: u.username, elo: u.elo,
      gameId: u.gameId || null, gameColor: u.gameColor || null,
      spectating: u.spectating || false,
      reviewing: u.reviewing || false,
      isBot: u.isBot || false,
      botLevel: u.botLevel ?? null,
    })),
    proposals: Array.from(gameProposals.values()),
  };
}
function broadcastLobby() { io.emit('lobby:state', lobbySnapshot()); }

function genId() { return crypto.randomBytes(6).toString('hex'); }
function sysChat(text, origin) {
  const msg = { id: genId(), type: 'system', text, origin };
  io.emit('chat:message', msg);
  Chat.create(msg).catch(e => console.error('chat:', e.message));
}
function fmt(n) { return (n >= 0 ? '+' : '') + n; }

function isValidSlot(s) {
  return s !== null && typeof s === 'object' &&
    (s.type === 'V' || s.type === 'H') &&
    Number.isInteger(s.line) && s.line >= 1 && s.line <= 6 &&
    Number.isInteger(s.slot) && s.slot >= 1 && s.slot <= 7;
}

// Return a copy of game with timer values advanced to "right now".
// applyMove already does this on each move; we need it for state emissions
// that aren't triggered by a move (join, disconnect, reconnect) so the client
// doesn't jump backwards to the stale post-last-move values.
function liveState(game) {
  if (game.winner) return game;
  const elapsed = Date.now() - game.lastMoveAt;
  return {
    ...game,
    redTimeMs:   game.currentPlayer === 'red'   ? Math.max(0, game.redTimeMs   - elapsed) : game.redTimeMs,
    blackTimeMs: game.currentPlayer === 'black' ? Math.max(0, game.blackTimeMs - elapsed) : game.blackTimeMs,
  };
}

// Apply a move and check for threefold-repetition draw.
// Returns the next game state (with winner='draw' if applicable).
function applyMoveWithDraw(game, to, from) {
  const next = applyMove(game, to, from);
  if (!next.winner) {
    // Count the new position (pieces after move + whose turn it now is)
    const posKey = positionKey(next.pieces, next.currentPlayer);
    const counts = { ...(game.positionCounts || {}) };
    counts[posKey] = (counts[posKey] || 0) + 1;
    next.positionCounts = counts;
    if (counts[posKey] >= 3) {
      next.winner = 'draw';
      next.drawnBy = 'repetition';
    }
  } else {
    next.positionCounts = game.positionCounts || {};
  }
  return next;
}

// Internal move execution for the bot (bypasses socket auth, same logic as game:move)
function botMove(gameId, to, from) {
  const game = activeGames.get(gameId);
  if (!game || game.winner) return;
  // Basic validity
  if (game.phase === 'placement') {
    if (from || game.pieces[slotKey(to)]) return;
  } else {
    if (!from) return;
    if (game.pieces[slotKey(from)] !== game.currentPlayer) return;
    if (!legalMoves(from, game.pieces).some(s => slotKey(s) === slotKey(to))) return;
  }
  const next = applyMoveWithDraw(game, to, from);
  activeGames.set(gameId, next);
  io.to(`game:${gameId}`).emit('game:state', next);
  for (const inst of bots.values()) inst.onGameState(gameId, next);
  if (next.winner) endGame(gameId, next.winner, next.drawnBy ? 'repetition' : 'board');
  else saveGame(next);
}

// Restore activeGames from DB on startup (called after mongoose connects)
async function loadActiveGames() {
  const games = await Game.find({ status: 'active' }).lean();
  for (const g of games) {
    activeGames.set(g.gameId, {
      id: g.gameId, color: g.color,
      red: g.red, black: g.black, eloInfo: g.eloInfo,
      pieces: g.pieces || {},
      currentPlayer: g.currentPlayer,
      redPlaced: g.redPlaced, blackPlaced: g.blackPlaced,
      phase: g.phase, moves: g.moves || [],
      winner: g.winner || null, resignedBy: g.resignedBy || null,
      drawnBy: g.drawnBy || null, positionCounts: g.positionCounts || {},
      redTimeMs: g.redTimeMs, blackTimeMs: g.blackTimeMs,
      lastMoveAt: Date.now(), // reset so downtime doesn't eat the clock
      startedAt: g.startedAt || Date.now(),
      disconnectedColor: null, disconnectedAt: null,
    });
  }
  if (games.length) console.log(`Restored ${games.length} active game(s) from DB`);
}

// ── Socket auth middleware ───────────────────────────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Unauthorized'));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId   = decoded.userId;
    socket.username = decoded.username;
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

// ── Socket handlers ──────────────────────────────────────────────────────────
io.on('connection', async (socket) => {
  // ── CRITICAL: register placeholder + ALL event handlers BEFORE any await ──
  // Socket.io buffers client messages that arrive during the connection
  // handshake and replays them as soon as the socket is registered.  If
  // socket.on() calls live after an await they simply don't exist yet when
  // those buffered events fire — and Socket.io drops them silently.
  connectedUsers.set(socket.id, {
    socketId: socket.id, userId: socket.userId,
    username: socket.username, elo: 1200, // placeholder; real value set below
    gameId: null, gameColor: null, spectating: false, reviewing: false,
  });

  // Kick any earlier session for the same user (second browser / tab)
  for (const [sid, u] of connectedUsers) {
    if (u.username === socket.username && sid !== socket.id) {
      const old = io.sockets.sockets.get(sid);
      if (old) { old.emit('session:kicked'); old.disconnect(true); }
      break;
    }
  }

  // ── Unified chat ──
  socket.on('chat:send', ({ text, origin }) => {
    if (typeof text !== 'string' || !text.trim() || typeof origin !== 'string') return;
    if (origin !== 'lobby' && !activeGames.has(origin)) return;
    const u = connectedUsers.get(socket.id);
    if (!u) return;
    const msg = {
      id: genId(), type: 'user', username: u.username,
      text: text.trim().slice(0, 200), origin,
      spectator: u.spectating || false,
    };
    io.emit('chat:message', msg);
    Chat.create(msg).catch(e => console.error('chat:', e.message));
  });

  // ── Game proposals ──
  socket.on('game:propose', () => {
    const u = connectedUsers.get(socket.id);
    if (!u) return;
    // Allow re-entry from spectating (game over)
    if (u.spectating) { u.gameId = null; u.gameColor = null; u.spectating = false; u.reviewing = false; broadcastLobby(); }
    if (u.gameId || gameProposals.has(u.username)) return;
    gameProposals.set(u.username, { username: u.username, elo: u.elo, eloRange: getEloRange(u.elo) });
    sysChat(`${u.username} just proposed a game`, 'lobby');
    broadcastLobby();
  });

  socket.on('game:remove', () => {
    const u = connectedUsers.get(socket.id);
    if (!u) return;
    if (gameProposals.delete(u.username)) {
      sysChat(`${u.username} removed its game proposal`, 'lobby');
      broadcastLobby();
    }
  });

  // ── Accept proposal → start game ──
  socket.on('game:accept', (proposerUsername) => {
    const accepter = connectedUsers.get(socket.id);
    if (!accepter) return;
    // Allow re-entry from spectating (game over)
    if (accepter.spectating) { accepter.gameId = null; accepter.gameColor = null; accepter.spectating = false; accepter.reviewing = false; }
    if (accepter.gameId) return;
    if (proposerUsername === accepter.username) return;
    const proposal = gameProposals.get(proposerUsername);
    if (!proposal) return;

    let proposerEntry = null;
    for (const [, u] of connectedUsers) {
      if (u.username === proposerUsername) { proposerEntry = u; break; }
    }
    if (!proposerEntry || proposerEntry.gameId) return;

    gameProposals.delete(proposerUsername);
    gameProposals.delete(accepter.username);

    const flip   = Math.random() < 0.5;
    const redU   = flip ? proposerEntry : accepter;
    const blackU = flip ? accepter       : proposerEntry;

    const gameId    = Math.random().toString(36).slice(2, 11);
    const hue       = Math.floor(Math.random() * 360);
    const gameColor = `hsl(${hue},70%,50%)`;

    const info = eloInfo(redU.elo, blackU.elo);

    const game = {
      id: gameId, color: gameColor,
      red:   { userId: redU.userId,   username: redU.username,   elo: redU.elo },
      black: { userId: blackU.userId, username: blackU.username, elo: blackU.elo },
      eloInfo: info,
      pieces: {}, currentPlayer: 'red',
      redPlaced: 0, blackPlaced: 0, phase: 'placement',
      moves: [], winner: null, resignedBy: null, drawnBy: null,
      positionCounts: {},
      redTimeMs: INITIAL_TIME_MS, blackTimeMs: INITIAL_TIME_MS,
      lastMoveAt: Date.now(),
      startedAt: Date.now(),
      disconnectedColor: null, disconnectedAt: null,
    };

    activeGames.set(gameId, game);
    redU.gameId   = gameId; redU.gameColor   = gameColor;
    blackU.gameId = gameId; blackU.gameColor = gameColor;

    const redSock   = io.sockets.sockets.get(redU.socketId);
    const blackSock = io.sockets.sockets.get(blackU.socketId);
    if (redSock)   redSock.join(`game:${gameId}`);
    if (blackSock) blackSock.join(`game:${gameId}`);

    sysChat(`${accepter.username} accepts ${proposerUsername}'s game`, 'lobby');
    sysChat(`${redU.username} - victory ${fmt(info.red.win)} / draw ${fmt(info.red.draw)} / loss ${fmt(info.red.loss)}`, gameId);
    sysChat(`${blackU.username} - victory ${fmt(info.black.win)} / draw ${fmt(info.black.draw)} / loss ${fmt(info.black.loss)}`, gameId);

    broadcastLobby();
    sysChat(`Game started: ${redU.username} vs ${blackU.username}`, 'lobby');

    saveGame(game);

    // Notify whichever bot instance is playing (if any)
    if (bots.has(redU.username))   bots.get(redU.username).onBotGameStarted(gameId, 'red',   game);
    if (bots.has(blackU.username)) bots.get(blackU.username).onBotGameStarted(gameId, 'black', game);

    // Emit directly to each socket ID (belt-and-suspenders vs room-join race)
    const startedPayload = { gameId, gameColor, red: game.red, black: game.black, eloInfo: info };
    io.to(redU.socketId).emit('game:started', startedPayload);
    io.to(blackU.socketId).emit('game:started', startedPayload);
    io.to(`game:${gameId}`).emit('game:state', game);
  });

  // ── Join game room (page load / reload / direct URL / spectating) ──
  socket.on('game:join', async (gameId) => {
    let game = activeGames.get(gameId);

    // Active game not found — try DB (ended games are still viewable)
    if (!game) {
      const dbGame = await Game.findOne({ gameId }).lean().catch(() => null);
      if (!dbGame) { socket.emit('game:error', { message: 'Game not found' }); return; }
      game = {
        id: dbGame.gameId, color: dbGame.color,
        red: dbGame.red, black: dbGame.black, eloInfo: dbGame.eloInfo,
        pieces: dbGame.pieces || {}, currentPlayer: dbGame.currentPlayer,
        redPlaced: dbGame.redPlaced, blackPlaced: dbGame.blackPlaced,
        phase: dbGame.phase, moves: dbGame.moves || [],
        winner: dbGame.winner || null, resignedBy: dbGame.resignedBy || null,
        redTimeMs: dbGame.redTimeMs, blackTimeMs: dbGame.blackTimeMs,
        lastMoveAt: dbGame.lastMoveAt || Date.now(),
        disconnectedColor: null, disconnectedAt: null,
      };
    }

    const u = connectedUsers.get(socket.id);
    if (!u) return;

    const isRed    = game.red.username   === u.username;
    const isBlack  = game.black.username === u.username;
    // Treat as spectator if not a player, or if the game is already over
    const isPlayer = (isRed || isBlack) && !game.winner;

    u.gameId     = gameId;
    u.gameColor  = game.color;
    u.spectating = !isPlayer;
    socket.join(`game:${gameId}`);

    if (!isPlayer) {
      sysChat(`${u.username} just joined game ${gameId}`, gameId);
    } else {
      const color         = isRed ? 'red' : 'black';
      const otherColor    = color === 'red' ? 'black' : 'red';
      const otherUsername = game[otherColor].username;

      // Clear reconnect countdown if this player was the disconnected one
      if (game.disconnectedColor === color) {
        const key = `${gameId}:${color}`;
        const t = disconnectTimeouts.get(key);
        if (t) { clearTimeout(t); disconnectTimeouts.delete(key); }
        game.disconnectedColor = null;
        game.disconnectedAt    = null;
        sysChat(`${u.username} reconnected`, gameId);
      } else {
        sysChat(`${u.username} just joined game ${gameId}`, gameId);
      }

      // If the other player isn't online and no countdown is running for them,
      // start one now. Handles server-restart recovery.
      if (!game.winner) {
        const otherKey    = `${gameId}:${otherColor}`;
        const otherOnline = Array.from(connectedUsers.values()).some(x => x.username === otherUsername && !x.spectating);
        if (!otherOnline && !disconnectTimeouts.has(otherKey)) {
          game.disconnectedColor = otherColor;
          game.disconnectedAt    = Date.now();
          sysChat(`Waiting for ${otherUsername} — 60 s to reconnect`, gameId);
          const t = setTimeout(() => {
            disconnectTimeouts.delete(otherKey);
            const g = activeGames.get(gameId);
            if (!g || g.winner || g.disconnectedColor !== otherColor) return;
            const winner = otherColor === 'red' ? 'black' : 'red';
            const next   = { ...g, winner, disconnectedColor: null, disconnectedAt: null };
            activeGames.set(gameId, next);
            io.to(`game:${gameId}`).emit('game:state', next);
            endGame(gameId, winner, 'disconnect');
          }, 60_000);
          disconnectTimeouts.set(otherKey, t);
        }
      }
    }

    // Broadcast state to the room so reconnect/spectate is visible to everyone;
    // for DB-loaded ended games the socket just joined so the room = only them.
    io.to(`game:${gameId}`).emit('game:state', liveState(game));
    socket.emit('game:started', {
      gameId, gameColor: game.color,
      red: game.red, black: game.black, eloInfo: game.eloInfo,
    });
    broadcastLobby();
  });

  // ── Move ──
  socket.on('game:move', ({ gameId, to, from }) => {
    if (typeof gameId !== 'string' || !isValidSlot(to)) return;
    if (from !== undefined && from !== null && !isValidSlot(from)) return;
    const game = activeGames.get(gameId);
    if (!game || game.winner) return;
    const u = connectedUsers.get(socket.id);
    if (!u) return;
    const color = game.red.username === u.username ? 'red' : game.black.username === u.username ? 'black' : null;
    if (!color || color !== game.currentPlayer) return;

    if (game.phase === 'placement') {
      if (from || game.pieces[slotKey(to)]) return;
    } else {
      if (!from) return;
      if (game.pieces[slotKey(from)] !== color) return;
      if (!legalMoves(from, game.pieces).some(s => slotKey(s) === slotKey(to))) return;
    }

    const next = applyMoveWithDraw(game, to, from);
    activeGames.set(gameId, next);
    io.to(`game:${gameId}`).emit('game:state', next);
    for (const inst of bots.values()) inst.onGameState(gameId, next);
    if (next.winner) endGame(gameId, next.winner, next.drawnBy ? 'repetition' : 'board');
    else saveGame(next);
  });

  // ── Resign ──
  socket.on('game:resign', ({ gameId }) => {
    if (typeof gameId !== 'string') return;
    const game = activeGames.get(gameId);
    if (!game || game.winner) return;
    const u = connectedUsers.get(socket.id);
    if (!u) return;
    const color = game.red.username === u.username ? 'red' : game.black.username === u.username ? 'black' : null;
    if (!color) return;
    const winner = color === 'red' ? 'black' : 'red';
    const next = { ...game, resignedBy: color, winner };
    activeGames.set(gameId, next);
    io.to(`game:${gameId}`).emit('game:state', next);
    endGame(gameId, winner, 'resign');
  });

  // ── Timeout (client reports own clock hit 0) ──
  socket.on('game:timeout', ({ gameId }) => {
    if (typeof gameId !== 'string') return;
    const game = activeGames.get(gameId);
    if (!game || game.winner) return;
    const u = connectedUsers.get(socket.id);
    if (!u) return;
    const loserColor = game.red.username === u.username ? 'red' : game.black.username === u.username ? 'black' : null;
    if (!loserColor) return;
    const winner = loserColor === 'red' ? 'black' : 'red';
    const next = { ...game, winner, timedOutBy: loserColor };
    activeGames.set(gameId, next);
    io.to(`game:${gameId}`).emit('game:state', next);
    endGame(gameId, winner, 'timeout');
  });

  // ── Leave game room (navigating away from game page) ──
  socket.on('game:leave', (gameId) => {
    const u = connectedUsers.get(socket.id);
    if (!u || u.gameId !== gameId) return;
    u.gameId = null; u.gameColor = null; u.spectating = false; u.reviewing = false;
    socket.leave(`game:${gameId}`);
    broadcastLobby();
  });


  // ── Disconnect ──
  socket.on('disconnect', () => {
    const u = connectedUsers.get(socket.id);
    if (!u) return;
    gameProposals.delete(u.username);
    connectedUsers.delete(socket.id);
    sysChat(`${u.username} just disconnected`, 'lobby');
    broadcastLobby();

    // If the player was in an active game, handle reconnect window (skip for spectators)
    if (u.gameId && !u.spectating) {
      const game = activeGames.get(u.gameId);
      if (game && !game.winner) {
        const color         = game.red.username === u.username ? 'red' : 'black';
        const otherColor    = color === 'red' ? 'black' : 'red';
        const gid           = u.gameId;
        const username      = u.username;
        const key           = `${gid}:${color}`;

        const existing = disconnectTimeouts.get(key);
        if (existing) { clearTimeout(existing); disconnectTimeouts.delete(key); }

        // Check if the other player is still connected
        const otherUsername = game[otherColor].username;
        const otherOnline   = Array.from(connectedUsers.values()).some(x => x.username === otherUsername);

        if (!otherOnline) {
          // Both players are now gone — cancel any running countdown for the
          // other player and hold the game indefinitely; the first one to
          // rejoin will start the 60 s window (handled in game:join).
          const otherKey = `${gid}:${otherColor}`;
          const otherT   = disconnectTimeouts.get(otherKey);
          if (otherT) { clearTimeout(otherT); disconnectTimeouts.delete(otherKey); }
          game.disconnectedColor = null;
          game.disconnectedAt    = null;
        } else {
          // Other player is still watching — start 60 s window for this player
          game.disconnectedColor = color;
          game.disconnectedAt    = Date.now();
          io.to(`game:${gid}`).emit('game:state', liveState(game));
          sysChat(`${username} disconnected — 60 s to reconnect`, gid);

          const t = setTimeout(() => {
            disconnectTimeouts.delete(key);
            const g = activeGames.get(gid);
            if (!g || g.winner || g.disconnectedColor !== color) return;
            const winner = color === 'red' ? 'black' : 'red';
            const next   = { ...g, winner, disconnectedColor: null, disconnectedAt: null };
            activeGames.set(gid, next);
            io.to(`game:${gid}`).emit('game:state', next);
            endGame(gid, winner, 'disconnect');
          }, 60_000);
          disconnectTimeouts.set(key, t);
        }
      }
    }
  });

  // ── Async setup: verify user in DB, update real ELO, announce to lobby ──
  // This runs AFTER all event handlers are registered so no incoming event
  // can be dropped while we wait for the database.
  const dbUser = await User.findById(socket.userId).catch(() => null);
  if (!dbUser) {
    connectedUsers.delete(socket.id);
    socket.disconnect();
    return;
  }

  const entry = connectedUsers.get(socket.id);
  if (entry) {
    entry.elo = dbUser.elo;
    // After a server restart, restore gameId for players with an active game
    const ongoing = Array.from(activeGames.values()).find(
      g => !g.winner && (g.red.username === socket.username || g.black.username === socket.username)
    );
    if (ongoing) { entry.gameId = ongoing.id; entry.gameColor = ongoing.color; }
  }

  // Kick any stale entry for same username (reconnect from another tab/page)
  for (const [sid, u] of connectedUsers) {
    if (u.username === socket.username && sid !== socket.id) {
      connectedUsers.delete(sid);
      break;
    }
  }

  socket.emit('lobby:state', lobbySnapshot());
  sysChat(`${socket.username} just connected`, 'lobby');
  broadcastLobby();
  const since = new Date(Date.now() - 60_000);
  const history = await Chat.find({ createdAt: { $gte: since } }).sort({ createdAt: 1 }).limit(500).lean();
  socket.emit('chat:history', history);
});

// ── End game ────────────────────────────────────────────────────────────────
async function endGame(gameId, winner, reason) {
  const game = activeGames.get(gameId);
  if (!game) return;

  const redScore   = winner === 'red' ? 1 : winner === 'draw' ? 0.5 : 0;
  const blackScore = 1 - redScore;
  const redDelta   = calcEloDelta(game.red.elo,   game.black.elo, redScore);
  const blackDelta = calcEloDelta(game.black.elo, game.red.elo,   blackScore);
  const newRedElo   = Math.max(100, game.red.elo   + redDelta);
  const newBlackElo = Math.max(100, game.black.elo + blackDelta);

  const durationMs = game.startedAt ? Date.now() - game.startedAt : null;
  const today = new Date().toISOString().slice(0, 10);

  await Promise.all([
    User.findByIdAndUpdate(game.red.userId,   { elo: newRedElo }),
    User.findByIdAndUpdate(game.black.userId, { elo: newBlackElo }),
    EloHistory.updateOne(
      { userId: game.red.userId,   date: today },
      { $max: { elo: newRedElo },   $set: { username: game.red.username } },
      { upsert: true }
    ),
    EloHistory.updateOne(
      { userId: game.black.userId, date: today },
      { $max: { elo: newBlackElo }, $set: { username: game.black.username } },
      { upsert: true }
    ),
  ]).catch(console.error);

  // Update game record with final ELO data
  Game.findOneAndUpdate({ gameId }, { $set: {
    status: 'ended', winner,
    drawnBy: game.drawnBy || null,
    redEloAfter: newRedElo, blackEloAfter: newBlackElo,
    redEloDelta: redDelta,  blackEloDelta: blackDelta,
    durationMs,
  }}).catch(console.error);

  // Update ELO and mark everyone still in the room as spectating
  // (keeps their gameId set so the lobby shows the faded circle until they leave)
  for (const [, u] of connectedUsers) {
    if (u.username === game.red.username)   u.elo = newRedElo;
    if (u.username === game.black.username) u.elo = newBlackElo;
    if (u.gameId === gameId) { u.spectating = true; u.reviewing = true; }
  }

  const isDraw = winner === 'draw';
  const winnerName = isDraw ? null : (winner === 'red' ? game.red.username : game.black.username);
  const reasonMsg  = reason === 'resign' ? ' (by resignation)' : reason === 'timeout' ? ' (on time)' : reason === 'disconnect' ? ' (opponent disconnected)' : reason === 'repetition' ? ' (threefold repetition)' : '';

  io.to(`game:${gameId}`).emit('game:over', {
    winner, reason, winnerName,
    redDelta, blackDelta, newRedElo, newBlackElo,
  });
  if (isDraw) {
    sysChat(`Draw${reasonMsg}!`, gameId);
    sysChat(`${game.red.username} vs ${game.black.username} — draw${reasonMsg}`, 'lobby');
  } else {
    sysChat(`${winnerName} wins${reasonMsg}!`, gameId);
    sysChat(`${winnerName} won a game${reasonMsg}`, 'lobby');
  }

  activeGames.delete(gameId);

  // Notify whichever bot instance was playing (if any)
  for (const [name, inst] of bots) {
    if (game.red.username === name || game.black.username === name) {
      const botNewElo = game.red.username === name ? newRedElo : newBlackElo;
      inst.onBotGameEnded(botNewElo);
    }
  }

  broadcastLobby();
}

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Furukoo server on :${PORT}`));
