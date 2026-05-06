import { Alert, Box } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { logoutCurrentSession } from "../lib/api/authApi";
import { AppFrame } from "../components/layout/AppFrame";
import { NotesPanel } from "../features/notes";
import { SessionsPanel } from "../features/sessions";
import { isAuthenticated, useAuthStore } from "../store/authStore";
import { useToast } from "../app/ToastProvider";
import { getApiErrorMessage } from "../lib/api/http";

type AppTab = "notes" | "sessions";

export function AppPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<AppTab>("notes");
  const { user, clearAuth } = useAuthStore();
  const { showToast } = useToast();

  useEffect(() => {
    if (!isAuthenticated()) {
      void navigate({ to: "/" });
    }
  }, [navigate]);

  const logoutMutation = useMutation({
    mutationFn: logoutCurrentSession,
    onSuccess: () => {
      clearAuth();
      showToast("Logged out", "success");
      void navigate({ to: "/" });
    },
    onError: (error) => {
      clearAuth();
      showToast(getApiErrorMessage(error, "Session cleared locally"), "warning");
      void navigate({ to: "/" });
    },
  });

  return (
    <AppFrame
      activeTab={activeTab}
      onTabChange={setActiveTab}
      userEmail={user?.email}
      onLogout={() => {
        logoutMutation.mutate();
      }}
    >
      {logoutMutation.isError ? <Alert severity="warning">Failed to logout cleanly; local session was cleared.</Alert> : null}
      <Box sx={{ display: "grid", gap: 2 }}>
        {activeTab === "notes" ? <NotesPanel /> : null}
        {activeTab === "sessions" ? <SessionsPanel /> : null}
      </Box>
    </AppFrame>
  );
}
