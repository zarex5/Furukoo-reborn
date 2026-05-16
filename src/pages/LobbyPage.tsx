import { useState, useEffect, useRef, useCallback } from 'react';
import boardPreview from '../assets/board-preview.png';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../lib/socket';
import { useChatMessages } from '../lib/chatStore';
import { PlayersBox, ChatBox, type OnlineUser } from '../components/RightPanel';
import { ResizableSplit } from '../components/ResizableSplit';
import { FurukooLogo } from '../components/FurukooLogo';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { DarkToggle } from '../components/DarkToggle';
import { useDarkMode } from '../lib/darkMode';
import { Tip } from '../components/Tip';

interface Proposal { username: string; elo: number; eloRange: string; isBot?: boolean; botLevel?: number; isPrivate?: boolean; }

const ELO_RANGES = ['2400-3000','2200-2399','2000-2199','1800-1999','1600-1799','1400-1599','1200-1399','1000-1199'];


const INVITE_MSGS = [
  'Invite your friends',      // English ×3
  'Invitez vos amis',         // French ×3
  'Invite your friends',
  'Invitez vos amis',
  'Kutsu ystäväsi',           // Finnish
  'Invite your friends',
  'Invitez vos amis',
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
  const renderCycle = (prefix: string) =>
    INVITE_MSGS.flatMap((msg, i) => [
      <span key={`${prefix}m${i}`}>{msg}</span>,
      <img key={`${prefix}s${i}`} src="/owl.jpg" alt="" className="inline-block w-5 h-4 object-cover opacity-60 mx-2" />,
    ]);
  return (
    <div className="overflow-hidden border-t border-slate-100 dark:border-gray-800 mt-1.5 pt-1.5 pb-1.5">
      <span className="ticker-track inline-flex items-center gap-2 text-xs font-mono text-slate-400 dark:text-gray-500 select-none">
        {renderCycle('a')}
        {renderCycle('b')}
      </span>
    </div>
  );
}

const CREDITS = (
  <div className="px-3 pb-1 border-t border-slate-100 dark:border-gray-800 text-xs font-mono text-slate-400 dark:text-gray-500 pt-2">
    <p>Coded with ♥ by <span className="text-slate-500 dark:text-gray-400">iNo_</span> & <span className="text-violet-500 dark:text-violet-400">Claude</span> — Original game by <span className="text-slate-500 dark:text-gray-400">Jean François Loiseleux</span> & <span className="text-slate-500 dark:text-gray-400">@Navedac</span></p>
  </div>
);

