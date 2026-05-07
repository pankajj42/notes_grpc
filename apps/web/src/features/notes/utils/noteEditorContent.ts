import {
  ListNoteContentSchema,
  TextNoteContentSchema,
  type ListNoteContent,
  type Note,
  type NoteContentType,
  type TextNoteContent,
} from "@notes/shared-types";

export type EditableListItem = {
  /** Client-only stable key used by dnd-kit for drag-and-drop sorting. Not persisted. */
  id: string;
  text: string;
  checked: boolean;
};

function newItemId(): string {
  return crypto.randomUUID();
}

export const EMPTY_LIST_ITEM: EditableListItem = { id: newItemId(), text: "", checked: false };

export function makeEmptyListItem(): EditableListItem {
  return { id: newItemId(), text: "", checked: false };
}

export function withDraftRow(items: EditableListItem[]): EditableListItem[] {
  if (items.length === 0) {
    return [makeEmptyListItem()];
  }

  const last = items[items.length - 1];
  if (last != null && last.text.trim() !== "") {
    return [...items, makeEmptyListItem()];
  }

  return items;
}

export function getInitialEditorState(note: Note | undefined): {
  title: string;
  contentType: NoteContentType;
  textContent: string;
  listItems: EditableListItem[];
  moveCheckedToEnd: boolean;
} {
  if (note == null) {
    return {
      title: "",
      contentType: "TEXT",
      textContent: "",
      listItems: [makeEmptyListItem()],
      moveCheckedToEnd: false,
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
        listItems: [makeEmptyListItem()],
        moveCheckedToEnd: false,
      };
    }

    const listParsed = ListNoteContentSchema.safeParse(parsed);
    const items = listParsed.success ? listParsed.data.items : [];
    const moveCheckedToEnd = listParsed.success ? listParsed.data.moveCheckedToEnd : false;

    return {
      title: note.title,
      contentType: "LIST",
      textContent: "",
      listItems: withDraftRow(items.map((item) => ({ ...item, id: newItemId() }))),
      moveCheckedToEnd,
    };
  } catch {
    return {
      title: note.title,
      contentType: note.contentType,
      textContent: "",
      listItems: [makeEmptyListItem()],
      moveCheckedToEnd: false,
    };
  }
}

export function serializeEditorContent(input: {
  contentType: NoteContentType;
  textContent: string;
  listItems: EditableListItem[];
  moveCheckedToEnd: boolean;
}): string {
  const { contentType, textContent, listItems, moveCheckedToEnd } = input;

  if (contentType === "TEXT") {
    return JSON.stringify(({ text: textContent } satisfies TextNoteContent));
  }

  return JSON.stringify({
    items: listItems
      .filter((item) => item.text.trim() !== "")
      .map((item) => ({ text: item.text, checked: item.checked })),
    moveCheckedToEnd,
  } satisfies ListNoteContent);
}

/**
 * When the moveCheckedToEnd toggle is switched ON, immediately move all
 * currently-checked items to the end, preserving their relative order.
 * The draft row (last empty-text item) is kept at the tail.
 */
export function applyMoveCheckedToEndToggle(items: EditableListItem[]): EditableListItem[] {
  const last = items[items.length - 1];
  const hasDraft = last != null && last.text.trim() === "";
  const tail = hasDraft ? [last] : [];
  const body = hasDraft ? items.slice(0, -1) : [...items];

  const unchecked = body.filter((item) => !item.checked);
  const checked = body.filter((item) => item.checked);

  return [...unchecked, ...checked, ...tail];
}

/**
 * Returns true when all unchecked items appear before all checked items.
 * Draft row (last empty item) is ignored.
 */
export function isMoveCheckedToEndOrderValid(items: EditableListItem[]): boolean {
  const last = items[items.length - 1];
  const hasDraft = last != null && last.text.trim() === "";
  const body = hasDraft ? items.slice(0, -1) : items;

  let seenChecked = false;
  for (const item of body) {
    if (item.checked) {
      seenChecked = true;
      continue;
    }

    if (seenChecked) {
      return false;
    }
  }

  return true;
}

/**
 * Apply move-checked-to-end reordering after a check/uncheck event.
 *
 * Newly-checked items move to the TOP of the checked section (just below the
 * last unchecked item).  Newly-unchecked items move to the END of the
 * unchecked section (just above the first checked item).
 *
 * The draft row (last item with empty text) is kept at the tail.
 */
export function applyMoveCheckedToEnd(
  items: EditableListItem[],
  changedIndex: number,
  nowChecked: boolean,
): EditableListItem[] {
  const last = items[items.length - 1];
  const hasDraft = last != null && last.text.trim() === "";
  const tail = hasDraft ? [last] : [];
  const body = hasDraft ? items.slice(0, -1) : [...items];

  const changed = body[changedIndex];
  if (changed == null) return items;

  const others = body.filter((_, i) => i !== changedIndex);

  if (nowChecked) {
    // Insert at the start of the checked section (end of unchecked section)
    const firstCheckedIdx = others.findIndex((item) => item.checked);
    if (firstCheckedIdx === -1) {
      return [...others, changed, ...tail];
    }
    return [
      ...others.slice(0, firstCheckedIdx),
      changed,
      ...others.slice(firstCheckedIdx),
      ...tail,
    ];
  }

  // Unchecked: insert at end of unchecked section (just before first checked item)
  const firstCheckedIdx = others.findIndex((item) => item.checked);
  if (firstCheckedIdx === -1) {
    return [...others, changed, ...tail];
  }
  return [
    ...others.slice(0, firstCheckedIdx),
    changed,
    ...others.slice(firstCheckedIdx),
    ...tail,
  ];
}
