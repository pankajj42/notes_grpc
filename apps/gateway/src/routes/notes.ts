import * as grpc from "@grpc/grpc-js";
import { Router } from "express";
import { createNotesServiceClient } from "@notes/grpc-clients";
import {
  ErrorCodeToHttpStatus,
  ErrorCodes,
  GetNotesResponseSchema,
  NoteSchema,
  UpdateNoteRequestSchema,
  successResponse,
  type CreateNoteRequest,
  type CreateNoteResponse,
  type DeleteNoteRequest,
  type DeleteNoteResponse,
  type GetNoteRequest,
  type GetNoteResponse,
  type GetNotesRequest,
  type GetNotesResponse,
  type Note,
  type NoteContentType,
  type UpdateNoteRequest,
  type UpdateNoteResponse,
} from "@notes/shared-types";
import { config } from "../config.js";
import { AppError } from "../middleware/errorHandler.js";
import { validate } from "../middleware/validate.js";
import {
  createNoteBodySchema,
  getNotesQuerySchema,
  noteIdParamsSchema,
} from "../validation/notes.js";

export function createNotesRouter(): Router {
  const router = Router();

  router.get("/", validate(getNotesQuerySchema, "query"), async (req, res, next) => {
    try {
      const userId = getAuthenticatedUserId(req.user);
      const metadata = createUserMetadata(userId);
      const request = res.locals.validated.query as GetNotesRequest;
      const response = await unaryCall<GetNotesRequest, GetNotesResponse>(
        "GetNotes",
        request,
        metadata,
      );

      const normalized = normalizeGetNotesResponse(response);
      res.status(200).json(successResponse(normalized));
    } catch (error: unknown) {
      next(toAppError(error));
    }
  });

  router.get("/:noteId", validate(noteIdParamsSchema, "params"), async (req, res, next) => {
    try {
      const userId = getAuthenticatedUserId(req.user);
      const metadata = createUserMetadata(userId);
      const request = res.locals.validated.params as GetNoteRequest;

      const response = await unaryCall<GetNoteRequest, GetNoteResponse>("GetNote", request, metadata);
      const normalized = normalizeGetNoteResponse(response);

      res.status(200).json(successResponse(normalized));
    } catch (error: unknown) {
      next(toAppError(error));
    }
  });

  router.post("/", validate(createNoteBodySchema), async (req, res, next) => {
    try {
      const userId = getAuthenticatedUserId(req.user);
      const metadata = createUserMetadata(userId);
      const request = res.locals.validated.body as CreateNoteRequest;

      const response = await unaryCall<GrpcCreateNoteRequest, CreateNoteResponse>(
        "CreateNote",
        {
          ...request,
          contentType: sharedToProtoContentType(request.contentType),
        },
        metadata,
      );

      const normalized = normalizeCreateNoteResponse(response);
      res.status(201).json(successResponse(normalized));
    } catch (error: unknown) {
      next(toAppError(error));
    }
  });

  router.put("/:noteId", validate(noteIdParamsSchema, "params"), async (req, res, next) => {
    try {
      const userId = getAuthenticatedUserId(req.user);
      const metadata = createUserMetadata(userId);
      const parsedRequest = UpdateNoteRequestSchema.safeParse({
        noteId: (res.locals.validated.params as { noteId: string }).noteId,
        title: typeof req.body?.title === "string" ? req.body.title : undefined,
        content: typeof req.body?.content === "string" ? req.body.content : undefined,
      });
      if (!parsedRequest.success) {
        throw new AppError(ErrorCodes.INVALID_ARGUMENT, parsedRequest.error.issues[0]?.message ?? "Invalid request");
      }

      const response = await unaryCall<UpdateNoteRequest, UpdateNoteResponse>(
        "UpdateNote",
        parsedRequest.data,
        metadata,
      );

      const normalized = normalizeUpdateNoteResponse(response);
      res.status(200).json(successResponse(normalized));
    } catch (error: unknown) {
      next(toAppError(error));
    }
  });

  router.delete("/:noteId", validate(noteIdParamsSchema, "params"), async (req, res, next) => {
    try {
      const userId = getAuthenticatedUserId(req.user);
      const metadata = createUserMetadata(userId);
      const request = res.locals.validated.params as DeleteNoteRequest;

      const response = await unaryCall<DeleteNoteRequest, DeleteNoteResponse>("DeleteNote", request, metadata);

      res.status(200).json(successResponse(response));
    } catch (error: unknown) {
      next(toAppError(error));
    }
  });

  return router;
}

type GrpcCreateNoteRequest = Omit<CreateNoteRequest, "contentType"> & {
  contentType: "NOTE_CONTENT_TYPE_TEXT" | "NOTE_CONTENT_TYPE_LIST";
};

