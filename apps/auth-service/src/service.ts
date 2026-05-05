import { randomUUID } from "node:crypto";
import * as grpc from "@grpc/grpc-js";
import bcrypt from "bcrypt";
import logger from "./logger";
import {
  type EmptyRequest,
  ErrorCodes,
  ErrorCodeToGrpcStatus,
  type ListSessionsResponse,
  type LoginRequest,
  type LoginResponse,
  LoginRequestSchema,
  type LogoutSessionRequest,
  type LogoutSessionResponse,
  LogoutSessionRequestSchema,
  type LogoutAllSessionsRequest,
  type LogoutAllSessionsResponse,
  type PublicKeyResponse,
  type RefreshTokenRequest,
  type RefreshTokenResponse,
  RefreshTokenRequestSchema,
  type SignupRequest,
  type SignupResponse,
  SignupRequestSchema,
  type ErrorCode,
} from "@notes/shared-types";
import { config } from "./config";
import { prisma } from "./prisma";
import { getPublicKeyPem } from "./keys";
import { generateRefreshToken, signAccessToken } from "./tokens";

type UnaryCallback<T> = grpc.sendUnaryData<T>;

const BCRYPT_COST = 12;
const MAX_FAILED_REFRESH_ATTEMPTS = 5;

export function createAuthHandlers(): grpc.UntypedServiceImplementation {
  return {
    Signup: (call: grpc.ServerUnaryCall<SignupRequest, SignupResponse>, callback: UnaryCallback<SignupResponse>) => {
      void handleSignup(call, callback);
    },
    Login: (call: grpc.ServerUnaryCall<LoginRequest, LoginResponse>, callback: UnaryCallback<LoginResponse>) => {
      void handleLogin(call, callback);
    },
    GetPublicKey: (
      _call: grpc.ServerUnaryCall<EmptyRequest, PublicKeyResponse>,
      callback: UnaryCallback<PublicKeyResponse>,
    ) => {
      try {
        callback(null, { publicKey: getPublicKeyPem() });
      } catch (error: unknown) {
        callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
      }
    },
    RefreshToken: (
      call: grpc.ServerUnaryCall<RefreshTokenRequest, RefreshTokenResponse>,
      callback: UnaryCallback<RefreshTokenResponse>,
    ) => {
      void handleRefreshToken(call, callback);
    },
    ListSessions: (
      call: grpc.ServerUnaryCall<EmptyRequest, ListSessionsResponse>,
      callback: UnaryCallback<ListSessionsResponse>,
    ) => {
      void handleListSessions(call, callback);
    },
    LogoutSession: (
      call: grpc.ServerUnaryCall<LogoutSessionRequest, LogoutSessionResponse>,
      callback: UnaryCallback<LogoutSessionResponse>,
    ) => {
      void handleLogoutSession(call, callback);
    },
    LogoutAllSessions: (
      call: grpc.ServerUnaryCall<LogoutAllSessionsRequest, LogoutAllSessionsResponse>,
      callback: UnaryCallback<LogoutAllSessionsResponse>,
    ) => {
      void handleLogoutAllSessions(call, callback);
    },
  };
}

async function handleSignup(
  call: grpc.ServerUnaryCall<SignupRequest, SignupResponse>,
  callback: UnaryCallback<SignupResponse>,
): Promise<void> {
  try {
    const parsed = SignupRequestSchema.safeParse(call.request);
    if (!parsed.success) {
      callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, firstIssue(parsed.error)));
      return;
    }

    const normalizedEmail = parsed.data.email.trim().toLowerCase();
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser != null) {
      callback(toGrpcError(ErrorCodes.ALREADY_EXISTS, "A user with this email already exists"));
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_COST);
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
      },
    });

    const ipAddress = extractOptionalMetadata(call, "x-client-ip", 64);
    const response = await buildAuthResponse(
      user.id,
      user.email,
      parsed.data.deviceName,
      extractOptionalMetadata(call, "x-user-agent", 512),
      ipAddress,
    );
    const sessionId = response.tokens.refreshToken.split(".")[0];
    logger.info({ event: "auth", type: "signup", userId: user.id, sessionId, ipAddress }, "User signed up");
    callback(null, response);
  } catch (error: unknown) {
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}

