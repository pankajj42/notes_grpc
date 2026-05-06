import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { UAParser } from "ua-parser-js";
import { LoginRequestSchema, SignupRequestSchema } from "@notes/shared-types";
import { login, signup } from "../../../lib/api/authApi";
import { useAuthStore } from "../../../store/authStore";
import { useToast } from "../../../app/ToastProvider";

type Mode = "login" | "signup";

type FormErrors = {
  email?: string;
  password?: string;
  deviceName?: string;
  root?: string;
};

function generateDeviceName(): string {
  const parser = new UAParser();
  const result = parser.getResult();
  const browser = result.browser.name || "Browser";
  const os = result.os.name || "Unknown OS";
  return `${browser} on ${os}`;
}

export function AuthForm() {
  const navigate = useNavigate();
  const { setAuthSession } = useAuthStore();
  const { showToast } = useToast();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [deviceName, setDeviceName] = useState(generateDeviceName);
  const [errors, setErrors] = useState<FormErrors>({});

  const schema = useMemo(() => (mode === "login" ? LoginRequestSchema : SignupRequestSchema), [mode]);

  const mutation = useMutation({
    mutationFn: async () => {
      const input = schema.parse({ email, password, deviceName });
      if (mode === "login") {
        return login(input);
      }
      return signup(input);
    },
    onSuccess: (data) => {
      setAuthSession({
        accessToken: data.tokens.accessToken,
        user: data.user,
      });
      showToast(mode === "login" ? "Logged in" : "Account created", "success");
      void navigate({ to: "/app" });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Authentication failed";
      setErrors((previous) => ({ ...previous, root: message }));
      showToast(message, "error");
    },
  });

  const submitForm = () => {
    setErrors({});
    const parsed = schema.safeParse({ email, password, deviceName });
    if (!parsed.success) {
      const nextErrors: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "email") {
          nextErrors.email = issue.message;
        } else if (field === "password") {
          nextErrors.password = issue.message;
        } else if (field === "deviceName") {
          nextErrors.deviceName = issue.message;
        }
      }
      setErrors(nextErrors);
      showToast("Please fix highlighted fields", "warning");
      return;
    }

    mutation.mutate();
  };

  return (
    <Paper component="form" onSubmit={(event) => { event.preventDefault(); submitForm(); }} elevation={0} sx={{ p: 3, borderRadius: 4 }}>
      <Stack spacing={2}>
        <Typography variant="h5">Get started</Typography>
        <ToggleButtonGroup
          color="primary"
          value={mode}
          exclusive
          onChange={(_event, value: Mode | null) => {
            if (value != null) {
              setMode(value);
              setErrors({});
            }
          }}
          fullWidth
          sx={{ "& .MuiToggleButton-root": { transition: "all 0.2s ease", "&:hover": { transform: "translateY(-1px)" } } }}
        >
          <ToggleButton value="login">Login</ToggleButton>
          <ToggleButton value="signup">Sign Up</ToggleButton>
        </ToggleButtonGroup>

        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
          error={errors.email !== undefined}
          helperText={errors.email}
          sx={{ "& .MuiOutlinedInput-root": { transition: "all 0.2s ease", "&:hover fieldset": { borderColor: "primary.main" } } }}
          fullWidth
        />
        <TextField
          label="Password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          error={errors.password !== undefined}
          helperText={errors.password}
          sx={{ "& .MuiOutlinedInput-root": { transition: "all 0.2s ease", "&:hover fieldset": { borderColor: "primary.main" } } }}
          fullWidth
        />
        <TextField
          label="Device Name"
          value={deviceName}
          onChange={(event) => {
            setDeviceName(event.target.value);
          }}
          error={errors.deviceName !== undefined}
          helperText={errors.deviceName ?? "Used to identify this device in sessions"}
          sx={{ "& .MuiOutlinedInput-root": { transition: "all 0.2s ease", "&:hover fieldset": { borderColor: "primary.main" } } }}
          fullWidth
        />

        {errors.root != null ? <Alert severity="error">{errors.root}</Alert> : null}

        <Box>
          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={mutation.isPending}
            sx={{ transition: "all 0.2s ease", "&:hover": { transform: "translateY(-1px)" } }}
          >
            {mutation.isPending ? "Please wait..." : mode === "login" ? "Login" : "Create account"}
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}
