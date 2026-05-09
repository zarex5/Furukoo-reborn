# AGENTS.md

## Structure

Two completely separate npm packages in one git repo. No workspaces, no shared build tooling.

```
furukoo/          ← CLIENT (Vite + React + TypeScript + Tailwind)
└── server/       ← SERVER (Node.js + Express + Socket.IO + Mongoose, CommonJS)
```

**`npm install` at the root does NOT install server dependencies.** Must run separately:
```sh
npm install              # client deps
cd server && npm install # server deps
```

---

## Commands

### Client (from repo root)

```sh
npm run dev      # Vite dev server (proxies /api/* and /socket.io/* to localhost:3001)
npm run build    # tsc -b && vite build (TypeScript type-checks first, Vite bundles)
npm run preview  # preview production build
npx eslint src/  # lint — there is NO "lint" script in package.json
```

**`npm run build` quirks:**
- `tsc -b` uses composite project references (`tsconfig.app.json` + `tsconfig.node.json`). `noEmit: true` — TS only type-checks; Vite does bundling.
- `noUnusedLocals` and `noUnusedParameters` are both `true`. Unused variables **fail the build**.
- `erasableSyntaxOnly: true` (TS 5.5+). No `const enum`, no namespaces, no decorators. Prefer `type` imports.

### Server (from `server/`)

```sh
node index.js     # production
nodemon index.js  # dev (auto-restart)
```

**No test suite exists anywhere.**

---

## Environment

Only the server uses env vars. Client has no `.env` and no `VITE_*` variables.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `MONGO_URI` | Yes | `mongodb://localhost:27017/furukoo` | Must exist in `server/.env` |
| `JWT_SECRET` | **Yes in prod** | Random per-process | Server exits if missing in production |
| `PORT` | No | `3001` | |
| `ALLOWED_ORIGIN` | No | `*` | CORS |
| `ADMIN_USERNAME` | No | — | Idempotent: promotes user to admin on startup |

`server/.env` is gitignored. `server/.env.example` is committed. After cloning, create `server/.env`.

---

## Architecture

### Client entrypoints
- `index.html` → `src/main.tsx` (wrapped in `StrictMode`, `BrowserRouter`, `AuthProvider`)
- `src/App.tsx` — route definitions; guards read `useAuth().user` and `user.isAdmin`
- All REST calls go through `src/lib/api.ts` (typed wrappers). Add new endpoints here.
- Socket.IO: `src/lib/socket.ts` exports a module-level singleton. `connectSocket()` is called in `AuthContext`. `getSocket()` returns `null` before connection — always guard against it.
- Chat: `src/lib/chatStore.ts` is a plain JS singleton (not Redux/Zustand/Context). `useChatMessages()` subscribes to it. Messages persist across page navigations (intentional).
- Auth token stored in `localStorage` under key `furukoo_auth`. `api.ts` reads it directly — works outside React components.

### Server entrypoint
- **Single file**: `server/index.js` (~1200 lines). Contains Express setup, all Mongoose schemas (inline), all REST routes, all Socket.IO handlers, in-memory state Maps, and bot management.
- All Mongoose models are defined inline — no separate model files, no migration scripts.
- In-memory state (`connectedUsers`, `gameProposals`, `activeGames`, `disconnectTimeouts`) is lost on restart. `loadActiveGames()` reloads active games from MongoDB on startup, but proposals and connected users are gone.

### Vite proxy (dev only)
`/api/*` and `/socket.io/*` proxy to `http://localhost:3001`. In production, a reverse proxy (nginx, Caddy, etc.) must forward the same paths. The client uses relative URLs only — no `VITE_API_URL`.

---

## Non-Obvious Gotchas

1. **gameLogic is duplicated.** `src/gameLogic.ts` (ESM/TS) and `server/gameLogic.js` (CommonJS) implement the same logic independently. The slot key format `${line}${type}${slot}` (e.g. `"1V3"`, `"4H7"`) **must match exactly** in both. Change one → change the other.

2. **Dark mode is NOT a class on `<html>`.** `tailwind.config.js` sets `darkMode: 'class'` but the app never adds `dark` to `document.documentElement`. Dark state comes from `useDarkMode()` and is prop-drilled. `dark:` Tailwind variants only work in components that explicitly pass and use the `isDark` prop. Do not rely on the class being on `html`.

3. **Socket.IO handlers must be registered before any `await` in the connect callback.** There is a comment in `server/index.js` around line 733–735: all `socket.on()` calls must precede the `await User.findById()` call, or buffered client events are silently dropped.

4. **Bots have no real sockets.** Bot moves bypass socket auth and call `botMove()` directly. Their `connectedUsers` entry is a synthetic object populated by `bot.js`. Handlers that check `connectedUsers` must account for this.

5. **Chat `id` is a custom field, not Mongoose `_id`.** The `Chat` schema has `id: { type: String, index: true }` — a custom `genId()` hex string. The client deduplicates by this field. Do not confuse with `_id`.

6. **ELO history stores only the daily maximum.** `EloHistory.updateOne` uses `$max` — only the highest ELO seen on a given day is saved.

7. **Threefold repetition is server-only.** `positionCounts` tracking exists only in `server/index.js` and `server/gameLogic.js`. `src/gameLogic.ts` does not implement it.

8. **Client timer is local approximation.** Server is authoritative (`redTimeMs`, `blackTimeMs`, `lastMoveAt`). Client reports timeout via `game:timeout`; server verifies with a 3-second grace window.

9. **`saveGame()` is fire-and-forget.** In-memory `activeGames` Map is the source of truth. DB is only for persistence across restarts.

10. **`gameId` format**: `Math.random().toString(36).slice(2, 11)` — a 9-character base-36 string. Used as both Socket.IO room name and URL param.

---

## Conventions

- All API calls use typed wrappers in `src/lib/api.ts`. New REST endpoints get a typed entry there.
- `ResizableSplit` is the canonical drag-to-resize component. Do not reimplement.
- `Tip` wraps `@radix-ui/react-tooltip` with no delay. Use it for tooltips; avoid HTML `title`.
- `font-mono` for all game data (clocks, ELO, move counts). Violet (`violet-500/600`) is the brand accent. Red/black are reserved for game player colors.
- Server is CommonJS (`require`/`module.exports`). Do not add ESM syntax to `server/`.

---

## No CI/CD

No `.github/workflows/` files exist.
