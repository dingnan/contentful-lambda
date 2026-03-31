export const environment = {
  production: true,
  // Akamai CDN base URL - content served from NetStorage via CDN
  akamaiCdnBaseUrl: 'https://your-cdn-hostname.akamai.com/123456/cms/content',
  // Cache bust interval (ms) - how often to refetch content
  contentCacheMs: 5 * 60 * 1000, // 5 minutes
};
