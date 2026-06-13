import axios from 'axios';
import { API_URL } from '../../config';

/**
 * Service for Authentication-related API calls.
 * Mirrors the 'auth' microservice on the backend.
 */
export const authService = {
  /**
   * Authenticate with username and password.
   *
   * Uses React Native's native fetch() instead of axios to dodge a class
   * of "Network Error" failures we kept hitting on Android 10/11/13
   * (Vivo Y50, older OneUI, Realme). axios runs a JS-side transform
   * pipeline before handing the body to the RN bridge; on Hermes + older
   * Android NDKs the body was occasionally mis-typed as a Buffer and
   * OkHttp would reject the request before it ever left the device,
   * surfacing as "Network Error" even on perfect Wi-Fi.
   *
   * fetch() goes straight to OkHttp with no JS-layer transform, which
   * is the most reliable way to hit an HTTPS endpoint from React Native
   * on any Android version. 60 s timeout via AbortController covers
   * slow TLS handshakes on cold cellular connections.
   */
  async login(username: string, password: string) {
    // One login attempt. HTTP errors (401 invalid credentials, 5xx, …) are
    // thrown WITH an `err.response`; transport failures are normalised to
    // ERR_NETWORK / ETIMEDOUT (no `response`) so the retry + offline branches
    // can tell them apart.
    const attempt = async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60_000);
      try {
        const res = await fetch(`${API_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ username, password }),
          // RN's lib.dom AbortSignal typing mismatches the RN global; cast to
          // silence the overload mismatch — runtime behaviour is identical.
          signal: ctrl.signal as any,
        });
        const dateHeader = res.headers.get('date');
        let data: any = {};
        try { data = await res.json(); } catch { /* empty/non-JSON body */ }
        if (!res.ok) {
          const err: any = new Error(data?.message || `Login failed (${res.status})`);
          err.response = { status: res.status, data, headers: { date: dateHeader } };
          throw err;
        }
        return { data, headers: { date: dateHeader } };
      } catch (err: any) {
        // Normalise AbortError → ETIMEDOUT so the caller's offline-login
        // branch still triggers, instead of throwing a raw DOMException.
        if (err?.name === 'AbortError') {
          const e: any = new Error('Login request timed out');
          e.code = 'ETIMEDOUT';
          throw e;
        }
        // fetch() throws TypeError on actual network failures (DNS, TLS,
        // no route). Re-flag as 'Network Error' so the existing offline
        // branch in auth store / LoginScreen still recognises it.
        if (err?.response == null && (err?.name === 'TypeError' || /network/i.test(err?.message ?? ''))) {
          const e: any = new Error('Network Error');
          e.code = 'ERR_NETWORK';
          throw e;
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      return await attempt();
    } catch (err: any) {
      // Retry ONCE on a cold-stack transport failure. Older Androids (Nokia,
      // Android 10) intermittently fail the FIRST request while DNS resolution
      // + the TLS handshake warm up — which is exactly why login showed
      // "invalid"/offline on the first tap and then worked on the second. A
      // single silent retry after a short warm-up pause makes the first tap
      // succeed. HTTP errors (401 wrong password, etc.) carry `err.response`
      // and are NEVER retried, so genuine bad credentials still fail fast.
      const isColdNetwork =
        err?.response == null && (err?.code === 'ERR_NETWORK' || err?.code === 'ETIMEDOUT');
      if (!isColdNetwork) throw err;
      await new Promise((r) => setTimeout(r, 1500));
      return await attempt();
    }
  },

  /**
   * Refresh the access token using a refresh token.
   */
  async refresh(refreshToken: string) {
    return axios.post(`${API_URL}/auth/refresh`, { refreshToken }, { timeout: 15000 });
  },

  /**
   * Verify if the current session is still valid.
   */
  async checkStatus(token: string) {
    return axios.get(`${API_URL}/sync/status`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8000,
    });
  },

  /**
   * Check if user is active or deactivated.
   */
  async checkUserStatus(token: string) {
    return axios.get(`${API_URL}/auth/user-status`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8000,
    });
  }
};
