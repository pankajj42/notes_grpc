import type { SxProps, Theme } from "@mui/material";

export const interactiveOutlinedInputSx: SxProps<Theme> = {
  "& .MuiOutlinedInput-root": {
    transition: "all 0.2s ease",
    "&:hover fieldset": { borderColor: "primary.main" },
  },
};

export const hoverLiftSx: SxProps<Theme> = {
  transition: "all 0.2s ease",
  "&:hover": { transform: "translateY(-1px)" },
};

export const toggleGroupSx: SxProps<Theme> = {
  "& .MuiToggleButton-root": {
    transition: "all 0.2s ease",
    "&:hover": { transform: "translateY(-1px)" },
  },
};
