import type { SxProps, Theme } from "@mui/material";

export const appBarPaperSx: SxProps<Theme> = {
  borderRadius: 4,
  px: 1,
  py: 0.5,
};

export const toolbarSx: SxProps<Theme> = {
  px: 1,
  gap: 1,
  minHeight: "56px !important",
};

export const userChipSx: SxProps<Theme> = {
  transition: "all 0.2s ease",
  "&:hover": { transform: "translateY(-1px)" },
};

export const logoutButtonSx: SxProps<Theme> = {
  transition: "all 0.2s ease",
  "&:hover": { transform: "translateY(-1px)" },
};

export const contentPaperSx: SxProps<Theme> = {
  mt: 1.5,
  borderRadius: 4,
  p: { xs: 1, sm: 2 },
};

export const tabsSx: SxProps<Theme> = {
  mb: 2,
  "& .MuiTab-root": {
    textTransform: "none",
    fontWeight: 600,
    minHeight: 38,
    borderRadius: 2,
    transition: "all 0.2s ease",
    "&:hover": { bgcolor: "action.hover" },
  },
};