function RulesBox({ mobile = false }: { mobile?: boolean }) {
  const rulesContent = (
    <div className="space-y-1.5">
      <div className="flex gap-3 items-start">
        <div className="flex-none mt-1"><img src={boardPreview} alt="Board preview" className="w-24 h-24 object-contain rounded-xl" /></div>
        <div className="space-y-1.5">
          <p>Furukoo is a strategy board game that plays in two phases:</p>
          <p><strong>Placement phase —</strong> Players alternate placing 7 pieces each on the board</p>
          <p><strong>Movement phase —</strong> Players move pieces to adjacent slots, trying to form a square</p>
        </div>
      </div>
      <p><strong>Win</strong> by forming four of your pieces in a square pattern.</p>
      <p><strong>Lose</strong> by letting your opponent form a square, by resigning or running out of time (5 min + 3 sec/move).</p>
      <p><strong>Draw</strong> by threefold position repetition.</p>
      <div className="pt-1.5"><p><strong>Spectate</strong> any game live by clicking the colored circle next to a player.</p></div>
    </div>
  );

  if (mobile) {
    return (
      <div className="px-3 py-2 text-xs font-mono text-slate-600 dark:text-gray-300 leading-relaxed">
        {rulesContent}
        <div className="mt-3">{CREDITS}</div>
        <InviteTicker />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="text-xs font-bold px-2 py-1 bg-slate-50 dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400 flex-none">
        How to play
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 text-xs font-mono text-slate-600 dark:text-gray-300 leading-relaxed">
        {rulesContent}
      </div>
      {CREDITS}
      <InviteTicker />
    </div>
  );
}

interface ProposalDropdownProps {
  username: string;
  isPrivate: boolean;
  onCopyLink: () => void;
  onTogglePrivate: () => void;
  onRemove: () => void;
  /** Compact style used inside the table badge */
  compact?: boolean;
}

function ProposalDropdown({ username, isPrivate, onCopyLink, onTogglePrivate, onRemove, compact = false }: ProposalDropdownProps) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setOpenUp(rect.bottom + 120 > window.innerHeight);
    }
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const item = 'w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-slate-100 dark:hover:bg-gray-700 transition whitespace-nowrap flex items-center gap-2';

  const triggerClass = compact
    ? `px-2 py-0.5 rounded text-xs font-bold font-sans transition border bg-slate-100 text-slate-500 border-slate-300 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600 cursor-pointer hover:bg-slate-200 dark:hover:bg-gray-600 flex items-center gap-1`
    : `px-3 py-0.5 rounded text-xs font-bold transition bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-gray-700 dark:text-gray-200 flex items-center gap-1`;

  const lockIcon = (
    <Tip content="Private game — only accessible via your shared link">
      <svg className="w-3 h-3 inline-block" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a4 4 0 0 1 4 4v1h1a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h1V5a4 4 0 0 1 4-4zm0 1a3 3 0 0 0-3 3v1h6V5a3 3 0 0 0-3-3zm0 7a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>
      </svg>
    </Tip>
  );

  return (
    <div ref={ref} className="relative inline-block">
      <button ref={btnRef} onClick={toggle} className={triggerClass}>
        {isPrivate && lockIcon}
        {compact ? `${username} (play)` : 'Play'}
        <svg className="w-3 h-3 ml-0.5 opacity-60" viewBox="0 0 12 12" fill="currentColor">
          <path d="M6 8L1 3h10z" />
        </svg>
      </button>
      {open && (
        <div className={`absolute ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'} left-0 z-50 min-w-max bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden`}>
          <button className={item} onClick={() => { onCopyLink(); setOpen(false); }}>
            <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H4zm0 1h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M6.5 6.5h3v1h-3z"/></svg>
            Copy link to game
          </button>
          <button className={item} onClick={() => { onTogglePrivate(); setOpen(false); }}>
            {isPrivate
              ? <><svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 16 16" fill="currentColor"><path d="M3 6V5a5 5 0 0 1 10 0v1h1a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h1zm1 0h8V5a4 4 0 0 0-8 0v1z"/></svg>Make public</>
              : <><svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a4 4 0 0 1 4 4v1h1a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h1V5a4 4 0 0 1 4-4zm0 1a3 3 0 0 0-3 3v1h6V5a3 3 0 0 0-3-3zm0 7a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg>Make private</>
            }
          </button>
          <div className="border-t border-slate-100 dark:border-gray-700" />
          <button className={`${item} text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20`} onClick={() => { onRemove(); setOpen(false); }}>
            <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zM2 5h12v1H2V5zm3.5-3h5a1 1 0 0 1 1 1v1h-7V3a1 1 0 0 1 1-1z"/></svg>
            Remove proposition
          </button>
        </div>
      )}
    </div>
  );
}

