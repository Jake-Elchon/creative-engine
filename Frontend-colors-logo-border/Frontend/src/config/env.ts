function normalizeApiBaseUrl(rawUrl: string | undefined): string {
  const fallback = 'https://api.kamerpay.cm/api/v1';
  const trimmed = (rawUrl || fallback).trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/api/v1')) {
    return trimmed;
  }
  return `${trimmed}/api/v1`;
}

export const env = {
  apiBaseUrl: normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
  useMockApi: import.meta.env.VITE_USE_MOCK_API === 'true',
  publicDomain: (import.meta.env.VITE_PUBLIC_DOMAIN || 'https://kamerpay.cm')
    .trim()
    .replace(/\/+$/, ''),
  isProduction: import.meta.env.PROD,
} as const;
