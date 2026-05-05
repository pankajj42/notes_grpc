import { type ErrorCode, ErrorCodeToGrpcStatus, ErrorCodes } from "@notes/shared-types";
import * as grpc from "@grpc/grpc-js";

export function toGrpcError(code: ErrorCode, message: string): grpc.ServiceError {
  const error = new Error(message) as grpc.ServiceError;
  error.name = code;
  error.message = message;
  error.details = message;
  error.code = ErrorCodeToGrpcStatus[code] as grpc.status;
  return error;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown internal error";
}

export function firstIssue(error: { issues: Array<{ message: string }> }): string {
  return error.issues[0]?.message ?? "Invalid request";
}
