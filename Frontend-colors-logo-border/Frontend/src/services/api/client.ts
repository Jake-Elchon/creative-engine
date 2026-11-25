import { env } from '@/config/env';
import { ApiClientError, type ApiErrorEnvelope, type ApiErrorKind } from '@/types/api';

const DEFAULT_TIMEOUT_MS = 12_000;
let authTokenProvider: (() => string | null) | null = null;
let recoverAuth: ((failedToken: string) => Promise<string | null>) | null = null;

export function setAuthTokenProvider(provider: (() => string | null) | null) {
  authTokenProvider = provider;
}

export function setAuthRecovery(recover: typeof recoverAuth) {
  recoverAuth = recover;
}

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
  noStore?: boolean;
  omitAuth?: boolean;
}

function classifyHttpStatus(status: number): ApiErrorKind {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 410) return 'GONE';
  if (status === 422) return 'UNPROCESSABLE_ENTITY';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 503) return 'SERVICE_UNAVAILABLE';
  if (status >= 500) return 'SERVER_ERROR';
  if (status >= 400) return 'VALIDATION_ERROR';
  return 'UNKNOWN_ERROR';
}

function parseRetryAfterSeconds(header: string | null): number | undefined {
  if (!header) return undefined;
  if (/^\d+$/.test(header)) return Number(header);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

async function getHttpError(response: Response): Promise<ApiClientError> {
  const kind = classifyHttpStatus(response.status);
  let parsed: ApiErrorEnvelope | undefined;
  try {
    parsed = JSON.parse(await response.text()) as ApiErrorEnvelope;
  } catch {
    // The HTTP status still describes plain-text and empty gateway responses.
  }
  return new ApiClientError({
    message: parsed?.error?.message || `Request failed with status ${response.status}`,
    code: parsed?.error?.code || `HTTP_${response.status}`,
    status: response.status,
    kind,
    requestId: parsed?.requestId || response.headers.get('X-Request-ID') || undefined,
    retryAfterSeconds: response.status === 429 ? parseRetryAfterSeconds(response.headers.get('Retry-After')) : undefined,
    isRetryable: kind === 'SERVER_ERROR' || kind === 'SERVICE_UNAVAILABLE' || kind === 'RATE_LIMITED',
  });
}

async function request<T>(
  endpoint: string,
  options: HttpRequestOptions,
  accept: string,
  parse: (response: Response) => Promise<T>,
): Promise<T> {
  const { method = 'GET', body, query, signal, timeoutMs = DEFAULT_TIMEOUT_MS, noStore, omitAuth } = options;
  const url = new URL(`${env.apiBaseUrl}${endpoint}`, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  const multipart = body instanceof FormData;
  const requestBody = multipart ? body : body === undefined ? undefined : JSON.stringify(body);
  async function send(token: string | null) {
    signal?.throwIfAborted();
    const headers: Record<string, string> = { Accept: accept, ...options.headers };
    if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const response = await fetch(url.toString(), {
        method, headers, body: requestBody, signal: controller.signal, cache: noStore ? 'no-store' : 'default',
      });
      if (!response.ok) throw await getHttpError(response);
      return await parse(response);
    } catch (error) {
      if (error instanceof ApiClientError) throw error;
      if (signal?.aborted) signal.throwIfAborted();
      const timeout = controller.signal.aborted;
      throw new ApiClientError({
        code: timeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        kind: timeout ? 'TIMEOUT_ERROR' : 'NETWORK_ERROR',
        message: timeout ? 'Request timed out.' : 'Network connection error.',
        status: 0,
        isRetryable: true,
      });
    } finally {
      window.clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abort);
    }
  }

  const token = omitAuth ? null : authTokenProvider?.() ?? null;
  try {
    return await send(token);
  } catch (error) {
    if (token && error instanceof ApiClientError && error.status === 401 && !signal?.aborted) {
      const replacement = await recoverAuth?.(token);
      if (replacement) return send(replacement);
    }
    throw error;
  }
}

async function readEnvelope<T>(response: Response): Promise<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await response.text());
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new ApiClientError({
      message: 'Received malformed JSON response from server.', code: 'INVALID_JSON',
      status: response.status, kind: 'SERVER_ERROR', isRetryable: true,
      requestId: response.headers.get('X-Request-ID') ?? undefined,
    });
  }
  if (typeof parsed !== 'object' || parsed === null || !('data' in parsed)) {
    throw new ApiClientError({
      message: 'Unexpected response envelope from server.', code: 'INVALID_ENVELOPE',
      status: response.status, kind: 'SERVER_ERROR', isRetryable: true,
      requestId: response.headers.get('X-Request-ID') ?? undefined,
    });
  }
  return parsed.data as T;
}

export function httpRequest<T>(endpoint: string, options: HttpRequestOptions = {}): Promise<T> {
  return request(endpoint, options, 'application/json', readEnvelope<T>);
}

export function httpMediaRequest(endpoint: string, options: HttpRequestOptions = {}): Promise<Blob> {
  return request(endpoint, options, '*/*', (response) => response.blob());
}
