import {
  ListNoteContentSchema,
  TextNoteContentSchema,
  type ListNoteContent,
  type Note,
  type NoteContentType,
  type TextNoteContent,
} from "@notes/shared-types";

export type EditableListItem = {
  text: string;
  checked: boolean;
};

export const EMPTY_LIST_ITEM: EditableListItem = { text: "", checked: false };

export function withDraftRow(items: EditableListItem[]): EditableListItem[] {
  if (items.length === 0) {
    return [{ ...EMPTY_LIST_ITEM }];
  }

  const last = items[items.length - 1];
  if (last != null && last.text.trim() !== "") {
    return [...items, { ...EMPTY_LIST_ITEM }];
  }

  return items;
}

export function getInitialEditorState(note: Note | undefined): {
  title: string;
  contentType: NoteContentType;
  textContent: string;
  listItems: EditableListItem[];
} {
  if (note == null) {
    return {
      title: "",
      contentType: "TEXT",
      textContent: "",
      listItems: [{ ...EMPTY_LIST_ITEM }],
    };
  }

  try {
    const parsed = JSON.parse(note.content) as unknown;

    if (note.contentType === "TEXT") {
      const textParsed = TextNoteContentSchema.safeParse(parsed);
      return {
        title: note.title,
        contentType: "TEXT",
        textContent: textParsed.success ? textParsed.data.text : "",
        listItems: [{ ...EMPTY_LIST_ITEM }],
      };
    }

    const listParsed = ListNoteContentSchema.safeParse(parsed);
    const items = listParsed.success ? listParsed.data.items : [];

    return {
      title: note.title,
      contentType: "LIST",
      textContent: "",
      listItems: withDraftRow(items),
    };
  } catch {
    return {
      title: note.title,
      contentType: note.contentType,
      textContent: "",
      listItems: [{ ...EMPTY_LIST_ITEM }],
    };
  }
}

export function serializeEditorContent(input: {
  contentType: NoteContentType;
  textContent: string;
  listItems: EditableListItem[];
}): string {
  const { contentType, textContent, listItems } = input;

  if (contentType === "TEXT") {
    return JSON.stringify(({ text: textContent } satisfies TextNoteContent));
  }

  return JSON.stringify({
    items: listItems
      .filter((item) => item.text.trim() !== "")
      .map((item) => ({ text: item.text, checked: item.checked })),
  } satisfies ListNoteContent);
}
