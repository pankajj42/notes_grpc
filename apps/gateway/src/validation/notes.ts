import {
  CreateNoteRequestSchema,
  DeleteNoteRequestSchema,
  GetNotesRequestSchema,
} from "@notes/shared-types";

export const createNoteBodySchema = CreateNoteRequestSchema;
export const getNotesQuerySchema = GetNotesRequestSchema;
export const noteIdParamsSchema = DeleteNoteRequestSchema;
