'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { apiGet, apiPost, clearToken } from '@/lib/api';
import type { User } from '@/lib/types';

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ user: User; token: string }>;
  signup: (name: string, email: string, password: string, extra?: Record<string, unknown>) => Promise<{ user: User; token: string }>;
  logout: () => void;
  refreshUser: () => Promise<User | undefined>;
  setUser: (u: User | null) => void;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiGet<User>('/api/me');
      setUser(data);
      return data;
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // One-time purge of a token a pre-fix browser may still have in
    // localStorage -- auth now runs solely on the httpOnly cookie.
    clearToken();
    apiGet<User>('/api/me')
      .then(setUser)
      .catch(() => { /* not authenticated */ })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function onUnauthorized() { clearToken(); setUser(null); }
    window.addEventListener('byn:unauthorized', onUnauthorized);
    return () => window.removeEventListener('byn:unauthorized', onUnauthorized);
  }, []);

  async function login(email: string, password: string) {
    const r = await apiPost<{ token: string; user: User }>('/api/login', { email, password });
    setUser(r.user);
    return r;
  }

  async function signup(name: string, email: string, password: string, extra?: Record<string, unknown>) {
    const r = await apiPost<{ token: string; user: User }>('/api/signup', { name, email, password, ...extra });
    setUser(r.user);
    return r;
  }

  function logout() {
    apiPost('/api/logout', {}).catch(() => {});
    clearToken();
    setUser(null);
    window.location.href = '/login';
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
