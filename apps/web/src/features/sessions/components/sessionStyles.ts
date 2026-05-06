import type { SxProps, Theme } from "@mui/material";

export const sessionsHeaderPaperSx: SxProps<Theme> = {
  p: 2.5,
  borderRadius: 3,
};

export const sessionsHeaderRowSx: SxProps<Theme> = {
  alignItems: { xs: "stretch", sm: "center" },
};

export const sessionMetaTextSx: SxProps<Theme> = {
  fontWeight: 700,
};

export const getSessionCardSx = (isCurrent: boolean): SxProps<Theme> => ({
  p: 2,
  borderRadius: 3,
  border: isCurrent ? "2px solid" : "1px solid",
  borderColor: isCurrent ? "primary.main" : "divider",
  bgcolor: isCurrent ? "primary.50" : "background.paper",
});
