import {
  type CreateNoteRequest,
  CreateNoteRequestSchema,
  CreateNoteResponseSchema,
  type GetNoteResponse,
  GetNoteResponseSchema,
  type GetNotesRequest,
  GetNotesRequestSchema,
  GetNotesResponseSchema,
  type Note,
  type PaginationMetadata,
  type UpdateNoteRequest,
  UpdateNoteRequestSchema,
  UpdateNoteResponseSchema,
} from "@notes/shared-types";
import { apiClient, parseSuccessEnvelope } from "./http";

export async function createNote(input: CreateNoteRequest): Promise<Note> {
  const request = CreateNoteRequestSchema.parse(input);
  const response = await apiClient.post("/notes", request);
  const parsed = parseSuccessEnvelope(response, CreateNoteResponseSchema);
  return parsed.data.note;
}

export async function getNotes(input: GetNotesRequest): Promise<{ notes: Note[]; pagination: PaginationMetadata }> {
  const request = GetNotesRequestSchema.parse(input);
  const response = await apiClient.get("/notes", { params: request });
  const parsed = parseSuccessEnvelope(response, GetNotesResponseSchema);
  return {
    notes: parsed.data.notes,
    pagination: parsed.data.pagination,
  };
}

export async function getNote(noteId: string): Promise<GetNoteResponse["note"]> {
  const response = await apiClient.get(`/notes/${encodeURIComponent(noteId)}`);
  const parsed = parseSuccessEnvelope(response, GetNoteResponseSchema);
  return parsed.data.note;
}

export async function updateNote(input: UpdateNoteRequest): Promise<Note> {
  const request = UpdateNoteRequestSchema.parse(input);
  const response = await apiClient.put(`/notes/${encodeURIComponent(request.noteId)}`, {
    title: request.title,
    content: request.content,
  });
  const parsed = parseSuccessEnvelope(response, UpdateNoteResponseSchema);
  return parsed.data.note;
}

export async function deleteNote(noteId: string): Promise<void> {
  await apiClient.delete(`/notes/${encodeURIComponent(noteId)}`);
}
