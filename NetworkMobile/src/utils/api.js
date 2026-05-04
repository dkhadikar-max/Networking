import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = 'https://buildyournetwork.online';

const api = axios.create({ baseURL: BASE_URL, timeout: 15000 });

// Attach token to every request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('nw_tok');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;

