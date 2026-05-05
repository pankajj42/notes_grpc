import { type Prisma } from "../generated/prisma/client.js";
import { ListNoteContentSchema, TextNoteContentSchema, type NoteContentType } from "@notes/shared-types";

export function parseContentJson(raw: string): Prisma.InputJsonValue | undefined {
  try {
    const parsed = JSON.parse(raw) as Prisma.InputJsonValue | null;
    return parsed === null ? undefined : parsed;
  } catch {
    return undefined;
  }
}

export function validateContentShape(
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

export function wireToDomainContentType(contentType: unknown): NoteContentType | undefined {
  const wireContentType = contentType as string;
  return wireContentType === "NOTE_CONTENT_TYPE_TEXT" ? "TEXT"
    : wireContentType === "NOTE_CONTENT_TYPE_LIST" ? "LIST"
    : undefined;
}
