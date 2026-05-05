import * as grpc from "@grpc/grpc-js";
import {
  type RefreshTokenRequest,
  type RefreshTokenResponse,
  RefreshTokenRequestSchema,
  ErrorCodes,
  parseRefreshToken,
} from "@notes/shared-types";
import logger from "../logger.js";
import { signAccessToken, generateRefreshToken } from "../tokens.js";
import { toGrpcError, firstIssue, getErrorMessage } from "../utils/errors.js";
import { extractCorrelationFields } from "../utils/metadata.js";
import {
  findSessionWithUser,
  verifyRefreshToken,
  updateSessionRefreshToken,
  revokeSession,
  incrementFailedRefreshAttempts,
} from "../services/session.js";

type UnaryCallback<T> = grpc.sendUnaryData<T>;

export async function handleRefreshToken(
  call: grpc.ServerUnaryCall<RefreshTokenRequest, RefreshTokenResponse>,
  callback: UnaryCallback<RefreshTokenResponse>,
): Promise<void> {
  const correlation = extractCorrelationFields(call);
  try {
    const parsed = RefreshTokenRequestSchema.safeParse(call.request);
    if (!parsed.success) {
      callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, firstIssue(parsed.error)));
      return;
    }

    const rawToken = parsed.data.refreshToken;
    const parsedToken = parseRefreshToken(rawToken);
    if (parsedToken == null) {
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "Invalid refresh token"));
      return;
    }

    const sessionId = parsedToken.sessionId;
    const session = await findSessionWithUser(sessionId);

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

    const tokenStatus = await verifyRefreshToken(rawToken, session.refreshTokenHash, session.previousTokenHash);

    if (tokenStatus === "reuse") {
      await revokeSession(sessionId);
      logger.warn(
        {
          ...correlation,
          event: "security",
          type: "refresh_token_reuse",
          sessionId,
          userId: session.userId,
          ipAddress: session.ipAddress,
        },
        "Refresh token reuse detected — session revoked",
      );
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "Refresh token reuse detected"));
      return;
    }

    if (tokenStatus === "invalid") {
      const shouldLock = await incrementFailedRefreshAttempts(sessionId);
      if (shouldLock) {
        logger.warn(
          {
            ...correlation,
            event: "security",
            type: "session_locked",
            sessionId,
            userId: session.userId,
            ipAddress: session.ipAddress,
          },
          "Session locked after too many failed refresh attempts",
        );
      }
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "Invalid refresh token"));
      return;
    }

    const newRefreshToken = generateRefreshToken(sessionId);
    await updateSessionRefreshToken(sessionId, newRefreshToken);

    logger.info(
      {
        ...correlation,
        event: "auth",
        type: "token_refresh",
        sessionId,
        userId: session.userId,
        ipAddress: session.ipAddress,
      },
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
    logger.error({ ...correlation, event: "auth", type: "token_refresh_failed", error }, "Refresh token flow failed");
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}
