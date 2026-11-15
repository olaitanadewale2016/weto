import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { logger } from './logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(422, 'VALIDATION_ERROR', message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(409, 'CONFLICT', message);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please slow down.') {
    super(429, 'RATE_LIMITED', message);
  }
}

export interface ApiSuccessPayload<T> {
  status: 'success';
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorPayload {
  status: 'error';
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function apiSuccess<T>(
  data: T,
  meta?: Record<string, unknown>,
  statusCode = 200
) {
  const body: ApiSuccessPayload<T> = { status: 'success', data };
  if (meta) body.meta = meta;
  return NextResponse.json(body, { status: statusCode });
}

export function apiError(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json<ApiErrorPayload>(
      {
        status: 'error',
        error: {
          code: err.code,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
        },
      },
      { status: err.statusCode }
    );
  }

  if (err instanceof ZodError) {
    return NextResponse.json<ApiErrorPayload>(
      {
        status: 'error',
        error: {
          code: 'VALIDATION_ERROR',
          message: err.issues[0]?.message || 'Invalid request input',
          details: err.flatten().fieldErrors,
        },
      },
      { status: 422 }
    );
  }

  logger.error({ err }, 'Unhandled API error');
  return NextResponse.json<ApiErrorPayload>(
    {
      status: 'error',
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message:
          process.env.NODE_ENV === 'production'
            ? 'An unexpected error occurred'
            : err instanceof Error
              ? err.message
              : 'Internal error',
      },
    },
    { status: 500 }
  );
}

/**
 * Wraps an API route handler with centralized error handling and CSRF Origin check on mutations.
 */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      return apiError(err);
    }
  };
}
