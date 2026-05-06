import { useState, useEffect, useRef } from 'react';
import { Tip } from './Tip';

export interface OnlineUser {
  username: string;
  elo: number;
  gameId: string | null;
  gameColor: string | null;
  spectating: boolean;
  reviewing: boolean;
}

export interface ChatMsg {
  id: string;
  type: 'system' | 'user';
  username?: string;
  text: string;
  origin: string;
  spectator?: boolean;
}

// ── PlayersBox ────────────────────────────────────────────────────────────────

interface PlayersBoxProps {
  users: OnlineUser[];
  myUsername: string;
  gamePlayers?: { red: string; black: string };
  onSpectate?: (gameId: string) => void;
}

export function PlayersBox({ users, myUsername, gamePlayers, onSpectate }: PlayersBoxProps) {
  const sorted = gamePlayers
    ? [
        ...users.filter(u => u.username === gamePlayers.red || u.username === gamePlayers.black),
        ...users.filter(u => u.username !== gamePlayers.red && u.username !== gamePlayers.black),
      ]
    : [...users].sort((a, b) => b.elo - a.elo);

  const rowCls = (u: OnlineUser) => {
    const isGamePlayer = gamePlayers && (u.username === gamePlayers.red || u.username === gamePlayers.black);
    const isMe = u.username === myUsername;
    let base = 'flex items-center gap-2 px-2 py-0.5 text-xs font-mono border-b border-slate-100 dark:border-gray-800 last:border-0';
    if (isGamePlayer) base += ' font-bold text-slate-900 dark:text-white';
    else base += ' text-slate-500 dark:text-gray-400';
    if (isMe) base += ' bg-violet-50 dark:bg-violet-950/30';
    return base;
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="grid grid-cols-[1fr_3rem_2rem] text-xs font-bold px-2 py-1 bg-slate-50 dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400 flex-none">
        <span>Players</span>
        <span className="text-center">ELO</span>
        <span className="text-center">In</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sorted.map(u => (
          <div key={u.username} className={rowCls(u)}>
            <span className="flex-1 truncate">{u.username}</span>
            <span className="w-12 text-center tabular-nums">{u.elo}</span>
            <span className="w-8 flex justify-center">
              {u.gameId && u.gameColor ? (
                <Tip content={u.reviewing ? `Reviewing ${u.gameId}` : u.spectating ? `Spectating ${u.gameId}` : `Playing ${u.gameId} — click to spectate`}>
                  <span
                    className="inline-block w-3 h-3 rounded-full cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-slate-400 dark:hover:ring-slate-500 transition-shadow"
                    style={{ background: u.gameColor, opacity: u.spectating ? 0.5 : 1 }}
                    onClick={() => onSpectate?.(u.gameId!)}
                  />
                </Tip>
              ) : (
                <Tip content="In lobby">
                  <span className="inline-block w-3 h-3 rounded-full bg-slate-200 dark:bg-slate-600" />
                </Tip>
              )}
            </span>
          </div>
        ))}
        {users.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-gray-500 px-2 py-2">No players online</p>
        )}
      </div>
    </div>
  );
}

// ── ChatBox ───────────────────────────────────────────────────────────────────

interface ChatBoxProps {
  messages: ChatMsg[];
  onSend: (text: string) => void;
  myUsername: string;
  origin: string;
}

export function ChatBox({ messages, onSend, myUsername, origin }: ChatBoxProps) {
  const [draft, setDraft] = useState('');
  const [filtered, setFiltered] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const visible = filtered ? messages.filter(m => m.origin === origin) : messages;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visible]);

  const send = () => {
    const t = draft.trim();
    if (!t) return;
    onSend(t);
    setDraft('');
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center gap-1 px-2 py-1 bg-slate-50 dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 flex-none">
        <span className="text-xs font-bold text-slate-500 dark:text-gray-400 flex-1">Chat</span>
        <button
          onClick={() => setFiltered(f => !f)}
          title={filtered ? 'Show all messages' : 'Show only this room'}
          className={`text-xs font-mono px-1.5 py-0.5 rounded transition ${
            filtered
              ? 'bg-violet-600 text-white'
              : 'bg-slate-200 dark:bg-gray-700 text-slate-500 dark:text-gray-400 hover:bg-slate-300 dark:hover:bg-gray-600'
          }`}
        >filter</button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5 min-h-0">
        {visible.map(m => (
          <div key={m.id} className={`text-xs font-mono leading-snug ${
            m.type === 'system' ? 'text-slate-400 dark:text-gray-500 italic' :
            m.spectator ? 'text-slate-400 dark:text-gray-500' :
            'text-slate-700 dark:text-gray-200'
          }`}>
            {m.type === 'system'
              ? m.text
              : <>
                  <span className={`font-bold ${
                    m.spectator ? 'text-slate-400 dark:text-gray-500' :
                    m.username === myUsername ? 'text-violet-600 dark:text-violet-400' :
                    'text-slate-600 dark:text-gray-300'
                  }`}>{m.username}: </span>
                  {m.text}
                </>}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-1 px-2 py-1 border-t border-slate-100 dark:border-gray-800 flex-none">
        <input
          className="flex-1 text-xs font-mono px-2 py-0.5 rounded border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-slate-800 dark:text-white focus:outline-none focus:border-violet-400"
          value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Message…"
        />
        <button onClick={send}
          className="px-2 py-0.5 rounded text-xs bg-violet-600 text-white hover:bg-violet-700 transition font-bold">
          Send
        </button>
      </div>
    </div>
  );
}

