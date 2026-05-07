import { Alert, Box, Checkbox, FormControlLabel, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { DeleteRounded, DragIndicatorRounded } from "@mui/icons-material";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { EditableListItem } from "../utils/noteEditorContent";
import { interactiveTextFieldSx, listScrollContainerSx } from "./noteEditorStyles";

// ---------------------------------------------------------------------------
// Sortable row sub-component
// ---------------------------------------------------------------------------

type SortableListItemProps = {
  item: EditableListItem;
  index: number;
  isDraftRow: boolean;
  onTextChange: (index: number, value: string) => void;
  onCheckedChange: (index: number, checked: boolean) => void;
  onRemove: (index: number) => void;
};

function SortableListItem({
  item,
  index,
  isDraftRow,
  onTextChange,
  onCheckedChange,
  onRemove,
}: SortableListItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: isDraftRow });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    zIndex: isDragging ? 1 : "auto",
  };

  return (
    <Stack
      ref={setNodeRef}
      style={style}
      direction="row"
      spacing={1}
      sx={{ alignItems: "center" }}
    >
      {/* Drag handle — hidden on the draft row */}
      {isDraftRow ? (
        <Box sx={{ width: 32 }} />
      ) : (
        <Tooltip title="Drag to reorder">
          <IconButton
            size="small"
            {...attributes}
            {...listeners}
            sx={{
              cursor: "grab",
              color: "text.disabled",
              "&:active": { cursor: "grabbing" },
              "&:hover": { color: "text.secondary" },
            }}
            tabIndex={-1}
          >
            <DragIndicatorRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      )}

      <Checkbox
        checked={item.checked}
        onChange={(_event, checked) => {
          onCheckedChange(index, checked);
        }}
      />

      <TextField
        label={`Item ${String(index + 1)}`}
        value={item.text}
        onChange={(event) => {
          onTextChange(index, event.target.value);
        }}
        sx={interactiveTextFieldSx}
        fullWidth
      />

      {!isDraftRow ? (
        <Tooltip title="Delete item">
          <IconButton
            color="error"
            onClick={() => {
              onRemove(index);
            }}
            sx={{ "&:hover": { bgcolor: "error.lighter" } }}
          >
            <DeleteRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : null}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Main editor component
// ---------------------------------------------------------------------------

type ListItemsEditorProps = {
  items: EditableListItem[];
  moveCheckedToEnd: boolean;
  error: string | undefined;
  onTextChange: (index: number, value: string) => void;
  onCheckedChange: (index: number, checked: boolean) => void;
  onRemove: (index: number) => void;
  onReorder: (oldIndex: number, newIndex: number) => void;
  onMoveCheckedToEndChange: (value: boolean) => void;
};

export function ListItemsEditor({
  items,
  moveCheckedToEnd,
  error,
  onTextChange,
  onCheckedChange,
  onRemove,
  onReorder,
  onMoveCheckedToEndChange,
}: ListItemsEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over == null || active.id === over.id) return;

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);

    // Don't allow dragging onto or past the draft row
    const draftIndex = items.length - 1;
    const isDraftDragTarget = items[newIndex]?.text.trim() === "" && newIndex === draftIndex;
    if (oldIndex === -1 || newIndex === -1 || isDraftDragTarget) return;

    onReorder(oldIndex, newIndex);
  };

  // The sortable context only gets IDs for non-draft items (draft row is not draggable)
  const sortableIds = items.map((item) => item.id);

  return (
    <Stack spacing={1.25}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          Keep typing in the last row to add more list items automatically.
        </Typography>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={moveCheckedToEnd}
              onChange={(_e, checked) => {
                onMoveCheckedToEndChange(checked);
              }}
            />
          }
          label={
            <Typography variant="body2" color="text.secondary">
              Move checked to end
            </Typography>
          }
        />
      </Stack>

      <Box sx={listScrollContainerSx}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <Stack spacing={1}>
              {items.map((item, index) => {
                const isDraftRow = index === items.length - 1 && item.text.trim() === "";
                return (
                  <SortableListItem
                    key={item.id}
                    item={item}
                    index={index}
                    isDraftRow={isDraftRow}
                    onTextChange={onTextChange}
                    onCheckedChange={onCheckedChange}
                    onRemove={onRemove}
                  />
                );
              })}
            </Stack>
          </SortableContext>
        </DndContext>
      </Box>

      {error != null ? <Alert severity="error">{error}</Alert> : null}
    </Stack>
  );
}
