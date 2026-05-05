import * as grpc from "@grpc/grpc-js";
import { type LogoutAllSessionsRequest, type LogoutAllSessionsResponse, ErrorCodes } from "@notes/shared-types";
import logger from "../logger.js";
import { toGrpcError, getErrorMessage } from "../utils/errors.js";
import { extractOptionalMetadata } from "../utils/metadata.js";
import { revokeAllUserSessions } from "../services/session.js";

type UnaryCallback<T> = grpc.sendUnaryData<T>;

export async function handleLogoutAllSessions(
  call: grpc.ServerUnaryCall<LogoutAllSessionsRequest, LogoutAllSessionsResponse>,
  callback: UnaryCallback<LogoutAllSessionsResponse>,
): Promise<void> {
  try {
    const userId = extractOptionalMetadata(call, "x-user-id", 36);
    if (userId == null) {
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "Missing user identity"));
      return;
    }

    await revokeAllUserSessions(userId);

    logger.info({ event: "auth", type: "logout_all", userId }, "All sessions revoked");

    callback(null, {});
  } catch (error: unknown) {
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}
