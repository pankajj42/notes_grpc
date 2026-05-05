import * as grpc from "@grpc/grpc-js";
import {
  CreateNoteRequestSchema,
  DeleteNoteRequestSchema,
  ErrorCodes,
  ErrorCodeToGrpcStatus,
  GetNoteRequestSchema,
  GetNotesRequestSchema,
  ListNoteContentSchema,
  TextNoteContentSchema,
  UpdateNoteRequestSchema,
  type CreateNoteRequest,
  type CreateNoteResponse,
  type DeleteNoteRequest,
  type DeleteNoteResponse,
  type ErrorCode,
  type GetNoteRequest,
  type GetNoteResponse,
  type GetNotesRequest,
  type GetNotesResponse,
  type Note,
  type NoteContentType,
  type UpdateNoteRequest,
  type UpdateNoteResponse,
} from "@notes/shared-types";
import { type Prisma } from "./generated/prisma/client.js";
import { type Note as PrismaNote } from "./generated/prisma/client.js";
import { prisma } from "./prisma.js";

type UnaryCallback<T> = grpc.sendUnaryData<T>;

export function createNotesHandlers(): grpc.UntypedServiceImplementation {
  return {
    CreateNote: (
      call: grpc.ServerUnaryCall<CreateNoteRequest, CreateNoteResponse>,
      callback: UnaryCallback<CreateNoteResponse>,
    ) => {
      void handleCreateNote(call, callback);
    },
    GetNotes: (
      call: grpc.ServerUnaryCall<GetNotesRequest, GetNotesResponse>,
      callback: UnaryCallback<GetNotesResponse>,
    ) => {
      void handleGetNotes(call, callback);
    },
    GetNote: (
      call: grpc.ServerUnaryCall<GetNoteRequest, GetNoteResponse>,
      callback: UnaryCallback<GetNoteResponse>,
    ) => {
      void handleGetNote(call, callback);
    },
    UpdateNote: (
      call: grpc.ServerUnaryCall<UpdateNoteRequest, UpdateNoteResponse>,
      callback: UnaryCallback<UpdateNoteResponse>,
    ) => {
      void handleUpdateNote(call, callback);
    },
    DeleteNote: (
      call: grpc.ServerUnaryCall<DeleteNoteRequest, DeleteNoteResponse>,
      callback: UnaryCallback<DeleteNoteResponse>,
    ) => {
      void handleDeleteNote(call, callback);
    },
  };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleCreateNote(
  call: grpc.ServerUnaryCall<CreateNoteRequest, CreateNoteResponse>,
  callback: UnaryCallback<CreateNoteResponse>,
): Promise<void> {
  try {
    const userId = extractUserId(call);
    if (userId === undefined) {
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "User ID is required"));
      return;
    }

    const wireContentType = call.request.contentType as unknown as string;
    const parsedRequest = CreateNoteRequestSchema.safeParse({
      title: call.request.title,
      content: call.request.content,
      contentType:
        wireContentType === "NOTE_CONTENT_TYPE_TEXT" ? "TEXT"
        : wireContentType === "NOTE_CONTENT_TYPE_LIST" ? "LIST"
        : undefined,
    });
    if (!parsedRequest.success) {
      callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, firstIssue(parsedRequest.error)));
      return;
    }

    const dbContentType = parsedRequest.data.contentType;
    const parsedContent = parseContentJson(parsedRequest.data.content);
    if (parsedContent === undefined) {
      callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, "Content must be valid JSON"));
      return;
    }

    const contentValidation = validateContentShape(parsedContent, dbContentType);
    if (!contentValidation.success) {
      callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, contentValidation.message));
      return;
    }

    const note = await prisma.note.create({
      data: {
        userId,
        contentType: dbContentType,
        title: parsedRequest.data.title,
        content: parsedContent,
      },
    });

    callback(null, { note: noteToProto(note) });
  } catch (error: unknown) {
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}

