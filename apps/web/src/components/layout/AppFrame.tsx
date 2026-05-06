import {
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  Paper,
  Tab,
  Tabs,
  Tooltip,
  Toolbar,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";
import { ThemeModeToggleButton } from "../../theme/ThemeModeProvider";

type AppTab = "notes" | "sessions";

interface AppFrameProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  userEmail: string | undefined;
  onLogout: () => void;
  children: ReactNode;
}

export function AppFrame({ activeTab, onTabChange, userEmail, onLogout, children }: AppFrameProps) {
  const username = userEmail?.split("@")[0];

  return (
    <Box sx={{ minHeight: "100vh", py: 2 }}>
      <Container maxWidth="md" sx={{ px: { xs: 1.5, sm: 2.5 } }}>
        <AppBar position="static" color="transparent" elevation={0}>
          <Paper elevation={0} sx={{ borderRadius: 4, px: 1, py: 0.5 }}>
            <Toolbar disableGutters sx={{ px: 1, gap: 1, minHeight: "56px !important" }}>
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 900 }}>
                  Notes
                </Typography>
              </Box>
              {userEmail != null ? (
                <Tooltip title={userEmail}>
                  <Chip
                    size="small"
                    label={username}
                    sx={{ transition: "all 0.2s ease", "&:hover": { transform: "translateY(-1px)" } }}
                  />
                </Tooltip>
              ) : null}
              <ThemeModeToggleButton />
              <Tooltip title="Logout">
                <Button onClick={onLogout} variant="outlined" size="small" sx={{ transition: "all 0.2s ease", "&:hover": { transform: "translateY(-1px)" } }}>
                  Logout
                </Button>
              </Tooltip>
            </Toolbar>
          </Paper>
        </AppBar>

        <Paper elevation={0} sx={{ mt: 1.5, borderRadius: 4, p: { xs: 1, sm: 2 } }}>
          <Tabs
            value={activeTab}
            onChange={(_event, value: AppTab) => {
              onTabChange(value);
            }}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{
              mb: 2,
              "& .MuiTab-root": {
                textTransform: "none",
                fontWeight: 600,
                minHeight: 38,
                borderRadius: 2,
                transition: "all 0.2s ease",
                "&:hover": { bgcolor: "action.hover" },
              },
            }}
          >
            <Tab label="Notes" value="notes" />
            <Tab label="Sessions" value="sessions" />
          </Tabs>
          {children}
        </Paper>
      </Container>
    </Box>
  );
}
