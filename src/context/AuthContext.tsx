import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { connectSocket, disconnectSocket, getSocket } from '../lib/socket';

interface AuthUser { username: string; elo: number; token: string; isAdmin?: boolean; }
interface AuthCtx {
  user: AuthUser | null;
  isMuted: boolean;
  soundEnabled: boolean;
  login: (u: AuthUser) => void;
  logout: () => void;
  updateElo: (elo: number) => void;
  setSoundEnabled: (v: boolean) => void;
}

const Ctx = createContext<AuthCtx>(null!);
const KEY = 'furukoo_auth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || 'null') as AuthUser | null;
      // Connect eagerly so getSocket() is non-null before any child effect runs
      if (data?.token && !getSocket()) connectSocket(data.token);
      return data;
    } catch { return null; }
  });
  const [isMuted, setIsMuted] = useState(false);
  const [soundEnabled, setSoundEnabledState] = useState(true);

  const login = (u: AuthUser) => {
    setUser(u);
    localStorage.setItem(KEY, JSON.stringify(u));
    connectSocket(u.token);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(KEY);
    disconnectSocket();
  };

  useEffect(() => {
    const sock = getSocket();
    if (!sock || !user) return;
    const onKicked = () => {
      setUser(null);
      localStorage.removeItem(KEY);
      disconnectSocket();
      window.location.replace('/login?reason=kicked');
    };
    const onBanned = () => {
      setUser(null);
      localStorage.removeItem(KEY);
      disconnectSocket();
      window.location.replace('/login?reason=banned');
    };
    const onFlags = ({ isMuted: m, soundEnabled: s, elo: e }: { isMuted: boolean; soundEnabled?: boolean; elo?: number }) => {
      setIsMuted(m);
      if (s !== undefined) setSoundEnabledState(s);
      if (e !== undefined) {
        setUser(prev => {
          if (!prev || prev.elo === e) return prev;
          const next = { ...prev, elo: e };
          localStorage.setItem(KEY, JSON.stringify(next));
          return next;
        });
      }
    };
    sock.on('session:kicked', onKicked);
    sock.on('auth:banned', onBanned);
    sock.on('user:flags', onFlags);
    return () => { sock.off('session:kicked', onKicked); sock.off('auth:banned', onBanned); sock.off('user:flags', onFlags); };
  }, [user]);

  const updateElo = (elo: number) => {
    setUser(prev => {
      if (!prev) return prev;
      const next = { ...prev, elo };
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  };

  const setSoundEnabled = (v: boolean) => {
    setSoundEnabledState(v);
    getSocket()?.emit('user:setSoundEnabled', { soundEnabled: v });
  };

  return (
    <Ctx.Provider value={{ user, isMuted, soundEnabled, login, logout, updateElo, setSoundEnabled }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() { return useContext(Ctx); }
