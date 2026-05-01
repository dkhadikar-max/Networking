import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = 'https://adequate-dedication-production-b992.up.railway.app';

const api = axios.create({ baseURL: BASE_URL });

// Attach token to every request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('nw_tok');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
