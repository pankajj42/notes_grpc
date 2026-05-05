import * as grpc from "@grpc/grpc-js";
import { type EmptyRequest, type ListSessionsResponse, ErrorCodes } from "@notes/shared-types";
import { toGrpcError, getErrorMessage } from "../utils/errors.js";
import { extractSessionId, extractUserId } from "../utils/metadata.js";
import { findUserSessions } from "../services/session.js";

type UnaryCallback<T> = grpc.sendUnaryData<T>;

export async function handleListSessions(
  call: grpc.ServerUnaryCall<EmptyRequest, ListSessionsResponse>,
  callback: UnaryCallback<ListSessionsResponse>,
): Promise<void> {
  try {
    const userId = extractUserId(call);
    if (userId == null) {
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "Missing user identity"));
      return;
    }

    const currentSessionId = extractSessionId(call);
    const sessions = await findUserSessions(userId);

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
