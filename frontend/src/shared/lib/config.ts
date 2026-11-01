/**
 * DevFlow Frontend Environment Configuration
 *
 * In production, defaults to relative '/api/v1' for same-origin proxying via Vercel Rewrites.
 * In development, defaults to local Go backend at 'http://localhost:8080/api/v1'.
 */
const defaultApiUrl = import.meta.env.PROD
  ? '/api/v1'
  : 'http://localhost:8080/api/v1';

const resolvedApiUrl = (import.meta.env.VITE_API_URL || defaultApiUrl).trim();
const resolvedBackendUrl = resolvedApiUrl.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');

export const config = {
  apiUrl: resolvedApiUrl,
  backendUrl: resolvedBackendUrl,
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
} as const;
