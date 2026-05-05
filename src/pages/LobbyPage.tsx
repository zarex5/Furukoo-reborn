import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../lib/socket';
import { PlayersBox, ChatBox, type OnlineUser, type ChatMsg } from '../components/RightPanel';
import { ResizableSplit } from '../components/ResizableSplit';
import { FurukooLogo } from '../components/FurukooLogo';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { DarkToggle } from '../components/DarkToggle';
import { useDarkMode } from '../lib/darkMode';

interface Proposal { username: string; elo: number; eloRange: string; }

const ELO_RANGES = ['2400-3000','2200-2399','2000-2199','1800-1999','1600-1799','1400-1599','1200-1399','1000-1199'];

let msgId = 0;
const mkId = () => String(++msgId);

/** Scaled-down replica of the real game board (6 V-lines × 6 H-lines, 7 slots each) */
function MiniBoardPreview() {
  const D = 6;          // px per grid cell (13×13 grid → 78×78 px internal)
  const G = 12 * D;     // 72 px — board spans visual rows/cols 0..12*D
  const PAD = 6;        // padding so edge pieces aren't clipped
  const LONG = 10;      // piece rectangle long side
  const SHORT = 3;      // piece rectangle short side

  // V line k is at x = (2k-1)*D;  V slot s on line k is at y = 2*(s-1)*D
  // H line j is at y = (2j-1)*D;  H slot k on line j is at x = 2*(k-1)*D
  const vX  = (k: number) => (2 * k - 1) * D;
  const hY  = (j: number) => (2 * j - 1) * D;
  const vsY = (s: number) => 2 * (s - 1) * D;
  const hsX = (k: number) => 2 * (k - 1) * D;

  const vp = (k: number, s: number, col: string, key: string) => (
    <rect key={key} x={vX(k) - SHORT / 2} y={vsY(s) - LONG / 2} width={SHORT} height={LONG} rx={1} fill={col} />
  );
  const hp = (j: number, k: number, col: string, key: string) => (
    <rect key={key} x={hsX(k) - LONG / 2} y={hY(j) - SHORT / 2} width={LONG} height={SHORT} rx={1} fill={col} />
  );

  const RED = '#ef4444'; const BLK = '#475569';
  const size = G + 2 * PAD;

  return (
    <svg viewBox={`${-PAD} ${-PAD} ${size} ${size}`} width={size} height={size}>
      {/* V lines */}
      {[1,2,3,4,5,6].map(k => <line key={`vl${k}`} x1={vX(k)} y1={0} x2={vX(k)} y2={G} stroke="#cbd5e1" strokeWidth={0.5} />)}
      {/* H lines */}
      {[1,2,3,4,5,6].map(j => <line key={`hl${j}`} x1={0} y1={hY(j)} x2={G} y2={hY(j)} stroke="#cbd5e1" strokeWidth={0.5} />)}
      {/* Completed square highlight at (j=1,k=1) */}
      <rect x={vX(1)} y={hY(1)} width={vX(2) - vX(1)} height={hY(2) - hY(1)} fill="rgba(239,68,68,0.18)" />
      {/* Intersection dots */}
      {[1,2,3,4,5,6].flatMap(j => [1,2,3,4,5,6].map(k =>
        <circle key={`d${j}${k}`} cx={vX(k)} cy={hY(j)} r={1.5} fill="#64748b" />
      ))}
      {/* Red pieces completing the square (top/bottom H slots + left/right V slots) */}
      {hp(1, 2, RED, 'r1')}  {hp(2, 2, RED, 'r2')}
      {vp(1, 2, RED, 'r3')}  {vp(2, 2, RED, 'r4')}
      {/* Black pieces scattered around the board */}
      {vp(4, 4, BLK, 'b1')}  {hp(3, 5, BLK, 'b2')}
      {vp(6, 5, BLK, 'b3')}  {hp(5, 3, BLK, 'b4')}
      {hp(4, 7, BLK, 'b5')}  {vp(3, 6, BLK, 'b6')}
      {hp(6, 4, BLK, 'b7')}
    </svg>
  );
}

const INVITE_MSGS = [
  'Invite your friends',      // English
  'Invitez vos amis',         // French
  'Kutsu ystäväsi',           // Finnish
  'Invita a tus amigos',      // Spanish
  'Lade deine Freunde ein',   // German
  'Invita i tuoi amici',      // Italian
  'Convide seus amigos',      // Portuguese
  '友達を誘おう',               // Japanese
  '邀请你的朋友',               // Chinese
  'ادعُ أصدقاءك',              // Arabic
  'Пригласи друзей',          // Russian
  '친구를 초대하세요',           // Korean
  'Nodig je vrienden uit',    // Dutch
  'Zaproś znajomych',         // Polish
  'Arkadaşlarını davet et',   // Turkish
];

function InviteTicker() {
  const content = INVITE_MSGS.join(' 🦉 ') + ' 🦉 ';
  const doubled = content + content;
  return (
    <div className="overflow-hidden border-t border-slate-100 dark:border-gray-800 mt-1.5 pt-1.5">
      <span className="ticker-track text-xs font-mono text-slate-400 dark:text-gray-500 select-none">
        {doubled}
      </span>
    </div>
  );
}

