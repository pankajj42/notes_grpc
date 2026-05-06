import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { DeleteRounded } from "@mui/icons-material";
import { useEffect, useState } from "react";
import {
  type ListNoteContent,
  type Note,
  type NoteContentType,
  type TextNoteContent,
  CreateNoteRequestSchema,
  ListNoteContentSchema,
  TextNoteContentSchema,
} from "@notes/shared-types";

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
  const [listItems, setListItems] = useState<Array<{ text: string; checked: boolean }>>([{ text: "", checked: false }]);
  const [titleError, setTitleError] = useState<string | undefined>();
  const [contentError, setContentError] = useState<string | undefined>();

  useEffect(() => {
    if (!open) {
      return;
    }

    if (mode === "edit" && note != null) {
      setTitle(note.title);
      setContentType(note.contentType);

      try {
        const parsed = JSON.parse(note.content) as unknown;
        if (note.contentType === "TEXT") {
          const textParsed = TextNoteContentSchema.safeParse(parsed);
          setTextContent(textParsed.success ? textParsed.data.text : "");
          setListItems([{ text: "", checked: false }]);
        } else {
          const listParsed = ListNoteContentSchema.safeParse(parsed);
          const items = listParsed.success ? listParsed.data.items : [];
          setListItems([...items, { text: "", checked: false }]);
          setTextContent("");
        }
      } catch {
        setTextContent("");
        setListItems([{ text: "", checked: false }]);
      }

      setTitleError(undefined);
      setContentError(undefined);
      return;
    }

    setTitle("");
    setContentType("TEXT");
    setTextContent("");
    setListItems([{ text: "", checked: false }]);
    setTitleError(undefined);
    setContentError(undefined);
  }, [mode, note, open]);

  const updateListText = (index: number, value: string) => {
    setListItems((previous) => {
      const next = previous.map((item, itemIndex) => (itemIndex === index ? { ...item, text: value } : item));
      const last = next[next.length - 1];
      if (last != null && last.text.trim() !== "") {
        next.push({ text: "", checked: false });
      }
      return next;
    });
  };

  const updateListChecked = (index: number, checked: boolean) => {
    setListItems((previous) => previous.map((item, itemIndex) => (itemIndex === index ? { ...item, checked } : item)));
  };

  const removeListItem = (index: number) => {
    setListItems((previous) => {
      const next = previous.filter((_item, itemIndex) => itemIndex !== index);
      if (next.length === 0) {
        return [{ text: "", checked: false }];
      }

      const last = next[next.length - 1];
      if (last != null && last.text.trim() !== "") {
        next.push({ text: "", checked: false });
      }

      return next;
    });
  };

  const submit = () => {
    setTitleError(undefined);
    setContentError(undefined);

    const content =
      contentType === "TEXT"
        ? JSON.stringify(({ text: textContent } satisfies TextNoteContent))
        : JSON.stringify({
            items: listItems.filter((item) => item.text.trim() !== "").map((item) => ({ text: item.text, checked: item.checked })),
          } satisfies ListNoteContent);

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
              sx={{
                alignSelf: "flex-start",
                "& .MuiToggleButton-root": {
                  textTransform: "none",
                  transition: "all 0.2s ease",
                  "&:hover": { transform: "translateY(-1px)" },
                },
              }}
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
              sx={{ "& .MuiOutlinedInput-root": { transition: "all 0.2s ease", "&:hover fieldset": { borderColor: "primary.main" } } }}
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
                sx={{ "& .MuiOutlinedInput-root": { transition: "all 0.2s ease", "&:hover fieldset": { borderColor: "primary.main" } } }}
              />
            ) : (
              <Stack spacing={1.25}>
                <Typography variant="body2" color="text.secondary">
                  Keep typing in the last row to add more list items automatically.
                </Typography>
                <Box sx={{ maxHeight: 280, overflowY: "auto", pr: 0.5 }}>
                  <Stack spacing={1}>
                    {listItems.map((item, index) => {
                      const isDraftRow = index === listItems.length - 1 && item.text.trim() === "";
                      return (
                        <Stack key={`item-${String(index)}`} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                          <Checkbox
                            checked={item.checked}
                            onChange={(_event, checked) => {
                              updateListChecked(index, checked);
                            }}
                          />
                          <TextField
                            label={`Item ${String(index + 1)}`}
                            value={item.text}
                            onChange={(event) => {
                              updateListText(index, event.target.value);
                            }}
                            sx={{ "& .MuiOutlinedInput-root": { transition: "all 0.2s ease", "&:hover fieldset": { borderColor: "primary.main" } } }}
                            fullWidth
                          />
                          {!isDraftRow ? (
                            <Tooltip title="Delete item">
                              <IconButton
                                color="error"
                                onClick={() => {
                                  removeListItem(index);
                                }}
                                sx={{ "&:hover": { bgcolor: "error.lighter" } }}
                              >
                                <DeleteRounded fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          ) : null}
                        </Stack>
                      );
                    })}
                  </Stack>
                </Box>
                {contentError != null ? <Alert severity="error">{contentError}</Alert> : null}
              </Stack>
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
