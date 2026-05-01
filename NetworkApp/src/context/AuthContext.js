import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user,  setUser]  = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const tok = await SecureStore.getItemAsync('nw_tok');
        const raw = await SecureStore.getItemAsync('nw_me');
        if (tok) {
          setToken(tok);
          const cached = raw ? JSON.parse(raw) : null;
          setUser(cached);
          // Refresh from server so profile_score / is_profile_complete is current
          try {
            const { data } = await api.get('/api/me', {
              headers: { Authorization: `Bearer ${tok}` },
            });
            setUser(data);
            await SecureStore.setItemAsync('nw_me', JSON.stringify(data));
          } catch {
            // Offline — use cached user
          }
        }
      } catch (e) {
        console.log('[Auth] Init error:', e.message);
        try { await SecureStore.deleteItemAsync('nw_tok'); } catch {}
        try { await SecureStore.deleteItemAsync('nw_me'); } catch {}
      } finally {
        setReady(true);
      }
    })();
  }, []);

  async function login(email, password) {
    const { data } = await api.post('/api/login', { email, password });
    await SecureStore.setItemAsync('nw_tok', data.token);
    await SecureStore.setItemAsync('nw_me', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  async function signup(name, email, password) {
    const { data } = await api.post('/api/signup', { name, email, password });
    await SecureStore.setItemAsync('nw_tok', data.token);
    await SecureStore.setItemAsync('nw_me', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  async function logout() {
    try { await SecureStore.deleteItemAsync('nw_tok'); } catch {}
    try { await SecureStore.deleteItemAsync('nw_me'); } catch {}
    setToken(null);
    setUser(null);
  }

  async function refreshUser() {
    try {
      const { data } = await api.get('/api/me');
      setUser(data);
      await SecureStore.setItemAsync('nw_me', JSON.stringify(data));
      return data;
    } catch {
      return user;
    }
  }

  return (
    <AuthContext.Provider value={{
      token,
      user,
      ready,
      profileComplete: user?.is_profile_complete === true ||
                       (user?.profile_score != null && user.profile_score >= 70),
      login,
      signup,
      logout,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
