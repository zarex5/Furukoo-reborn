'use strict';
require('dotenv').config();
const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { slotKey, legalMoves, applyMove, calcEloDelta, eloInfo, getEloRange, INITIAL_TIME_MS } = require('./gameLogic');

// ── App setup ────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*' }, // Vite proxy in dev; set origin explicitly for prod
});

app.use(express.json());

// ── MongoDB ──────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/furukoo')
  .then(async () => {
    console.log('MongoDB connected');
    await loadActiveGames();
  })
  .catch(e => console.error('MongoDB error:', e.message));

const UserSchema = new mongoose.Schema({
  username:     { type: String, unique: true, required: true, trim: true },
  passwordHash: { type: String, required: true },
  elo:          { type: Number, default: 1200 },
  email:        { type: String, trim: true, default: '' },
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
  redTimeMs:     Number,
  blackTimeMs:   Number,
  lastMoveAt:    { type: Number, default: Date.now },
  status:        { type: String, enum: ['active', 'ended'], default: 'active' },
  chat:          { type: M, default: [] },
}, { timestamps: true });

const Game = mongoose.model('Game', GameSchema);

const LobbyChatSchema = new mongoose.Schema({
  type:     { type: String, required: true },
  username: String,
  text:     { type: String, required: true },
}, { timestamps: true });
const LobbyChat = mongoose.model('LobbyChat', LobbyChatSchema);

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
      redTimeMs: game.redTimeMs, blackTimeMs: game.blackTimeMs,
      lastMoveAt: game.lastMoveAt,
      status: game.winner ? 'ended' : 'active',
      chat: game.chat || [],
    },
    { upsert: true }
  ).catch(e => console.error('saveGame:', e.message));
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
    users:     Array.from(connectedUsers.values()).map(u => ({
      username: u.username, elo: u.elo,
      gameId: u.gameId || null, gameColor: u.gameColor || null,
      spectating: u.spectating || false,
    })),
    proposals: Array.from(gameProposals.values()),
  };
}
function broadcastLobby() { io.emit('lobby:state', lobbySnapshot()); }

