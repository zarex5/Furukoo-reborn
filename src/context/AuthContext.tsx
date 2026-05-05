import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { connectSocket, disconnectSocket, getSocket } from '../lib/socket';

interface AuthUser { username: string; elo: number; token: string; }
interface AuthCtx {
  user: AuthUser | null;
  login: (u: AuthUser) => void;
  logout: () => void;
  updateElo: (elo: number) => void;
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
    };
    sock.on('session:kicked', onKicked);
    return () => { sock.off('session:kicked', onKicked); };
  }, [user]);

  const updateElo = (elo: number) => {
    setUser(prev => {
      if (!prev) return prev;
      const next = { ...prev, elo };
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  };

  return <Ctx.Provider value={{ user, login, logout, updateElo }}>{children}</Ctx.Provider>;
}

export function useAuth() { return useContext(Ctx); }
