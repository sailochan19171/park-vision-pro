// Centralized headers for API requests
// Adds ngrok-skip-browser-warning automatically when using an ngrok base URL

export function getDefaultHeaders(extra?: Record<string, string>): HeadersInit {
  const env: any = (import.meta as any).env || {};
  const rawBase: string = env.VITE_API_BASE_URL || env.VITE_API_URL || '';
  const isNgrok = /ngrok/i.test(rawBase);

  const baseHeaders: Record<string, string> = {
    'Accept': 'application/json',
  };

  if (isNgrok) {
    baseHeaders['ngrok-skip-browser-warning'] = 'true';
  }

  return { ...baseHeaders, ...(extra || {}) };
}