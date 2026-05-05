import * as grpc from "@grpc/grpc-js";
import { Router } from "express";
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
import { createCorrelationMetadata } from "../lib/correlation.js";
import { authenticate } from "../middleware/authenticate.js";
import { AppError } from "../middleware/errorHandler.js";
import { loginRateLimiter, refreshRateLimiter, signupRateLimiter } from "../middleware/rateLimiters.js";
import { validate } from "../middleware/validate.js";
import { grpcUnaryCall, toAppError } from "../lib/grpc.js";
import { REFRESH_COOKIE_NAME, clearRefreshTokenCookie, setRefreshTokenCookie } from "../lib/cookies.js";

// URL param schema for session ID — gateway-specific (`:id` path param)
const sessionIdParamsSchema = z.object({ id: sessionIdSchema });

type AuthServiceClient = ReturnType<typeof createAuthServiceClient>;

type HttpAuthPayload = {
  tokens: { accessToken: string };
  user: SignupResponse["user"];
};

export function createAuthRouter(): Router {
  const router = Router();

  router.post("/signup", signupRateLimiter, validate(SignupRequestSchema), async (req, res, next) => {
    try {
      const response = await callAuth<SignupResponse>((c, cb) =>
        c.Signup(res.locals.validated.body as SignupRequest, createCorrelationMetadata(req, undefined, res.locals.requestId), cb),
      );
      setRefreshTokenCookie(res, response.tokens.refreshToken);
      res.status(201).json(successResponse(toHttpAuthPayload(response)));
    } catch (error: unknown) {
      next(toAppError(error));
    }
  });

  router.post("/login", loginRateLimiter, validate(LoginRequestSchema), async (req, res, next) => {
    try {
      const response = await callAuth<LoginResponse>((c, cb) =>
        c.Login(res.locals.validated.body as LoginRequest, createCorrelationMetadata(req, undefined, res.locals.requestId), cb),
      );
      setRefreshTokenCookie(res, response.tokens.refreshToken);
      res.status(200).json(successResponse(toHttpAuthPayload(response)));
    } catch (error: unknown) {
      next(toAppError(error));
    }
  });

  router.get("/public-key", async (req, res, next) => {
    try {
      const response = await callAuth<PublicKeyResponse>((c, cb) =>
        c.GetPublicKey({} as EmptyRequest, createCorrelationMetadata(req, undefined, res.locals.requestId), cb),
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
        c.RefreshToken({ refreshToken } as RefreshTokenRequest, createCorrelationMetadata(req, undefined, res.locals.requestId), cb),
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
      const metadata = createCorrelationMetadata(req, { userId, sessionId }, res.locals.requestId);
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
      const metadata = createCorrelationMetadata(req, { userId, sessionId }, res.locals.requestId);
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
      const metadata = createCorrelationMetadata(req, { userId, sessionId: currentSessionId }, res.locals.requestId);
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
      const metadata = createCorrelationMetadata(req, { userId, sessionId }, res.locals.requestId);
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

function getAuthenticatedUser(user: Express.Request["user"]): { userId: string; sessionId: string } {
  if (user?.userId === undefined || user.userId.trim() === "") {
    throw new AppError(ErrorCodes.UNAUTHENTICATED);
  }
  if (user.sessionId === undefined || user.sessionId.trim() === "") {
    throw new AppError(ErrorCodes.UNAUTHENTICATED);
  }
  return { userId: user.userId, sessionId: user.sessionId };
}
