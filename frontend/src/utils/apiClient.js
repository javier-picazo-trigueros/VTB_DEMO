/**
 * apiClient.js
 * ============
 * Centralized HTTP client for VTB frontend.
 *
 * All requests go through this module so that:
 *   1. Cookies are always included (credentials: 'include' / withCredentials: true)
 *   2. Mutating requests (POST/PUT/PATCH/DELETE) automatically carry X-CSRF-Token
 *   3. On 401, a single token-refresh attempt is made before redirecting to /login
 *
 * Never import axios directly in page components — import from here instead.
 */

import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ── CSRF helper ───────────────────────────────────────────────────────────────
// The backend sets vtb_csrf as a non-httpOnly cookie so JS can read it.
const getCsrfToken = () => {
  const entry = document.cookie
    .split('; ')
    .find(row => row.startsWith('vtb_csrf='));
  return entry ? decodeURIComponent(entry.split('=')[1]) : '';
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// ── Axios instance ────────────────────────────────────────────────────────────
export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 15000,
});

// Request: attach CSRF header on mutations
api.interceptors.request.use(config => {
  if (!SAFE_METHODS.has((config.method ?? 'GET').toUpperCase())) {
    config.headers['X-CSRF-Token'] = getCsrfToken();
  }
  return config;
});

// Track whether a refresh is already in-flight to avoid cascade
let refreshing = false;
let refreshQueue = [];

const processQueue = (error) => {
  refreshQueue.forEach(({ resolve, reject }) =>
    error ? reject(error) : resolve()
  );
  refreshQueue = [];
};

// Paths that must NOT trigger the refresh-and-redirect flow:
// /auth/me   → AuthContext uses this to detect "not logged in" — 401 is normal
// /auth/login → credentials error, not an expired session
// /auth/refresh → avoid infinite retry loop
const SKIP_REFRESH_PATHS = new Set(['/auth/me', '/auth/login', '/auth/refresh', '/auth/logout']);

// Response: on 401, try one refresh then retry; on second 401, go to /login
api.interceptors.response.use(
  response => response,
  async error => {
    const original = error.config;

    // The backend guard blocks every route except login/me/change-password/logout
    // while must_change_password is set, and answers each of those with this
    // 403. Bounce to /change-password before any other handling below runs —
    // there is nothing useful the caller can do with a blocked request.
    if (
      error.response?.status === 403 &&
      error.response?.data?.code === 'MUST_CHANGE_PASSWORD' &&
      window.location.pathname !== '/change-password'
    ) {
      window.location.href = '/change-password';
      return Promise.reject(error);
    }

    // Let the caller handle 401s on paths that don't represent expired sessions
    const requestPath = original?.url ?? '';
    if (SKIP_REFRESH_PATHS.has(requestPath)) {
      return Promise.reject(error);
    }

    // Only intercept 401 and only once per request
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    if (refreshing) {
      // Another refresh is already in-flight — queue this request
      return new Promise((resolve, reject) => {
        refreshQueue.push({ resolve, reject });
      }).then(() => api(original)).catch(err => Promise.reject(err));
    }

    original._retry = true;
    refreshing = true;

    try {
      // /auth/refresh uses the httpOnly refresh cookie — no body needed
      await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true });
      processQueue(null);
      return api(original);
    } catch (refreshErr) {
      processQueue(refreshErr);
      // Refresh failed — session is dead; redirect to login
      window.location.href = '/login?reason=expired';
      return Promise.reject(refreshErr);
    } finally {
      refreshing = false;
    }
  },
);

// ── fetch wrapper ─────────────────────────────────────────────────────────────
// Use this for the few places that use native fetch instead of axios.
export const apiFetch = (url, options = {}) => {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = { ...(options.headers ?? {}) };
  if (!SAFE_METHODS.has(method)) {
    headers['X-CSRF-Token'] = getCsrfToken();
  }
  return fetch(
    url.startsWith('http') ? url : `${API_URL}${url}`,
    { ...options, credentials: 'include', headers },
  );
};
