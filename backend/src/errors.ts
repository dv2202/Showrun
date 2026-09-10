export const errorCodes = [
  'INVALID_TARGET',
  'SSRF_BLOCKED',
  'AUTHENTICATION_FAILED',
  'AUTHENTICATION_EXPIRED',
  'TARGET_UNAVAILABLE',
  'UNSUPPORTED_APPLICATION',
  'PROXY_ERROR',
  'NOT_FOUND',
  'UNAUTHORIZED',
  'CONFLICT',
  'VALIDATION_ERROR',
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly publicMessage: string,
    public readonly statusCode: number,
    options?: ErrorOptions,
  ) {
    super(publicMessage, options);
    this.name = 'AppError';
  }
}

export function asAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError('PROXY_ERROR', 'The request could not be completed', 502, {
    cause: error,
  });
}
