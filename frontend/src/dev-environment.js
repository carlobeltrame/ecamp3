// you can overwrite the env variables locally in frontend/env.local
// @see https://vitejs.dev/guide/env-and-mode.html
if (!window.environment) {
  const env = import.meta.env
  window.environment = {
    API_ROOT_URL: env.VITE_API_ROOT_URL ?? 'http://localhost:3001',
    COOKIE_PREFIX: env.VITE_COOKIE_PREFIX ?? 'localhost_',
    PRINT_URL: env.VITE_PRINT_URL ?? 'http://localhost:3003',
    SENTRY_FRONTEND_DSN: env.VITE_SENTRY_FRONTEND_DSN,
    SENTRY_ENVIRONMENT: env.VITE_SENTRY_ENVIRONMENT ?? 'http://localhost:3000',
    SHARED_COOKIE_DOMAIN: env.VITE_SHARED_COOKIE_DOMAIN ?? 'localhost',
    DEPLOYMENT_TIME: env.VITE_DEPLOYMENT_TIME ?? '',
    VERSION: env.VITE_VERSION ?? '',
    VERSION_LINK_TEMPLATE:
      env.VITE_VERSION_LINK_TEMPLATE ??
      'https://github.com/ecamp/ecamp3/commit/{version}',
    FEATURE_DEVELOPER: (env.VITE_FEATURE_DEVELOPER ?? 'true') === 'true',
    LOGIN_INFO_TEXT_KEY: env.VITE_LOGIN_INFO_TEXT_KEY ?? 'dev',
  }
}
export const getEnv = () => window.environment
