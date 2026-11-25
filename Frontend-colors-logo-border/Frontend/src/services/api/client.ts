import { env } from '@/config/env';
import {
  ApiClientError,
  type ApiErrorEnvelope,
  type ApiErrorKind,
  type ApiSuccessEnvelope,
} from '@/types/api';

const DEFAULT_TIMEOUT_MS = 12_000;

let authTokenProvider: (() => string | null) | null = null;

export function setAuthTokenProvider(provider: (() => string | null) | null) {
  authTokenProvider = provider;
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
  if (status >= 400 && status < 500) return 'VALIDATION_ERROR';
  if (status >= 500) return 'SERVER_ERROR';
  return 'UNKNOWN_ERROR';
}

function parseRetryAfterSeconds(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined;
  const numeric = Number.parseInt(headerValue, 10);
  if (!Number.isNaN(numeric) && numeric >= 0) {
    return numeric;
  }
  const dateMs = Date.parse(headerValue);
  if (!Number.isNaN(dateMs)) {
    const diffSec = Math.ceil((dateMs - Date.now()) / 1000);
    return diffSec > 0 ? diffSec : 0;
  }
  return undefined;
}

export async function httpRequest<T>(
  endpoint: string,
  options: HttpRequestOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    query,
    headers = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
    noStore = false,
    omitAuth = false,
  } = options;

  const url = new URL(`${env.apiBaseUrl}${endpoint}`);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...headers,
  };

  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  if (noStore) {
    requestHeaders['Cache-Control'] = 'no-store';
  }

  if (!omitAuth) {
    const token = authTokenProvider?.();
    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`;
    }
  }

  try {
    const response = await fetch(url.toString(), {
      method,
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: noStore ? 'no-store' : 'default',
    });

    const rawText = await response.text();
    let parsed: ApiSuccessEnvelope<T> | ApiErrorEnvelope | null = null;

    if (rawText) {
      try {
        parsed = JSON.parse(rawText) as ApiSuccessEnvelope<T> | ApiErrorEnvelope;
      } catch {
        throw new ApiClientError({
          message: 'Received malformed JSON response from server.',
          code: 'INVALID_JSON',
          status: response.status,
          kind: 'SERVER_ERROR',
          isRetryable: true,
        });
      }
    }

    if (!response.ok) {
      const errEnvelope = parsed as ApiErrorEnvelope | null;
      const kind = classifyHttpStatus(response.status);
      const retryAfterSeconds =
        response.status === 429
          ? parseRetryAfterSeconds(response.headers.get('Retry-After'))
          : undefined;

      throw new ApiClientError({
        message:
          errEnvelope?.error?.message ||
          `Request failed with status ${response.status}`,
        code: errEnvelope?.error?.code || `HTTP_${response.status}`,
        status: response.status,
        kind,
        requestId: errEnvelope?.requestId,
        retryAfterSeconds,
        isRetryable:
          kind === 'SERVER_ERROR' ||
          kind === 'SERVICE_UNAVAILABLE' ||
          kind === 'RATE_LIMITED',
      });
    }

    if (!parsed || !('data' in parsed)) {
      throw new ApiClientError({
        message: 'Unexpected response envelope from server.',
        code: 'INVALID_ENVELOPE',
        status: response.status,
        kind: 'SERVER_ERROR',
        isRetryable: true,
      });
    }

    return parsed.data;
  } catch (err) {
    if (err instanceof ApiClientError) {
      throw err;
    }

    if (err instanceof DOMException && err.name === 'AbortError') {
      if (signal?.aborted) {
        throw err;
      }
      throw new ApiClientError({
        message: 'Request timed out. Please check your connection and try again.',
        code: 'TIMEOUT',
        status: 0,
        kind: 'TIMEOUT_ERROR',
        isRetryable: true,
      });
    }

    throw new ApiClientError({
      message: 'Network connection error. Please check your internet access.',
      code: 'NETWORK_ERROR',
      status: 0,
      kind: 'NETWORK_ERROR',
      isRetryable: true,
    });
  } finally {
    window.clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener('abort', onExternalAbort);
    }
  }
}
