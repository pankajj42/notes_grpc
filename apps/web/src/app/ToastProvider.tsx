import { Alert, Snackbar } from "@mui/material";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type ToastSeverity = "success" | "info" | "warning" | "error";

type ToastItem = {
  id: number;
  message: string;
  severity: ToastSeverity;
};

type ToastContextValue = {
  showToast: (message: string, severity?: ToastSeverity) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, severity: ToastSeverity = "info") => {
    setQueue((previous) => [
      ...previous,
      { id: Date.now() + Math.floor(Math.random() * 10_000), message, severity },
    ]);
  }, []);

  const activeToast = queue[0];

  const closeActiveToast = useCallback(() => {
    setQueue((previous) => previous.slice(1));
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Snackbar
        open={activeToast !== undefined}
        autoHideDuration={3500}
        onClose={closeActiveToast}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={closeActiveToast}
          severity={activeToast?.severity ?? "info"}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {activeToast?.message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (value === undefined) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return value;
}
