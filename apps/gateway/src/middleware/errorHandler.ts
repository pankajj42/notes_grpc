import type { NextFunction, Request, Response } from "express";
import {
  ErrorCodes,
  ErrorCodeToHttpStatus,
  ErrorMessages,
  errorResponse,
  type ErrorCode,
} from "@notes/shared-types";
import logger from "../logger.js";

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
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const requestId = res.locals.requestId;

  if (err instanceof AppError) {
    logger.warn(
      {
        event: "http",
        type: "handled_error",
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: err.statusCode,
        code: err.code,
        details: err.details,
        userId: req.user?.userId,
        sessionId: req.user?.sessionId,
      },
      "Handled application error",
    );

    res.status(err.statusCode).json(
      errorResponse(err.code, err.message, err.details, requestId),
    );
    return;
  }

  logger.error(
    {
      event: "http",
      type: "unhandled_error",
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: 500,
      userId: req.user?.userId,
      sessionId: req.user?.sessionId,
      err,
    },
    "Unhandled gateway error",
  );

  res.status(500).json(
    errorResponse(
      ErrorCodes.INTERNAL,
      ErrorMessages.INTERNAL,
      undefined,
      requestId,
    ),
  );
}

/**
 * Catches requests that did not match any route and returns a 404.
 * Register this BEFORE `globalErrorHandler` but AFTER all routes.
 */
export function notFoundHandler(req: Request, res: Response): void {
  const requestId = res.locals.requestId;

  logger.info(
    {
      event: "http",
      type: "not_found",
      requestId,
      method: req.method,
      path: req.path,
      userId: req.user?.userId,
      sessionId: req.user?.sessionId,
    },
    "Route not found",
  );

  res.status(404).json(
    errorResponse(
      ErrorCodes.NOT_FOUND,
      `Route ${req.method} ${req.path} not found`,
      undefined,
      requestId,
    ),
  );
}
