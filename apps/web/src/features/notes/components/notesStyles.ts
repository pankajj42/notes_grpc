import type { SxProps, Theme } from "@mui/material";

export const notesHeaderPaperSx: SxProps<Theme> = { p: 2.5, borderRadius: 3 };

export const notesHeaderStackSx: SxProps<Theme> = {
  alignItems: { xs: "stretch", sm: "center" },
};

export const sortSelectSx: SxProps<Theme> = {
  minWidth: 150,
  transition: "all 0.2s ease",
  "&:hover": { transform: "translateY(-1px)" },
};

export const addButtonSx: SxProps<Theme> = {
  bgcolor: "primary.main",
  color: "primary.contrastText",
  transition: "all 0.2s ease",
  "&:hover": { bgcolor: "primary.dark", transform: "translateY(-1px)" },
};

export const iconHoverLiftSx: SxProps<Theme> = {
  transition: "all 0.2s ease",
  "&:hover": { transform: "translateY(-1px)" },
};

export const notesListContainerSx: SxProps<Theme> = { borderRadius: 3, p: 1, flex: 1 };

export const getNoteListItemSx = (isSelected: boolean): SxProps<Theme> => ({
  p: 1.5,
  borderRadius: 2,
  cursor: "pointer",
  transition: "all 0.2s ease",
  border: (theme) => `1px solid ${theme.palette.divider}`,
  bgcolor: isSelected ? "action.selected" : "background.paper",
  "&:hover": { transform: "translateY(-1px)", bgcolor: "action.hover" },
});

export const noteDetailsPaperSx: SxProps<Theme> = { borderRadius: 3, p: 2, flex: 1 };

export const noteContentBoxSx: SxProps<Theme> = { maxHeight: 300, overflowY: "auto", pr: 0.5 };
