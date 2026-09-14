import axios from 'axios';

const storageKey = 'nepchat-auth';

const api = axios.create({
  baseURL: '/',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach access token from localStorage automatically
api.interceptors.request.use((config) => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.access) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${parsed.access}`;
      }
    }
  } catch (e) {
    // ignore
  }
  return config;
});

// On 401, try to refresh the access token using the refresh token.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest) return Promise.reject(error);
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return Promise.reject(error);
        const parsed = JSON.parse(raw);
        if (!parsed?.refresh) return Promise.reject(error);

        // Use a short-lived axios instance to avoid interceptor loops
        const refreshRes = await axios.post('/api/token/refresh/', { refresh: parsed.refresh });
        if (refreshRes?.data?.access) {
          const next = { ...parsed, access: refreshRes.data.access };
          localStorage.setItem(storageKey, JSON.stringify(next));
          // update header and retry original request
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${refreshRes.data.access}`;
          return axios(originalRequest);
        }
      } catch (refreshErr) {
        // fall through to reject
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
