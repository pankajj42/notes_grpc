import { Box, Container } from "@mui/material";
import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { AppTabNav } from "./AppTabNav";

type AppTab = "notes" | "sessions";

interface AppFrameProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  userEmail: string | undefined;
  onLogout: () => void;
  children: ReactNode;
}

export function AppFrame({ activeTab, onTabChange, userEmail, onLogout, children }: AppFrameProps) {
  return (
    <Box sx={{ minHeight: "100vh", py: 2 }}>
      <Container maxWidth="md" sx={{ px: { xs: 1.5, sm: 2.5 } }}>
        <AppHeader userEmail={userEmail} onLogout={onLogout} />
        <AppTabNav activeTab={activeTab} onTabChange={onTabChange}>
          {children}
        </AppTabNav>
      </Container>
    </Box>
  );
}