async function handleLogin(
  call: grpc.ServerUnaryCall<LoginRequest, LoginResponse>,
  callback: UnaryCallback<LoginResponse>,
): Promise<void> {
  try {
    const parsed = LoginRequestSchema.safeParse(call.request);
    if (!parsed.success) {
      callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, firstIssue(parsed.error)));
      return;
    }

    const normalizedEmail = parsed.data.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (user == null) {
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "Invalid email or password"));
      return;
    }

    const passwordMatches = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!passwordMatches) {
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "Invalid email or password"));
      return;
    }

    const ipAddress = extractOptionalMetadata(call, "x-client-ip", 64);
    const response = await buildAuthResponse(
      user.id,
      user.email,
      parsed.data.deviceName,
      extractOptionalMetadata(call, "x-user-agent", 512),
      ipAddress,
    );
    const sessionId = response.tokens.refreshToken.split(".")[0];
    logger.info({ event: "auth", type: "login", userId: user.id, sessionId, ipAddress }, "User logged in");
    callback(null, response);
  } catch (error: unknown) {
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}

async function handleRefreshToken(
  call: grpc.ServerUnaryCall<RefreshTokenRequest, RefreshTokenResponse>,
  callback: UnaryCallback<RefreshTokenResponse>,
): Promise<void> {
  try {
    const parsed = RefreshTokenRequestSchema.safeParse(call.request);
    if (!parsed.success) {
      callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, firstIssue(parsed.error)));
      return;
    }

    const rawToken = parsed.data.refreshToken;
    const dotIndex = rawToken.indexOf(".");
    if (dotIndex === -1) {
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "Invalid refresh token"));
      return;
    }

    const sessionId = rawToken.slice(0, dotIndex);

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (session == null || session.revokedAt != null) {
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "Invalid or expired refresh token"));
      return;
    }

    if (session.lockedAt != null) {
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "Session is locked due to too many failed attempts"));
      return;
    }

    if (session.expiresAt < new Date()) {
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "Refresh token has expired"));
      return;
    }

    const tokenMatches = await bcrypt.compare(rawToken, session.refreshTokenHash);
    if (!tokenMatches) {
      // Check if this is a previously-rotated token (reuse detection)
      const isPreviousToken =
        session.previousTokenHash != null &&
        (await bcrypt.compare(rawToken, session.previousTokenHash));

      if (isPreviousToken) {
        // Token theft detected: revoke the session immediately so neither party can use it
        await prisma.session.update({
          where: { id: sessionId },
          data: { revokedAt: new Date() },
        });
        logger.warn(
          { event: "security", type: "refresh_token_reuse", sessionId, userId: session.userId, ipAddress: session.ipAddress },
          "Refresh token reuse detected — session revoked",
        );
        callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "Refresh token reuse detected"));
        return;
      }

      // Not a reuse attempt — just an invalid token; increment failed-attempt counter
      const newAttempts = session.failedRefreshAttempts + 1;
      const shouldLock = newAttempts >= MAX_FAILED_REFRESH_ATTEMPTS;
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          failedRefreshAttempts: newAttempts,
          lockedAt: shouldLock ? new Date() : null,
        },
      });
      if (shouldLock) {
        logger.warn(
          { event: "security", type: "session_locked", sessionId, userId: session.userId, ipAddress: session.ipAddress },
          "Session locked after too many failed refresh attempts",
        );
      }
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "Invalid refresh token"));
      return;
    }

    const newRefreshToken = generateRefreshToken(sessionId);
    const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 10);

    await prisma.session.update({
      where: { id: sessionId },
      data: {
        previousTokenHash: session.refreshTokenHash,
        refreshTokenHash: newRefreshTokenHash,
        failedRefreshAttempts: 0,
        lastUsedAt: new Date(),
      },
    });

    logger.info(
      { event: "auth", type: "token_refresh", sessionId, userId: session.userId, ipAddress: session.ipAddress },
      "Refresh token rotated",
    );

    callback(null, {
      tokens: {
        accessToken: signAccessToken(session.userId, sessionId),
        refreshToken: newRefreshToken,
      },
      user: {
        userId: session.userId,
        email: session.user.email,
      },
    });
  } catch (error: unknown) {
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}

