/**
 * Canonical error codes used across all services.
 * Maps to gRPC status codes for internal communication,
 * and HTTP status codes at the API Gateway.
 */

export const ErrorCodes = {
  // Success
  OK: "OK",

  // Client errors (4xx)
  INVALID_ARGUMENT: "INVALID_ARGUMENT",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  NOT_FOUND: "NOT_FOUND",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  RESOURCE_EXHAUSTED: "RESOURCE_EXHAUSTED",
  FAILED_PRECONDITION: "FAILED_PRECONDITION",
  ABORTED: "ABORTED",
  OUT_OF_RANGE: "OUT_OF_RANGE",

  // Server errors (5xx)
  INTERNAL: "INTERNAL",
  UNAVAILABLE: "UNAVAILABLE",
  DATA_LOSS: "DATA_LOSS",
  UNKNOWN: "UNKNOWN",
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Maps ErrorCode to gRPC status number.
 * These are stable gRPC status codes used in proto definitions.
 */
export const ErrorCodeToGrpcStatus: Record<ErrorCode, number> = {
  OK: 0,
  INVALID_ARGUMENT: 3,
  UNAUTHENTICATED: 16,
  PERMISSION_DENIED: 7,
  NOT_FOUND: 5,
  ALREADY_EXISTS: 6,
  RESOURCE_EXHAUSTED: 8,
  FAILED_PRECONDITION: 9,
  ABORTED: 10,
  OUT_OF_RANGE: 11,
  INTERNAL: 13,
  UNAVAILABLE: 14,
  DATA_LOSS: 15,
  UNKNOWN: 2,
};

/**
 * Maps ErrorCode to HTTP status code.
 * Used by the API Gateway when translating gRPC responses to REST.
 */
export const ErrorCodeToHttpStatus: Record<ErrorCode, number> = {
  OK: 200,
  INVALID_ARGUMENT: 400,
  UNAUTHENTICATED: 401,
  PERMISSION_DENIED: 403,
  NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  RESOURCE_EXHAUSTED: 429,
  FAILED_PRECONDITION: 400,
  ABORTED: 409,
  OUT_OF_RANGE: 400,
  INTERNAL: 500,
  UNAVAILABLE: 503,
  DATA_LOSS: 500,
  UNKNOWN: 500,
};

/**
 * User-facing error message templates.
 * Services populate these with details; never leak internal implementation.
 */
export const ErrorMessages: Record<ErrorCode, string> = {
  OK: "Success",
  INVALID_ARGUMENT: "Invalid request. Please check your input.",
  UNAUTHENTICATED: "Authentication required. Please log in.",
  PERMISSION_DENIED: "You do not have permission to access this resource.",
  NOT_FOUND: "The requested resource was not found.",
  ALREADY_EXISTS: "This resource already exists.",
  RESOURCE_EXHAUSTED: "Too many requests. Please try again later.",
  FAILED_PRECONDITION: "Operation failed due to invalid state.",
  ABORTED: "Operation was aborted.",
  OUT_OF_RANGE: "The provided value is out of range.",
  INTERNAL: "An internal server error occurred. Please try again.",
  UNAVAILABLE: "Service is temporarily unavailable. Please try again later.",
  DATA_LOSS: "A data loss condition occurred.",
  UNKNOWN: "An unknown error occurred.",
};
