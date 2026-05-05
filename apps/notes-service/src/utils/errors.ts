import * as grpc from "@grpc/grpc-js";
import { type ErrorCode, ErrorCodeToGrpcStatus } from "@notes/shared-types";

export function toGrpcError(code: ErrorCode, message: string): grpc.ServiceError {
  const error = new Error(message) as grpc.ServiceError;
  error.name = code;
  error.message = message;
  error.details = message;
  error.code = ErrorCodeToGrpcStatus[code] as grpc.status;
  return error;
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown internal error";
}

export function firstIssue(error: { issues: Array<{ message: string }> }): string {
  return error.issues[0]?.message ?? "Invalid request";
}
