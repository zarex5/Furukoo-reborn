import { useState, useEffect, useRef } from 'react';

export interface OnlineUser {
  username: string;
  elo: number;
  gameId: string | null;
  gameColor: string | null;
}

export interface ChatMsg {
  id: string;
  type: 'system' | 'user';
  username?: string;
  text: string;
}

interface Props {
  users: OnlineUser[];
  messages: ChatMsg[];
  onSend: (text: string) => void;
  myUsername: string;
  isDark: boolean;
  /** If set, these two players are pinned to top and shown in black */
  gamePlayers?: { red: string; black: string };
}

export function RightPanel({ users, messages, onSend, myUsername, isDark, gamePlayers }: Props) {
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sorted = gamePlayers
    ? [
        ...users.filter(u => u.username === gamePlayers.red || u.username === gamePlayers.black),
        ...users.filter(u => u.username !== gamePlayers.red && u.username !== gamePlayers.black),
      ]
    : [...users].sort((a, b) => b.elo - a.elo);

  const send = () => {
    const t = draft.trim();
    if (!t) return;
    onSend(t);
    setDraft('');
  };

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
    <div className={`${isDark ? 'dark' : ''} flex flex-col h-full`}>
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-lg overflow-hidden">

      {/* Players table */}
      <div className="flex-none">
        <div className="grid grid-cols-[1fr_auto_auto] text-xs font-bold px-2 py-1 bg-slate-50 dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400">
          <span>User Name</span><span className="px-2">Rate</span><span>Game</span>
        </div>
        <div className="max-h-44 overflow-y-auto">
          {sorted.map(u => (
            <div key={u.username} className={rowCls(u)}>
              <span className="flex-1 truncate">{u.username}</span>
              <span className="px-2 tabular-nums">{u.elo}</span>
              <span className="w-4 flex justify-center">
                {u.gameId && u.gameColor
                  ? <span className="inline-block w-3 h-3 rounded-full" style={{ background: u.gameColor }} />
                  : <span className="w-3" />}
              </span>
            </div>
          ))}
          {users.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-gray-500 px-2 py-2">No players online</p>
          )}
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 flex flex-col min-h-0 border-t border-slate-200 dark:border-gray-700">
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
          {messages.map(m => (
            <div key={m.id} className={`text-xs font-mono leading-snug ${m.type === 'system' ? 'text-slate-400 dark:text-gray-500 italic' : 'text-slate-700 dark:text-gray-200'}`}>
              {m.type === 'system'
                ? `System : ${m.text}`
                : <><span className={`font-bold ${m.username === myUsername ? 'text-violet-600 dark:text-violet-400' : 'text-slate-600 dark:text-gray-300'}`}>{m.username} : </span>{m.text}</>}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <div className="flex gap-1 px-2 py-1 border-t border-slate-100 dark:border-gray-800">
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
    </div>
    </div>
  );
}
