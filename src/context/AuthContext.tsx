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
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); }
    catch { return null; }
  });

  // Re-connect socket on first mount if we already have a stored session
  useEffect(() => {
    if (user && !getSocket()?.connected) connectSocket(user.token);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
