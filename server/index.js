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
  .then(() => console.log('MongoDB connected'))
  .catch(e => console.error('MongoDB error:', e.message));

const UserSchema = new mongoose.Schema({
  username:     { type: String, unique: true, required: true, trim: true },
  passwordHash: { type: String, required: true },
  elo:          { type: Number, default: 1200 },
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

const JWT_SECRET = process.env.JWT_SECRET || 'furukoo-dev-secret';
const sign = (user) => jwt.sign({ userId: user._id.toString(), username: user.username }, JWT_SECRET, { expiresIn: '30d' });

// ── Auth REST ────────────────────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username?.trim() || !password) return res.status(400).json({ error: 'Username and password required' });
    if (username.trim().length < 2)      return res.status(400).json({ error: 'Username must be at least 2 characters' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username: username.trim(), passwordHash });
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
      username: u.username, elo: u.elo, gameId: u.gameId || null, gameColor: u.gameColor || null,
    })),
    proposals: Array.from(gameProposals.values()),
  };
}
function broadcastLobby() { io.emit('lobby:state', lobbySnapshot()); }

function sysLobby(text) { io.emit('chat:lobby', { type: 'system', text }); }
function sysGame(gameId, text) { io.to(`game:${gameId}`).emit('chat:game', { type: 'system', text }); }
function fmt(n) { return (n >= 0 ? '+' : '') + n; }

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
  // Register immediately — before the async DB lookup — so that game:join and
  // other events buffered by Socket.io during connection don't race against
  // connectedUsers and silently get dropped (u would be undefined otherwise).
  connectedUsers.set(socket.id, {
    socketId: socket.id, userId: socket.userId,
    username: socket.username, elo: 1200, // placeholder; updated after DB lookup
    gameId: null, gameColor: null,
  });

  const dbUser = await User.findById(socket.userId).catch(() => null);
  if (!dbUser) {
    connectedUsers.delete(socket.id); // clean up placeholder
    socket.disconnect();
    return;
  }

  // Update placeholder with real ELO
  const entry = connectedUsers.get(socket.id);
  if (entry) entry.elo = dbUser.elo;

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

  // ── Lobby chat ──
  socket.on('lobby:chat', (text) => {
    if (typeof text !== 'string' || !text.trim()) return;
    io.emit('chat:lobby', { type: 'user', username: socket.username, text: text.trim().slice(0, 200) });
  });

  // ── Game proposals ──
  socket.on('game:propose', () => {
    const u = connectedUsers.get(socket.id);
    if (!u || u.gameId || gameProposals.has(u.username)) return;
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
    if (!accepter || accepter.gameId) return;
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
      // board state
      pieces: {}, currentPlayer: 'red',
      redPlaced: 0, blackPlaced: 0, phase: 'placement',
      moves: [], winner: null, resignedBy: null,
      redTimeMs: INITIAL_TIME_MS, blackTimeMs: INITIAL_TIME_MS,
      lastMoveAt: Date.now(),
      disconnectedColor: null, disconnectedAt: null,
    };

    activeGames.set(gameId, game);
    redU.gameId   = gameId; redU.gameColor   = gameColor;
    blackU.gameId = gameId; blackU.gameColor = gameColor;

    const redSock   = io.sockets.sockets.get(redU.socketId);
    const blackSock = io.sockets.sockets.get(blackU.socketId);
    if (redSock)   redSock.join(`game:${gameId}`);
    if (blackSock) blackSock.join(`game:${gameId}`);

    broadcastLobby();
    sysLobby(`Game started: ${redU.username} vs ${blackU.username}`);

    // Emit directly to each socket ID (belt-and-suspenders: room join above may race)
    const startedPayload = { gameId, gameColor, red: game.red, black: game.black, eloInfo: info };
    io.to(redU.socketId).emit('game:started', startedPayload);
    io.to(blackU.socketId).emit('game:started', startedPayload);
    io.to(`game:${gameId}`).emit('game:state', game);

  });

  // ── Join game room (on page load/reload) ──
  socket.on('game:join', (gameId) => {
    const game = activeGames.get(gameId);
    if (!game) { socket.emit('game:error', { message: 'Game not found' }); return; }
    const u = connectedUsers.get(socket.id);
    if (!u) return;
    const isRed   = game.red.username   === u.username;
    const isBlack = game.black.username === u.username;
    if (!isRed && !isBlack) { socket.emit('game:error', { message: 'Not a player in this game' }); return; }

    const color = isRed ? 'red' : 'black';

    // Keep connectedUsers in sync so lobby shows correct game status
    u.gameId    = gameId;
    u.gameColor = game.color;

    socket.join(`game:${gameId}`);

    // Clear reconnect countdown if this player was disconnected
    if (game.disconnectedColor === color) {
      const key = `${gameId}:${color}`;
      const t = disconnectTimeouts.get(key);
      if (t) { clearTimeout(t); disconnectTimeouts.delete(key); }
      game.disconnectedColor = null;
      game.disconnectedAt    = null;
      sysGame(gameId, `${u.username} reconnected`);
      io.to(`game:${gameId}`).emit('game:state', { ...game });
      broadcastLobby();
    }

    socket.emit('game:state', game);
    socket.emit('game:started', {
      gameId, gameColor: game.color,
      red: game.red, black: game.black, eloInfo: game.eloInfo,
    });
  });

  // ── Move ──
  socket.on('game:move', ({ gameId, to, from }) => {
    const game = activeGames.get(gameId);
    if (!game || game.winner) return;
    const u = connectedUsers.get(socket.id);
    if (!u) return;
    const color = game.red.username === u.username ? 'red' : game.black.username === u.username ? 'black' : null;
    if (!color || color !== game.currentPlayer) return;

    // Validate
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

  // ── Game chat ──
  socket.on('game:chat', ({ gameId, text }) => {
    if (typeof text !== 'string' || !text.trim()) return;
    const game = activeGames.get(gameId);
    if (!game) return;
    io.to(`game:${gameId}`).emit('chat:game', { type: 'user', username: socket.username, text: text.trim().slice(0, 200) });
  });

  // ── Disconnect ──
  socket.on('disconnect', () => {
    const u = connectedUsers.get(socket.id);
    if (!u) return;
    gameProposals.delete(u.username);
    connectedUsers.delete(socket.id);
    sysLobby(`${u.username} just disconnected`);
    broadcastLobby();

    // If the player was in an active game, start a 60-second reconnect window
    if (u.gameId) {
      const game = activeGames.get(u.gameId);
      if (game && !game.winner) {
        const color    = game.red.username === u.username ? 'red' : 'black';
        const gameId   = u.gameId;
        const username = u.username;
        const key      = `${gameId}:${color}`;

        // Clear any stale timeout for this slot
        const existing = disconnectTimeouts.get(key);
        if (existing) { clearTimeout(existing); disconnectTimeouts.delete(key); }

        game.disconnectedColor = color;
        game.disconnectedAt    = Date.now();
        io.to(`game:${gameId}`).emit('game:state', { ...game });
        sysGame(gameId, `${username} disconnected — 60 s to reconnect`);

        const t = setTimeout(() => {
          disconnectTimeouts.delete(key);
          const g = activeGames.get(gameId);
          if (!g || g.winner || g.disconnectedColor !== color) return;
          // Still disconnected after 60 s → forfeit
          const winner = color === 'red' ? 'black' : 'red';
          const next   = { ...g, winner, disconnectedColor: null, disconnectedAt: null };
          activeGames.set(gameId, next);
          io.to(`game:${gameId}`).emit('game:state', next);
          endGame(gameId, winner, 'disconnect');
        }, 60_000);
        disconnectTimeouts.set(key, t);
      }
    }
  });
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

  // Update online users' ELO and clear game
  for (const [, u] of connectedUsers) {
    if (u.username === game.red.username)   { u.elo = newRedElo;   u.gameId = null; u.gameColor = null; }
    if (u.username === game.black.username) { u.elo = newBlackElo; u.gameId = null; u.gameColor = null; }
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

  activeGames.delete(gameId);
  broadcastLobby();
}

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Furukoo server on :${PORT}`));
