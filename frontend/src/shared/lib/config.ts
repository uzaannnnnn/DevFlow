/**
 * DevFlow Frontend Environment Configuration
 */
export const config = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1',
  backendUrl: (import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1').replace(/\/api\/v1$/, ''),
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
} as const;
