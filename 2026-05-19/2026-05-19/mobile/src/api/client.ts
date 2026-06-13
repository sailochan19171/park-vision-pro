import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';
import { authService } from '../services/auth/authService';

const BASE_URL = API_URL;

const api = axios.create({
  baseURL: BASE_URL,
  // Long default so 2G master-data pulls (up to a few MB per page) don't abort
  // mid-flight. Individual callers may pass a shorter per-request timeout.
  timeout: 180_000,
  headers: { 'Content-Type': 'application/json' },
});

// ---- request interceptor: attach access token ----
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await AsyncStorage.getItem('accessToken');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
    return config;
  }
  // No access token in storage. Either a prior refresh failed and cleared
  // tokens, or the user was never authenticated. Force the auth store to
  // drop isLoggedIn so the app routes back to Login, and abort the request
  // here so the caller never surfaces a confusing "Missing Authorization
  // header" alert (which surfaced on Broadcast Initiative / Product Feedback
  // submits when the user stayed on the screen after tokens went away).
  // Lazy-required to avoid an import cycle with the auth store.
  try {
    const auth = require('../store/auth').default;
    if (auth.getState().isLoggedIn) {
      // Fire-and-forget — navigation flips via the auth-state subscriber.
      auth.getState().logout({ force: true }).catch(() => { /* best-effort */ });
    }
  } catch { /* best-effort */ }
  const err: any = new Error('Session expired. Please log in again.');
  err.isAuthMissing = true;
  return Promise.reject(err);
});

// ---- response interceptor: auto-refresh on 401 ----
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((p) => {
    if (error) {
      p.reject(error);
    } else {
      p.resolve(token!);
    }
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };
    const status = error.response?.status;

    // Rate limited — log and reject immediately
    if (status === 429) {
      console.warn('[API] Rate limited (429). Slow down requests.');
      return Promise.reject(error);
    }

    // Server error — log and reject, no retry
    if (status && status >= 500) {
      console.warn(`[API] Server error (${status}): ${originalRequest.url}`);
      return Promise.reject(error);
    }

    // Network-class failure retry — older Androids (Nokia, Android 10) on
    // Hermes intermittently fail the FIRST request before it leaves the device
    // (a JS↔native bridge warm-up issue that surfaces as "Network Error" even on
    // solid Wi-Fi). Retry ONCE after a short warm-up pause so report filters /
    // data loads succeed on the first tap instead of falling back to stale local
    // data. Restricted to idempotent GETs so a write that may have partially
    // landed is never double-submitted; a genuine offline device fails the retry
    // too and the caller's existing fallback/error path still runs.
    const netCode = (error as any).code as string | undefined;
    const isNetworkErr = !error.response && (
      netCode === 'ERR_NETWORK' || netCode === 'ECONNABORTED' || netCode === 'ETIMEDOUT' ||
      /network/i.test(error.message ?? '')
    );
    const method = (originalRequest.method ?? 'get').toLowerCase();
    if (isNetworkErr && method === 'get' && !(originalRequest as any)._netRetry) {
      (originalRequest as any)._netRetry = true;
      await new Promise((r) => setTimeout(r, 1200));
      return api(originalRequest);
    }

    if (status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Don't try to refresh for the login + refresh endpoints themselves —
    // refreshing on /auth/login or /auth/refresh would just loop. Every
    // OTHER /auth/* endpoint (user-status, change-password, etc.) is a
    // normal authenticated call and SHOULD go through the refresh path so
    // a benign access-token expiry doesn't surface as a hard 401 to the
    // caller. Previously any url containing 'auth' was skipped, which made
    // /auth/user-status fail open on token expiry and let deactivated reps
    // keep operating against a dead session.
    const reqUrl = originalRequest.url ?? '';
    if (reqUrl.endsWith('/auth/login') || reqUrl.endsWith('/auth/refresh')) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${token}`;
        }
        return api(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = await AsyncStorage.getItem('refreshToken');
      if (!refreshToken) {
        throw new Error('No refresh token');
      }

      const { data } = await authService.refresh(refreshToken);

      const { accessToken, refreshToken: newRefresh } = data;
      await AsyncStorage.setItem('accessToken', accessToken);
      await AsyncStorage.setItem('refreshToken', newRefresh);

      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      }

      processQueue(null, accessToken);
      return api(originalRequest);
    } catch (refreshError: any) {
      processQueue(refreshError, null);
      // Only force-logout when the refresh endpoint ACTIVELY rejected the
      // session (HTTP 401 / 403 — token revoked, user deactivated, etc.).
      // Network failures, timeouts, and 5xx errors mean the server simply
      // couldn't be reached or had an internal hiccup; the rep's session
      // is still valid and we should let them retry once they're back
      // online. The previous code wiped tokens on any refresh failure,
      // which kicked reps to the login screen after 15-20 min in
      // background (token expired locally, the foreground-tick refresh
      // hit a flaky network handover and looked like a "failed" refresh).
      const refreshStatus = refreshError?.response?.status;
      const isExplicitReject = refreshStatus === 401 || refreshStatus === 403;
      if (isExplicitReject) {
        await Promise.all([
          AsyncStorage.removeItem('accessToken'),
          AsyncStorage.removeItem('refreshToken'),
          AsyncStorage.removeItem('user'),
        ]);
        // Force the auth store to drop isLoggedIn so the app navigates back to
        // the Login screen. Without this, clearing the tokens here left the
        // user stranded on whatever screen they were on, seeing raw 401 alerts
        // on every subsequent submit (e.g. Product Feedback). Lazy-require to
        // avoid an import cycle with the auth store (which uses this client).
        try {
          const auth = require('../store/auth').default;
          await auth.getState().logout({ force: true });
        } catch { /* best-effort; navigation will catch up on next foreground */ }
      } else {
        console.warn('[API] Refresh failed (non-401):', refreshError?.message ?? refreshError);
      }
      // Reject with original error so the caller sees the 401 response.
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  },
);

export default api;
