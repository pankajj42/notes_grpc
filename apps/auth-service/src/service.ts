import * as grpc from "@grpc/grpc-js";
import bcrypt from "bcrypt";
import {
  type EmptyRequest,
  ErrorCodes,
  ErrorCodeToGrpcStatus,
  type ListSessionsResponse,
  type LoginRequest,
  type LoginResponse,
  LoginRequestSchema,
  type LogoutSessionRequest,
  type LogoutSessionResponse,
  type PublicKeyResponse,
  type RefreshTokenRequest,
  type RefreshTokenResponse,
  type SignupRequest,
  type SignupResponse,
  SignupRequestSchema,
  type ErrorCode,
} from "@notes/shared-types";
import { config } from "./config";
import { prisma } from "./prisma";
import { getPublicKeyPem } from "./keys";
import { generateRefreshToken, signAccessToken } from "./tokens";

type UnaryCallback<T> = grpc.sendUnaryData<T>;

const BCRYPT_COST = 12;

export function createAuthHandlers(): grpc.UntypedServiceImplementation {
  return {
    Signup: (call: grpc.ServerUnaryCall<SignupRequest, SignupResponse>, callback: UnaryCallback<SignupResponse>) => {
      void handleSignup(call, callback);
    },
    Login: (call: grpc.ServerUnaryCall<LoginRequest, LoginResponse>, callback: UnaryCallback<LoginResponse>) => {
      void handleLogin(call, callback);
    },
    GetPublicKey: (
      _call: grpc.ServerUnaryCall<EmptyRequest, PublicKeyResponse>,
      callback: UnaryCallback<PublicKeyResponse>,
    ) => {
      try {
        callback(null, { publicKey: getPublicKeyPem() });
      } catch (error: unknown) {
        callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
      }
    },
    RefreshToken: (
      _call: grpc.ServerUnaryCall<RefreshTokenRequest, RefreshTokenResponse>,
      callback: UnaryCallback<RefreshTokenResponse>,
    ) => {
      callback(toGrpcError(ErrorCodes.UNIMPLEMENTED, "RefreshToken will be implemented in a later phase"));
    },
    ListSessions: (
      _call: grpc.ServerUnaryCall<EmptyRequest, ListSessionsResponse>,
      callback: UnaryCallback<ListSessionsResponse>,
    ) => {
      callback(toGrpcError(ErrorCodes.UNIMPLEMENTED, "ListSessions will be implemented in a later phase"));
    },
    LogoutSession: (
      _call: grpc.ServerUnaryCall<LogoutSessionRequest, LogoutSessionResponse>,
      callback: UnaryCallback<LogoutSessionResponse>,
    ) => {
      callback(toGrpcError(ErrorCodes.UNIMPLEMENTED, "LogoutSession will be implemented in a later phase"));
    },
  };
}

async function handleSignup(
  call: grpc.ServerUnaryCall<SignupRequest, SignupResponse>,
  callback: UnaryCallback<SignupResponse>,
): Promise<void> {
  try {
    const parsed = SignupRequestSchema.safeParse(call.request);
    if (!parsed.success) {
      callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, firstIssue(parsed.error)));
      return;
    }

    const normalizedEmail = parsed.data.email.trim().toLowerCase();
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser != null) {
      callback(toGrpcError(ErrorCodes.ALREADY_EXISTS, "A user with this email already exists"));
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_COST);
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
      },
    });

    const response = await buildAuthResponse(
      user.id,
      user.email,
      parsed.data.deviceName,
      extractOptionalMetadata(call, "x-user-agent", 512),
      extractOptionalMetadata(call, "x-client-ip", 64),
    );
    callback(null, response);
  } catch (error: unknown) {
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}

async function handleLogin(
  call: grpc.ServerUnaryCall<LoginRequest, LoginResponse>,
  callback: UnaryCallback<LoginResponse>,
): Promise<void> {
  try {
    const parsed = LoginRequestSchema.safeParse(call.request);
    if (!parsed.success) {
      callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, firstIssue(parsed.error)));
      return;
    }

    const normalizedEmail = parsed.data.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (user == null) {
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "Invalid email or password"));
      return;
    }

    const passwordMatches = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!passwordMatches) {
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "Invalid email or password"));
      return;
    }

    const response = await buildAuthResponse(
      user.id,
      user.email,
      parsed.data.deviceName,
      extractOptionalMetadata(call, "x-user-agent", 512),
      extractOptionalMetadata(call, "x-client-ip", 64),
    );
    callback(null, response);
  } catch (error: unknown) {
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}

async function buildAuthResponse(
  userId: string,
  email: string,
  deviceName: string,
  userAgent?: string,
  ipAddress?: string,
): Promise<SignupResponse> {
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_COST);

  const session = await prisma.session.create({
    data: {
      userId,
      refreshTokenHash,
      deviceName,
      userAgent: userAgent ?? null,
      ipAddress: ipAddress ?? null,
      expiresAt: getRefreshTokenExpiryDate(),
    },
  });

  return {
    tokens: {
      accessToken: signAccessToken(userId, session.id),
      refreshToken,
    },
    user: {
      userId,
      email,
    },
  };
}

function toGrpcError(code: ErrorCode, message: string): grpc.ServiceError {
  const error = new Error(message) as grpc.ServiceError;
  error.name = code;
  error.message = message;
  error.details = message;
  error.code = ErrorCodeToGrpcStatus[code] as grpc.status;
  return error;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown internal error";
}

function firstIssue(error: { issues: Array<{ message: string }> }): string {
  return error.issues[0]?.message ?? "Invalid request";
}

function getRefreshTokenExpiryDate(): Date {
  return new Date(Date.now() + config.jwtRefreshTtlDays * 24 * 60 * 60 * 1000);
}

function extractOptionalMetadata(
  call: grpc.ServerUnaryCall<unknown, unknown>,
  key: string,
  maxLength: number,
): string | undefined {
  const value = call.metadata.get(key)[0];
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized === "") {
    return undefined;
  }

  return normalized.slice(0, maxLength);
}
