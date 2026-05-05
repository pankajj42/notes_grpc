import { type Note, type NoteContentType } from "@notes/shared-types";
import { type Note as PrismaNote } from "../generated/prisma/client.js";

export function noteToProto(note: PrismaNote): Note {
  return {
    id: note.id,
    userId: note.userId,
    title: note.title,
    content: JSON.stringify(note.content),
    contentType: dbToProtoContentType(note.contentType) as unknown as NoteContentType,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

function dbToProtoContentType(contentType: NoteContentType): 1 | 2 {
  return contentType === "TEXT" ? 1 : 2;
}
