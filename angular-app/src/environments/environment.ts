export const environment = {
  production: false,
  // During development, can point to local mock or staging Akamai
  akamaiCdnBaseUrl: 'http://localhost:4200/assets/mock-content',
  contentCacheMs: 30 * 1000, // 30 seconds in dev
};
