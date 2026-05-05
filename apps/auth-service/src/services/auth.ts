import { type SignupResponse } from "@notes/shared-types";
import { signAccessToken } from "../tokens.js";
import { createSession } from "./session.js";

export async function buildAuthResponse(
  userId: string,
  email: string,
  deviceName: string,
  userAgent?: string,
  ipAddress?: string,
): Promise<SignupResponse> {
  const { sessionId, refreshToken } = await createSession(userId, deviceName, userAgent, ipAddress);

  return {
    tokens: {
      accessToken: signAccessToken(userId, sessionId),
      refreshToken,
    },
    user: {
      userId,
      email,
    },
  };
}
