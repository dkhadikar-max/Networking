'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { apiGet, apiPost, clearToken } from '@/lib/api';
import type { User } from '@/lib/types';

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ user: User; token: string }>;
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
      .catch(() => {
        if (process.env.NODE_ENV === 'development') {
          setUser({
            id: 'user-founder-1',
            name: 'Aarav Sharma',
            email: 'aarav@neuroflow.ai',
            email_verified: true,
            onboarding_stage: 'complete',
            headline: 'Founder & CEO @ NeuroFlow · Bengaluru',
            location: 'Bengaluru, India',
            intent: 'find-cofounder',
            trust_score: 95,
            verified: true,
            photos: ['/assets/sample-founder-1.jpg'],
          } as User);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function onUnauthorized() {
      if (process.env.NODE_ENV === 'development') {
        setUser({
          id: 'user-founder-1',
          name: 'Aarav Sharma',
          email: 'aarav@neuroflow.ai',
          email_verified: true,
          onboarding_stage: 'complete',
          headline: 'Founder & CEO @ NeuroFlow · Bengaluru',
          location: 'Bengaluru, India',
          intent: 'find-cofounder',
          trust_score: 95,
          verified: true,
          photos: ['/assets/sample-founder-1.jpg'],
        } as User);
        return;
      }
      clearToken();
      setUser(null);
    }
    window.addEventListener('byn:unauthorized', onUnauthorized);
    return () => window.removeEventListener('byn:unauthorized', onUnauthorized);
  }, []);

  async function login(email: string, password: string) {
    const r = await apiPost<{ token: string; user: User }>('/api/login', { email, password });
    setUser(r.user);
    return r;
  }

  // Password-based registration retired (server.js /api/signup now returns
  // 410) — canonical flow is now Basic Details -> Magic Link -> Onboarding
  // -> Active, via /api/auth/magic-link/request (see signup/page.tsx),
  // which doesn't need a session-issuing helper here since it never issues
  // a session itself (only /api/auth/magic-link/verify does).

  function logout() {
    apiPost('/api/logout', {}).catch(() => {});
    clearToken();
    setUser(null);
    window.location.href = '/login';
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
