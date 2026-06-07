import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, type AdminBot, type AdminPlayer, type AdminPlayersPage, type ReportedIssue } from '../lib/api';
import { useDarkMode } from '../lib/darkMode';
import { DarkToggle } from '../components/DarkToggle';
import { FurukooLogo } from '../components/FurukooLogo';

// ── Shared primitives ─────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-none items-center rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? 'bg-violet-600' : 'bg-slate-300 dark:bg-gray-600'
      }`}
    >
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-4' : 'translate-x-0.5'
      }`} />
    </button>
  );
}

function ErrorBanner({ msg, onDismiss }: { msg: string; onDismiss: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs border border-red-200 dark:border-red-700">
      <span className="flex-1">{msg}</span>
      <button onClick={onDismiss} className="font-bold opacity-60 hover:opacity-100">✕</button>
    </div>
  );
}

// ── Bots section ──────────────────────────────────────────────────────────────

function CreateBotModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [username, setUsername] = useState('');
  const [level, setLevel] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!username.trim()) { setError('Username is required'); return; }
    setLoading(true);
    setError('');
    try {
      await api.admin.createBot(username.trim(), level);
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create bot');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm mx-4 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-slate-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-bold text-slate-800 dark:text-white mb-4">Create new bot</h3>
        {error && <ErrorBanner msg={error} onDismiss={() => setError('')} />}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-gray-400 mb-1">Username</label>
            <input
              autoFocus
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. Rookie or 🤖 Rookie"
              className="w-full px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-slate-800 dark:text-white focus:outline-none focus:border-violet-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-gray-400 mb-1">Level ({level}/10)</label>
            <input
              type="range" min={1} max={10} value={level}
              onChange={e => setLevel(Number(e.target.value))}
              className="w-full accent-violet-600"
            />
            <div className="flex justify-between text-[10px] text-slate-400 dark:text-gray-500 mt-0.5">
              <span>1 — Beginner</span><span>10 — Maximum</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-3 py-1.5 rounded text-sm text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800 transition">Cancel</button>
          <button onClick={handleCreate} disabled={loading}
            className="px-4 py-1.5 rounded text-sm font-bold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition">
            {loading ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteBotModal({ username, onClose, onDeleted }: { username: string; onClose: () => void; onDeleted: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setLoading(true);
    setError('');
    try {
      await api.admin.deleteBot(username);
      onDeleted();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete bot');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm mx-4 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-slate-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-bold text-slate-800 dark:text-white mb-2">Delete bot</h3>
        <p className="text-sm text-slate-500 dark:text-gray-400 mb-4">
          Are you sure you want to permanently delete <strong className="text-slate-700 dark:text-gray-200">{username}</strong>? This cannot be undone.
        </p>
        {error && <ErrorBanner msg={error} onDismiss={() => setError('')} />}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-1.5 rounded text-sm text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800 transition">Cancel</button>
          <button onClick={handleDelete} disabled={loading}
            className="px-4 py-1.5 rounded text-sm font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition">
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BotRow({ bot, onUpdated, onError }: { bot: AdminBot; onUpdated: () => void; onError: (msg: string) => void }) {
  const [editName, setEditName] = useState(false);
  const [nameVal, setNameVal] = useState(bot.username);
  const [editElo, setEditElo] = useState(false);
  const [eloVal, setEloVal] = useState(String(bot.elo));
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const update = async (updates: { username?: string; level?: number; enabled?: boolean }) => {
    setSaving(true);
    try {
      await api.admin.updateBot(bot.username, updates);
      onUpdated();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const saveName = () => {
    const trimmed = nameVal.trim();
    if (!trimmed || trimmed === bot.username) { setEditName(false); setNameVal(bot.username); return; }
    update({ username: trimmed }).then(() => setEditName(false));
  };

  const saveElo = () => {
    const n = Math.max(100, Math.round(Number(eloVal)));
    if (isNaN(n) || n === bot.elo) { setEditElo(false); setEloVal(String(bot.elo)); return; }
    update({ elo: n }).then(() => setEditElo(false));
  };

  const LEVEL_LABELS: Record<number, string> = {
    1: 'Beginner', 2: 'Novice', 3: 'Easy', 4: 'Casual', 5: 'Intermediate',
    6: 'Challenging', 7: 'Advanced', 8: 'Expert', 9: 'Master', 10: 'Maximum',
  };

  return (
    <tr className="border-b border-slate-100 dark:border-gray-800 last:border-0 hover:bg-slate-50 dark:hover:bg-gray-800/50">
      <td className="px-4 py-2.5">
        {editName ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditName(false); setNameVal(bot.username); } }}
              className="px-2 py-0.5 text-sm rounded border border-violet-400 bg-white dark:bg-gray-800 text-slate-800 dark:text-white focus:outline-none w-40"
            />
            <button onClick={saveName} disabled={saving} className="text-xs text-violet-600 dark:text-violet-400 font-bold disabled:opacity-50">Save</button>
            <button onClick={() => { setEditName(false); setNameVal(bot.username); }} className="text-xs text-slate-400">✕</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-slate-700 dark:text-gray-200">{bot.username}</span>
            {bot.inGame && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">Playing</span>}
            <button onClick={() => setEditName(true)} className="text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 text-xs opacity-60 hover:opacity-100 transition">✎</button>
          </div>
        )}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <select
            value={bot.level}
            onChange={e => update({ level: Number(e.target.value) })}
            disabled={saving}
            className="text-xs px-2 py-0.5 rounded border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-200 focus:outline-none disabled:opacity-50"
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>{n} — {LEVEL_LABELS[n]}</option>
            ))}
          </select>
        </div>
      </td>
      <td className="px-4 py-2.5 text-center">
        {editElo ? (
          <div className="flex items-center gap-1 justify-center">
            <input
              autoFocus
              type="number"
              value={eloVal}
              onChange={e => setEloVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveElo(); if (e.key === 'Escape') { setEditElo(false); setEloVal(String(bot.elo)); } }}
              className="px-1.5 py-0.5 text-sm rounded border border-violet-400 bg-white dark:bg-gray-800 text-slate-800 dark:text-white focus:outline-none w-20 text-center font-mono"
            />
            <button onClick={saveElo} disabled={saving} className="text-xs text-violet-600 dark:text-violet-400 font-bold disabled:opacity-50">✓</button>
            <button onClick={() => { setEditElo(false); setEloVal(String(bot.elo)); }} className="text-xs text-slate-400">✕</button>
          </div>
        ) : (
          <div className="flex items-center gap-1 justify-center group">
            <span className="font-mono text-sm text-slate-600 dark:text-gray-400">{bot.elo}</span>
            <button onClick={() => setEditElo(true)} className="text-slate-300 dark:text-gray-600 hover:text-slate-500 dark:hover:text-gray-400 text-xs opacity-0 group-hover:opacity-100 transition">✎</button>
          </div>
        )}
      </td>
      <td className="px-4 py-2.5 text-center font-mono text-sm text-slate-600 dark:text-gray-400">{bot.gamesPlayed}</td>
      <td className="px-4 py-2.5">
        <Toggle
          checked={bot.enabled}
          onChange={v => update({ enabled: v })}
          disabled={saving}
        />
      </td>
      <td className="px-4 py-2.5">
        <button
          onClick={() => setShowDelete(true)}
          disabled={bot.inGame}
          className="text-xs text-red-400 hover:text-red-600 dark:hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
          title={bot.inGame ? 'Cannot delete while playing' : 'Delete bot'}
        >✕</button>
      </td>
      {showDelete && (
        <DeleteBotModal
          username={bot.username}
          onClose={() => setShowDelete(false)}
          onDeleted={onUpdated}
        />
      )}
    </tr>
  );
}

