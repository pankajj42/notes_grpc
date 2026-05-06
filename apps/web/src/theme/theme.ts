import { createTheme, type Theme } from "@mui/material/styles";

export function createAppTheme(mode: "light" | "dark"): Theme {
  const isLight = mode === "light";

  return createTheme({
    palette: {
      mode,
      primary: {
        main: isLight ? "#1273EA" : "#6DA8FF",
      },
      secondary: {
        main: isLight ? "#0AA17F" : "#4DD5B7",
      },
      background: {
        default: isLight ? "#EEF3FB" : "#0E1624",
        paper: isLight ? "#FFFFFF" : "#142238",
      },
    },
    shape: {
      borderRadius: 16,
    },
    typography: {
      fontFamily: '"Plus Jakarta Sans", "Segoe UI", sans-serif',
      h4: {
        fontWeight: 700,
      },
      h5: {
        fontWeight: 700,
      },
    },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: "none",
            fontWeight: 600,
          },
        },
      },
    },
  });
}
