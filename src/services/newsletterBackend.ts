// Newsletter Backend Service - separated from contact service
import { getDefaultHeaders } from './http';

export interface ApiResponse {
  success: boolean;
  message: string;
  [key: string]: any;
}

// Prefer relative /api during dev so Vite proxy can be used; fallback to env for direct access
const RAW_API_BASE = (import.meta.env as any).VITE_API_BASE_URL || (import.meta.env as any).VITE_API_URL || '';
const API_BASE_URL = RAW_API_BASE
  ? (RAW_API_BASE.endsWith('/api') ? RAW_API_BASE : `${RAW_API_BASE.replace(/\/$/, '')}/api`)
  : '/api';

export const subscribeToNewsletter = async (email: string, source: string = 'footer'): Promise<ApiResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/newsletter/subscribe`, {
      method: 'POST',
      headers: getDefaultHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ email, source }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('❌ Newsletter subscribe API error:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Failed to subscribe' };
  }
};

// Register push token with backend (MongoDB)
export const registerPushToken = async (token: string, email?: string): Promise<ApiResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/push/register`, {
      method: 'POST',
      headers: getDefaultHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ token, email }),
    });
    const json = await response.json().catch(() => ({ success: false, message: 'Invalid JSON' }));
    if (!response.ok) throw new Error(json.message || `HTTP ${response.status}`);
    return json;
  } catch (error) {
    console.error('❌ Register push token error:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Failed to register push token' };
  }
};

// Trigger auto-publish from frontend (idempotent). Use when site deploys or loads.
export const autoPublishUpdate = async (version: string, title: string, body: string, link: string = '/'): Promise<ApiResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/updates/auto-publish`, {
      method: 'POST',
      headers: getDefaultHeaders({
        'Content-Type': 'application/json',
        'x-admin-token': (import.meta.env as any).VITE_NEWSLETTER_ADMIN_TOKEN || '',
      }),
      body: JSON.stringify({ version, title, body, link }),
    });

    const json = await response.json().catch(() => ({ success: false, message: 'Invalid JSON' }));
    if (!response.ok) throw new Error(json.message || `HTTP ${response.status}`);
    return json;
  } catch (error) {
    console.error('❌ Auto-publish API error:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Failed to auto-publish' };
  }
};