import { Alert, Box, Chip, Paper, Stack, ToggleButton, Typography } from "@mui/material";
import type { Note } from "@notes/shared-types";
import type { ParsedNoteContent } from "../utils/parseNoteContent";
import { noteContentBoxSx, noteDetailsPaperSx } from "./notesStyles";

type NoteDetailsPanelProps = {
  selectedNote: Note | undefined;
  selectedNoteContent: ParsedNoteContent | undefined;
  isLoading: boolean;
  errorMessage: string | undefined;
};

export function NoteDetailsPanel({ selectedNote, selectedNoteContent, isLoading, errorMessage }: NoteDetailsPanelProps) {
  return (
    <Paper elevation={0} sx={noteDetailsPaperSx}>
      <Typography variant="h6" sx={{ mb: 1 }}>Note detail</Typography>
      {isLoading ? <Typography color="text.secondary">Loading note...</Typography> : null}
      {errorMessage != null ? <Alert severity="error">{errorMessage}</Alert> : null}
      {selectedNote == null ? <Typography color="text.secondary">Select a note to view full details.</Typography> : null}
      {selectedNote != null ? (
        <Stack spacing={1}>
          <Typography sx={{ fontWeight: 700 }}>{selectedNote.title}</Typography>
          <Chip label={selectedNote.contentType} size="small" sx={{ width: "fit-content" }} />
          <Paper elevation={0} sx={{ p: 1.5, borderRadius: 2, bgcolor: "action.hover" }}>
            {selectedNoteContent?.kind === "text" ? (
              <Box sx={noteContentBoxSx}>
                <Typography sx={{ whiteSpace: "pre-wrap" }}>
                  {selectedNoteContent.text}
                </Typography>
              </Box>
            ) : null}

            {selectedNoteContent?.kind === "list" ? (
              <Box sx={noteContentBoxSx}>
                {selectedNoteContent.moveCheckedToEnd ? (
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
                    ✓ Checked items to end
                  </Typography>
                ) : null}
                {selectedNoteContent.items.length === 0 ? (
                  <Typography color="text.secondary">No list items.</Typography>
                ) : (
                  <Stack spacing={0.75}>
                    {selectedNoteContent.items.map((item, index) => (
                      <Stack key={`${selectedNote.id}-item-${String(index)}`} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <ToggleButton
                          value={`item-${String(index)}`}
                          selected={item.checked}
                          disabled
                          size="small"
                          sx={{ minWidth: 34, width: 34, height: 34, p: 0, borderRadius: 1.5 }}
                        >
                          {item.checked ? "✓" : ""}
                        </ToggleButton>
                        <Typography sx={{ textDecoration: item.checked ? "line-through" : "none", color: item.checked ? "text.secondary" : "text.primary" }}>
                          {item.text}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                )}
              </Box>
            ) : null}

            {selectedNoteContent?.kind === "invalid" ? (
              <Box sx={noteContentBoxSx}>
                <Alert severity="warning" sx={{ mb: 1 }}>
                  Could not parse note content. Showing raw text.
                </Alert>
                <Typography sx={{ whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
                  {selectedNoteContent.raw}
                </Typography>
              </Box>
            ) : null}
          </Paper>
        </Stack>
      ) : null}
    </Paper>
  );
}
