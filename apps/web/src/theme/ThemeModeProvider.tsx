import { CssBaseline, IconButton, Tooltip } from "@mui/material";
import { DarkModeRounded, LightModeRounded } from "@mui/icons-material";
import { ThemeProvider as MuiThemeProvider } from "@mui/material/styles";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { createAppTheme } from "./theme";

type ThemeMode = "light" | "dark";

type ThemeModeContextValue = {
  mode: ThemeMode;
  toggleMode: () => void;
};

const ThemeModeContext = createContext<ThemeModeContextValue | undefined>(undefined);

function getInitialMode(): ThemeMode {
  const saved = localStorage.getItem("notes-theme-mode");
  return saved === "light" || saved === "dark" ? saved : "light";
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(getInitialMode);

  const toggleMode = (): void => {
    setMode((previous) => {
      const next = previous === "light" ? "dark" : "light";
      localStorage.setItem("notes-theme-mode", next);
      return next;
    });
  };

  const value = useMemo(() => ({ mode, toggleMode }), [mode]);
  const theme = useMemo(() => createAppTheme(mode), [mode]);

  return (
    <ThemeModeContext.Provider value={value}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode(): ThemeModeContextValue {
  const value = useContext(ThemeModeContext);
  if (value === undefined) {
    throw new Error("useThemeMode must be used inside ThemeModeProvider");
  }
  return value;
}

export function ThemeModeToggleButton() {
  const { mode, toggleMode } = useThemeMode();

  return (
    <Tooltip title={mode === "light" ? "Switch to dark" : "Switch to light"}>
      <IconButton color="inherit" onClick={toggleMode} aria-label="toggle color mode">
        {mode === "light" ? <DarkModeRounded /> : <LightModeRounded />}
      </IconButton>
    </Tooltip>
  );
}