function RulesBox() {
  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="text-xs font-bold px-2 py-1 bg-slate-50 dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400 flex-none">
        How to play
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 text-xs font-mono text-slate-600 dark:text-gray-300 leading-relaxed">
        <div className="flex gap-3 items-start">
          <div className="flex-none mt-1"><MiniBoardPreview /></div>
          <div className="space-y-1.5">
            <p><strong>Goal</strong> — be the first to own all 4 sides of any unit square. Pieces sit on the <em>line segments</em> of a 6×6 grid, not on the dots.</p>
            <p><strong>Placement</strong> — alternate placing one of your 7 pieces on any free segment.</p>
            <p><strong>Movement</strong> — once all 14 pieces are on the board, each turn slide one piece to an adjacent free segment (along the line, or pivot at a dot onto a perpendicular line).</p>
            <p><strong>Winning</strong> — the moment all 4 sides of a square are yours, you win instantly.</p>
            <p><strong>Clock</strong> — each move adds +3 s. Run out of time and you lose. You can also <em>Resign</em> at any time.</p>
          </div>
        </div>
        <InviteTicker />
      </div>
    </div>
  );
}

export default function LobbyPage() {
  const { user, logout, updateElo } = useAuth();
  const navigate = useNavigate();

  const { isDark, toggleDark } = useDarkMode();
  const [users,     setUsers]     = useState<OnlineUser[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [messages,  setMessages]  = useState<ChatMsg[]>([]);
  const [hasProposal, setHasProposal] = useState(false);

  const addMsg = useCallback((m: Omit<ChatMsg, 'id'>) => {
    setMessages(prev => [...prev.slice(-199), { ...m, id: mkId() }]);
  }, []);

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
    socket.on('game:state',   onState);

    return () => {
      socket.off('lobby:state',  onLobby);
      socket.off('chat:lobby',   onChat);
      socket.off('game:started', onStarted);
      socket.off('game:state',   onState);
    };
  }, [addMsg, navigate, user?.username]);

  useEffect(() => {
    const me = users.find(u => u.username === user?.username);
    if (me && me.elo !== user?.elo) updateElo(me.elo);
  }, [users, user?.username, user?.elo, updateElo]);

  const myUser   = users.find(u => u.username === user?.username);
  const myGameId = myUser?.gameId && !myUser.spectating ? myUser.gameId : null;

  const handleSend   = (text: string) => getSocket()?.emit('lobby:chat', text);
  const handlePlay   = () => getSocket()?.emit('game:propose');
  const handleRemove = () => { getSocket()?.emit('game:remove'); setHasProposal(false); };
  const handleAccept = (proposerUsername: string) => getSocket()?.emit('game:accept', proposerUsername);
  const handleRejoin   = () => { if (myGameId) navigate(`/game/${myGameId}`); };
  const handleSpectate = (gameId: string) => navigate(`/game/${gameId}`);

  const btn = `px-3 py-0.5 rounded text-xs font-bold transition`;

  return (
    <div className={`${isDark ? 'dark' : ''} min-h-screen`}>
    <div className="min-h-screen bg-slate-100 dark:bg-gray-950 text-slate-800 dark:text-white flex flex-col">

      {/* Top bar — compact */}
      <div className="flex items-center gap-2 px-3 py-1 bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-700">
        <FurukooLogo />

        <div className="flex gap-2 ml-auto items-center">
          <span className="text-xs font-mono text-slate-500 dark:text-gray-400">
            {user?.username} <span className="text-violet-500 font-bold">({user?.elo})</span>
          </span>
          {myGameId
            ? <button onClick={handleRejoin} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>Rejoin</button>
            : hasProposal
              ? <button onClick={handleRemove} className={`${btn} bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-gray-700 dark:text-gray-200`}>Remove</button>
              : <button onClick={handlePlay}   className={`${btn} bg-violet-600 text-white hover:bg-violet-700`}>Play</button>
          }
          <button onClick={logout} className={`${btn} bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300`}>Logout</button>
          <DarkToggle isDark={isDark} onToggle={toggleDark} />
        </div>
      </div>

      <ConnectionBanner />

      {/* Main content — horizontal split: 66% left / 34% right */}
      <div className="flex-1 min-h-0 p-2">
        <ResizableSplit
          direction="horizontal"
          initialFirstPct={66}
          first={
            <div className="h-full flex flex-col min-h-0">
              {/* Vertical split: rules (top) / proposals table (bottom) */}
              <ResizableSplit
                direction="vertical"
                initialFirstPct={38}
                first={<div className="h-full"><RulesBox /></div>}
                second={
                  <div className="h-full"><div className="flex flex-col h-full bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700">
                          <th className="text-left px-3 py-1 text-slate-500 dark:text-gray-400 font-bold w-36">ELO Range</th>
                          <th className="text-left px-3 py-1 text-slate-500 dark:text-gray-400 font-bold">Waiting</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ELO_RANGES.map(range => {
                          const row = proposals.filter(p => p.eloRange === range);
                          return (
                            <tr key={range} className="border-b border-slate-100 dark:border-gray-800 last:border-0">
                              <td className="px-3 py-1 text-slate-500 dark:text-gray-400">{range}</td>
                              <td className="px-3 py-1">
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
                  </div></div>
                }
              />
            </div>
          }
          second={
            <div className="h-full flex flex-col min-h-0">
              {/* Vertical split: players (top) / chat (bottom) */}
              <ResizableSplit
                direction="vertical"
                initialFirstPct={45}
                first={<div className="h-full"><PlayersBox users={users} myUsername={user?.username ?? ''} onSpectate={handleSpectate} /></div>}
                second={<div className="h-full"><ChatBox messages={messages} onSend={handleSend} myUsername={user?.username ?? ''} /></div>}
              />
            </div>
          }
        />
      </div>
    </div>
    </div>
  );
}
