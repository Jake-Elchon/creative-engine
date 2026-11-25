function normalizeApiBaseUrl(rawUrl: string | undefined): string {
  const base = (rawUrl?.trim() || 'https://api.kamerpay.cm/api/v1').replace(/\/+$/, '');
  return base.endsWith('/api/v1') ? base : `${base}/api/v1`;
}

const apiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
const isProduction = import.meta.env.PROD || (typeof __ZIBI_STATIC_BUILD__ !== 'undefined' && __ZIBI_STATIC_BUILD__);
const useMockApi = !isProduction && import.meta.env.VITE_USE_MOCK_API === 'true';
const loopbackHosts = ['localhost', '127.0.0.1', '[::1]'];
const apiHost = new URL(apiBaseUrl, window.location.origin).hostname;

export const env = {
  apiBaseUrl,
  useMockApi,
  localOtpAvailable: !isProduction && loopbackHosts.includes(window.location.hostname) &&
    (useMockApi || loopbackHosts.includes(apiHost)),
  publicDomain: (import.meta.env.VITE_PUBLIC_DOMAIN || 'https://kamerpay.cm')
    .trim()
    .replace(/\/+$/, ''),
  isProduction,
} as const;
