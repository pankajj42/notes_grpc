import * as grpc from "@grpc/grpc-js";
import { ErrorCodes, type ErrorCode } from "@notes/shared-types";
import { AppError } from "../middleware/errorHandler.js";

/**
 * Wraps a single gRPC unary call in a promise.
 * The caller is responsible for managing the client lifecycle — clients
 * should be long-lived singletons, not created per-request.
 *
 * @param invoke - Calls the gRPC method, passing the callback.
 */
export function grpcUnaryCall<TResponse>(
  invoke: (callback: (error: grpc.ServiceError | null, response: unknown) => void) => void,
): Promise<TResponse> {
  return new Promise<TResponse>((resolve, reject) => {
    invoke((error, response) => {
      if (error != null) {
        reject(error);
        return;
      }
      if (response == null) {
        reject(new Error("gRPC call returned no response"));
        return;
      }
      resolve(response as TResponse);
    });
  });
}

export function toAppError(error: unknown): AppError {
  if (isGrpcServiceError(error)) {
    const code = grpcStatusToErrorCode(error.code);
    return new AppError(code, error.details || error.message);
  }

  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(ErrorCodes.INTERNAL, error.message);
  }

  return new AppError(ErrorCodes.INTERNAL);
}

function isGrpcServiceError(error: unknown): error is grpc.ServiceError {
  return error instanceof Error && "code" in error;
}

function grpcStatusToErrorCode(statusCode: number): ErrorCode {
  switch (statusCode) {
    case 3:
      return ErrorCodes.INVALID_ARGUMENT;
    case 5:
      return ErrorCodes.NOT_FOUND;
    case 6:
      return ErrorCodes.ALREADY_EXISTS;
    case 7:
      return ErrorCodes.PERMISSION_DENIED;
    case 12:
      return ErrorCodes.UNIMPLEMENTED;
    case 16:
      return ErrorCodes.UNAUTHENTICATED;
    default:
      return ErrorCodes.INTERNAL;
  }
}
