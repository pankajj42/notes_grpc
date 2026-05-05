import * as grpc from "@grpc/grpc-js";
import {
  type EmptyRequest,
  type ListSessionsResponse,
  type LoginRequest,
  type LoginResponse,
  type LogoutAllSessionsRequest,
  type LogoutAllSessionsResponse,
  type LogoutSessionRequest,
  type LogoutSessionResponse,
  type PublicKeyResponse,
  type RefreshTokenRequest,
  type RefreshTokenResponse,
  type SignupRequest,
  type SignupResponse,
} from "@notes/shared-types";
import { handleSignup } from "./handlers/signup.js";
import { handleLogin } from "./handlers/login.js";
import { handleGetPublicKey } from "./handlers/public-key.js";
import { handleRefreshToken } from "./handlers/refresh.js";
import { handleListSessions } from "./handlers/list-sessions.js";
import { handleLogoutSession } from "./handlers/logout.js";
import { handleLogoutAllSessions } from "./handlers/logout-all.js";

type UnaryCallback<T> = grpc.sendUnaryData<T>;

export function createAuthHandlers(): grpc.UntypedServiceImplementation {
  return {
    Signup: (call: grpc.ServerUnaryCall<SignupRequest, SignupResponse>, callback: UnaryCallback<SignupResponse>) => {
      void handleSignup(call, callback);
    },
    Login: (call: grpc.ServerUnaryCall<LoginRequest, LoginResponse>, callback: UnaryCallback<LoginResponse>) => {
      void handleLogin(call, callback);
    },
    GetPublicKey: (
      call: grpc.ServerUnaryCall<EmptyRequest, PublicKeyResponse>,
      callback: UnaryCallback<PublicKeyResponse>,
    ) => {
      handleGetPublicKey(call, callback);
    },
    RefreshToken: (
      call: grpc.ServerUnaryCall<RefreshTokenRequest, RefreshTokenResponse>,
      callback: UnaryCallback<RefreshTokenResponse>,
    ) => {
      void handleRefreshToken(call, callback);
    },
    ListSessions: (
      call: grpc.ServerUnaryCall<EmptyRequest, ListSessionsResponse>,
      callback: UnaryCallback<ListSessionsResponse>,
    ) => {
      void handleListSessions(call, callback);
    },
    LogoutSession: (
      call: grpc.ServerUnaryCall<LogoutSessionRequest, LogoutSessionResponse>,
      callback: UnaryCallback<LogoutSessionResponse>,
    ) => {
      void handleLogoutSession(call, callback);
    },
    LogoutAllSessions: (
      call: grpc.ServerUnaryCall<LogoutAllSessionsRequest, LogoutAllSessionsResponse>,
      callback: UnaryCallback<LogoutAllSessionsResponse>,
    ) => {
      void handleLogoutAllSessions(call, callback);
    },
  };
}
