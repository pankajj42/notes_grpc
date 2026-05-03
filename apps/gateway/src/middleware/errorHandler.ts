import type { NextFunction, Request, Response } from "express";
import {
  ErrorCodes,
  ErrorCodeToHttpStatus,
  ErrorMessages,
  errorResponse,
  type ErrorCode,
} from "@notes/shared-types";

/**
 * Opaque application error that can be thrown anywhere in the request
 * pipeline. The global error handler translates it to the standard
 * HTTP error envelope.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: ErrorCode,
    message?: string,
    details?: Record<string, unknown>,
  ) {
    super(message ?? ErrorMessages[code]);
    this.name = "AppError";
    this.code = code;
    this.statusCode = ErrorCodeToHttpStatus[code];
    this.details = details ?? undefined;
  }
}

/**
 * Express 4-argument error handler. Must be registered LAST in the
 * middleware chain via `app.use(globalErrorHandler)`.
 *
 * Handles:
 *  - `AppError` — structured application errors
 *  - All other `Error` instances — mapped to INTERNAL (500)
 *
 * Never leaks stack traces or internal details to the client.
 */
export function globalErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(
      errorResponse(err.code, err.message, err.details),
    );
    return;
  }

  // Log unexpected errors server-side (will use proper logger later)
  console.error("[gateway] Unhandled error:", err);

  res.status(500).json(
    errorResponse(
      ErrorCodes.INTERNAL,
      ErrorMessages.INTERNAL,
    ),
  );
}

/**
 * Catches requests that did not match any route and returns a 404.
 * Register this BEFORE `globalErrorHandler` but AFTER all routes.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json(
    errorResponse(
      ErrorCodes.NOT_FOUND,
      `Route ${req.method} ${req.path} not found`,
    ),
  );
}
