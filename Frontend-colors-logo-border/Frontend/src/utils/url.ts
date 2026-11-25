import { env } from '@/config/env';

/**
 * Strips leading '@' if present and trims whitespace.
 */
export function normalizeHandle(rawHandle: string | undefined): string {
  if (!rawHandle) return '';
  return rawHandle.trim().replace(/^@+/, '');
}

/**
 * Builds a public storefront URL using the configured public domain.
 */
export function buildStorefrontPublicUrl(handle: string): string {
  const clean = normalizeHandle(handle);
  return `${env.publicDomain}/@${clean}`;
}

/**
 * Extracts opaque invitation token from URL hash fragment (#<opaque-token> or #token=<opaque-token>)
 * without exposing it in query parameters or logs.
 */
export function extractInviteTokenFromHash(hash: string): string | null {
  if (!hash) return null;
  const cleaned = (hash.startsWith('#') ? hash.slice(1) : hash).trim();
  if (!cleaned) return null;

  if (cleaned.startsWith('token=')) {
    const params = new URLSearchParams(cleaned);
    const token = params.get('token');
    return token && token.trim().length > 0 ? token.trim() : null;
  }

  return cleaned;
}

export function publicMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const apiUrl = new URL(env.apiBaseUrl, window.location.origin);
  try {
    const source = new URL(url, apiUrl);
    return source.protocol === 'http:' || source.protocol === 'https:' ? source.href : undefined;
  } catch {
    return undefined;
  }
}
