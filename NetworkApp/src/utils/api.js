import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { notifyNetworkError, notifyNetworkRestored } from '../hooks/useNetworkStatus';

const BASE_URL = 'https://buildyournetwork.up.railway.app';

const api = axios.create({ baseURL: BASE_URL, timeout: 8000 });

// ── Request: attach auth token ────────────────────────────────────────────
api.interceptors.request.use(async (config) => {
  try {
    const token = await SecureStore.getItemAsync('nw_tok');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch (_) { /* secure store unavailable */ }
  return config;
});

// ── Response: track connectivity ──────────────────────────────────────────
api.interceptors.response.use(
  (response) => {
    notifyNetworkRestored();
    return response;
  },
  (error) => {
    if (!error.response) {
      // No response = network error (offline, DNS fail, timeout)
      notifyNetworkError();
    }
    return Promise.reject(error);
  },
);

export default api;
