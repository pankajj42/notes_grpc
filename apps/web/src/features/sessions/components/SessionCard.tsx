import { Chip, IconButton, Paper, Stack, Typography } from "@mui/material";
import { DeleteRounded } from "@mui/icons-material";
import type { SessionInfo } from "@notes/shared-types";
import { getSessionCardSx, sessionMetaTextSx } from "./sessionStyles";

type SessionCardProps = {
  session: SessionInfo;
  onRevoke: (sessionId: string) => void;
};

export function SessionCard({ session, onRevoke }: SessionCardProps) {
  return (
    <Paper key={session.sessionId} elevation={0} sx={getSessionCardSx(session.isCurrent)}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Stack sx={{ flexGrow: 1 }}>
          <Typography sx={sessionMetaTextSx}>{session.deviceName}</Typography>
          <Typography variant="body2" color="text.secondary">
            Created: {new Date(session.createdAt).toLocaleString()}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Last activity: {new Date(session.lastActivityAt).toLocaleString()}
          </Typography>
        </Stack>
        {session.isCurrent ? <Chip label="Current" color="primary" size="small" /> : null}
        {!session.isCurrent ? (
          <IconButton
            color="error"
            onClick={() => {
              onRevoke(session.sessionId);
            }}
          >
            <DeleteRounded />
          </IconButton>
        ) : null}
      </Stack>
    </Paper>
  );
}
