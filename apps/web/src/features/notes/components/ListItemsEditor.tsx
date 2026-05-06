import { Alert, Box, Checkbox, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { DeleteRounded } from "@mui/icons-material";
import type { EditableListItem } from "../utils/noteEditorContent";
import { interactiveTextFieldSx, listScrollContainerSx } from "./noteEditorStyles";

type ListItemsEditorProps = {
  items: EditableListItem[];
  error: string | undefined;
  onTextChange: (index: number, value: string) => void;
  onCheckedChange: (index: number, checked: boolean) => void;
  onRemove: (index: number) => void;
};

export function ListItemsEditor({ items, error, onTextChange, onCheckedChange, onRemove }: ListItemsEditorProps) {
  return (
    <Stack spacing={1.25}>
      <Typography variant="body2" color="text.secondary">
        Keep typing in the last row to add more list items automatically.
      </Typography>
      <Box sx={listScrollContainerSx}>
        <Stack spacing={1}>
          {items.map((item, index) => {
            const isDraftRow = index === items.length - 1 && item.text.trim() === "";
            return (
              <Stack key={`item-${String(index)}`} direction="row" spacing={1} sx={{ alignItems: "center" }}>
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
          })}
        </Stack>
      </Box>
      {error != null ? <Alert severity="error">{error}</Alert> : null}
    </Stack>
  );
}
