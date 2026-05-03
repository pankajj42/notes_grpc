import type { ErrorCode } from "./errors";

/**
 * Standard HTTP response envelope.
 * All REST endpoints return responses matching one of these shapes.
 *
 * Success responses: status 2xx, data is populated, error is null
 * Error responses: status 4xx/5xx, data is null or omitted, error is populated
 */

export interface SuccessResponse<T> {
  status: "success";
  data: T;
  timestamp: string;
  requestId?: string;
}

export interface ErrorResponse {
  status: "error";
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
    timestamp: string;
    requestId?: string;
  };
}

export interface PaginatedResponse<T> {
  status: "success";
  data: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  timestamp: string;
  requestId?: string;
}

/**
 * Helper to construct a success response.
 * @param data - Response payload
 * @param requestId - Optional correlation ID for tracing
 */
export function successResponse<T>(data: T, requestId?: string): SuccessResponse<T> {
  return {
    status: "success",
    data,
    timestamp: new Date().toISOString(),
    ...(requestId && { requestId }),
  };
}

/**
 * Helper to construct an error response.
 * @param code - Error code from ErrorCodes
 * @param message - User-facing error message
 * @param details - Optional error details (not exposed to client in production)
 * @param requestId - Optional correlation ID for tracing
 */
export function errorResponse(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
  requestId?: string,
): ErrorResponse {
  return {
    status: "error",
    error: {
      code,
      message,
      ...(details && { details }),
      timestamp: new Date().toISOString(),
      ...(requestId && { requestId }),
    },
  };
}

/**
 * Helper to construct a paginated response.
 * @param data - Array of items
 * @param total - Total number of items across all pages
 * @param page - Current page number (1-indexed)
 * @param pageSize - Number of items per page
 * @param requestId - Optional correlation ID for tracing
 */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
  requestId?: string,
): PaginatedResponse<T> {
  return {
    status: "success",
    data,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
    timestamp: new Date().toISOString(),
    ...(requestId && { requestId }),
  };
}
