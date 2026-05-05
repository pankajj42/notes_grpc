import * as grpc from "@grpc/grpc-js";
import {
  type CreateNoteRequest,
  type CreateNoteResponse,
  type DeleteNoteRequest,
  type DeleteNoteResponse,
  type GetNoteRequest,
  type GetNoteResponse,
  type GetNotesRequest,
  type GetNotesResponse,
  type UpdateNoteRequest,
  type UpdateNoteResponse,
} from "@notes/shared-types";
import { handleCreateNote } from "./handlers/create-note.js";
import { handleDeleteNote } from "./handlers/delete-note.js";
import { handleGetNote } from "./handlers/get-note.js";
import { handleGetNotes } from "./handlers/get-notes.js";
import { handleUpdateNote } from "./handlers/update-note.js";

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
