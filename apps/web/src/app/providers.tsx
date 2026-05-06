import { Box, CircularProgress } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { router } from "./router";
import { ThemeModeProvider } from "../theme/ThemeModeProvider";
import { refreshSession } from "../lib/api/authApi";
import { useAuthStore } from "../store/authStore";
import { ToastProvider } from "./ToastProvider";

function AuthBootstrapGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const setAuthSession = useAuthStore((state) => state.setAuthSession);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const response = await refreshSession();
        if (!active) {
          return;
        }
        setAuthSession({
          accessToken: response.tokens.accessToken,
          user: response.user,
        });
      } catch {
        if (active) {
          clearAuth();
        }
      } finally {
        if (active) {
          setReady(true);
        }
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, [clearAuth, setAuthSession]);

  if (!ready) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return <>{children}</>;
}

export function AppProviders() {
  const queryClient = useMemo(() => new QueryClient(), []);

  return (
    <ThemeModeProvider>
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          <AuthBootstrapGate>
            <RouterProvider router={router} />
          </AuthBootstrapGate>
          <TanStackRouterDevtools router={router} />
        </QueryClientProvider>
      </ToastProvider>
    </ThemeModeProvider>
  );
}
