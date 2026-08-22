import axios from 'axios';
import { useAuthStore } from '../stores/auth.store';

interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
}

let refreshPromise: Promise<RefreshedTokens> | null = null;

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const { refreshToken } = useAuthStore.getState();
      if (refreshToken) {
        try {
          // Share one refresh request between all API calls that receive 401
          // at the same time. Without this, token rotation makes the requests
          // race each other and the losing requests log the user out.
          if (!refreshPromise) {
            refreshPromise = axios
              .post<RefreshedTokens>('/api/auth/refresh', { refreshToken })
              .then((res) => {
                useAuthStore.getState().setTokens(res.data.accessToken, res.data.refreshToken);
                return res.data;
              })
              .finally(() => {
                refreshPromise = null;
              });
          }

          const tokens = await refreshPromise;
          original.headers.Authorization = `Bearer ${tokens.accessToken}`;
          return api(original);
        } catch {
          useAuthStore.getState().logout();
        }
      } else {
        useAuthStore.getState().logout();
      }
    }
    return Promise.reject(error);
  },
);

export default api;
