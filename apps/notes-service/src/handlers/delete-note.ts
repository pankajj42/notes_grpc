import * as grpc from "@grpc/grpc-js";
import {
  DeleteNoteRequestSchema,
  ErrorCodes,
  type DeleteNoteRequest,
  type DeleteNoteResponse,
} from "@notes/shared-types";
import logger from "../logger.js";
import { findNoteById, softDeleteNoteById } from "../services/notes.js";
import { firstIssue, getErrorMessage, toGrpcError } from "../utils/errors.js";
import { extractCorrelationFields, extractUserId } from "../utils/metadata.js";

type UnaryCallback<T> = grpc.sendUnaryData<T>;

export async function handleDeleteNote(
  call: grpc.ServerUnaryCall<DeleteNoteRequest, DeleteNoteResponse>,
  callback: UnaryCallback<DeleteNoteResponse>,
): Promise<void> {
  const correlation = extractCorrelationFields(call);
  try {
    const userId = extractUserId(call);
    if (userId === undefined) {
      logger.warn({ ...correlation, event: "notes", type: "delete_unauthenticated" }, "Missing user identity for delete note");
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "User ID is required"));
      return;
    }

    const parsedRequest = DeleteNoteRequestSchema.safeParse(call.request);
    if (!parsedRequest.success) {
      callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, firstIssue(parsedRequest.error)));
      return;
    }

    const noteId = parsedRequest.data.noteId;
    const note = await findNoteById(noteId);
    if (note === null || note.deletedAt !== null) {
      logger.info({ ...correlation, event: "notes", type: "delete_not_found", userId, noteId }, "Requested note not found for delete");
      callback(toGrpcError(ErrorCodes.NOT_FOUND, "Note not found"));
      return;
    }

    if (note.userId !== userId) {
      logger.warn({ ...correlation, event: "notes", type: "delete_forbidden", userId, noteId }, "User is not allowed to delete note");
      callback(toGrpcError(ErrorCodes.PERMISSION_DENIED, "Access denied"));
      return;
    }

    await softDeleteNoteById(noteId);
    logger.info({ ...correlation, event: "notes", type: "delete", userId, noteId }, "Note soft-deleted");
    callback(null, {});
  } catch (error: unknown) {
    logger.error({ ...correlation, event: "notes", type: "delete_failed", error }, "Delete note failed");
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}
