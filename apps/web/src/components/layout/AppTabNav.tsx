import { Paper, Tab, Tabs } from "@mui/material";
import type { ReactNode } from "react";
import { contentPaperSx, tabsSx } from "./appFrameStyles";

type AppTab = "notes" | "sessions";

interface AppTabNavProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  children: ReactNode;
}

export function AppTabNav({ activeTab, onTabChange, children }: AppTabNavProps) {
  return (
    <Paper elevation={0} sx={contentPaperSx}>
      <Tabs
        value={activeTab}
        onChange={(_event, value: AppTab) => {
          onTabChange(value);
        }}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={tabsSx}
      >
        <Tab label="Notes" value="notes" />
        <Tab label="Sessions" value="sessions" />
      </Tabs>
      {children}
    </Paper>
  );
}
