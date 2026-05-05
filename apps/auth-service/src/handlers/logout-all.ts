import * as grpc from "@grpc/grpc-js";
import { type LogoutAllSessionsRequest, type LogoutAllSessionsResponse, ErrorCodes } from "@notes/shared-types";
import logger from "../logger.js";
import { toGrpcError, getErrorMessage } from "../utils/errors.js";
import { extractCorrelationFields, extractUserId } from "../utils/metadata.js";
import { revokeAllUserSessions } from "../services/session.js";

type UnaryCallback<T> = grpc.sendUnaryData<T>;

export async function handleLogoutAllSessions(
  call: grpc.ServerUnaryCall<LogoutAllSessionsRequest, LogoutAllSessionsResponse>,
  callback: UnaryCallback<LogoutAllSessionsResponse>,
): Promise<void> {
  const correlation = extractCorrelationFields(call);
  try {
    const userId = extractUserId(call);
    if (userId == null) {
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "Missing user identity"));
      return;
    }

    await revokeAllUserSessions(userId);

    logger.info({ ...correlation, event: "auth", type: "logout_all", userId }, "All sessions revoked");

    callback(null, {});
  } catch (error: unknown) {
    logger.error({ ...correlation, event: "auth", type: "logout_all_failed", error }, "Logout all sessions failed");
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}
