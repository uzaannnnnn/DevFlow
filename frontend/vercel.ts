import { routes, deploymentEnv, type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  rewrites: [
    routes.rewrite(
      '/api/v1/:path*',
      `${deploymentEnv('BACKEND_URL')}/api/v1/:path*`
    ),
    routes.rewrite('/(.*)', '/index.html'),
  ],
};

export default config;

