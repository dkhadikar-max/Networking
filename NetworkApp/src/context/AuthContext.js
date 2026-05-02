import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import api from '../utils/api';

const AuthContext = createContext(null);

// Handle incoming notifications while app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

async function registerPushToken() {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    // Android needs a notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#C6A86B',
      });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data; // e.g. ExponentPushToken[xxxx]
  } catch (e) {
    console.log('[Push] Token error:', e.message);
    return null;
  }
}

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
          // Refresh from server so profile_score / trust_score / is_profile_complete is current
          try {
            const { data } = await api.get('/api/me', {
              headers: { Authorization: `Bearer ${tok}` },
            });
            setUser(data);
            await SecureStore.setItemAsync('nw_me', JSON.stringify(data));
            // Register push token silently after successful auth
            syncPushToken();
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

  async function syncPushToken() {
    try {
      const pushToken = await registerPushToken();
      if (pushToken) {
        await api.post('/api/me/push-token', { token: pushToken });
      }
    } catch (e) {
      console.log('[Push] Sync error:', e.message);
    }
  }

  async function login(email, password) {
    const { data } = await api.post('/api/login', { email, password });
    await SecureStore.setItemAsync('nw_tok', data.token);
    await SecureStore.setItemAsync('nw_me', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    // Register push token after login (non-blocking)
    syncPushToken().catch(() => {});
    return data.user;
  }

  async function signup(name, email, password) {
    const { data } = await api.post('/api/signup', { name, email, password });
    await SecureStore.setItemAsync('nw_tok', data.token);
    await SecureStore.setItemAsync('nw_me', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    syncPushToken().catch(() => {});
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
