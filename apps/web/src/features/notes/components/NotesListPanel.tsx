import { Chip, IconButton, Pagination, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { DeleteRounded, EditRounded } from "@mui/icons-material";
import type { Note } from "@notes/shared-types";
import { getNoteListItemSx, notesListContainerSx } from "./notesStyles";

type NotesListPanelProps = {
  notes: Note[];
  selectedNoteId: string | undefined;
  page: number;
  totalPages: number;
  onSelect: (noteId: string) => void;
  onEdit: (noteId: string) => void;
  onDelete: (noteId: string) => void;
  onPageChange: (page: number) => void;
};

export function NotesListPanel({
  notes,
  selectedNoteId,
  page,
  totalPages,
  onSelect,
  onEdit,
  onDelete,
  onPageChange,
}: NotesListPanelProps) {
  const hasNotes = notes.length > 0;

  return (
    <Paper elevation={0} sx={notesListContainerSx}>
      <Stack spacing={1}>
        {notes.map((note) => (
          <Paper
            key={note.id}
            elevation={0}
            onClick={() => {
              onSelect(note.id);
            }}
            sx={getNoteListItemSx(selectedNoteId === note.id)}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Stack sx={{ flexGrow: 1 }}>
                <Typography sx={{ fontWeight: 600 }}>{note.title}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {new Date(note.updatedAt).toLocaleString()}
                </Typography>
              </Stack>
              <Chip label={note.contentType} size="small" />
              <Tooltip title="Edit note">
                <IconButton size="small" onClick={(event) => { event.stopPropagation(); onEdit(note.id); }} sx={{ "&:hover": { bgcolor: "action.hover" } }}>
                  <EditRounded fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete note">
                <IconButton size="small" color="error" onClick={(event) => { event.stopPropagation(); onDelete(note.id); }} sx={{ "&:hover": { bgcolor: "error.lighter" } }}>
                  <DeleteRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Paper>
        ))}

        {!hasNotes ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>
            No notes yet. Create your first note to get started.
          </Typography>
        ) : null}

        {totalPages > 1 ? (
          <Stack sx={{ alignItems: "center", pt: 0.5 }}>
            <Pagination
              count={totalPages}
              page={page}
              onChange={(_event, value) => {
                onPageChange(value);
              }}
              size="small"
              shape="rounded"
              showFirstButton
              showLastButton
              siblingCount={1}
              boundaryCount={1}
              sx={{ "& .MuiPagination-ul": { flexWrap: "wrap", justifyContent: "center" } }}
            />
          </Stack>
        ) : null}
      </Stack>
    </Paper>
  );
}
