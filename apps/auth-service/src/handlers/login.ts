import * as grpc from "@grpc/grpc-js";
import {
  type LoginRequest,
  type LoginResponse,
  LoginRequestSchema,
  ErrorCodes,
  parseRefreshToken,
} from "@notes/shared-types";
import logger from "../logger.js";
import { toGrpcError, firstIssue, getErrorMessage } from "../utils/errors.js";
import { extractCorrelationFields } from "../utils/metadata.js";
import { findUserByEmail, verifyPassword } from "../services/user.js";
import { buildAuthResponse } from "../services/auth.js";

type UnaryCallback<T> = grpc.sendUnaryData<T>;

export async function handleLogin(
  call: grpc.ServerUnaryCall<LoginRequest, LoginResponse>,
  callback: UnaryCallback<LoginResponse>,
): Promise<void> {
  const correlation = extractCorrelationFields(call);
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

    const ipAddress = correlation.clientIp;
    const response = await buildAuthResponse(
      user.id,
      user.email,
      parsed.data.deviceName,
      correlation.userAgent,
      ipAddress,
    );
    const sessionId = parseRefreshToken(response.tokens.refreshToken)?.sessionId;
    logger.info({ ...correlation, event: "auth", type: "login", userId: user.id, sessionId, ipAddress }, "User logged in");
    callback(null, response);
  } catch (error: unknown) {
    logger.error({ ...correlation, event: "auth", type: "login_failed", error }, "Login failed");
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}
