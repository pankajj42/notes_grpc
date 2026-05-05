import * as grpc from "@grpc/grpc-js";
import { Router } from "express";
import { createNotesServiceClient } from "@notes/grpc-clients";
import {
  ErrorCodes,
  CreateNoteRequestSchema,
  DeleteNoteRequestSchema,
  GetNoteRequestSchema,
  GetNotesRequestSchema,
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
  type UpdateNoteResponse,
} from "@notes/shared-types";
import { config } from "../config.js";
import { AppError } from "../middleware/errorHandler.js";
import { validate } from "../middleware/validate.js";
import { grpcUnaryCall, toAppError } from "../lib/grpc.js";

export function createNotesRouter(): Router {
  const router = Router();

  router.get("/", validate(GetNotesRequestSchema, "query"), async (req, res, next) => {
    try {
      const userId = getAuthenticatedUserId(req.user);
      const metadata = createUserMetadata(userId);
      const request = res.locals.validated.query as GetNotesRequest;
      const response = await callNotes<GetNotesResponse>((c, cb) =>
        c.GetNotes(request, metadata, cb),
      );
      res.status(200).json(successResponse(normalizeGetNotesResponse(response)));
    } catch (error: unknown) {
      next(toAppError(error));
    }
  });

  router.get("/:noteId", validate(GetNoteRequestSchema, "params"), async (req, res, next) => {
    try {
      const userId = getAuthenticatedUserId(req.user);
      const metadata = createUserMetadata(userId);
      const request = res.locals.validated.params as GetNoteRequest;
      const response = await callNotes<GetNoteResponse>((c, cb) =>
        c.GetNote(request, metadata, cb),
      );
      res.status(200).json(successResponse(normalizeGetNoteResponse(response)));
    } catch (error: unknown) {
      next(toAppError(error));
    }
  });

  router.post("/", validate(CreateNoteRequestSchema), async (req, res, next) => {
    try {
      const userId = getAuthenticatedUserId(req.user);
      const metadata = createUserMetadata(userId);
      const request = res.locals.validated.body as CreateNoteRequest;
      const grpcRequest: GrpcCreateNoteRequest = {
        ...request,
        contentType: sharedToProtoContentType(request.contentType),
      };
      const response = await callNotes<CreateNoteResponse>((c, cb) =>
        c.CreateNote(grpcRequest, metadata, cb),
      );
      res.status(201).json(successResponse(normalizeCreateNoteResponse(response)));
    } catch (error: unknown) {
      next(toAppError(error));
    }
  });

  router.put("/:noteId", validate(GetNoteRequestSchema, "params"), async (req, res, next) => {
    try {
      const userId = getAuthenticatedUserId(req.user);
      const metadata = createUserMetadata(userId);
      const parsed = UpdateNoteRequestSchema.safeParse({
        noteId: (res.locals.validated.params as { noteId: string }).noteId,
        title: typeof req.body?.title === "string" ? req.body.title : undefined,
        content: typeof req.body?.content === "string" ? req.body.content : undefined,
      });
      if (!parsed.success) {
        throw new AppError(ErrorCodes.INVALID_ARGUMENT, parsed.error.issues[0]?.message ?? "Invalid request");
      }
      const response = await callNotes<UpdateNoteResponse>((c, cb) =>
        c.UpdateNote(parsed.data, metadata, cb),
      );
      res.status(200).json(successResponse(normalizeUpdateNoteResponse(response)));
    } catch (error: unknown) {
      next(toAppError(error));
    }
  });

  router.delete("/:noteId", validate(DeleteNoteRequestSchema, "params"), async (req, res, next) => {
    try {
      const userId = getAuthenticatedUserId(req.user);
      const metadata = createUserMetadata(userId);
      const request = res.locals.validated.params as DeleteNoteRequest;
      const response = await callNotes<DeleteNoteResponse>((c, cb) =>
        c.DeleteNote(request, metadata, cb),
      );
      res.status(200).json(successResponse(response));
    } catch (error: unknown) {
      next(toAppError(error));
    }
  });

  return router;
}

type NotesServiceClient = ReturnType<typeof createNotesServiceClient>;

type GrpcCreateNoteRequest = Omit<CreateNoteRequest, "contentType"> & {
  contentType: "NOTE_CONTENT_TYPE_TEXT" | "NOTE_CONTENT_TYPE_LIST";
};

function callNotes<TResponse>(
  fn: (client: NotesServiceClient, cb: (error: grpc.ServiceError | null, response: unknown) => void) => void,
): Promise<TResponse> {
  const client = createNotesServiceClient(config.notesServiceUrl);
  return grpcUnaryCall<TResponse>((cb) => fn(client, cb), () => client.close());
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
