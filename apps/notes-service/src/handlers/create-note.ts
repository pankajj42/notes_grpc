import * as grpc from "@grpc/grpc-js";
import {
  CreateNoteRequestSchema,
  ErrorCodes,
  type CreateNoteRequest,
  type CreateNoteResponse,
} from "@notes/shared-types";
import logger from "../logger.js";
import { createNoteRecord } from "../services/notes.js";
import { parseContentJson, validateContentShape, wireToDomainContentType } from "../utils/content.js";
import { firstIssue, getErrorMessage, toGrpcError } from "../utils/errors.js";
import { extractCorrelationFields, extractUserId } from "../utils/metadata.js";
import { noteToProto } from "../utils/note.js";

type UnaryCallback<T> = grpc.sendUnaryData<T>;

export async function handleCreateNote(
  call: grpc.ServerUnaryCall<CreateNoteRequest, CreateNoteResponse>,
  callback: UnaryCallback<CreateNoteResponse>,
): Promise<void> {
  const correlation = extractCorrelationFields(call);
  try {
    const userId = extractUserId(call);
    if (userId === undefined) {
      logger.warn({ ...correlation, event: "notes", type: "create_unauthenticated" }, "Missing user identity for create note");
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "User ID is required"));
      return;
    }

    const parsedRequest = CreateNoteRequestSchema.safeParse({
      title: call.request.title,
      content: call.request.content,
      contentType: wireToDomainContentType(call.request.contentType),
    });
    if (!parsedRequest.success) {
      callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, firstIssue(parsedRequest.error)));
      return;
    }

    const parsedContent = parseContentJson(parsedRequest.data.content);
    if (parsedContent === undefined) {
      callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, "Content must be valid JSON"));
      return;
    }

    const contentValidation = validateContentShape(parsedContent, parsedRequest.data.contentType);
    if (!contentValidation.success) {
      callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, contentValidation.message));
      return;
    }

    const note = await createNoteRecord({
      userId,
      title: parsedRequest.data.title,
      contentType: parsedRequest.data.contentType,
      content: parsedContent,
    });

    logger.info(
      { ...correlation, event: "notes", type: "create", userId, noteId: note.id, contentType: parsedRequest.data.contentType },
      "Note created",
    );

    callback(null, { note: noteToProto(note) });
  } catch (error: unknown) {
    logger.error({ ...correlation, event: "notes", type: "create_failed", error }, "Create note failed");
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}
