import axios from 'axios';

export function createJarvisClient(baseURL, token) {
  const api = axios.create({
    baseURL,
    timeout: 60000,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  return {
    async command(message, context = {}) {
      const { data } = await api.post('/api/jarvis/command', { message, context });
      return data;
    },
    async tasks(params = {}) {
      const { data } = await api.get('/api/jarvis/tasks', { params });
      return data.tasks;
    },
    async task(id) {
      const { data } = await api.get(`/api/jarvis/tasks/${id}`);
      return data;
    },
  };
}
