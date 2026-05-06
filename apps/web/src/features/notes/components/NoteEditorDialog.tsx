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
import { useEffect, useState } from "react";
import {
  type Note,
  type NoteContentType,
  CreateNoteRequestSchema,
} from "@notes/shared-types";
import { ListItemsEditor } from "./ListItemsEditor";
import { hoverLiftToggleButtonsSx, interactiveTextFieldSx } from "./noteEditorStyles";
import {
  EMPTY_LIST_ITEM,
  getInitialEditorState,
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
  const [listItems, setListItems] = useState<EditableListItem[]>([{ ...EMPTY_LIST_ITEM }]);
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
    setTitleError(undefined);
    setContentError(undefined);
  }, [mode, note, open]);

  const updateListText = (index: number, value: string) => {
    setListItems((previous) => {
      const next = previous.map((item, itemIndex) => (itemIndex === index ? { ...item, text: value } : item));
      return withDraftRow(next);
    });
  };

  const updateListChecked = (index: number, checked: boolean) => {
    setListItems((previous) => previous.map((item, itemIndex) => (itemIndex === index ? { ...item, checked } : item)));
  };

  const removeListItem = (index: number) => {
    setListItems((previous) => {
      const next = previous.filter((_item, itemIndex) => itemIndex !== index);
      return withDraftRow(next);
    });
  };

  const submit = () => {
    setTitleError(undefined);
    setContentError(undefined);

    const content = serializeEditorContent({ contentType, textContent, listItems });

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
                error={contentError !== undefined}
                helperText={contentError ?? "Saved as JSON: { text: string }"}
                sx={interactiveTextFieldSx}
              />
            ) : (
              <ListItemsEditor
                items={listItems}
                error={contentError}
                onTextChange={updateListText}
                onCheckedChange={updateListChecked}
                onRemove={removeListItem}
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
