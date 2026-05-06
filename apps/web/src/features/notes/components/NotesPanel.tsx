import {
  Alert,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  ToggleButton,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AddRounded,
  ArrowDownwardRounded,
  ArrowUpwardRounded,
  RefreshRounded,
} from "@mui/icons-material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  type NoteContentType,
  CreateNoteRequestSchema,
  UpdateNoteRequestSchema,
} from "@notes/shared-types";
import { createNote, deleteNote, getNote, getNotes, updateNote } from "../../../lib/api/notesApi";
import { queryKeys } from "../../../lib/queryKeys";
import { NoteEditorDialog } from "./NoteEditorDialog";
import { useToast } from "../../../app/ToastProvider";
import { getApiErrorMessage } from "../../../lib/api/http";
import { parseNoteContent } from "../utils/parseNoteContent";
import { NoteDetailsPanel } from "./NoteDetailsPanel";
import { NotesListPanel } from "./NotesListPanel";
import {
  addButtonSx,
  iconHoverLiftSx,
  notesHeaderPaperSx,
  notesHeaderStackSx,
  sortSelectSx,
} from "./notesStyles";

type SortBy = "createdAt" | "updatedAt" | "title";
type SortOrder = "asc" | "desc";

export function NotesPanel() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [page] = useState(1);
  const [pageSize] = useState(20);
  const [sortBy, setSortBy] = useState<SortBy>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [selectedNoteId, setSelectedNoteId] = useState<string | undefined>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");

  const notesQuery = useQuery({
    queryKey: queryKeys.notes(page, pageSize, sortBy, sortOrder),
    queryFn: () => getNotes({ page, pageSize, sortBy, sortOrder }),
  });

  const notesQueryKey = queryKeys.notes(page, pageSize, sortBy, sortOrder);

  const selectedNoteQuery = useQuery({
    queryKey: selectedNoteId == null ? ["note-empty"] : queryKeys.noteById(selectedNoteId),
    queryFn: () => {
      if (selectedNoteId == null) {
        throw new Error("No note selected");
      }
      return getNote(selectedNoteId);
    },
    enabled: selectedNoteId != null,
  });

  const createMutation = useMutation({
    mutationFn: createNote,
    onMutate: async (newNote) => {
      await queryClient.cancelQueries({ queryKey: notesQueryKey });
      const previous = queryClient.getQueryData<{ notes: unknown[]; pagination: { total: number; page: number; pageSize: number; totalPages: number } }>(notesQueryKey);

      if (previous != null) {
        const optimistic = {
          id: `optimistic-${String(Date.now())}`,
          userId: "optimistic",
          title: newNote.title,
          contentType: newNote.contentType,
          content: newNote.content,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        queryClient.setQueryData(notesQueryKey, {
          ...previous,
          notes: [optimistic, ...previous.notes],
          pagination: {
            ...previous.pagination,
            total: previous.pagination.total + 1,
          },
        });
      }

      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous != null) {
        queryClient.setQueryData(notesQueryKey, context.previous);
      }
      showToast(getApiErrorMessage(error, "Failed to create note"), "error");
    },
    onSuccess: () => {
      showToast("Note created", "success");
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
      setEditorOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateNote,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: notesQueryKey });
      const previous = queryClient.getQueryData<{ notes: { id: string; title: string; content: string; updatedAt: string }[]; pagination: { total: number; page: number; pageSize: number; totalPages: number } }>(notesQueryKey);

      if (previous != null) {
        queryClient.setQueryData(notesQueryKey, {
          ...previous,
          notes: previous.notes.map((note) => {
            if (note.id !== input.noteId) {
              return note;
            }
            return {
              ...note,
              title: input.title ?? note.title,
              content: input.content ?? note.content,
              updatedAt: new Date().toISOString(),
            };
          }),
        });
      }

      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous != null) {
        queryClient.setQueryData(notesQueryKey, context.previous);
      }
      showToast(getApiErrorMessage(error, "Failed to update note"), "error");
    },
    onSuccess: async (note) => {
      showToast("Note updated", "success");
      setSelectedNoteId(note.id);
      await queryClient.invalidateQueries({ queryKey: ["notes"] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.noteById(note.id) });
      setEditorOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteNote,
    onMutate: async (noteId) => {
      await queryClient.cancelQueries({ queryKey: notesQueryKey });
      const previous = queryClient.getQueryData<{ notes: { id: string }[]; pagination: { total: number; page: number; pageSize: number; totalPages: number } }>(notesQueryKey);

      if (previous != null) {
        queryClient.setQueryData(notesQueryKey, {
          ...previous,
          notes: previous.notes.filter((note) => note.id !== noteId),
          pagination: {
            ...previous.pagination,
            total: Math.max(0, previous.pagination.total - 1),
          },
        });
      }

      if (selectedNoteId === noteId) {
        setSelectedNoteId(undefined);
      }

      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous != null) {
        queryClient.setQueryData(notesQueryKey, context.previous);
      }
      showToast(getApiErrorMessage(error, "Failed to delete note"), "error");
    },
    onSuccess: async () => {
      showToast("Note deleted", "success");
      setSelectedNoteId(undefined);
      await queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
  });

  const selectedNote = useMemo(() => selectedNoteQuery.data, [selectedNoteQuery.data]);
  const selectedNoteContent = useMemo(() => {
    if (selectedNote == null) {
      return undefined;
    }

    return parseNoteContent(selectedNote);
  }, [selectedNote]);
  const notes = notesQuery.data?.notes ?? [];
  const hasNotes = notes.length > 0;

  const handleSortSelection = (field: SortBy) => {
    if (field === sortBy) {
      setSortOrder((previous) => (previous === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(field);
    setSortOrder("desc");
  };

  const sortArrow = sortOrder === "asc" ? <ArrowUpwardRounded fontSize="small" /> : <ArrowDownwardRounded fontSize="small" />;

  const openCreate = (): void => {
    setEditorMode("create");
    setEditorOpen(true);
  };

  const openEdit = (noteId: string): void => {
    setSelectedNoteId(noteId);
    setEditorMode("edit");
    setEditorOpen(true);
  };

  const handleSave = (payload: { title: string; contentType: NoteContentType; content: string }): void => {
    if (editorMode === "create") {
      const request = CreateNoteRequestSchema.parse(payload);
      createMutation.mutate(request);
      return;
    }

    if (selectedNoteId == null) {
      return;
    }

    const request = UpdateNoteRequestSchema.parse({
      noteId: selectedNoteId,
      title: payload.title,
      content: payload.content,
    });
    updateMutation.mutate(request);
  };

  return (
    <Stack spacing={2}>
      <Paper elevation={0} sx={notesHeaderPaperSx}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={notesHeaderStackSx}>
          {hasNotes ? (
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              Notes
            </Typography>
          ) : (
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              Add a new note
            </Typography>
          )}
          {hasNotes ? (
            <Tooltip title="Sort according">
              <Select<SortBy>
                value={sortBy}
                onChange={(event) => {
                  handleSortSelection(event.target.value);
                }}
                size="small"
                renderValue={(value) => {
                  const label = value === "createdAt" ? "Created" : value === "updatedAt" ? "Updated" : "Title";
                  return (
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                      {sortArrow}
                      <span>{label}</span>
                    </Stack>
                  );
                }}
                sx={sortSelectSx}
              >
                {(["createdAt", "updatedAt", "title"] as const).map((field) => {
                  const selected = sortBy === field;
                  const arrowIcon = selected
                    ? sortOrder === "asc"
                      ? <ArrowUpwardRounded fontSize="small" />
                      : <ArrowDownwardRounded fontSize="small" />
                    : <ArrowDownwardRounded fontSize="small" />;
                  const label = field === "createdAt" ? "Created" : field === "updatedAt" ? "Updated" : "Title";

                  return (
                    <MenuItem key={field} value={field}>
                      <Tooltip title="Sort according">
                        <Stack direction="row" sx={{ width: "100%" }}>
                          <ToggleButton
                            value={field}
                            selected={selected}
                            fullWidth
                            onClick={() => {
                              handleSortSelection(field);
                            }}
                            sx={{ justifyContent: "flex-start", gap: 0.75, textTransform: "none", transition: "all 0.2s ease", "&:hover": { bgcolor: "action.hover" } }}
                          >
                            {arrowIcon}
                            {label}
                          </ToggleButton>
                        </Stack>
                      </Tooltip>
                    </MenuItem>
                  );
                })}
              </Select>
            </Tooltip>
          ) : null}

          <Tooltip title="Add new note">
            <IconButton
              color="primary"
              onClick={openCreate}
              sx={addButtonSx}
            >
              <AddRounded />
            </IconButton>
          </Tooltip>

          <Tooltip title="Refresh notes">
            <IconButton
              onClick={() => {
                void notesQuery.refetch();
              }}
              sx={iconHoverLiftSx}
            >
              <RefreshRounded />
            </IconButton>
          </Tooltip>
        </Stack>
      </Paper>

      {notesQuery.isError ? <Alert severity="error">{getApiErrorMessage(notesQuery.error, "Failed to fetch notes.")}</Alert> : null}

      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <NotesListPanel
          notes={notes}
          selectedNoteId={selectedNoteId}
          page={notesQuery.data?.pagination.page ?? 1}
          totalPages={notesQuery.data?.pagination.totalPages ?? 1}
          onSelect={setSelectedNoteId}
          onEdit={openEdit}
          onDelete={(noteId) => {
            deleteMutation.mutate(noteId);
          }}
        />

        {hasNotes ? (
          <NoteDetailsPanel
            selectedNote={selectedNote}
            selectedNoteContent={selectedNoteContent}
            isLoading={selectedNoteQuery.isLoading}
            errorMessage={selectedNoteQuery.isError ? getApiErrorMessage(selectedNoteQuery.error, "Failed to load note details.") : undefined}
          />
        ) : null}
      </Stack>

      <NoteEditorDialog
        open={editorOpen}
        mode={editorMode}
        note={selectedNote}
        onClose={() => {
          setEditorOpen(false);
        }}
        onSubmit={handleSave}
        loading={createMutation.isPending || updateMutation.isPending}
      />
    </Stack>
  );
}
