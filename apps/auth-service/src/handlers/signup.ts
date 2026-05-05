import * as grpc from "@grpc/grpc-js";
import { type SignupRequest, type SignupResponse, SignupRequestSchema, ErrorCodes } from "@notes/shared-types";
import logger from "../logger.js";
import { toGrpcError, firstIssue, getErrorMessage } from "../utils/errors.js";
import { extractCorrelationFields } from "../utils/metadata.js";
import { createUser, userExists } from "../services/user.js";
import { buildAuthResponse } from "../services/auth.js";

type UnaryCallback<T> = grpc.sendUnaryData<T>;

export async function handleSignup(
  call: grpc.ServerUnaryCall<SignupRequest, SignupResponse>,
  callback: UnaryCallback<SignupResponse>,
): Promise<void> {
  const correlation = extractCorrelationFields(call);
  try {
    const parsed = SignupRequestSchema.safeParse(call.request);
    if (!parsed.success) {
      callback(toGrpcError(ErrorCodes.INVALID_ARGUMENT, firstIssue(parsed.error)));
      return;
    }

    const emailExists = await userExists(parsed.data.email);
    if (emailExists) {
      callback(toGrpcError(ErrorCodes.ALREADY_EXISTS, "A user with this email already exists"));
      return;
    }

    const user = await createUser(parsed.data.email, parsed.data.password);

    const ipAddress = correlation.clientIp;
    const response = await buildAuthResponse(
      user.id,
      user.email,
      parsed.data.deviceName,
      correlation.userAgent,
      ipAddress,
    );
    const sessionId = response.tokens.refreshToken.split(".")[0];
    logger.info({ ...correlation, event: "auth", type: "signup", userId: user.id, sessionId, ipAddress }, "User signed up");
    callback(null, response);
  } catch (error: unknown) {
    logger.error({ ...correlation, event: "auth", type: "signup_failed", error }, "Signup failed");
    callback(toGrpcError(ErrorCodes.INTERNAL, getErrorMessage(error)));
  }
}