async function unaryCall<TRequest extends object, TResponse>(
  method: "CreateNote" | "GetNotes" | "GetNote" | "UpdateNote" | "DeleteNote",
  request: TRequest,
  metadata: grpc.Metadata,
): Promise<TResponse> {
  const client = createNotesServiceClient(config.notesServiceUrl);

  try {
    return await new Promise<TResponse>((resolve, reject) => {
      const callback = (error: grpc.ServiceError | null, response: TResponse): void => {
        if (error != null) {
          reject(error);
          return;
        }

        resolve(response);
      };

      switch (method) {
        case "CreateNote":
          client.CreateNote(request, metadata, callback as (error: grpc.ServiceError | null, response: unknown) => void);
          return;
        case "GetNotes":
          client.GetNotes(request, metadata, callback as (error: grpc.ServiceError | null, response: unknown) => void);
          return;
        case "GetNote":
          client.GetNote(request, metadata, callback as (error: grpc.ServiceError | null, response: unknown) => void);
          return;
        case "UpdateNote":
          client.UpdateNote(request, metadata, callback as (error: grpc.ServiceError | null, response: unknown) => void);
          return;
        case "DeleteNote":
          client.DeleteNote(request, metadata, callback as (error: grpc.ServiceError | null, response: unknown) => void);
          return;
      }
    });
  } finally {
    client.close();
  }
}

function createUserMetadata(userId: string): grpc.Metadata {
  const metadata = new grpc.Metadata();
  metadata.set("x-user-id", userId);
  return metadata;
}

function getAuthenticatedUserId(user: Express.Request["user"]): string {
  if (user?.userId === undefined || user.userId.trim() === "") {
    throw new AppError(ErrorCodes.UNAUTHENTICATED);
  }

  return user.userId;
}

function sharedToProtoContentType(contentType: NoteContentType): GrpcCreateNoteRequest["contentType"] {
  return contentType === "TEXT" ? "NOTE_CONTENT_TYPE_TEXT" : "NOTE_CONTENT_TYPE_LIST";
}

function normalizeCreateNoteResponse(response: CreateNoteResponse): CreateNoteResponse {
  return {
    note: normalizeNote(response.note),
  };
}

function normalizeGetNotesResponse(response: GetNotesResponse): GetNotesResponse {
  const normalized = {
    ...response,
    notes: response.notes.map(normalizeNote),
  };

  const parsed = GetNotesResponseSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new AppError(ErrorCodes.INTERNAL, "Invalid notes list payload from notes service");
  }

  return parsed.data;
}

function normalizeGetNoteResponse(response: GetNoteResponse): GetNoteResponse {
  return {
    note: normalizeNote(response.note),
  };
}

function normalizeUpdateNoteResponse(response: UpdateNoteResponse): UpdateNoteResponse {
  return {
    note: normalizeNote(response.note),
  };
}

function normalizeNote(note: Note): Note {
  const normalized = {
    ...note,
    contentType: normalizeContentType(note.contentType as unknown as string),
  };

  const parsed = NoteSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new AppError(ErrorCodes.INTERNAL, "Invalid note payload from notes service");
  }

  return parsed.data;
}

function normalizeContentType(contentType: string): NoteContentType {
  if (contentType === "TEXT" || contentType === "NOTE_CONTENT_TYPE_TEXT") {
    return "TEXT";
  }

  if (contentType === "LIST" || contentType === "NOTE_CONTENT_TYPE_LIST") {
    return "LIST";
  }

  throw new AppError(ErrorCodes.INTERNAL, "Invalid note content type from notes service");
}

function toAppError(error: unknown): AppError {
  if (isGrpcServiceError(error)) {
    const code = grpcStatusToErrorCode(error.code);
    return new AppError(code, error.details || error.message);
  }

  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(ErrorCodes.INTERNAL, error.message);
  }

  return new AppError(ErrorCodes.INTERNAL);
}

function isGrpcServiceError(error: unknown): error is grpc.ServiceError {
  return error instanceof Error && "code" in error;
}

function grpcStatusToErrorCode(statusCode: number): keyof typeof ErrorCodeToHttpStatus {
  switch (statusCode) {
    case 3:
      return ErrorCodes.INVALID_ARGUMENT;
    case 5:
      return ErrorCodes.NOT_FOUND;
    case 6:
      return ErrorCodes.ALREADY_EXISTS;
    case 7:
      return ErrorCodes.PERMISSION_DENIED;
    case 12:
      return ErrorCodes.UNIMPLEMENTED;
    case 16:
      return ErrorCodes.UNAUTHENTICATED;
    default:
      return ErrorCodes.INTERNAL;
  }
}
