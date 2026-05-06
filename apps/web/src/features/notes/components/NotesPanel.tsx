import {
  Alert,
  Box,
  Chip,
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
  DeleteRounded,
  EditRounded,
  RefreshRounded,
} from "@mui/icons-material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  type NoteContentType,
  CreateNoteRequestSchema,
  ListNoteContentSchema,
  TextNoteContentSchema,
  UpdateNoteRequestSchema,
} from "@notes/shared-types";
import { createNote, deleteNote, getNote, getNotes, updateNote } from "../../../lib/api/notesApi";
import { queryKeys } from "../../../lib/queryKeys";
import { NoteEditorDialog } from "./NoteEditorDialog";
import { useToast } from "../../../app/ToastProvider";
import { getApiErrorMessage } from "../../../lib/api/http";

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
    onError: (_error, _vars, context) => {
      if (context?.previous != null) {
        queryClient.setQueryData(notesQueryKey, context.previous);
      }
      showToast("Failed to create note", "error");
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
    onError: (_error, _vars, context) => {
      if (context?.previous != null) {
        queryClient.setQueryData(notesQueryKey, context.previous);
      }
      showToast("Failed to update note", "error");
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
    onError: (_error, _vars, context) => {
      if (context?.previous != null) {
        queryClient.setQueryData(notesQueryKey, context.previous);
      }
      showToast("Failed to delete note", "error");
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

    try {
      const parsed = JSON.parse(selectedNote.content) as unknown;
      if (selectedNote.contentType === "TEXT") {
        const result = TextNoteContentSchema.safeParse(parsed);
        if (result.success) {
          return { kind: "text" as const, text: result.data.text };
        }
      }

      if (selectedNote.contentType === "LIST") {
        const result = ListNoteContentSchema.safeParse(parsed);
        if (result.success) {
          return { kind: "list" as const, items: result.data.items };
        }
      }
    } catch {
      return { kind: "invalid" as const, raw: selectedNote.content };
    }

    return { kind: "invalid" as const, raw: selectedNote.content };
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
      <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { xs: "stretch", sm: "center" } }}>
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
                sx={{ minWidth: 150, transition: "all 0.2s ease", "&:hover": { transform: "translateY(-1px)" } }}
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
              sx={{ bgcolor: "primary.main", color: "primary.contrastText", transition: "all 0.2s ease", "&:hover": { bgcolor: "primary.dark", transform: "translateY(-1px)" } }}
            >
              <AddRounded />
            </IconButton>
          </Tooltip>

          <Tooltip title="Refresh notes">
            <IconButton
              onClick={() => {
                void notesQuery.refetch();
              }}
              sx={{ transition: "all 0.2s ease", "&:hover": { transform: "translateY(-1px)" } }}
            >
              <RefreshRounded />
            </IconButton>
          </Tooltip>
        </Stack>
      </Paper>

      {notesQuery.isError ? <Alert severity="error">{getApiErrorMessage(notesQuery.error, "Failed to fetch notes.")}</Alert> : null}

      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <Paper elevation={0} sx={{ borderRadius: 3, p: 1, flex: 1 }}>
          <Stack spacing={1}>
            {notes.map((note) => (
              <Paper
                key={note.id}
                elevation={0}
                onClick={() => {
                  setSelectedNoteId(note.id);
                }}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  border: (theme) => `1px solid ${theme.palette.divider}`,
                  bgcolor: selectedNoteId === note.id ? "action.selected" : "background.paper",
                  "&:hover": { transform: "translateY(-1px)", bgcolor: "action.hover" },
                }}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography sx={{ fontWeight: 600 }}>{note.title}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(note.updatedAt).toLocaleString()}
                    </Typography>
                  </Box>
                  <Chip label={note.contentType} size="small" />
                  <Tooltip title="Edit note">
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); openEdit(note.id); }} sx={{ "&:hover": { bgcolor: "action.hover" } }}>
                      <EditRounded fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete note">
                    <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(note.id); }} sx={{ "&:hover": { bgcolor: "error.lighter" } }}>
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
            ) : (
              <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
                Page {notesQuery.data?.pagination.page ?? 1} of {notesQuery.data?.pagination.totalPages ?? 1}
              </Typography>
            )}
          </Stack>
        </Paper>

        { hasNotes ? (
          <Paper elevation={0} sx={{ borderRadius: 3, p: 2, flex: 1 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Note detail</Typography>
            {selectedNoteQuery.isLoading ? <Typography color="text.secondary">Loading note...</Typography> : null}
            {selectedNoteQuery.isError ? <Alert severity="error">{getApiErrorMessage(selectedNoteQuery.error, "Failed to load note details.")}</Alert> : null}
            {selectedNote == null ? <Typography color="text.secondary">Select a note to view full details.</Typography> : null}
            {selectedNote != null ? (
              <Stack spacing={1}>
                <Typography sx={{ fontWeight: 700 }}>{selectedNote.title}</Typography>
                <Chip label={selectedNote.contentType} size="small" sx={{ width: "fit-content" }} />
                <Paper elevation={0} sx={{ p: 1.5, borderRadius: 2, bgcolor: "action.hover" }}>
                  {selectedNoteContent?.kind === "text" ? (
                    <Box sx={{ maxHeight: 300, overflowY: "auto", pr: 0.5 }}>
                      <Typography sx={{ whiteSpace: "pre-wrap" }}>
                        {selectedNoteContent.text}
                      </Typography>
                    </Box>
                  ) : null}

                  {selectedNoteContent?.kind === "list" ? (
                    <Box sx={{ maxHeight: 300, overflowY: "auto", pr: 0.5 }}>
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
                    <Box sx={{ maxHeight: 300, overflowY: "auto", pr: 0.5 }}>
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
