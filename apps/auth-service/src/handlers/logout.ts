import * as grpc from "@grpc/grpc-js";
import { type LogoutSessionRequest, type LogoutSessionResponse, LogoutSessionRequestSchema, ErrorCodes } from "@notes/shared-types";
import logger from "../logger.js";
import { toGrpcError, firstIssue, getErrorMessage } from "../utils/errors.js";
import { extractCorrelationFields, extractUserId } from "../utils/metadata.js";
import { findSession, revokeSession } from "../services/session.js";

type UnaryCallback<T> = grpc.sendUnaryData<T>;

export async function handleLogoutSession(
  call: grpc.ServerUnaryCall<LogoutSessionRequest, LogoutSessionResponse>,
  callback: UnaryCallback<LogoutSessionResponse>,
): Promise<void> {
  const correlation = extractCorrelationFields(call);
  try {
    const parsed = LogoutSessionRequestSchema.safeParse(call.request);
    if (!parsed.success) {
      callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, firstIssue(parsed.error)));
      return;
    }

    const userId = extractUserId(call);
    if (userId == null) {
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "Missing user identity"));
      return;
    }

    const session = await findSession(parsed.data.sessionId);

    if (session == null || session.userId !== userId) {
      callback(toGrpcError(ErrorCodes.NOT_FOUND, "Session not found"));
      return;
    }

    if (session.revokedAt != null) {
      callback(null, {});
      return;
    }

    await revokeSession(session.id);

    logger.info(
      { ...correlation, event: "auth", type: "logout", userId, sessionId: session.id },
      "Session revoked",
    );

    callback(null, {});
  } catch (error: unknown) {
    logger.error({ ...correlation, event: "auth", type: "logout_failed", error }, "Logout session failed");
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}