async function buildAuthResponse(
  userId: string,
  email: string,
  deviceName: string,
  userAgent?: string,
  ipAddress?: string,
): Promise<SignupResponse> {
  const sessionId = randomUUID();
  const refreshToken = generateRefreshToken(sessionId);
  const refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_COST);

  await prisma.session.create({
    data: {
      id: sessionId,
      userId,
      refreshTokenHash,
      deviceName,
      userAgent: userAgent ?? null,
      ipAddress: ipAddress ?? null,
      expiresAt: getRefreshTokenExpiryDate(),
    },
  });

  return {
    tokens: {
      accessToken: signAccessToken(userId, sessionId),
      refreshToken,
    },
    user: {
      userId,
      email,
    },
  };
}

async function handleListSessions(
  call: grpc.ServerUnaryCall<EmptyRequest, ListSessionsResponse>,
  callback: UnaryCallback<ListSessionsResponse>,
): Promise<void> {
  try {
    const userId = extractOptionalMetadata(call, "x-user-id", 36);
    if (userId == null) {
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "Missing user identity"));
      return;
    }

    const currentSessionId = extractOptionalMetadata(call, "x-session-id", 36);

    const sessions = await prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastUsedAt: "desc" },
    });

    callback(null, {
      sessions: sessions.map((s) => ({
        sessionId: s.id,
        deviceName: s.deviceName ?? "",
        createdAt: s.createdAt.toISOString(),
        lastActivityAt: s.lastUsedAt.toISOString(),
        isCurrent: s.id === currentSessionId,
      })),
    });
  } catch (error: unknown) {
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}

async function handleLogoutSession(
  call: grpc.ServerUnaryCall<LogoutSessionRequest, LogoutSessionResponse>,
  callback: UnaryCallback<LogoutSessionResponse>,
): Promise<void> {
  try {
    const parsed = LogoutSessionRequestSchema.safeParse(call.request);
    if (!parsed.success) {
      callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, firstIssue(parsed.error)));
      return;
    }

    const userId = extractOptionalMetadata(call, "x-user-id", 36);
    if (userId == null) {
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "Missing user identity"));
      return;
    }

    const session = await prisma.session.findUnique({
      where: { id: parsed.data.sessionId },
    });

    if (session == null || session.userId !== userId) {
      callback(toGrpcError(ErrorCodes.NOT_FOUND, "Session not found"));
      return;
    }

    if (session.revokedAt != null) {
      callback(null, {});
      return;
    }

    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    logger.info(
      { event: "auth", type: "logout", userId, sessionId: session.id },
      "Session revoked",
    );

    callback(null, {});
  } catch (error: unknown) {
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}

async function handleLogoutAllSessions(
  call: grpc.ServerUnaryCall<LogoutAllSessionsRequest, LogoutAllSessionsResponse>,
  callback: UnaryCallback<LogoutAllSessionsResponse>,
): Promise<void> {
  try {
    const userId = extractOptionalMetadata(call, "x-user-id", 36);
    if (userId == null) {
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "Missing user identity"));
      return;
    }

    await prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    logger.info({ event: "auth", type: "logout_all", userId }, "All sessions revoked");

    callback(null, {});
  } catch (error: unknown) {
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}

function toGrpcError(code: ErrorCode, message: string): grpc.ServiceError {
  const error = new Error(message) as grpc.ServiceError;
  error.name = code;
  error.message = message;
  error.details = message;
  error.code = ErrorCodeToGrpcStatus[code] as grpc.status;
  return error;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown internal error";
}

function firstIssue(error: { issues: Array<{ message: string }> }): string {
  return error.issues[0]?.message ?? "Invalid request";
}

function getRefreshTokenExpiryDate(): Date {
  return new Date(Date.now() + config.jwtRefreshTtlDays * 24 * 60 * 60 * 1000);
}

function extractOptionalMetadata(
  call: grpc.ServerUnaryCall<unknown, unknown>,
  key: string,
  maxLength: number,
): string | undefined {
  const value = call.metadata.get(key)[0];
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized === "") {
    return undefined;
  }

  return normalized.slice(0, maxLength);
}
