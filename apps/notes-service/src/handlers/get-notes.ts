import * as grpc from "@grpc/grpc-js";
import {
  ErrorCodes,
  GetNotesRequestSchema,
  type GetNotesRequest,
  type GetNotesResponse,
} from "@notes/shared-types";
import logger from "../logger.js";
import { listUserNotes } from "../services/notes.js";
import { firstIssue, getErrorMessage, toGrpcError } from "../utils/errors.js";
import { extractCorrelationFields, extractUserId } from "../utils/metadata.js";
import { noteToProto } from "../utils/note.js";

type UnaryCallback<T> = grpc.sendUnaryData<T>;

export async function handleGetNotes(
  call: grpc.ServerUnaryCall<GetNotesRequest, GetNotesResponse>,
  callback: UnaryCallback<GetNotesResponse>,
): Promise<void> {
  const correlation = extractCorrelationFields(call);
  try {
    const userId = extractUserId(call);
    if (userId === undefined) {
      logger.warn({ ...correlation, event: "notes", type: "list_unauthenticated" }, "Missing user identity for list notes");
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "User ID is required"));
      return;
    }

    const parsedRequest = GetNotesRequestSchema.safeParse(call.request);
    if (!parsedRequest.success) {
      callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, firstIssue(parsedRequest.error)));
      return;
    }

    const { page, pageSize, sortBy, sortOrder } = parsedRequest.data;
    const { notes, total } = await listUserNotes({
      userId,
      page,
      pageSize,
      sortBy,
      sortOrder,
    });

    logger.info(
      { ...correlation, event: "notes", type: "list", userId, count: notes.length, total, page, pageSize, sortBy, sortOrder },
      "Notes listed",
    );

    callback(null, {
      notes: notes.map(noteToProto),
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error: unknown) {
    logger.error({ ...correlation, event: "notes", type: "list_failed", error }, "List notes failed");
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}
