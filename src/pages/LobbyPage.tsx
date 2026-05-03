import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../lib/socket';
import { RightPanel, type OnlineUser, type ChatMsg } from '../components/RightPanel';
import { FurukooLogo } from '../components/FurukooLogo';

interface Proposal { username: string; elo: number; eloRange: string; }

const ELO_RANGES = ['2400-3000','2200-2399','2000-2199','1800-1999','1600-1799','1400-1599','1200-1399','1000-1199'];

let msgId = 0;
const mkId = () => String(++msgId);

export default function LobbyPage() {
  const { user, logout, updateElo } = useAuth();
  const navigate = useNavigate();

  const [isDark,    setIsDark]    = useState(() => localStorage.getItem('theme') === 'dark');
  const [users,     setUsers]     = useState<OnlineUser[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [messages,  setMessages]  = useState<ChatMsg[]>([]);
  const [hasProposal, setHasProposal] = useState(false);

  const addMsg = useCallback((m: Omit<ChatMsg, 'id'>) => {
    setMessages(prev => [...prev.slice(-199), { ...m, id: mkId() }]);
  }, []);

  const toggleDark = () => {
    setIsDark(d => { const n = !d; localStorage.setItem('theme', n ? 'dark' : 'light'); return n; });
  };

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onLobby = ({ users: u, proposals: p }: { users: OnlineUser[]; proposals: Proposal[] }) => {
      setUsers(u);
      setProposals(p);
      setHasProposal(p.some(pr => pr.username === user?.username));
    };
    const onChat = (m: { type: 'system' | 'user'; username?: string; text: string }) => addMsg(m);
    const onStarted = ({ gameId }: { gameId: string }) => navigate(`/game/${gameId}`);
    const onState = (g: { id: string }) => navigate(`/game/${g.id}`);

    socket.on('lobby:state',  onLobby);
    socket.on('chat:lobby',   onChat);
    socket.on('game:started', onStarted);
    socket.on('game:state',   onState); // if we were redirected back and a game:state fires

    return () => {
      socket.off('lobby:state',  onLobby);
      socket.off('chat:lobby',   onChat);
      socket.off('game:started', onStarted);
      socket.off('game:state',   onState);
    };
  }, [addMsg, navigate, user?.username]);

  // Also update our ELO in auth context when lobby state reflects changed value
  useEffect(() => {
    const me = users.find(u => u.username === user?.username);
    if (me && me.elo !== user?.elo) updateElo(me.elo);
  }, [users, user?.username, user?.elo, updateElo]);

  const handleSend = (text: string) => getSocket()?.emit('lobby:chat', text);
  const handlePlay = () => getSocket()?.emit('game:propose');
  const handleRemove = () => { getSocket()?.emit('game:remove'); setHasProposal(false); };
  const handleAccept = (proposerUsername: string) => getSocket()?.emit('game:accept', proposerUsername);

  const btn = `px-3 py-1 rounded text-xs font-bold transition`;

  return (
    <div className={`${isDark ? 'dark' : ''} min-h-screen`}>
    <div className="min-h-screen bg-slate-100 dark:bg-gray-950 text-slate-800 dark:text-white flex flex-col">

      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-700 flex-wrap">
        <FurukooLogo />
        <span className="text-xs font-mono text-slate-500 dark:text-gray-400 ml-1">
          {user?.username} <span className="text-violet-500 font-bold">({user?.elo})</span>
        </span>

        <div className="flex gap-2 ml-auto items-center">
          {hasProposal
            ? <button onClick={handleRemove} className={`${btn} bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-gray-700 dark:text-gray-200`}>Remove</button>
            : <button onClick={handlePlay}   className={`${btn} bg-violet-600 text-white hover:bg-violet-700`}>Play</button>
          }
          <button onClick={logout} className={`${btn} bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300`}>Logout</button>
          {/* Dark toggle */}
          <button role="switch" aria-checked={isDark} onClick={toggleDark}
            className="flex items-center gap-1.5 focus:outline-none select-none">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isDark ? '#a78bfa' : '#475569'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
            <span className={`relative inline-block w-8 h-4 rounded-full transition-colors ${isDark ? 'bg-violet-500' : 'bg-slate-300'}`}>
              <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${isDark ? 'translate-x-4' : ''}`} />
            </span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 gap-4 p-4 min-h-0">

        {/* Left: ELO range proposals */}
        <div className="flex-1 min-w-0">
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="bg-slate-50 dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700">
                  <th className="text-left px-3 py-1.5 text-slate-500 dark:text-gray-400 font-bold w-32">ELO Range</th>
                  <th className="text-left px-3 py-1.5 text-slate-500 dark:text-gray-400 font-bold">Waiting</th>
                </tr>
              </thead>
              <tbody>
                {ELO_RANGES.map(range => {
                  const row = proposals.filter(p => p.eloRange === range);
                  return (
                    <tr key={range} className="border-b border-slate-100 dark:border-gray-800 last:border-0">
                      <td className="px-3 py-1.5 text-slate-500 dark:text-gray-400">{range}</td>
                      <td className="px-3 py-1.5">
                        <div className="flex flex-wrap gap-2">
                          {row.map(p => (
                            <button key={p.username}
                              onClick={() => p.username !== user?.username && handleAccept(p.username)}
                              disabled={p.username === user?.username}
                              className={`px-2 py-0.5 rounded text-xs font-bold transition border
                                ${p.username === user?.username
                                  ? 'bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700 cursor-default'
                                  : 'bg-green-50 text-green-800 border-green-300 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700 cursor-pointer'
                                }`}
                            >
                              {p.username} ({p.elo})
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right panel */}
        <div className="w-72 flex-none flex flex-col" style={{ minHeight: 400 }}>
          <RightPanel users={users} messages={messages} onSend={handleSend}
            myUsername={user?.username ?? ''} isDark={isDark} />
        </div>
      </div>
    </div>
    </div>
  );
}