function sysLobby(text) {
  const msg = { type: 'system', text };
  io.emit('chat:lobby', msg);
  LobbyChat.create(msg).catch(e => console.error('lobbyChat:', e.message));
}
function sysGame(gameId, text) {
  const msg = { type: 'system', text };
  io.to(`game:${gameId}`).emit('chat:game', msg);
  const game = activeGames.get(gameId);
  if (game) { game.chat.push(msg); saveGame(game); }
}
function fmt(n) { return (n >= 0 ? '+' : '') + n; }

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
      redTimeMs: g.redTimeMs, blackTimeMs: g.blackTimeMs,
      lastMoveAt: Date.now(), // reset so downtime doesn't eat the clock
      disconnectedColor: null, disconnectedAt: null,
      chat: g.chat || [],
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
    gameId: null, gameColor: null, spectating: false,
  });

  // ── Lobby chat ──
  socket.on('lobby:chat', (text) => {
    if (typeof text !== 'string' || !text.trim()) return;
    const msg = { type: 'user', username: socket.username, text: text.trim().slice(0, 200) };
    io.emit('chat:lobby', msg);
    LobbyChat.create(msg).catch(e => console.error('lobbyChat:', e.message));
  });

  // ── Game proposals ──
  socket.on('game:propose', () => {
    const u = connectedUsers.get(socket.id);
    if (!u) return;
    // Allow re-entry from spectating (game over)
    if (u.spectating) { u.gameId = null; u.gameColor = null; u.spectating = false; broadcastLobby(); }
    if (u.gameId || gameProposals.has(u.username)) return;
    gameProposals.set(u.username, { username: u.username, elo: u.elo, eloRange: getEloRange(u.elo) });
    sysLobby(`${u.username} just created a new game`);
    broadcastLobby();
  });

  socket.on('game:remove', () => {
    const u = connectedUsers.get(socket.id);
    if (!u) return;
    if (gameProposals.delete(u.username)) broadcastLobby();
  });

  // ── Accept proposal → start game ──
  socket.on('game:accept', (proposerUsername) => {
    const accepter = connectedUsers.get(socket.id);
    if (!accepter) return;
    // Allow re-entry from spectating (game over)
    if (accepter.spectating) { accepter.gameId = null; accepter.gameColor = null; accepter.spectating = false; }
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
      moves: [], winner: null, resignedBy: null,
      redTimeMs: INITIAL_TIME_MS, blackTimeMs: INITIAL_TIME_MS,
      lastMoveAt: Date.now(),
      disconnectedColor: null, disconnectedAt: null,
      chat: [],
    };

    activeGames.set(gameId, game);
    redU.gameId   = gameId; redU.gameColor   = gameColor;
    blackU.gameId = gameId; blackU.gameColor = gameColor;

    const redSock   = io.sockets.sockets.get(redU.socketId);
    const blackSock = io.sockets.sockets.get(blackU.socketId);
    if (redSock)   redSock.join(`game:${gameId}`);
    if (blackSock) blackSock.join(`game:${gameId}`);

    // Seed chat with ELO stakes for both players (delivered via game:history)
    game.chat.push({ type: 'system', text: `${redU.username}: win ${fmt(info.red.win)} / draw ${fmt(info.red.draw)} / loss ${fmt(info.red.loss)}` });
    game.chat.push({ type: 'system', text: `${blackU.username}: win ${fmt(info.black.win)} / draw ${fmt(info.black.draw)} / loss ${fmt(info.black.loss)}` });

    broadcastLobby();
    sysLobby(`Game started: ${redU.username} vs ${blackU.username}`);

    saveGame(game);

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
        chat: dbGame.chat || [],
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
      sysGame(gameId, `${u.username} is spectating`);
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
        sysGame(gameId, `${u.username} reconnected`);
      }

      // If the other player isn't online and no countdown is running for them,
      // start one now. Handles server-restart recovery.
      if (!game.winner) {
        const otherKey    = `${gameId}:${otherColor}`;
        const otherOnline = Array.from(connectedUsers.values()).some(x => x.username === otherUsername && !x.spectating);
        if (!otherOnline && !disconnectTimeouts.has(otherKey)) {
          game.disconnectedColor = otherColor;
          game.disconnectedAt    = Date.now();
          sysGame(gameId, `Waiting for ${otherUsername} — 60 s to reconnect`);
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
    socket.emit('game:history', { messages: game.chat || [] });
    socket.emit('game:started', {
      gameId, gameColor: game.color,
      red: game.red, black: game.black, eloInfo: game.eloInfo,
    });
    broadcastLobby();
  });

  // ── Move ──
  socket.on('game:move', ({ gameId, to, from }) => {
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

    const next = applyMove(game, to, from);
    activeGames.set(gameId, next);
    io.to(`game:${gameId}`).emit('game:state', next);
    if (next.winner) endGame(gameId, next.winner, 'board');
    else saveGame(next);
  });

  // ── Resign ──
  socket.on('game:resign', ({ gameId }) => {
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
    u.gameId = null; u.gameColor = null; u.spectating = false;
    socket.leave(`game:${gameId}`);
    broadcastLobby();
  });

  // ── Game chat ──
  socket.on('game:chat', ({ gameId, text }) => {
    if (typeof text !== 'string' || !text.trim()) return;
    const u = connectedUsers.get(socket.id);
    if (!u || u.gameId !== gameId) return;
    const msg = { type: 'user', username: socket.username, text: text.trim().slice(0, 200), spectator: u.spectating };
    io.to(`game:${gameId}`).emit('chat:game', msg);
    const game = activeGames.get(gameId);
    if (game) { game.chat.push(msg); saveGame(game); }
  });

  // ── Disconnect ──
  socket.on('disconnect', () => {
    const u = connectedUsers.get(socket.id);
    if (!u) return;
    gameProposals.delete(u.username);
    connectedUsers.delete(socket.id);
    sysLobby(`${u.username} just disconnected`);
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
          sysGame(gid, `${username} disconnected — 60 s to reconnect`);

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
  sysLobby(`${socket.username} just connected`);
  broadcastLobby();
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

  await Promise.all([
    User.findByIdAndUpdate(game.red.userId,   { elo: newRedElo }),
    User.findByIdAndUpdate(game.black.userId, { elo: newBlackElo }),
  ]).catch(console.error);

  // Update ELO and mark everyone still in the room as spectating
  // (keeps their gameId set so the lobby shows the faded circle until they leave)
  for (const [, u] of connectedUsers) {
    if (u.username === game.red.username)   u.elo = newRedElo;
    if (u.username === game.black.username) u.elo = newBlackElo;
    if (u.gameId === gameId) u.spectating = true;
  }

  const winnerName = winner === 'red' ? game.red.username : game.black.username;
  const reasonMsg  = reason === 'resign' ? ' (by resignation)' : reason === 'timeout' ? ' (on time)' : reason === 'disconnect' ? ' (opponent disconnected)' : '';

  io.to(`game:${gameId}`).emit('game:over', {
    winner, reason, winnerName,
    redDelta, blackDelta, newRedElo, newBlackElo,
  });
  sysGame(gameId, `${winnerName} wins${reasonMsg}!`);
  sysGame(gameId, `${game.red.username}: ${fmt(redDelta)} ELO → ${newRedElo}`);
  sysGame(gameId, `${game.black.username}: ${fmt(blackDelta)} ELO → ${newBlackElo}`);
  sysLobby(`${winnerName} won a game${reasonMsg}`);

  Game.findOneAndUpdate({ gameId }, { $set: { status: 'ended', winner } }).catch(console.error);
  activeGames.delete(gameId);
  broadcastLobby();
}

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Furukoo server on :${PORT}`));
