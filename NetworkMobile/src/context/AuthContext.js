import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken]   = useState(null);
  const [user,  setUser]    = useState(null);
  const [ready, setReady]   = useState(false);

  useEffect(() => {
    (async () => {
      const tok = await SecureStore.getItemAsync('nw_tok');
      const raw = await SecureStore.getItemAsync('nw_me');
      if (tok) { setToken(tok); setUser(raw ? JSON.parse(raw) : null); }
      setReady(true);
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
    await SecureStore.deleteItemAsync('nw_tok');
    await SecureStore.deleteItemAsync('nw_me');
    setToken(null);
    setUser(null);
  }

  async function refreshUser() {
    try {
      const { data } = await api.get('/api/me');
      setUser(data);
      await SecureStore.setItemAsync('nw_me', JSON.stringify(data));
      return data;
    } catch { return user; }
  }

  return (
    <AuthContext.Provider value={{ token, user, ready, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
