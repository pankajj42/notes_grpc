import {
  type LoginResponse,
  type LoginRequest,
  LoginRequestSchema,
  LoginResponseSchema,
  RefreshTokenResponseSchema,
  type RefreshTokenResponse,
  type PublicKeyResponse,
  PublicKeyResponseSchema,
  type SessionInfo,
  ListSessionsResponseSchema,
  type SignupRequest,
  type SignupResponse,
  SignupRequestSchema,
  SignupResponseSchema,
} from "@notes/shared-types";
import { apiClient, parseSuccessEnvelope } from "./http";

export async function signup(input: SignupRequest): Promise<SignupResponse> {
  const request = SignupRequestSchema.parse(input);
  const response = await apiClient.post("/auth/signup", request);
  const parsed = parseSuccessEnvelope(response, SignupResponseSchema);
  return parsed.data;
}

export async function login(input: LoginRequest): Promise<LoginResponse> {
  const request = LoginRequestSchema.parse(input);
  const response = await apiClient.post("/auth/login", request);
  const parsed = parseSuccessEnvelope(response, LoginResponseSchema);
  return parsed.data;
}

export async function logoutCurrentSession(): Promise<void> {
  await apiClient.post("/auth/logout");
}

export async function refreshSession(): Promise<RefreshTokenResponse> {
  const response = await apiClient.post("/auth/refresh");
  const parsed = parseSuccessEnvelope(response, RefreshTokenResponseSchema);
  return parsed.data;
}

export async function logoutAllSessions(): Promise<void> {
  await apiClient.post("/auth/logout-all");
}

export async function listSessions(): Promise<SessionInfo[]> {
  const response = await apiClient.get("/auth/sessions");
  const parsed = parseSuccessEnvelope(response, ListSessionsResponseSchema);
  return parsed.data.sessions;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await apiClient.delete(`/auth/sessions/${encodeURIComponent(sessionId)}`);
}

export async function getPublicKey(): Promise<PublicKeyResponse> {
  const response = await apiClient.get("/auth/public-key");
  const parsed = parseSuccessEnvelope(response, PublicKeyResponseSchema);
  return parsed.data;
}
