import * as grpc from "@grpc/grpc-js";
import {
  ErrorCodes,
  UpdateNoteRequestSchema,
  type UpdateNoteRequest,
  type UpdateNoteResponse,
} from "@notes/shared-types";
import logger from "../logger.js";
import { type Prisma } from "../generated/prisma/client.js";
import { findNoteById, updateNoteById } from "../services/notes.js";
import { parseContentJson, validateContentShape } from "../utils/content.js";
import { firstIssue, getErrorMessage, toGrpcError } from "../utils/errors.js";
import { extractCorrelationFields, extractUserId } from "../utils/metadata.js";
import { noteToProto } from "../utils/note.js";

type UnaryCallback<T> = grpc.sendUnaryData<T>;

export async function handleUpdateNote(
  call: grpc.ServerUnaryCall<UpdateNoteRequest, UpdateNoteResponse>,
  callback: UnaryCallback<UpdateNoteResponse>,
): Promise<void> {
  const correlation = extractCorrelationFields(call);
  try {
    const userId = extractUserId(call);
    if (userId === undefined) {
      logger.warn({ ...correlation, event: "notes", type: "update_unauthenticated" }, "Missing user identity for update note");
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "User ID is required"));
      return;
    }

    const normalizedRequest = {
      noteId: call.request.noteId,
      title:
        typeof call.request.title === "string" && call.request.title.trim() !== ""
          ? call.request.title
          : undefined,
      content:
        typeof call.request.content === "string" && call.request.content.trim() !== ""
          ? call.request.content
          : undefined,
    };
    const parsedRequest = UpdateNoteRequestSchema.safeParse(normalizedRequest);
    if (!parsedRequest.success) {
      callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, firstIssue(parsedRequest.error)));
      return;
    }

    const { noteId, title, content } = parsedRequest.data;
    const note = await findNoteById(noteId);

    if (note === null || note.deletedAt !== null) {
      logger.info({ ...correlation, event: "notes", type: "update_not_found", userId, noteId }, "Requested note not found for update");
      callback(toGrpcError(ErrorCodes.NOT_FOUND, "Note not found"));
      return;
    }

    if (note.userId !== userId) {
      logger.warn({ ...correlation, event: "notes", type: "update_forbidden", userId, noteId }, "User is not allowed to update note");
      callback(toGrpcError(ErrorCodes.PERMISSION_DENIED, "Access denied"));
      return;
    }

    const updateData: Prisma.NoteUpdateInput = {};

    if (title !== undefined) {
      updateData.title = title;
    }

    if (content !== undefined) {
      const parsedContent = parseContentJson(content);
      if (parsedContent === undefined) {
        callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, "Content must be valid JSON"));
        return;
      }

      const contentValidation = validateContentShape(parsedContent, note.contentType);
      if (!contentValidation.success) {
        callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, contentValidation.message));
        return;
      }

      updateData.content = parsedContent;
    }

    const updated = await updateNoteById(noteId, updateData);
    logger.info(
      {
        ...correlation,
        event: "notes",
        type: "update",
        userId,
        noteId,
        titleUpdated: title !== undefined,
        contentUpdated: content !== undefined,
      },
      "Note updated",
    );
    callback(null, { note: noteToProto(updated) });
  } catch (error: unknown) {
    logger.error({ ...correlation, event: "notes", type: "update_failed", error }, "Update note failed");
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}
