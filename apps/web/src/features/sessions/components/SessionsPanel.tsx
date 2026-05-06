import {
  Alert,
  Button,
  IconButton,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { RefreshRounded } from "@mui/icons-material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listSessions, logoutAllSessions, revokeSession } from "../../../lib/api/authApi";
import { queryKeys } from "../../../lib/queryKeys";
import { useAuthStore } from "../../../store/authStore";
import { useToast } from "../../../app/ToastProvider";
import { getApiErrorMessage } from "../../../lib/api/http";
import { SessionCard } from "./SessionCard";
import { sessionsHeaderPaperSx, sessionsHeaderRowSx } from "./sessionStyles";

export function SessionsPanel() {
  const queryClient = useQueryClient();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const { showToast } = useToast();

  const sessionsQuery = useQuery({
    queryKey: queryKeys.sessions,
    queryFn: listSessions,
  });

  const revokeMutation = useMutation({
    mutationFn: revokeSession,
    onMutate: async (sessionId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.sessions });
      const previous = queryClient.getQueryData(queryKeys.sessions);
      queryClient.setQueryData(queryKeys.sessions, (sessions: Array<{ sessionId: string }> | undefined) =>
        (sessions ?? []).filter((session) => session.sessionId !== sessionId),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous != null) {
        queryClient.setQueryData(queryKeys.sessions, context.previous);
      }
      showToast(getApiErrorMessage(error, "Failed to revoke session"), "error");
    },
    onSuccess: async () => {
      showToast("Session revoked", "success");
      await queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
    },
  });

  const logoutAllMutation = useMutation({
    mutationFn: logoutAllSessions,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.sessions });
      const previous = queryClient.getQueryData(queryKeys.sessions);
      queryClient.setQueryData(queryKeys.sessions, []);
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous != null) {
        queryClient.setQueryData(queryKeys.sessions, context.previous);
      }
      showToast(getApiErrorMessage(error, "Failed to logout all sessions"), "warning");
      clearAuth();
      queryClient.clear();
      window.location.assign("/");
    },
    onSuccess: () => {
      clearAuth();
      queryClient.clear();
      window.location.assign("/");
    },
  });

  return (
    <Stack spacing={2}>
      <Paper elevation={0} sx={sessionsHeaderPaperSx}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={sessionsHeaderRowSx}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Active sessions
          </Typography>
          <Button
            color="error"
            variant="outlined"
            onClick={() => {
              logoutAllMutation.mutate();
            }}
          >
            Logout all sessions
          </Button>
          <IconButton
            onClick={() => {
              void sessionsQuery.refetch();
            }}
          >
            <RefreshRounded />
          </IconButton>
        </Stack>
      </Paper>

      {sessionsQuery.isError ? <Alert severity="error">{getApiErrorMessage(sessionsQuery.error, "Unable to load sessions.")}</Alert> : null}

      {(sessionsQuery.data ?? []).map((session) => (
        <SessionCard
          key={session.sessionId}
          session={session}
          onRevoke={(sessionId) => {
            revokeMutation.mutate(sessionId);
          }}
        />
      ))}
    </Stack>
  );
}
