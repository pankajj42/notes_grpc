import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "00000000-0000-4000-8000-000000000001"),
}));

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn(async (value: string) => `hashed:${value}`),
    compare: vi.fn(async (plain: string, hash: string) => hash === `hashed:${plain}`),
  },
}));

vi.mock("../tokens.js", () => ({
  generateRefreshToken: vi.fn(() => "refresh-token-1"),
}));

vi.mock("../utils/date.js", () => ({
  getRefreshTokenExpiryDate: vi.fn(() => new Date("2030-01-01T00:00:00.000Z")),
}));

vi.mock("../prisma.js", () => ({
  prisma: {
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import bcrypt from "bcrypt";
import { prisma } from "../prisma.js";
import {
  createSession,
  findSession,
  findSessionWithUser,
  findUserSessions,
  incrementFailedRefreshAttempts,
  revokeAllUserSessions,
  revokeSession,
  updateSessionRefreshToken,
  verifyRefreshToken,
} from "./session.js";

type MockFn = ReturnType<typeof vi.fn>;

const sessionCreate = prisma.session.create as unknown as MockFn;
const sessionFindUnique = prisma.session.findUnique as unknown as MockFn;
const sessionFindMany = prisma.session.findMany as unknown as MockFn;
const sessionUpdate = prisma.session.update as unknown as MockFn;
const sessionUpdateMany = prisma.session.updateMany as unknown as MockFn;
const bcryptHash = bcrypt.hash as unknown as MockFn;
const bcryptCompare = bcrypt.compare as unknown as MockFn;

describe("session service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createSession stores hashed refresh token with metadata", async () => {
    sessionCreate.mockResolvedValue({});

    const result = await createSession("user-1", "Pixel 8", "Mozilla", "127.0.0.1");

    expect(result).toEqual({
      sessionId: "00000000-0000-4000-8000-000000000001",
      refreshToken: "refresh-token-1",
    });

    expect(bcryptHash).toHaveBeenCalledWith("refresh-token-1", 12);
    expect(sessionCreate).toHaveBeenCalledWith({
      data: {
        id: "00000000-0000-4000-8000-000000000001",
        userId: "user-1",
        refreshTokenHash: "hashed:refresh-token-1",
        deviceName: "Pixel 8",
        userAgent: "Mozilla",
        ipAddress: "127.0.0.1",
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      },
    });
  });

  it("findSessionWithUser includes user relation", async () => {
    sessionFindUnique.mockResolvedValue({ id: "session-1" });

    await findSessionWithUser("session-1");

    expect(sessionFindUnique).toHaveBeenCalledWith({
      where: { id: "session-1" },
      include: { user: true },
    });
  });

  it("findSession calls prisma by id", async () => {
    sessionFindUnique.mockResolvedValue({ id: "session-1" });

    await findSession("session-1");

    expect(sessionFindUnique).toHaveBeenCalledWith({ where: { id: "session-1" } });
  });

  it("findUserSessions filters revoked and expired sessions", async () => {
    sessionFindMany.mockResolvedValue([]);

    await findUserSessions("user-1");

    expect(sessionFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      orderBy: { lastUsedAt: "desc" },
    });
  });

  it("updateSessionRefreshToken rotates token hash and resets counters", async () => {
    sessionFindUnique.mockResolvedValue({ id: "session-1", refreshTokenHash: "old-hash" });
    sessionUpdate.mockResolvedValue({});

    await updateSessionRefreshToken("session-1", "refresh-token-2");

    expect(sessionUpdate).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: {
        previousTokenHash: "old-hash",
        refreshTokenHash: "hashed:refresh-token-2",
        failedRefreshAttempts: 0,
        lastUsedAt: expect.any(Date),
      },
    });
  });

  it("updateSessionRefreshToken throws when session is missing", async () => {
    sessionFindUnique.mockResolvedValue(null);

    await expect(updateSessionRefreshToken("missing", "refresh-token")).rejects.toThrow("Session not found");
  });

  it("revokeSession marks revokedAt", async () => {
    sessionUpdate.mockResolvedValue({});

    await revokeSession("session-1");

    expect(sessionUpdate).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("revokeAllUserSessions marks all active sessions", async () => {
    sessionUpdateMany.mockResolvedValue({ count: 2 });

    await revokeAllUserSessions("user-1");

    expect(sessionUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("incrementFailedRefreshAttempts locks after threshold", async () => {
    sessionFindUnique.mockResolvedValue({ id: "session-1", failedRefreshAttempts: 4 });
    sessionUpdate.mockResolvedValue({});

    const shouldLock = await incrementFailedRefreshAttempts("session-1");

    expect(shouldLock).toBe(true);
    expect(sessionUpdate).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: {
        failedRefreshAttempts: 5,
        lockedAt: expect.any(Date),
      },
    });
  });

  it("incrementFailedRefreshAttempts keeps unlocked below threshold", async () => {
    sessionFindUnique.mockResolvedValue({ id: "session-1", failedRefreshAttempts: 1 });
    sessionUpdate.mockResolvedValue({});

    const shouldLock = await incrementFailedRefreshAttempts("session-1");

    expect(shouldLock).toBe(false);
    expect(sessionUpdate).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: {
        failedRefreshAttempts: 2,
        lockedAt: null,
      },
    });
  });

  it("incrementFailedRefreshAttempts throws when session is missing", async () => {
    sessionFindUnique.mockResolvedValue(null);

    await expect(incrementFailedRefreshAttempts("missing")).rejects.toThrow("Session not found");
  });

  it("verifyRefreshToken returns valid for current hash", async () => {
    await expect(verifyRefreshToken("token", "hashed:token", null)).resolves.toBe("valid");
  });

  it("verifyRefreshToken returns reuse for previous hash", async () => {
    bcryptCompare
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(verifyRefreshToken("token", "hashed:new", "hashed:token")).resolves.toBe("reuse");
  });

  it("verifyRefreshToken returns invalid when neither hash matches", async () => {
    bcryptCompare
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);

    await expect(verifyRefreshToken("token", "hashed:new", "hashed:old")).resolves.toBe("invalid");
  });
});
