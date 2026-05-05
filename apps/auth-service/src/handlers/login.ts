import * as grpc from "@grpc/grpc-js";
import { type LoginRequest, type LoginResponse, LoginRequestSchema, ErrorCodes } from "@notes/shared-types";
import logger from "../logger.js";
import { toGrpcError, firstIssue, getErrorMessage } from "../utils/errors.js";
import { extractOptionalMetadata } from "../utils/metadata.js";
import { findUserByEmail, verifyPassword } from "../services/user.js";
import { buildAuthResponse } from "../services/auth.js";

type UnaryCallback<T> = grpc.sendUnaryData<T>;

export async function handleLogin(
  call: grpc.ServerUnaryCall<LoginRequest, LoginResponse>,
  callback: UnaryCallback<LoginResponse>,
): Promise<void> {
  try {
    const parsed = LoginRequestSchema.safeParse(call.request);
    if (!parsed.success) {
      callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, firstIssue(parsed.error)));
      return;
    }

    const user = await findUserByEmail(parsed.data.email);
    if (user == null) {
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "Invalid email or password"));
      return;
    }

    const passwordMatches = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!passwordMatches) {
      callback(toGrpcError(ErrorCodes.UNAUTHENTICATED, "Invalid email or password"));
      return;
    }

    const ipAddress = extractOptionalMetadata(call, "x-client-ip", 64);
    const response = await buildAuthResponse(
      user.id,
      user.email,
      parsed.data.deviceName,
      extractOptionalMetadata(call, "x-user-agent", 512),
      ipAddress,
    );
    const sessionId = response.tokens.refreshToken.split(".")[0];
    logger.info({ event: "auth", type: "login", userId: user.id, sessionId, ipAddress }, "User logged in");
    callback(null, response);
  } catch (error: unknown) {
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}
