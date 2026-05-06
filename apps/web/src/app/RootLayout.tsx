import { Box } from "@mui/material";
import { Outlet } from "@tanstack/react-router";

export function RootLayout() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, rgba(18,115,234,0.08) 0%, rgba(10,161,127,0.08) 100%)",
      }}
    >
      <Outlet />
    </Box>
  );
}
