import * as grpc from "@grpc/grpc-js";
import {
  ErrorCodes,
  GetNoteRequestSchema,
  type GetNoteRequest,
  type GetNoteResponse,
} from "@notes/shared-types";
import logger from "../logger.js";
import { findNoteById } from "../services/notes.js";
import { firstIssue, getErrorMessage, toGrpcError } from "../utils/errors.js";
import { extractCorrelationFields, extractUserId } from "../utils/metadata.js";
import { noteToProto } from "../utils/note.js";

type UnaryCallback<T> = grpc.sendUnaryData<T>;

export async function handleGetNote(
  call: grpc.ServerUnaryCall<GetNoteRequest, GetNoteResponse>,
  callback: UnaryCallback<GetNoteResponse>,
): Promise<void> {
  const correlation = extractCorrelationFields(call);
  try {
    const userId = extractUserId(call);
    if (userId === undefined) {
      logger.warn({ ...correlation, event: "notes", type: "get_unauthenticated" }, "Missing user identity for get note");
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "User ID is required"));
      return;
    }

    const parsedRequest = GetNoteRequestSchema.safeParse(call.request);
    if (!parsedRequest.success) {
      callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, firstIssue(parsedRequest.error)));
      return;
    }

    const noteId = parsedRequest.data.noteId;
    const note = await findNoteById(noteId);
    if (note === null || note.deletedAt !== null) {
      logger.info({ ...correlation, event: "notes", type: "get_not_found", userId, noteId }, "Requested note not found");
      callback(toGrpcError(ErrorCodes.NOT_FOUND, "Note not found"));
      return;
    }

    if (note.userId !== userId) {
      logger.warn({ ...correlation, event: "notes", type: "get_forbidden", userId, noteId }, "User is not allowed to read note");
      callback(toGrpcError(ErrorCodes.PERMISSION_DENIED, "Access denied"));
      return;
    }

    logger.info({ ...correlation, event: "notes", type: "get", userId, noteId }, "Note fetched");

    callback(null, { note: noteToProto(note) });
  } catch (error: unknown) {
    logger.error({ ...correlation, event: "notes", type: "get_failed", error }, "Get note failed");
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}
