'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { apiGet, apiPost, getToken, setToken, clearToken } from '@/lib/api';
import type { User } from '@/lib/types';

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ user: User; token: string }>;
  signup: (name: string, email: string, password: string) => Promise<{ user: User; token: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  setUser: (u: User | null) => void;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => !!getToken());

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiGet<User>('/api/me');
      setUser(data);
    } catch {
      clearToken();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    apiGet<User>('/api/me')
      .then(data => setUser(data))
      .catch(() => { clearToken(); })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const r = await apiPost<{ token: string; user: User }>('/api/login', { email, password });
    setToken(r.token);
    setUser(r.user);
    return r;
  }

  async function signup(name: string, email: string, password: string) {
    const r = await apiPost<{ token: string; user: User }>('/api/signup', { name, email, password });
    setToken(r.token);
    setUser(r.user);
    return r;
  }

  function logout() {
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
