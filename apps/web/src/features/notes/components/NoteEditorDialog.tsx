import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import { arrayMove } from "@dnd-kit/sortable";
import { useEffect, useState } from "react";
import {
  type Note,
  type NoteContentType,
  CreateNoteRequestSchema,
} from "@notes/shared-types";
import { ListItemsEditor } from "./ListItemsEditor";
import { hoverLiftToggleButtonsSx, interactiveTextFieldSx } from "./noteEditorStyles";
import {
  applyMoveCheckedToEnd,
  applyMoveCheckedToEndToggle,
  getInitialEditorState,
  isMoveCheckedToEndOrderValid,
  makeEmptyListItem,
  serializeEditorContent,
  withDraftRow,
  type EditableListItem,
} from "../utils/noteEditorContent";

type EditorMode = "create" | "edit";

type NoteEditorPayload = {
  title: string;
  contentType: NoteContentType;
  content: string;
};

interface NoteEditorDialogProps {
  open: boolean;
  mode: EditorMode;
  note: Note | undefined;
  onClose: () => void;
  onSubmit: (payload: NoteEditorPayload) => void;
  loading?: boolean;
}

export function NoteEditorDialog({ open, mode, note, onClose, onSubmit, loading }: NoteEditorDialogProps) {
  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState<NoteContentType>("TEXT");
  const [textContent, setTextContent] = useState("");
  const [listItems, setListItems] = useState<EditableListItem[]>([makeEmptyListItem()]);
  const [moveCheckedToEnd, setMoveCheckedToEnd] = useState(false);
  const [titleError, setTitleError] = useState<string | undefined>();
  const [contentError, setContentError] = useState<string | undefined>();

  useEffect(() => {
    if (!open) {
      return;
    }

    const initialState = mode === "edit" ? getInitialEditorState(note) : getInitialEditorState(undefined);
    setTitle(initialState.title);
    setContentType(initialState.contentType);
    setTextContent(initialState.textContent);
    setListItems(initialState.listItems);
    setMoveCheckedToEnd(initialState.moveCheckedToEnd);
    setTitleError(undefined);
    setContentError(undefined);
  }, [mode, note, open]);

  const updateListText = (index: number, value: string) => {
    setListItems((previous) => {
      const next = previous.map((item, itemIndex) => (itemIndex === index ? { ...item, text: value } : item));
      const nextWithDraft = withDraftRow(next);
      if (moveCheckedToEnd && !isMoveCheckedToEndOrderValid(nextWithDraft)) {
        setMoveCheckedToEnd(false);
      }
      return nextWithDraft;
    });
  };

  const updateListChecked = (index: number, checked: boolean) => {
    setListItems((previous) => {
      const updated = previous.map((item, itemIndex) => (itemIndex === index ? { ...item, checked } : item));
      if (moveCheckedToEnd) {
        return applyMoveCheckedToEnd(updated, index, checked);
      }
      return updated;
    });
  };

  const removeListItem = (index: number) => {
    setListItems((previous) => {
      const next = previous.filter((_item, itemIndex) => itemIndex !== index);
      return withDraftRow(next);
    });
  };

  const reorderListItems = (oldIndex: number, newIndex: number) => {
    setListItems((previous) => {
      const next = arrayMove(previous, oldIndex, newIndex);
      if (moveCheckedToEnd && !isMoveCheckedToEndOrderValid(next)) {
        setMoveCheckedToEnd(false);
      }
      return next;
    });
  };

  const handleMoveCheckedToEndChange = (value: boolean) => {
    setMoveCheckedToEnd(value);
    if (value) {
      setListItems((previous) => applyMoveCheckedToEndToggle(previous));
    }
  };

  const submit = () => {
    setTitleError(undefined);
    setContentError(undefined);

    const content = serializeEditorContent({ contentType, textContent, listItems, moveCheckedToEnd });

    const validation = CreateNoteRequestSchema.safeParse({
      title,
      contentType,
      content,
    });

    if (!validation.success) {
      for (const issue of validation.error.issues) {
        if (issue.path[0] === "title") {
          setTitleError(issue.message);
        }
        if (issue.path[0] === "content") {
          setContentError(issue.message);
        }
      }
      return;
    }

    onSubmit({ title, contentType, content });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <form onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <DialogTitle>{mode === "create" ? "Create note" : "Edit note"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <ToggleButtonGroup
              value={contentType}
              exclusive
              disabled={mode === "edit"}
              onChange={(_event, value: NoteContentType | null) => {
                if (value != null) {
                  setContentType(value);
                  setContentError(undefined);
                }
              }}
              sx={hoverLiftToggleButtonsSx}
            >
              <ToggleButton value="TEXT">Text</ToggleButton>
              <ToggleButton value="LIST">List</ToggleButton>
            </ToggleButtonGroup>

            <TextField
              label="Title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
              }}
              error={titleError !== undefined}
              helperText={titleError}
              sx={interactiveTextFieldSx}
              fullWidth
            />

            {contentType === "TEXT" ? (
              <TextField
                label="Content"
                value={textContent}
                onChange={(event) => {
                  setTextContent(event.target.value);
                }}
                fullWidth
                multiline
                minRows={6}
                maxRows={16}
                error={contentError !== undefined}
                helperText={contentError ? "Content is required" : undefined}
                sx={{
                  ...interactiveTextFieldSx,
                  "& .MuiInputBase-inputMultiline": {
                    overflowY: "auto !important",
                    maxHeight: 320,
                  },
                }}
              />
            ) : (
              <ListItemsEditor
                items={listItems}
                moveCheckedToEnd={moveCheckedToEnd}
                error={contentError ? "List cannot be empty" : undefined}
                onTextChange={updateListText}
                onCheckedChange={updateListChecked}
                onRemove={removeListItem}
                onReorder={reorderListItems}
                onMoveCheckedToEndChange={handleMoveCheckedToEndChange}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
          >
            {loading ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
