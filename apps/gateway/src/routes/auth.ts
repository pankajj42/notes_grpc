import { createAuthServiceClient } from "@notes/grpc-clients";
import {
  ErrorCodeToHttpStatus,
  ErrorCodes,
  successResponse,
  type EmptyRequest,
  type ListSessionsResponse,
  type LoginRequest,
  type LoginResponse,
  type LogoutAllSessionsRequest,
  type LogoutAllSessionsResponse,
  type LogoutSessionRequest,
  type LogoutSessionResponse,
  type PublicKeyResponse,
  type RefreshTokenRequest,
  type RefreshTokenResponse,
  type SignupRequest,
  type SignupResponse,
} from "@notes/shared-types";
import * as grpc from "@grpc/grpc-js";
import { rateLimit } from "express-rate-limit";
import { Router, type Request } from "express";
import type { CookieOptions, Response } from "express";
import { config } from "../config.js";
import { authenticate } from "../middleware/authenticate.js";
import { AppError } from "../middleware/errorHandler.js";
import { validate } from "../middleware/validate.js";
import { loginBodySchema, sessionIdParamsSchema, signupBodySchema } from "../validation/auth.js";

const REFRESH_COOKIE_NAME = "refreshToken";

// 10 refresh calls per minute per session (keyed by sessionId embedded in the cookie)
const refreshRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const cookie = req.cookies[REFRESH_COOKIE_NAME] as string | undefined;
    if (typeof cookie === "string") {
      const dotIndex = cookie.indexOf(".");
      if (dotIndex !== -1) return cookie.slice(0, dotIndex);
    }
    return req.ip ?? "unknown";
  },
  handler: (_req, res) => {
    res.status(429).json({ status: "error", code: "RATE_LIMITED", message: "Too many refresh attempts. Try again later." });
  },
});

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

  router.post("/refresh", refreshRateLimiter, async (req, res, next) => {
    try {
      const refreshToken = req.cookies[REFRESH_COOKIE_NAME] as string | undefined;
      if (typeof refreshToken !== "string" || refreshToken.trim() === "") {
        next(new AppError(ErrorCodes.UNAUTHENTICATED, "Missing refresh token"));
        return;
      }

      const response = await unaryCall<RefreshTokenRequest, RefreshTokenResponse>("RefreshToken", { refreshToken });
      setRefreshTokenCookie(res, response.tokens.refreshToken);
      res.status(200).json(successResponse(toHttpAuthPayload(response)));
    } catch (error: unknown) {
      next(toAppError(error));
    }
  });

  router.get("/sessions", authenticate, async (req, res, next) => {
    try {
      const { userId, sessionId } = getAuthenticatedUser(req.user);
      const metadata = createSessionMetadata(userId, sessionId);
      const response = await unaryCall<EmptyRequest, ListSessionsResponse>("ListSessions", {}, metadata);
      res.status(200).json(successResponse(response));
    } catch (error: unknown) {
      next(toAppError(error));
    }
  });

  router.post("/logout", authenticate, async (req, res, next) => {
    try {
      const { userId, sessionId } = getAuthenticatedUser(req.user);
      const metadata = createSessionMetadata(userId, sessionId);
      await unaryCall<LogoutSessionRequest, LogoutSessionResponse>(
        "LogoutSession",
        { sessionId },
        metadata,
      );
      clearRefreshTokenCookie(res);
      res.status(200).json(successResponse({}));
    } catch (error: unknown) {
      next(toAppError(error));
    }
  });

  router.delete("/sessions/:id", authenticate, validate(sessionIdParamsSchema, "params"), async (req, res, next) => {
    try {
      const { userId, sessionId: currentSessionId } = getAuthenticatedUser(req.user);
      const targetSessionId = (res.locals.validated.params as { id: string }).id;
      const metadata = createSessionMetadata(userId, currentSessionId);
      await unaryCall<LogoutSessionRequest, LogoutSessionResponse>(
        "LogoutSession",
        { sessionId: targetSessionId },
        metadata,
      );
      res.status(200).json(successResponse({}));
    } catch (error: unknown) {
      next(toAppError(error));
    }
  });

  router.post("/logout-all", authenticate, async (req, res, next) => {
    try {
      const { userId, sessionId } = getAuthenticatedUser(req.user);
      const metadata = createSessionMetadata(userId, sessionId);
      await unaryCall<LogoutAllSessionsRequest, LogoutAllSessionsResponse>("LogoutAllSessions", {}, metadata);
      clearRefreshTokenCookie(res);
      res.status(200).json(successResponse({}));
    } catch (error: unknown) {
      next(toAppError(error));
    }
  });

  return router;
}

async function unaryCall<TRequest extends object, TResponse>(
  method: "Signup" | "Login" | "GetPublicKey" | "RefreshToken" | "ListSessions" | "LogoutSession" | "LogoutAllSessions",
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
        case "RefreshToken":
          client.RefreshToken(request, callback as (error: grpc.ServiceError | null, response: unknown) => void);
          return;
        case "ListSessions":
          client.ListSessions(
            request,
            metadata ?? new grpc.Metadata(),
            callback as (error: grpc.ServiceError | null, response: unknown) => void,
          );
          return;
        case "LogoutSession":
          client.LogoutSession(
            request,
            metadata ?? new grpc.Metadata(),
            callback as (error: grpc.ServiceError | null, response: unknown) => void,
          );
          return;
        case "LogoutAllSessions":
          client.LogoutAllSessions(
            request,
            metadata ?? new grpc.Metadata(),
            callback as (error: grpc.ServiceError | null, response: unknown) => void,
          );
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

function createSessionMetadata(userId: string, sessionId: string): grpc.Metadata {
  const metadata = new grpc.Metadata();
  metadata.set("x-user-id", userId);
  metadata.set("x-session-id", sessionId);
  return metadata;
}

function getAuthenticatedUser(user: Express.Request["user"]): { userId: string; sessionId: string } {
  if (user?.userId === undefined || user.userId.trim() === "") {
    throw new AppError(ErrorCodes.UNAUTHENTICATED);
  }
  if (user.sessionId === undefined || user.sessionId.trim() === "") {
    throw new AppError(ErrorCodes.UNAUTHENTICATED);
  }
  return { userId: user.userId, sessionId: user.sessionId };
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

function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    path: "/auth",
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    ...(typeof config.cookieDomain === "string" && config.cookieDomain.trim() !== ""
      ? { domain: config.cookieDomain }
      : {}),
  });
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