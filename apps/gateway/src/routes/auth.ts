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
import * as grpc from "@grpc/grpc-js";
import { Router, type Request } from "express";
import type { CookieOptions } from "express";
import { config } from "../config.js";
import { AppError } from "../middleware/errorHandler.js";
import { validate } from "../middleware/validate.js";
import { loginBodySchema, signupBodySchema } from "../validation/auth.js";

const REFRESH_COOKIE_NAME = "refreshToken";

type HttpAuthPayload = {
  tokens: {
    accessToken: string;
  };
  user: SignupResponse["user"];
};

export function createAuthRouter(): Router {
  const router = Router();

  router.post("/signup", validate(signupBodySchema), async (req, res, next) => {
    try {
      const response = await unaryCall<SignupRequest, SignupResponse>(
        "Signup",
        res.locals.validated.body as SignupRequest,
        createRequestMetadata(req),
      );
      setRefreshTokenCookie(res, response.tokens.refreshToken);
      res.status(201).json(successResponse(toHttpAuthPayload(response)));
    } catch (error: unknown) {
      next(toAppError(error));
    }
  });

  router.post("/login", validate(loginBodySchema), async (req, res, next) => {
    try {
      const response = await unaryCall<LoginRequest, LoginResponse>(
        "Login",
        res.locals.validated.body as LoginRequest,
        createRequestMetadata(req),
      );
      setRefreshTokenCookie(res, response.tokens.refreshToken);
      res.status(200).json(successResponse(toHttpAuthPayload(response)));
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
  metadata?: grpc.Metadata,
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
          client.Signup(
            request,
            metadata ?? new grpc.Metadata(),
            callback as (error: grpc.ServiceError | null, response: unknown) => void,
          );
          return;
        case "Login":
          client.Login(
            request,
            metadata ?? new grpc.Metadata(),
            callback as (error: grpc.ServiceError | null, response: unknown) => void,
          );
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

function createRequestMetadata(req: Request): grpc.Metadata {
  const metadata = new grpc.Metadata();
  const userAgent = req.get("user-agent");
  if (typeof userAgent === "string" && userAgent.trim() !== "") {
    metadata.set("x-user-agent", userAgent.trim());
  }

  const forwardedFor = req.get("x-forwarded-for");
  const candidateIp = typeof forwardedFor === "string" && forwardedFor.trim() !== ""
    ? forwardedFor.split(",")[0]?.trim()
    : req.ip;

  if (typeof candidateIp === "string" && candidateIp.trim() !== "") {
    metadata.set("x-client-ip", candidateIp.trim());
  }

  return metadata;
}

function setRefreshTokenCookie(
  res: { cookie: (name: string, value: string, options: CookieOptions) => void },
  refreshToken: string,
): void {
  const options: CookieOptions = {
    path: "/auth",
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    maxAge: config.jwtRefreshTtlDays * 24 * 60 * 60 * 1000,
  };

  if (typeof config.cookieDomain === "string" && config.cookieDomain.trim() !== "") {
    options.domain = config.cookieDomain;
  }

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, options);
}

function toHttpAuthPayload(response: SignupResponse | LoginResponse): HttpAuthPayload {
  return {
    tokens: {
      accessToken: response.tokens.accessToken,
    },
    user: response.user,
  };
}