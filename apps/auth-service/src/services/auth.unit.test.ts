import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../tokens.js", () => ({
  signAccessToken: vi.fn(() => "access-token"),
}));

vi.mock("./session.js", () => ({
  createSession: vi.fn(async () => ({
    sessionId: "session-1",
    refreshToken: "refresh-1",
  })),
}));

import { signAccessToken } from "../tokens.js";
import { buildAuthResponse } from "./auth.js";
import { createSession } from "./session.js";

describe("buildAuthResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates session and returns tokens with user payload", async () => {
    const response = await buildAuthResponse(
      "user-1",
      "demo@example.com",
      "MacBook Pro",
      "UA",
      "127.0.0.1",
    );

    expect(createSession).toHaveBeenCalledWith("user-1", "MacBook Pro", "UA", "127.0.0.1");
    expect(signAccessToken).toHaveBeenCalledWith("user-1", "session-1");
    expect(response).toEqual({
      tokens: {
        accessToken: "access-token",
        refreshToken: "refresh-1",
      },
      user: {
        userId: "user-1",
        email: "demo@example.com",
      },
    });
  });
});
