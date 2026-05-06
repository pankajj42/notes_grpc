import { AppBar, Box, Button, Chip, Paper, Toolbar, Tooltip, Typography } from "@mui/material";
import { ThemeModeToggleButton } from "../../theme/ThemeModeProvider";
import { appBarPaperSx, logoutButtonSx, toolbarSx, userChipSx } from "./appFrameStyles";

interface AppHeaderProps {
  userEmail: string | undefined;
  onLogout: () => void;
}

export function AppHeader({ userEmail, onLogout }: AppHeaderProps) {
  const username = userEmail?.split("@")[0];

  return (
    <AppBar position="static" color="transparent" elevation={0}>
      <Paper elevation={0} sx={appBarPaperSx}>
        <Toolbar disableGutters sx={toolbarSx}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>
              Notes
            </Typography>
          </Box>
          {userEmail != null ? (
            <Tooltip title={userEmail}>
              <Chip size="small" label={username} sx={userChipSx} />
            </Tooltip>
          ) : null}
          <ThemeModeToggleButton />
          <Tooltip title="Logout">
            <Button onClick={onLogout} variant="outlined" size="small" sx={logoutButtonSx}>
              Logout
            </Button>
          </Tooltip>
        </Toolbar>
      </Paper>
    </AppBar>
  );
}
