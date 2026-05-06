import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, type ProfileData, type LeaderboardData, type EloPoint, type RecordsData, type GamesPage, type GameMeta } from '../lib/api';
import { FurukooLogo } from '../components/FurukooLogo';
import { DarkToggle } from '../components/DarkToggle';
import { useDarkMode } from '../lib/darkMode';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip as ChartTooltip,
} from 'recharts';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDuration(ms: number | null) {
  if (ms == null) return '—';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDelta(n: number | null) {
  if (n == null) return '—';
  return (n >= 0 ? '+' : '') + n;
}

// ── StatBox ────────────────────────────────────────────────────────────────────

function StatBox({ icon, value, label }: { icon: string; value: string | number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-lg p-4 flex-1 min-w-0">
      <span className="text-2xl">{icon}</span>
      <span className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{value}</span>
      <span className="text-xs font-mono text-slate-400 dark:text-gray-500 text-center">{label}</span>
    </div>
  );
}

// ── GameRecordBox ──────────────────────────────────────────────────────────────

function GameRecordBox({ icon, label, game, navigate }: {
  icon: string; label: string; game: GameMeta | null; navigate: (path: string) => void;
}) {
  if (!game) return (
    <div className="flex flex-col items-center gap-1 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-lg p-4 flex-1 min-w-0">
      <span className="text-2xl">{icon}</span>
      <span className="text-lg font-bold text-slate-400 dark:text-gray-600">—</span>
      <span className="text-xs font-mono text-slate-400 dark:text-gray-500 text-center">{label}</span>
    </div>
  );

  const sub = label.toLowerCase().includes('move')
    ? `${game.moveCount} moves`
    : fmtDuration(game.durationMs);

  return (
    <button
      onClick={() => navigate(`/game/${game.gameId}`)}
      className="flex flex-col items-center gap-1 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-lg p-4 flex-1 min-w-0 hover:border-violet-400 dark:hover:border-violet-500 transition-colors text-left"
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{sub}</span>
      <span className="text-xs font-mono text-slate-400 dark:text-gray-500 text-center">{label}</span>
      <span className="text-xs font-mono text-slate-500 dark:text-gray-400">vs {game.opponent}</span>
    </button>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">{title}</h2>
      {children}
    </div>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 dark:bg-gray-800 rounded ${className}`} />;
}

// ── ELO history chart ──────────────────────────────────────────────────────────

function EloChart({ data, isDark }: { data: EloPoint[]; isDark: boolean }) {
  if (!data.length) return (
    <div className="h-40 flex items-center justify-center text-xs font-mono text-slate-400 dark:text-gray-500">
      No ELO history yet
    </div>
  );

  const tickColor  = isDark ? '#9ca3af' : '#94a3b8';
  const gridColor  = isDark ? '#1f2937' : '#f1f5f9';
  const lineColor  = '#7c3aed';

  const fmt = (d: string) => {
    const dt = new Date(d);
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  // Show at most 8 X-axis ticks
  const step = Math.max(1, Math.ceil(data.length / 8));
  const ticks = data.filter((_, i) => i % step === 0 || i === data.length - 1).map(d => d.date);

  return (
    <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-lg p-4">
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
          <XAxis
            dataKey="date" ticks={ticks} tickFormatter={fmt}
            tick={{ fontSize: 10, fill: tickColor, fontFamily: 'monospace' }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fontSize: 10, fill: tickColor, fontFamily: 'monospace' }}
            axisLine={false} tickLine={false} width={40}
          />
          <ChartTooltip
            contentStyle={{
              background: isDark ? '#111827' : '#fff',
              border: `1px solid ${isDark ? '#374151' : '#e2e8f0'}`,
              borderRadius: 6, fontSize: 11, fontFamily: 'monospace',
              color: isDark ? '#f9fafb' : '#1e293b',
            }}
            labelFormatter={fmt}
            formatter={(v: number) => [v, 'ELO']}
          />
          <Line
            type="monotone" dataKey="elo" stroke={lineColor}
            strokeWidth={2} dot={data.length < 30 ? { r: 3, fill: lineColor } : false}
            activeDot={{ r: 5, fill: lineColor }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Leaderboard ────────────────────────────────────────────────────────────────

const MEDALS = ['🥇', '🥈', '🥉'];

function LeaderboardTable({ data, myUsername }: { data: LeaderboardData; myUsername: string }) {
  const { rows, separatorAfter } = data;
  return (
    <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="bg-slate-50 dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700">
            <th className="text-left px-3 py-2 text-slate-500 dark:text-gray-400 font-bold w-10">#</th>
            <th className="text-left px-3 py-2 text-slate-500 dark:text-gray-400 font-bold">Player</th>
            <th className="text-right px-3 py-2 text-slate-500 dark:text-gray-400 font-bold w-20">ELO</th>
            <th className="text-right px-3 py-2 text-slate-500 dark:text-gray-400 font-bold w-24">Games</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isMe     = row.username === myUsername;
            const medal    = MEDALS[row.rank - 1] ?? null;
            const showSep  = separatorAfter !== null && i === separatorAfter;
            return (
              <>
                {showSep && (
                  <tr key="sep" className="border-b border-dashed border-slate-200 dark:border-gray-700">
                    <td colSpan={4} className="py-0" />
                  </tr>
                )}
                <tr
                  key={row.username}
                  className={`border-b border-slate-100 dark:border-gray-800 last:border-0 ${isMe ? 'bg-violet-50 dark:bg-violet-950/30' : ''}`}
                >
                  <td className="px-3 py-1.5 text-slate-400 dark:text-gray-500 tabular-nums">
                    {medal ?? row.rank}
                  </td>
                  <td className="px-3 py-1.5">
                    <Link
                      to={`/profile/${row.username}`}
                      className={`hover:underline ${isMe ? 'text-violet-600 dark:text-violet-400 font-bold' : 'text-slate-700 dark:text-gray-200'}`}
                    >
                      {row.username}
                    </Link>
                  </td>
                  <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${isMe ? 'text-violet-600 dark:text-violet-400' : 'text-slate-700 dark:text-gray-200'}`}>
                    {row.elo}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-500 dark:text-gray-400">{row.gamesPlayed}</td>
                </tr>
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Games history table ────────────────────────────────────────────────────────

function GamesTable({ data, page, setPage }: { data: GamesPage; page: number; setPage: (p: number) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="bg-slate-50 dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700">
              <th className="text-left px-3 py-2 text-slate-500 dark:text-gray-400 font-bold">Opponent</th>
              <th className="text-center px-3 py-2 text-slate-500 dark:text-gray-400 font-bold w-16">Result</th>
              <th className="text-right px-3 py-2 text-slate-500 dark:text-gray-400 font-bold w-16">ELO ±</th>
              <th className="text-right px-3 py-2 text-slate-500 dark:text-gray-400 font-bold w-16">After</th>
              <th className="text-right px-3 py-2 text-slate-500 dark:text-gray-400 font-bold w-20 hidden sm:table-cell">Moves</th>
              <th className="text-right px-3 py-2 text-slate-500 dark:text-gray-400 font-bold w-20 hidden sm:table-cell">Duration</th>
              <th className="text-right px-3 py-2 text-slate-500 dark:text-gray-400 font-bold w-28">Date</th>
            </tr>
          </thead>
          <tbody>
            {data.games.map(g => (
              <tr key={g.gameId} className="border-b border-slate-100 dark:border-gray-800 last:border-0">
                <td className="px-3 py-1.5">
                  <Link to={`/profile/${g.opponent}`} className="text-slate-700 dark:text-gray-200 hover:underline hover:text-violet-600 dark:hover:text-violet-400">
                    {g.opponent}
                  </Link>
                </td>
                <td className="px-3 py-1.5 text-center">
                  <span className={`font-bold ${g.result === 'win' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                    {g.result === 'win' ? 'Win' : 'Loss'}
                  </span>
                </td>
                <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${
                  g.eloDelta == null ? 'text-slate-400 dark:text-gray-600' :
                  g.eloDelta >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
                }`}>{fmtDelta(g.eloDelta)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-600 dark:text-gray-300">
                  {g.eloAfter ?? '—'}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-500 dark:text-gray-400 hidden sm:table-cell">
                  {g.myMoves}/{g.opponentMoves}
                </td>
                <td className="px-3 py-1.5 text-right text-slate-500 dark:text-gray-400 hidden sm:table-cell">
                  {fmtDuration(g.durationMs)}
                </td>
                <td className="px-3 py-1.5 text-right text-slate-500 dark:text-gray-400">
                  <Link to={`/game/${g.gameId}`} className="hover:underline hover:text-violet-600 dark:hover:text-violet-400">
                    {fmtDate(g.date)}
                  </Link>
                </td>
              </tr>
            ))}
            {data.games.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-4 text-center text-slate-400 dark:text-gray-500">No games yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {data.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs font-mono text-slate-500 dark:text-gray-400">
          <span>{data.total} games total</span>
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-2 py-0.5 rounded bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-600 hover:bg-slate-50 dark:hover:bg-gray-800 disabled:opacity-30 transition"
            >◀</button>
            <span>{page} / {data.totalPages}</span>
            <button
              disabled={page >= data.totalPages}
              onClick={() => setPage(page + 1)}
              className="px-2 py-0.5 rounded bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-600 hover:bg-slate-50 dark:hover:bg-gray-800 disabled:opacity-30 transition"
            >▶</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { username }  = useParams<{ username: string }>();
  const { user }      = useAuth();
  const navigate      = useNavigate();
  const { isDark, toggleDark } = useDarkMode();

  const [profile,   setProfile]   = useState<ProfileData | null>(null);
  const [lb,        setLb]        = useState<LeaderboardData | null>(null);
  const [eloHist,   setEloHist]   = useState<EloPoint[] | null>(null);
  const [records,   setRecords]   = useState<RecordsData | null>(null);
  const [gamesPage, setGamesPage] = useState<GamesPage | null>(null);
  const [page,      setPage]      = useState(1);
  const [error,     setError]     = useState('');

  useEffect(() => {
    if (!username) return;
    setProfile(null); setLb(null); setEloHist(null); setRecords(null); setGamesPage(null); setError('');
    setPage(1);

    Promise.all([
      api.profile(username).then(setProfile),
      api.leaderboard(user?.username).then(setLb),
      api.eloHistory(username).then(setEloHist),
      api.gameRecords(username).then(setRecords),
      api.userGames(username, 1).then(setGamesPage),
    ]).catch(e => setError(e instanceof Error ? e.message : 'Error'));
  }, [username, user?.username]);

  useEffect(() => {
    if (!username || !gamesPage) return;
    api.userGames(username, page).then(setGamesPage).catch(() => {});
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`${isDark ? 'dark' : ''} min-h-screen`}>
    <div className="min-h-screen bg-slate-100 dark:bg-gray-950 text-slate-800 dark:text-white flex flex-col">

      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-1 bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-700 flex-none">
        <FurukooLogo />
        <div className="flex gap-2 ml-auto items-center">
          <button
            onClick={() => navigate('/')}
            className="px-3 py-0.5 rounded text-xs font-bold bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-700 transition"
          >← Lobby</button>
          <DarkToggle isDark={isDark} onToggle={toggleDark} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-6 flex flex-col gap-8">

        {/* Title */}
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">{username}</h1>
          {profile && <p className="text-xs font-mono text-slate-400 dark:text-gray-500 mt-0.5">Member since {fmtDate(profile.joinDate)}</p>}
        </div>

        {error && <p className="text-red-500 text-sm font-mono">{error}</p>}

        {/* ── Me ──────────────────────────────────────────── */}
        <Section title="Stats">
          <div className="flex gap-3">
            {profile ? <>
              <StatBox icon="⚡" value={profile.elo} label="Current ELO" />
              <StatBox icon="🎮" value={profile.gamesPlayed} label="Games played" />
              <StatBox icon="⏱️" value={profile.minutesPlayed === 0 ? '—' : `${profile.minutesPlayed}m`} label="Time played" />
              <StatBox icon="📅" value={fmtDate(profile.joinDate)} label="Joined" />
            </> : [0,1,2,3].map(i => (
              <div key={i} className="flex-1 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-lg p-4 flex flex-col items-center gap-2">
                <Skeleton className="w-8 h-8" />
                <Skeleton className="w-16 h-5" />
                <Skeleton className="w-20 h-3" />
              </div>
            ))}
          </div>
        </Section>

        {/* ── Leaderboard ─────────────────────────────────── */}
        <Section title="Leaderboard">
          {lb ? <LeaderboardTable data={lb} myUsername={user?.username ?? ''} /> : (
            <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-lg p-4 flex flex-col gap-2">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
            </div>
          )}
        </Section>

        {/* ── ELO history ─────────────────────────────────── */}
        <Section title="ELO History">
          {eloHist ? <EloChart data={eloHist} isDark={isDark} /> : (
            <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-lg p-4">
              <Skeleton className="w-full h-48" />
            </div>
          )}
        </Section>

        {/* ── Records ─────────────────────────────────────── */}
        <Section title="Records">
          <div className="flex gap-3">
            {records ? <>
              <GameRecordBox icon="🐣" label="Least moves"   game={records.leastMoves}   navigate={navigate} />
              <GameRecordBox icon="🏟️" label="Most moves"    game={records.mostMoves}    navigate={navigate} />
              <GameRecordBox icon="⚡" label="Shortest game" game={records.shortestGame} navigate={navigate} />
              <GameRecordBox icon="🐢" label="Longest game"  game={records.longestGame}  navigate={navigate} />
            </> : [0,1,2,3].map(i => (
              <div key={i} className="flex-1 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-lg p-4 flex flex-col items-center gap-2">
                <Skeleton className="w-8 h-8" />
                <Skeleton className="w-16 h-5" />
                <Skeleton className="w-20 h-3" />
              </div>
            ))}
          </div>
        </Section>

        {/* ── Games history ────────────────────────────────── */}
        <Section title="Games History">
          {gamesPage
            ? <GamesTable data={gamesPage} page={page} setPage={p => { setPage(p); }} />
            : <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-lg p-4 flex flex-col gap-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
              </div>
          }
        </Section>

      </div>
    </div>
    </div>
  );
}
