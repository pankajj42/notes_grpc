import {
  ListNoteContentSchema,
  TextNoteContentSchema,
  type Note,
} from "@notes/shared-types";

export type ParsedNoteContent =
  | { kind: "text"; text: string }
  | { kind: "list"; items: Array<{ text: string; checked: boolean }> }
  | { kind: "invalid"; raw: string };

export function parseNoteContent(note: Note): ParsedNoteContent {
  try {
    const parsed = JSON.parse(note.content) as unknown;

    if (note.contentType === "TEXT") {
      const result = TextNoteContentSchema.safeParse(parsed);
      if (result.success) {
        return { kind: "text", text: result.data.text };
      }
    }

    if (note.contentType === "LIST") {
      const result = ListNoteContentSchema.safeParse(parsed);
      if (result.success) {
        return { kind: "list", items: result.data.items };
      }
    }
  } catch {
    return { kind: "invalid", raw: note.content };
  }

  return { kind: "invalid", raw: note.content };
}
