import { createAuthServiceClient } from "@notes/grpc-clients";
import {
  ErrorCodeToHttpStatus,
  ErrorCodes,
  successResponse,
  type EmptyRequest,
  type LoginRequest,
  type LoginResponse,
  type PublicKeyResponse,
  type SignupRequest,
  type SignupResponse,
} from "@notes/shared-types";
import { Router } from "express";
import type * as grpc from "@grpc/grpc-js";
import { config } from "../config.js";
import { AppError } from "../middleware/errorHandler.js";
import { validate } from "../middleware/validate.js";
import { loginBodySchema, signupBodySchema } from "../validation/auth.js";

export function createAuthRouter(): Router {
  const router = Router();

  router.post("/signup", validate(signupBodySchema), async (req, res, next) => {
    try {
      const response = await unaryCall<SignupRequest, SignupResponse>("Signup", req.body as SignupRequest);
      res.status(201).json(successResponse(response));
    } catch (error: unknown) {
      next(toAppError(error));
    }
  });

  router.post("/login", validate(loginBodySchema), async (req, res, next) => {
    try {
      const response = await unaryCall<LoginRequest, LoginResponse>("Login", req.body as LoginRequest);
      res.status(200).json(successResponse(response));
    } catch (error: unknown) {
      next(toAppError(error));
    }
  });

  router.get("/public-key", async (_req, res, next) => {
    try {
      const response = await unaryCall<EmptyRequest, PublicKeyResponse>("GetPublicKey", {});
      res.status(200).json(successResponse(response));
    } catch (error: unknown) {
      next(toAppError(error));
    }
  });

  return router;
}

async function unaryCall<TRequest extends object, TResponse>(
  method: "Signup" | "Login" | "GetPublicKey",
  request: TRequest,
): Promise<TResponse> {
  const client = createAuthServiceClient(config.authServiceUrl);

  try {
    return await new Promise<TResponse>((resolve, reject) => {
      const callback = (error: grpc.ServiceError | null, response: TResponse): void => {
        if (error != null) {
          reject(error);
          return;
        }

        resolve(response);
      };

      switch (method) {
        case "Signup":
          client.Signup(request, callback as (error: grpc.ServiceError | null, response: unknown) => void);
          return;
        case "Login":
          client.Login(request, callback as (error: grpc.ServiceError | null, response: unknown) => void);
          return;
        case "GetPublicKey":
          client.GetPublicKey(request, callback as (error: grpc.ServiceError | null, response: unknown) => void);
          return;
      }
    });
  } finally {
    client.close();
  }
}

function toAppError(error: unknown): AppError {
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

function grpcStatusToErrorCode(statusCode: number): keyof typeof ErrorCodeToHttpStatus {
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