function BotsSection() {
  const [bots, setBots] = useState<AdminBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBots(await api.admin.bots());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load bots');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {error && <ErrorBanner msg={error} onDismiss={() => setError('')} />}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-slate-500 dark:text-gray-400">{bots.length} bot{bots.length !== 1 ? 's' : ''} registered</p>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 rounded text-xs font-bold bg-violet-600 text-white hover:bg-violet-700 transition"
        >
          + New bot
        </button>
      </div>
      {loading ? (
        <p className="text-xs text-slate-400 dark:text-gray-500 py-4 text-center">Loading…</p>
      ) : bots.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-gray-500 py-4 text-center">No bots yet</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-gray-700">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-gray-800 text-xs font-bold text-slate-500 dark:text-gray-400 border-b border-slate-200 dark:border-gray-700">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Level</th>
                <th className="px-4 py-2 text-center">ELO</th>
                <th className="px-4 py-2 text-center">Games</th>
                <th className="px-4 py-2">Enabled</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {bots.map(bot => (
                <BotRow key={bot.username} bot={bot} onUpdated={load} onError={setError} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showCreate && <CreateBotModal onClose={() => setShowCreate(false)} onCreated={load} />}
    </div>
  );
}

// ── Players section ───────────────────────────────────────────────────────────

function DeletePlayerModal({ username, onClose, onDeleted }: { username: string; onClose: () => void; onDeleted: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setLoading(true);
    setError('');
    try {
      await api.admin.deletePlayer(username);
      onDeleted();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete player');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm mx-4 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-slate-200 dark:border-gray-700 p-6">
        <h3 className="text-base font-bold text-slate-800 dark:text-white mb-2">Delete player</h3>
        <p className="text-sm text-slate-500 dark:text-gray-400 mb-4">
          Are you sure you want to permanently delete <strong className="text-slate-700 dark:text-gray-200">{username}</strong>? This cannot be undone.
        </p>
        {error && <ErrorBanner msg={error} onDismiss={() => setError('')} />}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-1.5 rounded text-sm text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800 transition">Cancel</button>
          <button onClick={handleDelete} disabled={loading}
            className="px-4 py-1.5 rounded text-sm font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition">
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PlayerRow({ player, onUpdated, onError, currentUsername }: { player: AdminPlayer; onUpdated: () => void; onError: (msg: string) => void; currentUsername: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [editElo, setEditElo] = useState(false);
  const [eloVal, setEloVal] = useState(String(player.elo));
  const [showDelete, setShowDelete] = useState(false);
  const isSelf = player.username === currentUsername;

  const act = async (action: () => Promise<void>, key: string) => {
    setBusy(key);
    try { await action(); onUpdated(); }
    catch (e) { onError(e instanceof Error ? e.message : 'Action failed'); }
    finally { setBusy(null); }
  };

  const saveElo = () => {
    const n = Math.max(100, Math.round(Number(eloVal)));
    if (isNaN(n) || n === player.elo) { setEditElo(false); setEloVal(String(player.elo)); return; }
    act(() => api.admin.setPlayerElo(player.username, n), 'elo').then(() => setEditElo(false));
  };

  const fmt = (d: string) => new Date(d).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <tr className="border-b border-slate-100 dark:border-gray-800 last:border-0 hover:bg-slate-50 dark:hover:bg-gray-800/50">
      <td className="px-4 py-2.5 font-mono text-sm text-slate-700 dark:text-gray-200 max-w-[130px] truncate">
        {player.username}
      </td>
      <td className="px-4 py-2.5 text-center">
        {editElo ? (
          <div className="flex items-center gap-1 justify-center">
            <input
              autoFocus
              type="number"
              value={eloVal}
              onChange={e => setEloVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveElo(); if (e.key === 'Escape') { setEditElo(false); setEloVal(String(player.elo)); } }}
              className="px-1.5 py-0.5 text-sm rounded border border-violet-400 bg-white dark:bg-gray-800 text-slate-800 dark:text-white focus:outline-none w-20 text-center font-mono"
            />
            <button onClick={saveElo} disabled={busy === 'elo'} className="text-xs text-violet-600 dark:text-violet-400 font-bold disabled:opacity-50">✓</button>
            <button onClick={() => { setEditElo(false); setEloVal(String(player.elo)); }} className="text-xs text-slate-400">✕</button>
          </div>
        ) : (
          <div className="flex items-center gap-1 justify-center group">
            <span className="font-mono text-sm text-slate-600 dark:text-gray-400">{player.elo}</span>
            <button onClick={() => setEditElo(true)} className="text-slate-300 dark:text-gray-600 hover:text-slate-500 dark:hover:text-gray-400 text-xs opacity-0 group-hover:opacity-100 transition">✎</button>
          </div>
        )}
      </td>
      <td className="px-4 py-2.5 text-center text-sm text-slate-500 dark:text-gray-400">{player.gamesPlayed}</td>
      <td className="px-4 py-2.5 text-center text-sm text-slate-500 dark:text-gray-400">{player.messageCount}</td>
      <td className="px-4 py-2.5 text-xs text-slate-400 dark:text-gray-500 whitespace-nowrap">{fmt(player.joinDate)}</td>
      <td className="px-4 py-2.5">
        <Toggle
          checked={player.isAdmin}
          onChange={v => act(() => api.admin.setAdmin(player.username, v), 'admin')}
          disabled={busy === 'admin'}
        />
      </td>
      <td className="px-4 py-2.5">
        <Toggle
          checked={player.isMuted}
          onChange={v => act(() => api.admin.setMute(player.username, v), 'mute')}
          disabled={busy === 'mute'}
        />
      </td>
      <td className="px-4 py-2.5">
        <Toggle
          checked={player.isBanned}
          onChange={v => act(() => api.admin.setBan(player.username, v), 'ban')}
          disabled={busy === 'ban'}
        />
      </td>
      <td className="px-4 py-2.5">
        <button
          onClick={() => setShowDelete(true)}
          disabled={isSelf}
          className="text-xs text-red-400 hover:text-red-600 dark:hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
          title={isSelf ? 'Cannot delete yourself' : 'Delete player'}
        >✕</button>
      </td>
      {showDelete && (
        <DeletePlayerModal
          username={player.username}
          onClose={() => setShowDelete(false)}
          onDeleted={onUpdated}
        />
      )}
    </tr>
  );
}

function PlayersSection() {
  const { user } = useAuth();
  const [data, setData] = useState<AdminPlayersPage | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.admin.players(page, search || undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load players');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div>
      {error && <ErrorBanner msg={error} onDismiss={() => setError('')} />}
      <div className="flex items-center gap-2 mb-3">
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Search username…"
          className="flex-1 max-w-xs px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-slate-800 dark:text-white focus:outline-none focus:border-violet-400"
        />
        <button onClick={handleSearch}
          className="px-3 py-1.5 rounded text-xs font-bold bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-gray-200 hover:bg-slate-200 dark:hover:bg-gray-600 transition">
          Search
        </button>
        {search && (
          <button onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}
            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-gray-300">Clear</button>
        )}
        {data && <span className="ml-auto text-xs text-slate-400 dark:text-gray-500">{data.total} player{data.total !== 1 ? 's' : ''}</span>}
      </div>
      {loading ? (
        <p className="text-xs text-slate-400 dark:text-gray-500 py-4 text-center">Loading…</p>
      ) : !data || data.players.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-gray-500 py-4 text-center">No players found</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-gray-700">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-gray-800 text-xs font-bold text-slate-500 dark:text-gray-400 border-b border-slate-200 dark:border-gray-700">
                  <th className="px-4 py-2">Username</th>
                  <th className="px-4 py-2 text-center">ELO</th>
                  <th className="px-4 py-2 text-center">Games</th>
                  <th className="px-4 py-2 text-center">Msgs</th>
                  <th className="px-4 py-2">Joined</th>
                  <th className="px-4 py-2">Admin</th>
                  <th className="px-4 py-2">Muted</th>
                  <th className="px-4 py-2">Banned</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.players.map(p => (
                  <PlayerRow key={p.username} player={p} onUpdated={load} onError={setError} currentUsername={user?.username ?? ''} />
                ))}
              </tbody>
            </table>
          </div>
          {data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded text-xs bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-gray-600 transition"
              >← Prev</button>
              <span className="text-xs text-slate-500 dark:text-gray-400">
                {page} / {data.totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                disabled={page === data.totalPages}
                className="px-3 py-1 rounded text-xs bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-gray-600 transition"
              >Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Issues section ────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  Critical: 'text-red-600 dark:text-red-400 font-bold',
  High:     'text-orange-500 dark:text-orange-400 font-bold',
  Medium:   'text-amber-500 dark:text-amber-400',
  Low:      'text-blue-500 dark:text-blue-400',
  Note:     'text-slate-400 dark:text-gray-500',
};

function IssuesSection({ onCountChange }: { onCountChange: (n: number) => void }) {
  const [issues,  setIssues]  = useState<ReportedIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.admin.issues();
      setIssues(data);
      onCountChange(data.filter(i => !i.acknowledgedAt).length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load issues');
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => { load(); }, [load]);

  const acknowledge = async (id: string) => {
    try {
      await api.admin.acknowledgeIssue(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to acknowledge');
    }
  };

  const unacknowledge = async (id: string) => {
    try {
      await api.admin.unacknowledgeIssue(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to unacknowledge');
    }
  };

  const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div>
      {error && <ErrorBanner msg={error} onDismiss={() => setError('')} />}
      {loading ? (
        <p className="text-xs text-slate-400 dark:text-gray-500 py-4 text-center">Loading…</p>
      ) : issues.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-gray-500 py-4 text-center">No reported issues</p>
      ) : (
        <div className="space-y-3">
          {issues.map(issue => (
            <div key={issue.id}
              className={`rounded-lg border p-3 text-xs font-mono ${issue.acknowledgedAt
                ? 'border-slate-100 dark:border-gray-800 bg-slate-50 dark:bg-gray-900/50 opacity-60'
                : 'border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900'}`}>
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300">{issue.page}</span>
                  <span className={SEVERITY_COLORS[issue.severity]}>{issue.severity}</span>
                  <span className="text-slate-400 dark:text-gray-500">by{' '}
                    <a href={`/profile/${encodeURIComponent(issue.submittedBy)}`}
                      className="font-bold text-violet-600 dark:text-violet-400 hover:underline">
                      {issue.submittedBy}
                    </a>
                  </span>
                  <span className="text-slate-400 dark:text-gray-500">{fmt(issue.submittedAt)}</span>
                </div>
                {issue.acknowledgedAt ? (
                  <div className="flex items-center gap-1.5 flex-none">
                    <span className="text-green-600 dark:text-green-400 whitespace-nowrap">✓ {issue.acknowledgedBy}</span>
                    <button
                      onClick={() => unacknowledge(issue.id)}
                      className="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-gray-700 dark:text-gray-400 transition whitespace-nowrap">
                      Undo
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => acknowledge(issue.id)}
                    className="flex-none px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300 transition whitespace-nowrap">
                    Acknowledge
                  </button>
                )}
              </div>
              <p className="text-slate-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{issue.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'bots' | 'players' | 'issues';

export default function AdminPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('players');
  const [issueCount, setIssueCount] = useState(0);
  const { isDark, toggleDark } = useDarkMode();

  // Fetch badge count on mount so the tab badge is visible before opening Issues
  useEffect(() => {
    api.admin.issuesUnacknowledgedCount().then(d => setIssueCount(d.count)).catch(() => {});
  }, []);

  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 dark:text-gray-500 text-sm">
        Access denied
      </div>
    );
  }

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-bold border-b-2 transition ${
      tab === t
        ? 'border-violet-600 text-violet-700 dark:text-violet-400'
        : 'border-transparent text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'
    }`;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1 bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-700 flex-none">
        <FurukooLogo />
        <div className="flex gap-2 ml-auto items-center">
          <button
            onClick={() => navigate('/')}
            className="px-2 py-0.5 rounded text-xs font-mono bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-700 transition border border-slate-200 dark:border-gray-700"
          >
            Back to lobby
          </button>
          <button
            onClick={logout}
            className="px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 transition border border-red-200 dark:border-red-700"
          >
            Logout
          </button>
          <DarkToggle isDark={isDark} onToggle={toggleDark} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        <h1 className="text-xl font-bold text-slate-800 dark:text-white mb-1">Admin Panel</h1>
        <p className="text-xs text-slate-400 dark:text-gray-500 mb-5">Logged in as <strong>{user.username}</strong></p>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-gray-700 mb-6">
          <button className={tabCls('players')} onClick={() => setTab('players')}>Players</button>
          <button className={tabCls('bots')}    onClick={() => setTab('bots')}>Bots</button>
          <button className={`${tabCls('issues')} relative`} onClick={() => setTab('issues')}>
            Reported Issues
            {issueCount > 0 && (
              <span className="absolute -top-0.5 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                {issueCount}
              </span>
            )}
          </button>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-700 p-5">
          {tab === 'bots'    && <BotsSection />}
          {tab === 'players' && <PlayersSection />}
          {tab === 'issues'  && <IssuesSection onCountChange={setIssueCount} />}
        </div>
      </div>
    </div>
  );
}
