import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import api from '../utils/api';

// Resolve EAS project ID — required by expo-notifications on real devices (iOS + Android)
const EAS_PROJECT_ID =
  Constants?.expoConfig?.extra?.eas?.projectId ??
  Constants?.easConfig?.projectId ??
  'f01fcb05-0fe1-4d67-84f3-6e82bfd47200';

// How long a device stays "remembered" after OTP verification
const REMEMBER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const KEYS = {
  token:          'nw_tok',
  user:           'nw_me',
  deviceVerified: 'nw_dev_verified_until', // epoch ms stored as string
};

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
        lightColor: '#0F766E',
      });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    return tokenData.data;
  } catch (e) {
    console.log('[Push] Token error:', e.message);
    return null;
  }
}

// Read the device-verified-until timestamp from SecureStore.
// Returns the epoch ms number, or 0 if not set / expired.
async function readDeviceVerifiedUntil() {
  try {
    const raw = await SecureStore.getItemAsync(KEYS.deviceVerified);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

export function AuthProvider({ children }) {
  const [token,               setToken]               = useState(null);
  const [user,                setUser]                 = useState(null);
  const [ready,               setReady]               = useState(false);
  const [deviceVerifiedUntil, setDeviceVerifiedUntil] = useState(0);

  // On boot: restore token, user, and device-verified timestamp from SecureStore
  useEffect(() => {
    (async () => {
      try {
        const [tok, raw, devRaw] = await Promise.all([
          SecureStore.getItemAsync(KEYS.token),
          SecureStore.getItemAsync(KEYS.user),
          SecureStore.getItemAsync(KEYS.deviceVerified),
        ]);

        const devUntil = devRaw ? parseInt(devRaw, 10) : 0;
        setDeviceVerifiedUntil(devUntil);

        if (tok) {
          setToken(tok);
          const cached = raw ? JSON.parse(raw) : null;
          setUser(cached);

          // Always refresh from server to get latest email_verified, trust_score, etc.
          try {
            const { data } = await api.get('/api/me', {
              headers: { Authorization: `Bearer ${tok}` },
            });
            setUser(data);
            await SecureStore.setItemAsync(KEYS.user, JSON.stringify(data));
            syncPushToken();
          } catch {
            // Offline — use cached user; app still works
          }
        }
      } catch (e) {
        console.log('[Auth] Init error:', e.message);
        try { await SecureStore.deleteItemAsync(KEYS.token); } catch {}
        try { await SecureStore.deleteItemAsync(KEYS.user);  } catch {}
      } finally {
        setReady(true);
      }
    })();
  }, []);

  async function syncPushToken() {
    try {
      const pushToken = await registerPushToken();
      if (pushToken) await api.post('/api/me/push-token', { token: pushToken });
    } catch (e) {
      console.log('[Push] Sync error:', e.message);
    }
  }

  async function login(email, password) {
    const { data } = await api.post('/api/login', { email, password });
    await SecureStore.setItemAsync(KEYS.token, data.token);
    await SecureStore.setItemAsync(KEYS.user,  JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    syncPushToken().catch(() => {});
    return data.user;
  }

  async function signup(name, email, password) {
    const { data } = await api.post('/api/signup', { name, email, password });
    await SecureStore.setItemAsync(KEYS.token, data.token);
    await SecureStore.setItemAsync(KEYS.user,  JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    syncPushToken().catch(() => {});
    return data.user;
  }

  async function logout() {
    try { await SecureStore.deleteItemAsync(KEYS.token); } catch {}
    try { await SecureStore.deleteItemAsync(KEYS.user);  } catch {}
    // Do NOT clear deviceVerifiedUntil on logout — the whole point is that the
    // device stays remembered across login sessions for up to 7 days.
    setToken(null);
    setUser(null);
  }

  async function refreshUser() {
    try {
      const { data } = await api.get('/api/me');
      setUser(data);
      await SecureStore.setItemAsync(KEYS.user, JSON.stringify(data));
      return data;
    } catch {
      return user;
    }
  }

  // Call this after a successful OTP verification (optionally with remember=true).
  // If remember=true, sets a 7-day device timestamp so future logins skip OTP.
  async function markDeviceVerified(remember = true) {
    const until = remember ? Date.now() + REMEMBER_MS : 0;
    setDeviceVerifiedUntil(until);
    if (remember) {
      await SecureStore.setItemAsync(KEYS.deviceVerified, String(until));
    } else {
      // Not remembered — clear so next login requires OTP again
      await SecureStore.deleteItemAsync(KEYS.deviceVerified);
    }
  }

  // emailVerified = true when:
  //   1. The server says email_verified === true (permanent, set after first OTP)
  //   AND
  //   2. This device is within its 7-day remember window
  //      OR the user has never needed to re-verify (deviceVerifiedUntil === 0 means
  //      they verified on a different device/session — still require OTP on this device)
  //
  // Logic:
  //   - Fresh signup:  email_verified=false → always show OTP screen
  //   - After verify + remember: email_verified=true, deviceVerifiedUntil = now+7d → skip OTP
  //   - After 7 days: deviceVerifiedUntil expired → OTP required again
  //   - New device (no local key): deviceVerifiedUntil=0, email_verified=true → OTP required
  const isDbVerified     = user?.email_verified === true;
  const isDeviceRemembered = deviceVerifiedUntil > Date.now();
  const emailVerified    = isDbVerified && isDeviceRemembered;

  return (
    <AuthContext.Provider value={{
      token,
      user,
      ready,
      emailVerified,
      profileComplete: user?.is_profile_complete === true ||
                       (user?.profile_score != null && user.profile_score >= 70),
      login,
      signup,
      logout,
      refreshUser,
      markDeviceVerified,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