async function handleGetNotes(
  call: grpc.ServerUnaryCall<GetNotesRequest, GetNotesResponse>,
  callback: UnaryCallback<GetNotesResponse>,
): Promise<void> {
  try {
    const userId = extractUserId(call);
    if (userId === undefined) {
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "User ID is required"));
      return;
    }

    const parsedRequest = GetNotesRequestSchema.safeParse(call.request);
    if (!parsedRequest.success) {
      callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, firstIssue(parsedRequest.error)));
      return;
    }

    const { page, pageSize, sortBy: orderByField, sortOrder: orderByDir } = parsedRequest.data;
    const where = { userId, deletedAt: null } as const;

    const [notes, total] = await prisma.$transaction([
      prisma.note.findMany({
        where,
        orderBy: { [orderByField]: orderByDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.note.count({ where }),
    ]);

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
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}

async function handleGetNote(
  call: grpc.ServerUnaryCall<GetNoteRequest, GetNoteResponse>,
  callback: UnaryCallback<GetNoteResponse>,
): Promise<void> {
  try {
    const userId = extractUserId(call);
    if (userId === undefined) {
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "User ID is required"));
      return;
    }

    const parsedRequest = GetNoteRequestSchema.safeParse(call.request);
    if (!parsedRequest.success) {
      callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, firstIssue(parsedRequest.error)));
      return;
    }

    const { noteId } = parsedRequest.data;
    const note = await prisma.note.findUnique({ where: { id: noteId } });

    if (note === null || note.deletedAt !== null) {
      callback(toGrpcError(ErrorCodes.NOT_FOUND, "Note not found"));
      return;
    }

    if (note.userId !== userId) {
      callback(toGrpcError(ErrorCodes.PERMISSION_DENIED, "Access denied"));
      return;
    }

    callback(null, { note: noteToProto(note) });
  } catch (error: unknown) {
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}

async function handleUpdateNote(
  call: grpc.ServerUnaryCall<UpdateNoteRequest, UpdateNoteResponse>,
  callback: UnaryCallback<UpdateNoteResponse>,
): Promise<void> {
  try {
    const userId = extractUserId(call);
    if (userId === undefined) {
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "User ID is required"));
      return;
    }

    const parsedRequest = UpdateNoteRequestSchema.safeParse(call.request);
    if (!parsedRequest.success) {
      callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, firstIssue(parsedRequest.error)));
      return;
    }

    const { noteId, title, content } = parsedRequest.data;
    const note = await prisma.note.findUnique({ where: { id: noteId } });

    if (note === null || note.deletedAt !== null) {
      callback(toGrpcError(ErrorCodes.NOT_FOUND, "Note not found"));
      return;
    }

    if (note.userId !== userId) {
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

    const updated = await prisma.note.update({
      where: { id: noteId },
      data: updateData,
    });

    callback(null, { note: noteToProto(updated) });
  } catch (error: unknown) {
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}

async function handleDeleteNote(
  call: grpc.ServerUnaryCall<DeleteNoteRequest, DeleteNoteResponse>,
  callback: UnaryCallback<DeleteNoteResponse>,
): Promise<void> {
  try {
    const userId = extractUserId(call);
    if (userId === undefined) {
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "User ID is required"));
      return;
    }

    const parsedRequest = DeleteNoteRequestSchema.safeParse(call.request);
    if (!parsedRequest.success) {
      callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, firstIssue(parsedRequest.error)));
      return;
    }

    const { noteId } = parsedRequest.data;
    const note = await prisma.note.findUnique({ where: { id: noteId } });

    if (note === null || note.deletedAt !== null) {
      callback(toGrpcError(ErrorCodes.NOT_FOUND, "Note not found"));
      return;
    }

    if (note.userId !== userId) {
      callback(toGrpcError(ErrorCodes.PERMISSION_DENIED, "Access denied"));
      return;
    }

    await prisma.note.update({
      where: { id: noteId },
      data: { deletedAt: new Date() },
    });

    callback(null, {});
  } catch (error: unknown) {
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}

function extractUserId(call: grpc.ServerUnaryCall<unknown, unknown>): string | undefined {
  const values = call.metadata.get("x-user-id");
  const value = values[0];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function parseContentJson(raw: string): Prisma.InputJsonValue | undefined {
  try {
    const parsed = JSON.parse(raw) as Prisma.InputJsonValue | null;
    return parsed === null ? undefined : parsed;
  } catch {
    return undefined;
  }
}

function validateContentShape(
  parsed: Prisma.InputJsonValue,
  contentType: NoteContentType,
): { success: true } | { success: false; message: string } {
  if (contentType === "TEXT") {
    const result = TextNoteContentSchema.safeParse(parsed);
    if (!result.success) {
      return { success: false, message: "For TEXT notes, content must be JSON like { text: string }" };
    }
    return { success: true };
  }

  const result = ListNoteContentSchema.safeParse(parsed);
  if (!result.success) {
    return { success: false, message: "For LIST notes, content must be JSON like { items: [{ text, checked }] }" };
  }
  return { success: true };
}

function noteToProto(note: PrismaNote): Note {
  return {
    id: note.id,
    userId: note.userId,
    title: note.title,
    content: JSON.stringify(note.content),
    contentType: note.contentType as NoteContentType,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

function toGrpcError(code: ErrorCode, message: string): grpc.ServiceError {
  const error = new Error(message) as grpc.ServiceError;
  error.name = code;
  error.message = message;
  error.details = message;
  error.code = ErrorCodeToGrpcStatus[code] as grpc.status;
  return error;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown internal error";
}

function firstIssue(error: { issues: Array<{ message: string }> }): string {
  return error.issues[0]?.message ?? "Invalid request";
}
