import type { SxProps, Theme } from "@mui/material";

export const hoverLiftToggleButtonsSx: SxProps<Theme> = {
  alignSelf: "flex-start",
  "& .MuiToggleButton-root": {
    textTransform: "none",
    transition: "all 0.2s ease",
    "&:hover": { transform: "translateY(-1px)" },
  },
};

export const interactiveTextFieldSx: SxProps<Theme> = {
  "& .MuiOutlinedInput-root": {
    transition: "all 0.2s ease",
    "&:hover fieldset": { borderColor: "primary.main" },
  },
};

export const listScrollContainerSx: SxProps<Theme> = {
  maxHeight: 280,
  overflowY: "auto",
  pr: 0.5,
};
