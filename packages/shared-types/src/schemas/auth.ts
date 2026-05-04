import { z } from "zod";

// ---------------------------------------------------------------------------
// Field primitives
// ---------------------------------------------------------------------------

const emailSchema = z
  .email("Must be a valid email address")
  .trim()
  .max(254, "Email must be at most 254 characters");

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters");

const deviceNameSchema = z
  .string()
  .trim()
  .min(1, "Device name is required")
  .max(100, "Device name must be at most 100 characters");

const refreshTokenSchema = z
  .string()
  .min(1, "Refresh token is required");

const sessionIdSchema = z
  .uuid("Session ID must be a valid UUID");

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const SignupRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  deviceName: deviceNameSchema,
});

export const LoginRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  deviceName: deviceNameSchema,
});

export const RefreshTokenRequestSchema = z.object({
  refreshToken: refreshTokenSchema,
});

export const LogoutSessionRequestSchema = z.object({
  sessionId: sessionIdSchema,
});

export const EmptyRequestSchema = z.object({});

// ---------------------------------------------------------------------------
// Inferred types (shared with frontend)
// ---------------------------------------------------------------------------

export type SignupRequest = z.infer<typeof SignupRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;
export type LogoutSessionRequest = z.infer<typeof LogoutSessionRequestSchema>;
export type EmptyRequest = z.infer<typeof EmptyRequestSchema>;

// ---------------------------------------------------------------------------
// Response schemas (mirroring proto contracts)
// ---------------------------------------------------------------------------

export const AuthTokensSchema = z.object({
  accessToken: z.string().min(1, "Access token is required"),
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export const UserInfoSchema = z.object({
  userId: z.uuid("User ID must be a valid UUID"),
  email: emailSchema,
});

export const SessionInfoSchema = z.object({
  sessionId: z.uuid("Session ID must be a valid UUID"),
  deviceName: deviceNameSchema,
  createdAt: z.iso.datetime({ message: "createdAt must be an ISO datetime" }),
  lastActivityAt: z.iso.datetime({ message: "lastActivityAt must be an ISO datetime" }),
  isCurrent: z.boolean(),
});

export const AuthResponseSchema = z.object({
  tokens: AuthTokensSchema,
  user: UserInfoSchema,
});

export const SignupResponseSchema = AuthResponseSchema;
export const LoginResponseSchema = AuthResponseSchema;
export const RefreshTokenResponseSchema = AuthResponseSchema;

export const ListSessionsResponseSchema = z.object({
  sessions: z.array(SessionInfoSchema),
});

export const PublicKeyResponseSchema = z.object({
  publicKey: z.string().min(1, "Public key is required"),
});

export const LogoutSessionResponseSchema = z.object({});

export type AuthTokens = z.infer<typeof AuthTokensSchema>;
export type UserInfo = z.infer<typeof UserInfoSchema>;
export type SessionInfo = z.infer<typeof SessionInfoSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type SignupResponse = z.infer<typeof SignupResponseSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type RefreshTokenResponse = z.infer<typeof RefreshTokenResponseSchema>;
export type ListSessionsResponse = z.infer<typeof ListSessionsResponseSchema>;
export type PublicKeyResponse = z.infer<typeof PublicKeyResponseSchema>;
export type LogoutSessionResponse = z.infer<typeof LogoutSessionResponseSchema>;
