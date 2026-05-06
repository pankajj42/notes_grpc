import { Box, Container, Paper, Stack, Typography } from "@mui/material";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AuthForm } from "../features/auth/components/AuthForm";
import { isAuthenticated } from "../store/authStore";

export function AuthPage() {
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated()) {
      void navigate({ to: "/app" });
    }
  }, [navigate]);

  return (
    <Container maxWidth="md" sx={{ py: 3, px: 1.5 }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: "stretch" }}>
        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 4,
            flex: 1,
            transition: "all 0.2s ease",
            "&:hover": { transform: "translateY(-2px)", boxShadow: 2 },
          }}
        >
          <Typography variant="h4" sx={{ mb: 1 }}>
            Welcome to Notes
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            A clean collaboration-inspired workspace for secure auth, notes, and session control.
          </Typography>
          <Box sx={{ display: "grid", gap: 1 }}>
            <Typography variant="body2">• RS256 access tokens and refresh rotation</Typography>
            <Typography variant="body2">• Mobile-first notes editor for TEXT and LIST notes</Typography>
            <Typography variant="body2">• Per-device session management and revocation</Typography>
          </Box>
        </Paper>
        <Box sx={{ flex: 1 }}>
          <AuthForm />
        </Box>
      </Stack>
    </Container>
  );
}