export default function LobbyPage() {
  const { user, isMuted, logout, updateElo } = useAuth();
  const navigate = useNavigate();

  const { isDark, toggleDark } = useDarkMode();
  const [users,     setUsers]     = useState<OnlineUser[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [hasProposal, setHasProposal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const messages = useChatMessages();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const myProposal = proposals.find(p => p.username === user?.username);
  const myProposalIsPrivate = myProposal?.isPrivate ?? false;

  const handleCopyLink = useCallback(() => {
    const link = `${window.location.origin}/?join=${user?.username}`;
    navigator.clipboard.writeText(link).catch(() => {});
  }, [user?.username]);

  const handleTogglePrivate = useCallback(() => {
    getSocket()?.emit('game:togglePrivate');
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onLobby = ({ users: u, proposals: p }: { users: OnlineUser[]; proposals: Proposal[] }) => {
      setUsers(u);
      setProposals(p);
      setHasProposal(p.some(pr => pr.username === user?.username));
    };
    const onStarted = ({ gameId }: { gameId: string }) => navigate(`/game/${gameId}`);
    const onState = (g: { id: string }) => navigate(`/game/${g.id}`);

    socket.on('lobby:state',  onLobby);
    socket.on('game:started', onStarted);
    socket.on('game:state',   onState);

    // Re-request state on mount — the socket stays connected during navigation
    // so the server won't push a fresh snapshot when we navigate back via browser history.
    if (socket.connected) {
      socket.emit('lobby:request');

      const params = new URLSearchParams(window.location.search);
      const joinUser = params.get('join');
      if (joinUser) {
        navigate('/', { replace: true });
        if (joinUser === user?.username) {
          setToast("You can't accept your own game");
        } else {
          socket.emit('game:accept', joinUser);
        }
      }
    }

    return () => {
      socket.off('lobby:state',  onLobby);
      socket.off('game:started', onStarted);
      socket.off('game:state',   onState);
    };
  }, [navigate, user?.username]);

  useEffect(() => {
    const me = users.find(u => u.username === user?.username);
    if (me && me.elo !== user?.elo) updateElo(me.elo);
  }, [users, user?.username, user?.elo, updateElo]);

  const myUser   = users.find(u => u.username === user?.username);
  const myGameId = myUser?.gameId && !myUser.spectating ? myUser.gameId : null;

  const handleSend   = (text: string) => getSocket()?.emit('chat:send', { text, origin: 'lobby' });
  const handlePlay   = () => getSocket()?.emit('game:propose');
  const handleRemove = () => { getSocket()?.emit('game:remove'); setHasProposal(false); };
  const handleAccept = (proposerUsername: string) => getSocket()?.emit('game:accept', proposerUsername);
  const handleRejoin   = () => { if (myGameId) navigate(`/game/${myGameId}`); };
  const handleSpectate = (gameId: string) => navigate(`/game/${gameId}`);

  const btn = `px-3 py-0.5 rounded text-xs font-bold transition`;
  const visibleProposals = proposals.filter(p => !p.isPrivate || p.username === user?.username);
  const allProposals = visibleProposals; // flat list for mobile
  const [rulesOpen, setRulesOpen] = useState(false);

  const dropdownProps = {
    username: user?.username ?? '',
    isPrivate: myProposalIsPrivate,
    onCopyLink: handleCopyLink,
    onTogglePrivate: handleTogglePrivate,
    onRemove: handleRemove,
  };

  return (
    <div className={`${isDark ? 'dark' : ''} md:h-screen md:overflow-hidden`}>
    <div className="md:h-full bg-slate-100 dark:bg-gray-950 text-slate-800 dark:text-white flex flex-col">

      {/* ── Shared top bar ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-1 bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-700 flex-none">
        <FurukooLogo />
        <div className="flex gap-2 ml-auto items-center">
          {/* Profile button — hidden on mobile (shown in mobile action bar) */}
          <button
            onClick={() => navigate(`/profile/${user?.username}`)}
            className="hidden md:inline-flex px-2 py-0.5 rounded text-xs font-mono bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-700 transition border border-slate-200 dark:border-gray-700"
          >
            {user?.username} <span className="text-violet-500 font-bold">({user?.elo})</span>
          </button>
          {/* Desktop action buttons */}
          <div className="hidden md:flex gap-2 items-center">
            {myGameId
              ? <button onClick={handleRejoin} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>Rejoin</button>
              : hasProposal
                ? <ProposalDropdown {...dropdownProps} />
                : <button onClick={handlePlay}   className={`${btn} bg-violet-600 text-white hover:bg-violet-700`}>Play</button>
            }
            {user?.isAdmin && (
              <button onClick={() => navigate('/admin')} className={`${btn} bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300`}>Admin</button>
            )}
            <button onClick={logout} className={`${btn} bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300`}>Logout</button>
          </div>
          <DarkToggle isDark={isDark} onToggle={toggleDark} />
        </div>
      </div>

      <ConnectionBanner />

      {/* ── Desktop layout (md+) ─────────────────────────────────────────── */}
      <div className="hidden md:flex flex-1 min-h-0 p-2">
        <ResizableSplit
          direction="horizontal"
          initialFirstPct={66}
          first={
            <div className="h-full flex flex-col min-h-0">
              <ResizableSplit
                direction="vertical"
                initialFirstPct={65}
                first={<div className="h-full"><RulesBox /></div>}
                second={
                  <div className="h-full"><div className="flex flex-col h-full bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700">
                          <th className="text-left px-3 py-1 text-slate-500 dark:text-gray-400 font-bold w-36">ELO Range</th>
                          <th className="px-3 py-1 text-slate-500 dark:text-gray-400 font-bold">
                            <div className="flex items-center justify-between">
                              <span>Waiting</span>
                              {visibleProposals.length > 0 && (
                                <span className="text-violet-600 dark:text-violet-400 font-bold">{visibleProposals.length} open</span>
                              )}
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {ELO_RANGES.map(range => {
                          const row = proposals.filter(p => p.eloRange === range && (p.username === user?.username || !p.isPrivate));
                          return (
                            <tr key={range} className="border-b border-slate-100 dark:border-gray-800 last:border-0">
                              <td className="px-3 py-1 text-slate-500 dark:text-gray-400">{range}</td>
                              <td className="px-3 py-1">
                                <div className="flex flex-wrap gap-2">
                                  {row.map(p => (
                                    p.username === user?.username
                                      ? <ProposalDropdown key={p.username} {...dropdownProps} compact />
                                      : <button key={p.username}
                                          onClick={() => handleAccept(p.username)}
                                          className="px-2 py-0.5 rounded text-xs font-bold font-sans transition border bg-green-50 text-green-800 border-green-300 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700 cursor-pointer"
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
              <ResizableSplit
                direction="vertical"
                initialFirstPct={50}
                first={<div className="h-full"><PlayersBox users={users} myUsername={user?.username ?? ''} onSpectate={handleSpectate} /></div>}
                second={<div className="h-full"><ChatBox messages={messages} onSend={handleSend} myUsername={user?.username ?? ''} origin="lobby" muted={isMuted} /></div>}
              />
            </div>
          }
        />
      </div>

      {/* ── Mobile layout (<md) ──────────────────────────────────────────── */}
      <div className="flex md:hidden flex-col pb-4">

        {/* Action bar */}
        <div className="flex items-center gap-2 px-3 py-1 bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-700">
          <button
            onClick={() => navigate(`/profile/${user?.username}`)}
            className="flex-1 min-w-0 text-left px-2 py-0.5 rounded text-xs font-mono bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-700 transition border border-slate-200 dark:border-gray-700"
          >
            <span className="font-bold">{user?.username}</span>
            <span className="text-violet-500 font-bold ml-1">({user?.elo})</span>
          </button>
          {myGameId
            ? <button onClick={handleRejoin}  className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>Rejoin</button>
            : hasProposal
              ? <ProposalDropdown {...dropdownProps} />
              : <button onClick={handlePlay}   className={`${btn} bg-violet-600 text-white hover:bg-violet-700`}>Play</button>
          }
          {user?.isAdmin && (
            <button onClick={() => navigate('/admin')} className={`${btn} bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300`}>Admin</button>
          )}
          <button onClick={logout} className={`${btn} bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300`}>Logout</button>
        </div>

        {/* Waiting section — ELO range table (same as desktop) */}
        <div className="mx-3 mt-3 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="bg-slate-50 dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700">
                <th className="text-left px-3 py-1 text-slate-500 dark:text-gray-400 font-bold w-28">ELO Range</th>
                <th className="px-3 py-1 text-slate-500 dark:text-gray-400 font-bold">
                  <div className="flex items-center justify-between">
                    <span>Waiting</span>
                    {allProposals.length > 0 && (
                      <span className="text-violet-600 dark:text-violet-400 font-bold">{allProposals.length} open</span>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {ELO_RANGES.map(range => {
                const row = proposals.filter(p => p.eloRange === range && (p.username === user?.username || !p.isPrivate));
                return (
                  <tr key={range} className="border-b border-slate-100 dark:border-gray-800 last:border-0">
                    <td className="px-3 py-1.5 text-slate-400 dark:text-gray-500 whitespace-nowrap w-28">{range}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex flex-wrap gap-1.5">
                        {row.map(p => (
                          p.username === user?.username
                            ? <ProposalDropdown key={p.username} {...dropdownProps} compact />
                            : <button key={p.username}
                                onClick={() => handleAccept(p.username)}
                                className="px-2 py-0.5 rounded text-xs font-bold font-sans border transition bg-green-50 text-green-800 border-green-300 active:bg-green-100 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700 cursor-pointer"
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

        {/* Chat */}
        <div className="mx-3 mt-3 flex flex-col bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl overflow-hidden" style={{ height: 240 }}>
          <ChatBox messages={messages} onSend={handleSend} myUsername={user?.username ?? ''} origin="lobby" muted={isMuted} />
        </div>

        {/* Players — auto-height, no fixed constraint */}
        <div className="mx-3 mt-3 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <PlayersBox users={users} myUsername={user?.username ?? ''} onSpectate={handleSpectate} mobile />
        </div>

        {/* Rules — collapsible */}
        <div className="mx-3 mt-3 mb-4 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <button
            onClick={() => setRulesOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-gray-800 text-xs font-bold text-slate-500 dark:text-gray-400"
          >
            <span>How to play</span>
            <span className="text-slate-400 dark:text-gray-500">{rulesOpen ? '▲' : '▼'}</span>
          </button>
          {rulesOpen && (
            <div className="px-4 py-3">
              <RulesBox mobile />
            </div>
          )}
        </div>

      </div>

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-slate-800 dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-mono shadow-xl pointer-events-none">
          {toast}
        </div>
      )}
    </div>
    </div>
  );
}
