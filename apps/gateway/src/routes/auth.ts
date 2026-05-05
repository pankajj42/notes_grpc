import * as grpc from "@grpc/grpc-js";
import { rateLimit } from "express-rate-limit";
import { Router, type Request } from "express";
import { z } from "zod";
import { createAuthServiceClient } from "@notes/grpc-clients";
import {
  ErrorCodes,
  LoginRequestSchema,
  SignupRequestSchema,
  sessionIdSchema,
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
import { config } from "../config.js";
import { authenticate } from "../middleware/authenticate.js";
import { AppError } from "../middleware/errorHandler.js";
import { validate } from "../middleware/validate.js";
import { grpcUnaryCall, toAppError } from "../lib/grpc.js";
import { REFRESH_COOKIE_NAME, clearRefreshTokenCookie, setRefreshTokenCookie } from "../lib/cookies.js";

// URL param schema for session ID — gateway-specific (`:id` path param)
const sessionIdParamsSchema = z.object({ id: sessionIdSchema });

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

type AuthServiceClient = ReturnType<typeof createAuthServiceClient>;

type HttpAuthPayload = {
  tokens: { accessToken: string };
  user: SignupResponse["user"];
};

export function createAuthRouter(): Router {
  const router = Router();

  router.post("/signup", validate(SignupRequestSchema), async (req, res, next) => {
    try {
      const response = await callAuth<SignupResponse>((c, cb) =>
        c.Signup(res.locals.validated.body as SignupRequest, createRequestMetadata(req), cb),
      );
      setRefreshTokenCookie(res, response.tokens.refreshToken);
      res.status(201).json(successResponse(toHttpAuthPayload(response)));
    } catch (error: unknown) {
      next(toAppError(error));
    }
  });

  router.post("/login", validate(LoginRequestSchema), async (req, res, next) => {
    try {
      const response = await callAuth<LoginResponse>((c, cb) =>
        c.Login(res.locals.validated.body as LoginRequest, createRequestMetadata(req), cb),
      );
      setRefreshTokenCookie(res, response.tokens.refreshToken);
      res.status(200).json(successResponse(toHttpAuthPayload(response)));
    } catch (error: unknown) {
      next(toAppError(error));
    }
  });

  router.get("/public-key", async (_req, res, next) => {
    try {
      const response = await callAuth<PublicKeyResponse>((c, cb) =>
        c.GetPublicKey({} as EmptyRequest, cb),
      );
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
      const response = await callAuth<RefreshTokenResponse>((c, cb) =>
        c.RefreshToken({ refreshToken } as RefreshTokenRequest, cb),
      );
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
      const response = await callAuth<ListSessionsResponse>((c, cb) =>
        c.ListSessions({} as EmptyRequest, metadata, cb),
      );
      res.status(200).json(successResponse(response));
    } catch (error: unknown) {
      next(toAppError(error));
    }
  });

  router.post("/logout", authenticate, async (req, res, next) => {
    try {
      const { userId, sessionId } = getAuthenticatedUser(req.user);
      const metadata = createSessionMetadata(userId, sessionId);
      await callAuth<LogoutSessionResponse>((c, cb) =>
        c.LogoutSession({ sessionId } as LogoutSessionRequest, metadata, cb),
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
      await callAuth<LogoutSessionResponse>((c, cb) =>
        c.LogoutSession({ sessionId: targetSessionId } as LogoutSessionRequest, metadata, cb),
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
      await callAuth<LogoutAllSessionsResponse>((c, cb) =>
        c.LogoutAllSessions({} as LogoutAllSessionsRequest, metadata, cb),
      );
      clearRefreshTokenCookie(res);
      res.status(200).json(successResponse({}));
    } catch (error: unknown) {
      next(toAppError(error));
    }
  });

  return router;
}

function callAuth<TResponse>(
  fn: (client: AuthServiceClient, cb: (error: grpc.ServiceError | null, response: unknown) => void) => void,
): Promise<TResponse> {
  const client = createAuthServiceClient(config.authServiceUrl);
  return grpcUnaryCall<TResponse>((cb) => fn(client, cb), () => client.close());
}

function toHttpAuthPayload(response: SignupResponse | LoginResponse): HttpAuthPayload {
  return {
    tokens: { accessToken: response.tokens.accessToken },
    user: response.user,
  };
}

function createRequestMetadata(req: Request): grpc.Metadata {
  const metadata = new grpc.Metadata();

  const userAgent = req.get("user-agent");
  if (typeof userAgent === "string" && userAgent.trim() !== "") {
    metadata.set("x-user-agent", userAgent.trim());
  }

  const forwardedFor = req.get("x-forwarded-for");
  const candidateIp =
    typeof forwardedFor === "string" && forwardedFor.trim() !== ""
      ? forwardedFor.split(",")[0]?.trim()
      : req.ip;
  if (typeof candidateIp === "string" && candidateIp.trim() !== "") {
    metadata.set("x-client-ip", candidateIp.trim());
  }

  return metadata;
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
