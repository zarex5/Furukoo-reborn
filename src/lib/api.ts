const BASE = '/api';

function authHeaders(): Record<string, string> {
  try {
    const data = JSON.parse(localStorage.getItem('furukoo_auth') || 'null') as { token?: string } | null;
    if (data?.token) return { Authorization: `Bearer ${data.token}` };
  } catch { /* */ }
  return {};
}

async function getAuth<T>(path: string): Promise<T> {
  let res: Response;
  try { res = await fetch(BASE + path, { headers: authHeaders() }); }
  catch { throw new Error('Cannot reach server'); }
  const text = await res.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = {}; }
  if (!res.ok) throw new Error((data as Record<string, string>).error || `Server error (${res.status})`);
  return data as T;
}

async function putAuth(path: string, body: Record<string, unknown>): Promise<void> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    });
  } catch { throw new Error('Cannot reach server'); }
  if (!res.ok) {
    const text = await res.text();
    let data: Record<string, string> = {};
    try { data = JSON.parse(text); } catch { /* */ }
    throw new Error(data.error || `Server error (${res.status})`);
  }
}

async function postAuth<T = Record<string, unknown>>(path: string, body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    });
  } catch { throw new Error('Cannot reach server'); }
  const text = await res.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = {}; }
  if (!res.ok) throw new Error((data as Record<string, string>).error || `Server error (${res.status})`);
  return data as T;
}

async function post(path: string, body: Record<string, string>) {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Cannot reach server — is it running on port 3001?');
  }
  const text = await res.text();
  let data: Record<string, string> = {};
  try { data = JSON.parse(text); } catch { /* server returned non-JSON */ }
  if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
  return data as unknown as { token: string; username: string; elo: number };
}

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path);
  } catch {
    throw new Error('Cannot reach server');
  }
  const text = await res.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = {}; }
  if (!res.ok) throw new Error((data as Record<string, string>).error || `Server error (${res.status})`);
  return data as T;
}

export interface ProfileData {
  username: string;
  elo: number;
  isBot?: boolean;
  gamesPlayed: number;
  minutesPlayed: number;
  joinDate: string;
  isGuest: boolean;
}

export interface LeaderboardRow {
  rank: number;
  username: string;
  elo: number;
  gamesPlayed: number;
}

export interface LeaderboardData {
  rows: LeaderboardRow[];
  separatorAfter: number | null;
  userRank: number;
}

export interface EloPoint { date: string; elo: number; }

export interface GameMeta {
  gameId: string;
  opponent: string;
  result: 'win' | 'loss' | 'draw';
  eloDelta: number | null;
  eloAfter: number | null;
  myMoves: number;
  opponentMoves: number;
  moveCount: number;
  durationMs: number | null;
  date: string;
}

export interface RecordsData {
  leastMoves:   GameMeta | null;
  mostMoves:    GameMeta | null;
  shortestGame: GameMeta | null;
  longestGame:  GameMeta | null;
}

export interface GamesPage {
  games: GameMeta[];
  total: number;
  page: number;
  totalPages: number;
}

export interface AdminBot {
  username:    string;
  elo:         number;
  level:       number;
  enabled:     boolean;
  gamesPlayed: number;
  inGame:      boolean;
}

export interface AdminPlayer {
  username:     string;
  elo:          number;
  gamesPlayed:  number;
  messageCount: number;
  joinDate:     string;
  isAdmin:      boolean;
  isMuted:      boolean;
  isBanned:     boolean;
}

export interface AdminPlayersPage {
  players:    AdminPlayer[];
  total:      number;
  page:       number;
  totalPages: number;
}

export const api = {
  register: (username: string, password: string, email: string) =>
    post('/register', { username, password, email }),
  login:    (username: string, password: string) => post('/login', { username, password }),
  guest:    () => post('/guest', {}),

  profile:     (username: string) => get<ProfileData>(`/profile/${encodeURIComponent(username)}`),
  leaderboard: (username?: string) => get<LeaderboardData>(`/leaderboard${username ? `?username=${encodeURIComponent(username)}` : ''}`),
  eloHistory:  (username: string) => get<EloPoint[]>(`/profile/${encodeURIComponent(username)}/elo-history`),
  gameRecords: (username: string) => get<RecordsData>(`/profile/${encodeURIComponent(username)}/records`),
  userGames:   (username: string, page: number) => get<GamesPage>(`/profile/${encodeURIComponent(username)}/games?page=${page}`),

  admin: {
    bots:      () => getAuth<AdminBot[]>('/admin/bots'),
    createBot: (username: string, level: number) => postAuth('/admin/bots', { username, level }),
    updateBot: (username: string, updates: { username?: string; level?: number; enabled?: boolean }) =>
      putAuth(`/admin/bots/${encodeURIComponent(username)}`, updates as Record<string, unknown>),
    players: (page: number, search?: string) =>
      getAuth<AdminPlayersPage>(`/admin/players?page=${page}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
    setAdmin: (username: string, isAdmin: boolean) =>
      putAuth(`/admin/players/${encodeURIComponent(username)}/admin`, { isAdmin }),
    setMute:  (username: string, isMuted: boolean) =>
      putAuth(`/admin/players/${encodeURIComponent(username)}/mute`, { isMuted }),
    setBan:   (username: string, isBanned: boolean) =>
      putAuth(`/admin/players/${encodeURIComponent(username)}/ban`, { isBanned }),
  },
};
