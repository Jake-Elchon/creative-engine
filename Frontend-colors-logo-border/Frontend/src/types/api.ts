export interface ApiSuccessEnvelope<T> {
  data: T;
  requestId: string;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
}

export interface ApiErrorEnvelope {
  error: ApiErrorDetail;
  requestId: string;
}

export type ApiErrorKind =
  | 'NETWORK_ERROR'
  | 'TIMEOUT_ERROR'
  | 'SERVER_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'GONE'
  | 'UNPROCESSABLE_ENTITY'
  | 'RATE_LIMITED'
  | 'UNKNOWN_ERROR';

export class ApiClientError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly kind: ApiErrorKind;
  public readonly requestId?: string;
  public readonly isRetryable: boolean;
  public readonly retryAfterSeconds?: number;

  constructor(params: {
    message: string;
    code: string;
    status: number;
    kind: ApiErrorKind;
    requestId?: string;
    isRetryable?: boolean;
    retryAfterSeconds?: number;
  }) {
    super(params.message);
    this.name = 'ApiClientError';
    this.code = params.code;
    this.status = params.status;
    this.kind = params.kind;
    this.requestId = params.requestId;
    this.isRetryable = params.isRetryable ?? false;
    this.retryAfterSeconds = params.retryAfterSeconds;
  }
}
