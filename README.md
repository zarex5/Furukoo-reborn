# Furukoo

A real-time multiplayer board game where two players race to form a **4-in-a-square** pattern on a grid.  
Built with React, Socket.IO, and Node.js.

🌐 **Live at [furukoo.llegrand.fr](https://furukoo.llegrand.fr)**

---

## Gameplay

Furukoo is a two-phase strategy game:

1. **Placement phase** — Players alternate placing 7 pieces each on the board
2. **Movement phase** — Players move pieces to adjacent slots, trying to form a 2×2 square

**Win** by forming four of your pieces in a square pattern.  
**Draw** by threefold position repetition (detected server-side).  
**Lose** by resigning or running out of time (5 min + 3 sec/move).

---

## Features

### Multiplayer & Matchmaking
- Real-time gameplay via Socket.IO with live board sync
- Lobby proposal system — announce you want to play, accept/decline challenges
- Live player list showing ELO, in-game status, and spectator count
- Spectate any ongoing game in real-time
- 60-second reconnect window — accidental disconnects don't forfeit your game

### ELO & Ranking
- Dynamic ELO rating (K=60) updated after every game
- Eight ELO brackets from 1000 to 3000+
- Pre-game ELO swing preview
- ELO history chart with 1-year rolling window

### Profiles & Leaderboard
- Player profiles with full career stats (games, time played, win rate)
- Detailed game records: shortest/longest games, min/max moves
- Global top-10 leaderboard, context-aware for logged-in users
- Paginated match history with full game metadata

### Bot AI
- 10 configurable difficulty levels
- Minimax with alpha-beta pruning and move ordering
- Level 1: shallow search, 50% error rate, fast responses
- Level 10: deep search (5 moves ahead), no errors, realistic think time
- Bots run server-side — no WebSocket overhead

### Chat
- Unified chat across lobby and active games
- Chat history replay on reconnect (last 60 seconds)
- Spectator badge on messages
- System messages for game events

### Admin Panel
- Mute, ban, or promote players
- Create and manage bots (name, difficulty, enable/disable)
- Search and paginate all users with full stats
- Ban enforcement: disconnects the user and blocks re-login

### Auth & Accounts
- Email + password registration with JWT auth (30-day tokens)
- Guest accounts with auto-generated usernames (rate-limited)
- Password hashing with bcryptjs

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Routing | React Router v7 |
| Charts | Recharts |
| Real-time | Socket.IO (client + server) |
| Backend | Node.js, Express |
| Database | MongoDB + Mongoose |
| Auth | JWT + bcryptjs |
| Security | Helmet, express-rate-limit |

---

## Running Locally

### Prerequisites
- Node.js v16+
- MongoDB (local or Docker)

### Setup

```bash
# Clone and install frontend deps
git clone https://github.com/zarex5/Furukoo-reborn.git
cd furukoo
npm install

# Install backend deps
cd server && npm install && cd ..

# Configure backend
cp server/.env.example server/.env
# Edit server/.env — see Environment Variables below
```

### Start

```bash
# Terminal 1 — frontend (Vite on :5173, proxies /api and /socket.io to :3001)
npm run dev

# Terminal 2 — backend
cd server && npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Build for Production

```bash
npm run build        # outputs to dist/
npm run preview      # test the production bundle locally
```

---

## Environment Variables

Create `server/.env` (see `server/.env.example`):

| Variable | Required | Default | Description |
|---|---|---|---|
| `MONGO_URI` | Yes | `mongodb://localhost:27017/furukoo` | MongoDB connection string |
| `JWT_SECRET` | **Yes (prod)** | Random | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `PORT` | No | `3001` | Server port |
| `ALLOWED_ORIGIN` | No | `*` | CORS origin — set to your domain in production |
| `ADMIN_USERNAME` | No | — | Auto-promotes this username to admin on startup |

---

## Deploying

**Backend** — run with pm2:
```bash
cd server
pm2 start index.js --name furukoo-server
pm2 save && pm2 startup
```

**Frontend** — build and serve with nginx:
```nginx
server {
    root /var/www/furukoo/dist;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3001;
    }

    location /socket.io {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## License

MIT
